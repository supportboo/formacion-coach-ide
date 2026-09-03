/* Brandooers · servicio (Node, sin dependencias, escucha solo en 127.0.0.1).
   LOGIN con sesión (scrypt + cookie firmada HMAC HttpOnly) + AFILIACIÓN.
   Auth:
   - POST /auth/login     {u,p} -> valida, pone cookie de sesión, {ok,role}
   - GET  /auth/verify    para nginx auth_request (200/401; ?admin=1 exige rol admin -> 403 si no)
   - GET  /auth/me        {user,role} del que está logueado
   - GET  /auth/logout    borra la cookie y redirige a /login.html
   - POST /auth/password  {old,new} cambia la propia contraseña
   Afiliación:
   - GET  /r/:id          redirector SEGURO (registro/allowlist; añade tag afiliado + UTM; clic anónimo)
   - GET  /aff/           panel (nginx exige rol admin delante)
   - GET  /aff/api/data | POST /aff/api/status | POST /aff/api/tag
   Lectura del registro desde su carpeta; ESCRITURA solo en AFF_DATA.
   Arranque: AFF_PORT=8090 AFF_DATA=/var/lib/brandooers-aff node server.mjs */
import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.AFF_DATA || HERE;         // solo aquí se escribe
try { mkdirSync(DATA, { recursive: true }); } catch {}
const PORT = process.env.AFF_PORT || 8090;
const R = (f) => join(HERE, f);                    // registro (solo lectura)
const W = (f) => join(DATA, f);                    // datos runtime (lectura/escritura)
const jload = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const jsave = (p, o) => writeFileSync(p, JSON.stringify(o, null, 0), 'utf8');
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const json = (res, code, o, extra) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...(extra || {}) }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });

/* ---------------- AUTH ---------------- */
// secreto de firma persistente
let SECRET;
try { SECRET = readFileSync(W('auth-secret'), 'utf8').trim(); }
catch { SECRET = crypto.randomBytes(32).toString('hex'); try { writeFileSync(W('auth-secret'), SECRET, { mode: 0o600 }); } catch {} }

const users = () => jload(W('users.json'), {});           // { user: {salt, hash, role} }
function checkPassword(u, p) {
  const rec = users()[u]; if (!rec) return null;
  const h = crypto.scryptSync(String(p), rec.salt, 32).toString('hex');
  const a = Buffer.from(h), b = Buffer.from(rec.hash || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { user: u, role: rec.role || 'member' };
}
const b64u = (s) => Buffer.from(s).toString('base64url');
function sign(u, role, days = 30) {
  const payload = b64u(JSON.stringify({ u, role, exp: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function session(req) {
  const c = req.headers.cookie || ''; let tok = '';
  for (const kv of c.split(';')) { const i = kv.indexOf('='); if (i > 0 && kv.slice(0, i).trim() === 'bd_sess') tok = kv.slice(i + 1).trim(); }
  const i = tok.lastIndexOf('.'); if (i < 1) return null;
  const payload = tok.slice(0, i), sig = tok.slice(i + 1);
  const good = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return o.exp > Date.now() ? o : null; } catch { return null; }
}
function setCookie(u, role, https) {
  return `bd_sess=${sign(u, role)}; HttpOnly; Path=/; Max-Age=${30 * 864e2}; SameSite=Lax${https ? '; Secure' : ''}`;
}
// rate limit login por IP (10 intentos / 15 min)
const hits = new Map();
function rateOk(ip) {
  const now = Date.now(), w = hits.get(ip) || { n: 0, t: now };
  if (now - w.t > 9e5) { w.n = 0; w.t = now; }
  w.n++; hits.set(ip, w); return w.n <= 10;
}

/* ---------------- AFILIACIÓN ---------------- */
function reload() {
  return {
    resources: jload(R('resources.json'), {}),
    opps: jload(R('opportunities.json'), {}),
    domains: jload(R('domains.json'), {}),
    tags: jload(W('affiliates.json'), {}),
    over: jload(W('status-overrides.json'), {}),
  };
}
let DB = reload();
function withAffiliate(url, domain) {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'brandooers');
    u.searchParams.set('utm_medium', 'formacion');
    const t = DB.tags[domain];
    if (t && t.param && t.value) u.searchParams.set(t.param, t.value);
    return u.href;
  } catch { return url; }
}
function clickLog(rec) { try { appendFileSync(W('clicks.jsonl'), JSON.stringify(rec) + '\n'); } catch {} }
function clicksByDomain() {
  const out = {};
  try { for (const l of readFileSync(W('clicks.jsonl'), 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); out[r.domain] = (out[r.domain] || 0) + 1; } catch {} } } catch {}
  return out;
}

// bandeja de revisión: feedback de alumnos, solicitudes de curso y onboarding
function inboxAppend(kind, data) {
  const id = (data && data.id) ? String(data.id) : ('i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  try { appendFileSync(W('inbox.jsonl'), JSON.stringify({ id, kind, data, ts: new Date().toISOString() }) + '\n'); } catch {}
  return id;
}
function inboxMeta() { return jload(W('inbox-meta.json'), {}); }
function inboxSetMeta(id, patch) { const m = inboxMeta(); m[id] = { ...(m[id] || {}), ...patch, updatedTs: new Date().toISOString() }; jsave(W('inbox-meta.json'), m); }
function countLines(p) { try { return readFileSync(p, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } }
function inboxAll() {
  const items = [];
  try { for (const l of readFileSync(W('inbox.jsonl'), 'utf8').split('\n')) { if (!l) continue; try { items.push(JSON.parse(l)); } catch {} } } catch {}
  const m = inboxMeta();
  return items.map(it => { const x = m[it.id] || {}; return { ...it, status: x.status || 'nuevo', instruction: x.instruction || '', reply: x.reply || '', stage: x.stage || '', eta: x.eta || '', courseUrl: x.courseUrl || '', moderation: x.moderation || '' }; });
}
function readJsonl(f) { const rows = []; try { for (const l of readFileSync(W(f), 'utf8').split('\n')) { if (!l) continue; try { rows.push(JSON.parse(l)); } catch {} } } catch {} return rows; }

// moderación de peticiones de curso: bloquea porno, insultos, violencia/ilegal, spam y fuera de contexto
const MOD_BLOCK = /(\bporn|xxx|sexual|desnud|nude|escort|follar|corrida|tetas|\bculo\b|masturb|onlyfans|\bsexo\b|erotic|gilipollas|imb[eé]cil|idiota|subnormal|cabr[oó]n|\bputa\b|maric[oó]n|hijo de puta|nazi|matar a|hacer una bomba|drogas? para vender|coca[ií]na|hero[ií]na|hackear (cuenta|whatsapp|instagram|correo)|suicid)/i;
function moderate(text) {
  const t = String(text || '').trim();
  if (t.length < 5) return { ok: false, reason: 'vacío o demasiado corto' };
  if (t.length > 200) return { ok: false, reason: 'demasiado largo' };
  if (MOD_BLOCK.test(t)) return { ok: false, reason: 'contenido inapropiado o fuera de contexto' };
  if (!/[a-zA-Záéíóúñ]{3,}/.test(t)) return { ok: false, reason: 'sin texto reconocible' };
  return { ok: true };
}
const SETTINGS_DEFAULT = { autoValidate: false, maxPerDay: 3, moderation: true };
function getSettings() { return { ...SETTINGS_DEFAULT, ...jload(W('settings.json'), {}) }; }

// rangos (por puntos) y equipos de coach
function rankOf(p) { return p >= 1000 ? 'Maestro' : p >= 600 ? 'Experto' : p >= 300 ? 'Pro' : p >= 100 ? 'Practicante' : 'Rookie'; }
const teams = () => jload(W('teams.json'), {}); // { coacheeUser: coachUser }
function userRows() {
  const prog = readJsonl('progress.jsonl'), views = readJsonl('views.jsonl'), exams = readJsonl('exams.jsonl'), applied = readJsonl('applied.jsonl');
  const comp = {}; for (const r of prog) { if (r.done && r.user && r.course) (comp[r.user] = comp[r.user] || new Set()).add(r.course); }
  const passed = {}; for (const e of exams) { if (e.passed && e.user && e.course) (passed[e.user] = passed[e.user] || new Set()).add(e.course); }
  const apl = {}; for (const a of applied) { if (a.user) apl[a.user] = (apl[a.user] || 0) + 1; }
  const lastSeen = {}, viewCount = {}; for (const v of views) { if (v.user) { if (!lastSeen[v.user] || v.ts > lastSeen[v.user]) lastSeen[v.user] = v.ts; viewCount[v.user] = (viewCount[v.user] || 0) + 1; } }
  const fb = inboxAll().filter(x => x.kind === 'feedback'); const fbG = {}, fbA = {};
  for (const f of fb) { const u = (f.data || {}).user || (f.data || {}).name; if (!u) continue; fbG[u] = (fbG[u] || 0) + 1; if (f.status === 'aceptado' || f.status === 'aplicado') fbA[u] = (fbA[u] || 0) + 1; }
  const known = Object.keys(users());
  const allU = new Set([...known, ...Object.keys(comp), ...Object.keys(lastSeen), ...Object.keys(fbG), ...Object.keys(apl)]);
  return [...allU].map(u => {
    const completions = [...(comp[u] || [])], aprobados = [...(passed[u] || [])], acc = fbA[u] || 0, aplicaciones = apl[u] || 0;
    const points = completions.length * 100 + aprobados.length * 50 + acc * 20 + aplicaciones * 40;
    return { user: u, cuenta: known.includes(u), completions, badges: completions.length, examenes: aprobados.length, aplicaciones, feedbackDado: fbG[u] || 0, feedbackAceptado: acc, vistas: viewCount[u] || 0, lastSeen: lastSeen[u] || '', points, rank: rankOf(points) };
  }).sort((a, b) => b.points - a.points);
}

// ---- notificaciones push (móvil) ----
/* Aviso de leads por email.
   Se envía DESDE MAIL_FROM (info@brandooers.com) HACIA LEAD_TO (boo@boomatik.com),
   con Reply-To del propio lead para poder contestarle directo. Todo por variables
   de entorno: sin credenciales esto no hace nada y el lead se sigue guardando en
   leads.jsonl + push.
   Con Resend basta RESEND_API_KEY: su SMTP es smtp.resend.com / usuario "resend"
   / contraseña = la API key (docs oficiales, verificado 2026-09-03). El dominio
   remitente tiene que estar verificado en Resend. Si no, se usa SMTP_* directo. */
const RESEND = process.env.RESEND_API_KEY || '';
const MAIL = {
  host: process.env.SMTP_HOST || (RESEND ? 'smtp.resend.com' : 'smtp.ionos.es'),
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || (RESEND ? 'resend' : 'info@brandooers.com'),
  pass: RESEND || process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || 'info@brandooers.com',
  to: process.env.LEAD_TO || 'boo@boomatik.com',
};
let mailer = null;
if (MAIL.pass) {
  try {
    const nm = (await import('nodemailer')).default;
    mailer = nm.createTransport({ host: MAIL.host, port: MAIL.port, secure: MAIL.port === 465, auth: { user: MAIL.user, pass: MAIL.pass } });
    console.log('mail: on ·', MAIL.host, '· de', MAIL.from, '→', MAIL.to);
  } catch (e) { console.log('mail off (nodemailer):', e.message); }
} else { console.log('mail off: falta RESEND_API_KEY o SMTP_PASS'); }

function notifyLeadByEmail(rec, origin) {
  if (!mailer) return;
  const line = (k, v) => v ? k + ': ' + v + '\n' : '';
  mailer.sendMail({
    from: '"Brandooers" <' + MAIL.from + '>',
    to: MAIL.to,
    replyTo: rec.email,
    subject: 'Nueva solicitud · ' + (rec.name || rec.email) + (rec.company ? ' · ' + rec.company : ''),
    text: 'Solicitud recibida en ' + (origin || 'brandooers.com') + '\n\n'
      + line('Nombre', rec.name) + line('Email', rec.email) + line('Empresa / sector / equipo', rec.company)
      + line('Fecha', rec.ts) + '\nResponde a este correo para contestarle directamente.\n',
  }).catch(e => console.log('mail error:', e.message));
}

let webpush = null; const VAPID = jload(W('vapid.json'), null);
try { webpush = (await import('web-push')).default; if (VAPID) webpush.setVapidDetails('mailto:support@boomatik.com', VAPID.publicKey, VAPID.privateKey); } catch (e) { console.log('web-push off:', e.message); }
const pushSubs = () => jload(W('push-subs.json'), {});
function notifyAdmins(title, body, url) {
  if (!webpush || !VAPID) return;
  const subs = pushSubs(), u = users(), payload = JSON.stringify({ title, body: String(body || '').slice(0, 140), url: url || '/hub.html' });
  for (const [key, rec] of Object.entries(subs)) {
    if (!(u[rec.user] && u[rec.user].role === 'admin')) continue;
    webpush.sendNotification(rec.sub, payload).catch(e => { if (e.statusCode === 404 || e.statusCode === 410) { const s = pushSubs(); delete s[key]; jsave(W('push-subs.json'), s); } });
  }
}

const server = http.createServer(async (req, res) => {
  const https = (req.headers['x-forwarded-proto'] || '') === 'https';
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  /* ----- AUTH ----- */
  if (path === '/auth/verify') {
    const s = session(req);
    if (!s) { res.writeHead(401); return res.end('no'); }
    if (url.searchParams.get('admin') === '1' && s.role !== 'admin') { res.writeHead(403); return res.end('no admin'); }
    res.writeHead(200, { 'x-auth-user': s.u }); return res.end('ok');
  }
  if (path === '/auth/me') {
    const s = session(req); if (!s) return json(res, 401, { error: 'no autenticado' });
    return json(res, 200, { user: s.u, role: s.role });
  }
  if (path === '/auth/login' && req.method === 'POST') {
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
    if (!rateOk(ip)) return json(res, 429, { error: 'Demasiados intentos, espera unos minutos' });
    const b = await body(req);
    const ok = checkPassword(String(b.u || '').slice(0, 60), String(b.p || '').slice(0, 200));
    if (!ok) return json(res, 401, { error: 'Usuario o contraseña incorrectos' });
    return json(res, 200, { ok: true, role: ok.role }, { 'set-cookie': setCookie(ok.user, ok.role, https) });
  }
  if (path === '/auth/logout') {
    res.writeHead(302, { 'set-cookie': 'bd_sess=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax', location: '/login.html' });
    return res.end();
  }
  // captura de leads desde la landing (solicitar acceso) — público, anti-spam por IP
  if (path === '/auth/lead' && req.method === 'POST') {
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
    if (!rateOk(ip)) return json(res, 429, { error: 'Demasiadas solicitudes, prueba en un rato' });
    const b = await body(req);
    const email = String(b.email || '').slice(0, 120).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Email no válido' });
    const rec = { name: String(b.name || '').slice(0, 80).trim(), email, company: String(b.company || '').slice(0, 120).trim(), ts: new Date().toISOString() };
    try { appendFileSync(W('leads.jsonl'), JSON.stringify(rec) + '\n'); } catch {}
    notifyAdmins('Nuevo lead 🎯', (rec.name || '') + ' · ' + rec.email + (rec.company ? ' · ' + rec.company : ''), '/panel.html');
    notifyLeadByEmail(rec, String(req.headers.host || ''));
    return json(res, 200, { ok: true });
  }
  if (path === '/auth/password' && req.method === 'POST') {
    const s = session(req); if (!s) return json(res, 401, { error: 'no autenticado' });
    const b = await body(req);
    if (!checkPassword(s.u, String(b.old || ''))) return json(res, 403, { error: 'La contraseña actual no es correcta' });
    const np = String(b.new || ''); if (np.length < 8) return json(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    const db = users(); const salt = crypto.randomBytes(16).toString('hex');
    db[s.u] = { ...db[s.u], salt, hash: crypto.scryptSync(np, salt, 32).toString('hex') };
    jsave(W('users.json'), db);
    return json(res, 200, { ok: true });
  }

  // recuperación de contraseña (self-service): crea un token; el email se envía si hay SMTP,
  // si no, el admin ve la petición en Usuarios y pasa el enlace. Respuesta genérica (no revela si existe).
  if (path === '/auth/forgot' && req.method === 'POST') {
    const b = await body(req); const u = String(b.u || '').slice(0, 60);
    if (users()[u]) {
      const token = crypto.randomBytes(24).toString('base64url');
      const rs = jload(W('resets.json'), {}); rs[token] = { u, exp: Date.now() + 36e5 }; jsave(W('resets.json'), rs);
      // TODO email: si AFF_SMTP configurado, enviar aquí /reset.html?token=<token> al correo del usuario
    }
    return json(res, 200, { ok: true });
  }
  if (path === '/auth/reset' && req.method === 'POST') {
    const b = await body(req); const token = String(b.token || ''); const np = String(b.new || '');
    const rs = jload(W('resets.json'), {}); const r = rs[token];
    if (!r || r.exp < Date.now()) return json(res, 400, { error: 'Enlace caducado o no válido' });
    if (np.length < 8) return json(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres' });
    const db = users(); if (!db[r.u]) return json(res, 400, { error: 'Usuario no encontrado' });
    const salt = crypto.randomBytes(16).toString('hex');
    db[r.u] = { ...db[r.u], salt, hash: crypto.scryptSync(np, salt, 32).toString('hex') };
    jsave(W('users.json'), db); delete rs[token]; jsave(W('resets.json'), rs);
    return json(res, 200, { ok: true });
  }
  // gestión de usuarios (solo admin)
  if (path.startsWith('/auth/users')) {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    if (path === '/auth/users' && req.method === 'GET') {
      const db = users(); const rs = jload(W('resets.json'), {}); const t = teams();
      return json(res, 200, {
        users: Object.entries(db).map(([u, r]) => ({ u, role: r.role || 'member', created: r.created || '', coach: t[u] || '' })).sort((a, b) => a.u.localeCompare(b.u)),
        resets: Object.entries(rs).filter(([, r]) => r.exp > Date.now()).map(([token, r]) => ({ u: r.u, link: '/reset.html?token=' + token })),
      });
    }
    if (path === '/auth/users/save' && req.method === 'POST') {
      const b = await body(req); const u = String(b.u || '').slice(0, 60).trim();
      if (!/^[a-zA-Z0-9._-]{2,}$/.test(u)) return json(res, 400, { error: 'Usuario no válido (letras, números, . _ -)' });
      const db = users(); const cur = db[u] || { created: new Date().toISOString() };
      if (b.password) { const salt = crypto.randomBytes(16).toString('hex'); cur.salt = salt; cur.hash = crypto.scryptSync(String(b.password), salt, 32).toString('hex'); }
      else if (!db[u]) return json(res, 400, { error: 'Un usuario nuevo necesita contraseña' });
      cur.role = b.role === 'admin' ? 'admin' : 'member';
      db[u] = cur; jsave(W('users.json'), db);
      return json(res, 200, { ok: true });
    }
    if (path === '/auth/users/reset' && req.method === 'POST') {
      const b = await body(req); const u = String(b.u || ''); if (!users()[u]) return json(res, 404, { error: 'no existe' });
      const token = crypto.randomBytes(24).toString('base64url');
      const rs = jload(W('resets.json'), {}); rs[token] = { u, exp: Date.now() + 36e5 }; jsave(W('resets.json'), rs);
      return json(res, 200, { ok: true, link: '/reset.html?token=' + token });
    }
    if (path === '/auth/users/delete' && req.method === 'POST') {
      const b = await body(req); const u = String(b.u || '');
      if (u === s.u) return json(res, 400, { error: 'No puedes borrar tu propia cuenta' });
      const db = users(); delete db[u]; jsave(W('users.json'), db);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no' });
  }

  /* ----- BANDEJA (captura pública + revisión admin) ----- */
  if (path === '/api/feedback' && req.method === 'POST') {
    const b = await body(req); if (!b || !b.type) return json(res, 400, { error: 'no' });
    inboxAppend('feedback', b);
    if (b.type === 'improve' || b.type === 'stale') notifyAdmins('Nuevo feedback', (b.course ? b.course + ': ' : '') + (b.comment || b.quote || ''), '/revisiones.html');
    return json(res, 200, { ok: true });
  }
  if (path === '/api/track' && req.method === 'POST') {
    const b = await body(req);
    if (b && b.ev === 'course_request' && b.topic) {
      const id = inboxAppend('request', b);
      const mod = getSettings().moderation ? moderate(b.topic) : { ok: true };
      if (!mod.ok) inboxSetMeta(id, { status: 'rechazado', moderation: mod.reason });
      else notifyAdmins('Nueva petición de curso', b.topic, '/revisiones.html');
    }
    return json(res, 200, { ok: true });
  }
  if (path === '/api/onboarding' && req.method === 'POST') {
    const b = await body(req); inboxAppend('onboarding', b); return json(res, 200, { ok: true });
  }
  if (path === '/api/view' && req.method === 'POST') {
    const b = await body(req);
    try { appendFileSync(W('views.jsonl'), JSON.stringify({ page: String(b.page || '').slice(0, 80), user: String(b.user || '').slice(0, 60), ts: new Date().toISOString() }) + '\n'); } catch {}
    return json(res, 200, { ok: true });
  }
  if (path === '/api/progress' && req.method === 'POST') {
    const b = await body(req);
    try { appendFileSync(W('progress.jsonl'), JSON.stringify({ user: String(b.user || '').slice(0, 60), course: String(b.course || '').slice(0, 80), done: !!b.done, pct: Number(b.pct) || null, ts: new Date().toISOString() }) + '\n'); } catch {}
    return json(res, 200, { ok: true });
  }
  if (path === '/api/exam' && req.method === 'POST') {   // resultado de examen -> badge
    const b = await body(req);
    try { appendFileSync(W('exams.jsonl'), JSON.stringify({ user: String(b.user || '').slice(0, 60), course: String(b.course || '').slice(0, 80), score: Number(b.score) || 0, passed: !!b.passed, ts: new Date().toISOString() }) + '\n'); } catch {}
    return json(res, 200, { ok: true });
  }
  if (path === '/api/mis-cursos') {   // cursos que el alumno ha pedido y su estado de producción
    const s = session(req); if (!s) return json(res, 401, { error: 'no auth' });
    const rows = inboxAll().filter(x => x.kind === 'request' && (x.data || {}).user === s.u)
      .map(x => ({ id: x.id, topic: (x.data || {}).topic || '', status: x.status, stage: x.stage || (x.status === 'aceptado' ? 'cola' : (x.status === 'nuevo' ? 'solicitado' : x.status)), eta: x.eta || '', courseUrl: x.courseUrl || '', ts: x.ts }))
      .reverse();
    return json(res, 200, { cursos: rows });
  }
  if (path === '/api/push/key') return json(res, 200, { key: VAPID ? VAPID.publicKey : '' });
  if (path === '/api/push/subscribe' && req.method === 'POST') {
    const s = session(req); if (!s) return json(res, 401, { error: 'no auth' });
    const b = await body(req); if (!b || !b.endpoint) return json(res, 400, { error: 'sin subscripción' });
    const subs = pushSubs(); subs[b.endpoint] = { user: s.u, sub: b, ts: new Date().toISOString() }; jsave(W('push-subs.json'), subs);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/push/test') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    notifyAdmins('Brandooers', 'Notificación de prueba · funciona', '/panel.html');
    return json(res, 200, { ok: true });
  }
  if (path === '/api/admin/inbox') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const g = { feedback: [], request: [], onboarding: [] };
    for (const it of inboxAll()) (g[it.kind] || (g[it.kind] = [])).push(it);
    for (const k in g) g[k].reverse();
    return json(res, 200, g);
  }
  if (path === '/api/admin/status' && req.method === 'POST') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const b = await body(req); if (!b.id) return json(res, 400, { error: 'falta id' });
    const patch = {};
    if (b.status != null) patch.status = String(b.status).slice(0, 20);
    if (b.instruction != null) patch.instruction = String(b.instruction).slice(0, 4000);
    if (b.reply != null) patch.reply = String(b.reply).slice(0, 2000);
    if (b.stage != null) patch.stage = String(b.stage).slice(0, 20);
    if (b.eta != null) patch.eta = String(b.eta).slice(0, 40);
    if (b.courseUrl != null) patch.courseUrl = String(b.courseUrl).slice(0, 160);
    if (!Object.keys(patch).length) return json(res, 400, { error: 'nada que cambiar' });
    inboxSetMeta(b.id, patch);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/admin/dashboard') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const all = inboxAll();
    const of = k => all.filter(x => x.kind === k);
    const byStatus = arr => arr.reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});
    const fb = of('feedback'), rq = of('request'), ob = of('onboarding');
    const fbType = fb.reduce((a, x) => { const t = (x.data || {}).type || 'note'; a[t] = (a[t] || 0) + 1; return a; }, {});
    const clicks = clicksByDomain(); const totalClicks = Object.values(clicks).reduce((a, b) => a + b, 0);
    const instrucciones = all.filter(x => x.instruction).map(x => ({ id: x.id, kind: x.kind, status: x.status, instruction: x.instruction, ref: (x.data || {}).course || (x.data || {}).topic || '' }));
    return json(res, 200, {
      usuarios: Object.keys(users()).length,
      onboardings: ob.length,
      peticiones: { total: rq.length, estados: byStatus(rq), ultimas: rq.slice(0, 6).map(x => ({ topic: (x.data || {}).topic, status: x.status, ts: x.ts })) },
      feedback: { total: fb.length, tipos: fbType, estados: byStatus(fb) },
      leads: countLines(W('leads.jsonl')),
      vistas: countLines(W('views.jsonl')),
      clicsAfiliacion: totalClicks,
      instrucciones,
    });
  }
  if (path === '/api/admin/leads') {   // solicitudes de piloto/acceso (brandooers.com + skillup), más recientes primero
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const rows = [];
    try { for (const l of readFileSync(W('leads.jsonl'), 'utf8').split('\n')) { if (!l) continue; try { rows.push(JSON.parse(l)); } catch {} } } catch {}
    return json(res, 200, { leads: rows.reverse().slice(0, 200) });
  }
  if (path === '/api/admin/queue') {   // cola de instrucciones para Claude Code interno (solo admin)
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const q = inboxAll().filter(x => x.instruction && x.status !== 'aplicado' && x.status !== 'rechazado')
      .map(x => ({ id: x.id, kind: x.kind, status: x.status, ref: (x.data || {}).course || (x.data || {}).topic || '', instruction: x.instruction }));
    return json(res, 200, { queue: q });
  }
  if (path === '/api/admin/insights') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const rows = userRows();
    return json(res, 200, {
      rows, ranking: rows.filter(r => r.points > 0).slice(0, 20),
      aggregates: { usuarios: Object.keys(users()).length, activos: rows.filter(r => r.lastSeen).length, completaciones: rows.reduce((a, r) => a + r.completions.length, 0), examenes: readJsonl('exams.jsonl').filter(e => e.passed).length, aplicaciones: rows.reduce((a, r) => a + r.aplicaciones, 0) },
      puntos: { curso: 100, examen: 50, aplicacion: 40, feedbackAceptado: 20 },
    });
  }
  if (path === '/api/apply' && req.method === 'POST') {
    const s = session(req); if (!s) return json(res, 401, { error: 'no auth' });
    const b = await body(req);
    try { appendFileSync(W('applied.jsonl'), JSON.stringify({ user: s.u, course: String(b.course || '').slice(0, 80), commit: String(b.commit || '').slice(0, 300), result: String(b.result || '').slice(0, 300), ts: new Date().toISOString() }) + '\n'); } catch {}
    notifyAdmins('Aplicación en el trabajo', s.u + ': ' + String(b.commit || b.result || '').slice(0, 80), '/insights.html');
    return json(res, 200, { ok: true });
  }
  if (path === '/api/coach/me') {
    const s = session(req); if (!s) return json(res, 401, { error: 'no auth' });
    const t = teams(); const coachees = Object.keys(t).filter(u => t[u] === s.u);
    const me = userRows().find(r => r.user === s.u) || { points: 0, rank: 'Rookie' };
    return json(res, 200, { user: s.u, rank: me.rank, points: me.points, isCoach: coachees.length > 0, coachees: coachees.length });
  }
  if (path === '/api/coach/team') {
    const s = session(req); if (!s) return json(res, 401, { error: 'no auth' });
    const t = teams(); const mine = new Set(Object.keys(t).filter(u => t[u] === s.u));
    const rows = userRows().filter(r => mine.has(r.user)).map(r => ({ user: r.user, rank: r.rank, points: r.points, badges: r.badges, aplicaciones: r.aplicaciones, completions: r.completions, lastSeen: r.lastSeen }));
    return json(res, 200, { coach: s.u, team: rows });
  }
  if (path === '/api/admin/team' && req.method === 'POST') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    const b = await body(req); if (!b.user) return json(res, 400, { error: 'falta user' });
    const t = teams(); if (b.coach) t[b.user] = String(b.coach).slice(0, 60); else delete t[b.user];
    jsave(W('teams.json'), t);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/admin/settings') {
    const s = session(req); if (!s || s.role !== 'admin') return json(res, 403, { error: 'solo admin' });
    if (req.method === 'POST') {
      const b = await body(req); const cur = getSettings();
      if (b.autoValidate != null) cur.autoValidate = !!b.autoValidate;
      if (b.moderation != null) cur.moderation = !!b.moderation;
      if (b.maxPerDay != null) cur.maxPerDay = Math.max(0, Math.min(50, parseInt(b.maxPerDay, 10) || 0));
      jsave(W('settings.json'), cur);
      return json(res, 200, { ok: true, settings: cur });
    }
    return json(res, 200, { settings: getSettings() });
  }

  /* ----- AFILIACIÓN ----- */
  if (path.startsWith('/r/')) {
    const id = path.slice(3);
    let r = DB.resources[id];
    if (!r) { // recurso aún no registrado: usar u SOLO si su dominio está en la allowlist (evita open-redirect)
      const u = url.searchParams.get('u'); const dom = domainOf(u || '');
      if (u && /^https:\/\//i.test(u) && dom && DB.domains[dom] != null) r = { url: u, domain: dom };
    }
    if (!r || !/^https?:\/\//i.test(r.url)) { res.writeHead(404); return res.end('recurso no encontrado'); }
    clickLog({ id, domain: r.domain, course: (url.searchParams.get('c') || '').slice(0, 60), ts: new Date().toISOString() });
    res.writeHead(302, { location: withAffiliate(r.url, r.domain), 'cache-control': 'no-store' });
    return res.end();
  }
  if (path === '/aff/' || path === '/aff' || path === '/aff/index.html') {
    try { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(readFileSync(R('admin.html'))); }
    catch { res.writeHead(500); return res.end('sin admin.html'); }
  }
  if (path === '/aff/api/data') {
    DB = reload();
    const clicks = clicksByDomain();
    const rows = Object.entries(DB.opps).map(([domain, o]) => ({
      domain, status: DB.over[domain] || o.status, autoStatus: o.status, network: o.network || '',
      programUrl: o.programUrl || '', note: o.note || '', resources: o.resources || 0,
      clicks: clicks[domain] || 0, tag: DB.tags[domain] || null,
    })).sort((a, b) => b.clicks - a.clicks || b.resources - a.resources);
    return json(res, 200, { rows, totals: { dominios: rows.length, disponibles: rows.filter(r => r.autoStatus === 'DISPONIBLE').length, clics: Object.values(clicks).reduce((a, b) => a + b, 0) } });
  }
  if (path === '/aff/api/status' && req.method === 'POST') {
    const b = await body(req); if (!b.domain || !b.status) return json(res, 400, { error: 'faltan datos' });
    const o = jload(W('status-overrides.json'), {}); o[b.domain] = b.status; jsave(W('status-overrides.json'), o); DB = reload();
    return json(res, 200, { ok: true });
  }
  if (path === '/aff/api/tag' && req.method === 'POST') {
    const b = await body(req); if (!b.domain) return json(res, 400, { error: 'falta dominio' });
    const t = jload(W('affiliates.json'), {});
    if (b.value) t[b.domain] = { param: (b.param || 'ref').slice(0, 20), value: b.value.slice(0, 80) }; else delete t[b.domain];
    jsave(W('affiliates.json'), t); DB = reload();
    return json(res, 200, { ok: true });
  }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT, '127.0.0.1', () => console.log(`Brandooers en http://127.0.0.1:${PORT} (data=${DATA})`));
