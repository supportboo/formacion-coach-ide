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
      const db = users(); const rs = jload(W('resets.json'), {});
      return json(res, 200, {
        users: Object.entries(db).map(([u, r]) => ({ u, role: r.role || 'member', created: r.created || '' })).sort((a, b) => a.u.localeCompare(b.u)),
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
