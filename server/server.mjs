/* Brandooers · servidor de personalización en vivo (para desplegar en IONOS)
   - Sirve la plataforma estática (mismo repo).
   - POST /api/onboard      → agente entrevistador (lenguaje natural): pregunta y, cuando
                              tiene suficiente, devuelve un perfil rico. Modelo rápido (Haiku).
   - POST /api/personalize  → reescribe una sección del curso al perfil del usuario. Modelo
                              de calidad de copy (Sonnet). Cualquier sector, no listas cerradas.
   Node 18+ (usa fetch nativo, sin dependencias). Arranque: ANTHROPIC_API_KEY=... node server.mjs */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 8080;
const ROOT = process.env.STATIC_DIR || join(process.cwd(), '..'); // por defecto, la raíz del repo
const KEY = process.env.ANTHROPIC_API_KEY;
const GEN_MODEL  = process.env.GEN_MODEL  || 'claude-sonnet-4-6';        // reescritura de contenido
const FAST_MODEL = process.env.FAST_MODEL || 'claude-haiku-4-5-20251001'; // entrevista/extracción
// Origen permitido para las llamadas LLM (evita que cualquier web ajena use esta API a nuestro cargo).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://brandooers.com';

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.pdf':'application/pdf'};

// rate limit por IP (20 peticiones LLM / 10 min) — mismas cifras de espíritu que affiliate/server.mjs.
const hits = new Map();
function rateOk(ip) {
  const now = Date.now(), w = hits.get(ip) || { n: 0, t: now };
  if (now - w.t > 6e5) { w.n = 0; w.t = now; }
  w.n++; hits.set(ip, w); return w.n <= 20;
}

async function claude(model, system, messages, max = 1400) {
  if (!KEY) throw new Error('Falta ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: max, system, messages }),
    signal: AbortSignal.timeout(30_000),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'error API');
  return (d.content || []).map(c => c.text || '').join('');
}
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': ALLOWED_ORIGIN }); res.end(b); }
function firstJson(s) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); return JSON.parse(s.slice(a, b + 1)); }
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); }); }

/* ===== Catálogo (para que los agentes recomienden módulos reales) ===== */
const CATALOG = {
  coach:         { title: 'Coach de los que llegan', file: 'index.html', anclas: '#adn #perfil #pilares #herramientas #calendario', temas: ['ADN de equipo','personalidades (eneagrama/DISC)','liderazgo','coaching práctico','plan de 6 meses'] },
  outbound:      { title: 'Outbound Sales', file: 'outbound-sales.html', anclas: '#fundamentos #frameworks #prospeccion #objeciones #clientes #partners #herramientas #legal #recursos', temas: ['fundamentos','frameworks (MEDDIC/SPIN/Challenger)','prospección y cadencia','objeciones','captar clientes','captar partners','herramientas','marco legal'] },
  reclutamiento: { title: 'Reclutamiento de Partners (12 mód.)', file: 'reclutamiento-partners.html', anclas: '#mod-01 … #mod-12', temas: ['negocio','mindset','ICP','prospección','copywriting','LinkedIn','email frío','multicanal','webinars','objeciones','stack e IA','métricas'] },
  marketing:     { title: 'Marketing para Partners (12 mód.)', file: 'marketing-partners.html', anclas: '#mod-01 … #mod-12', temas: ['marketing sin humo','prospección B2B','outbound local','leads del PM','LinkedIn+contenido','SEO/GEO','web/conversión','paid ads','eventos/referidos','embudos/métricas','automatización','atribución'] }
};
const CATALOG_TXT = Object.entries(CATALOG).map(function (e) { return '- ' + e[0] + ' (' + e[1].title + ', ' + e[1].file + '; anclas: ' + e[1].anclas + '): ' + e[1].temas.join(', '); }).join('\n');
function slug(s) { return String(s).normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 48); }

/* ===== Agente director académico (onboarding: entrevista tipo máster) ===== */
const ONBOARD_SYS = `Eres el director académico de Brandooers, una escuela de ventas y marketing B2B con varios cursos. Actúas como el tutor de un máster que orienta a cada profesional. En español de España, cercano y breve.
Entrevista de máximo 5 preguntas, UNA a la vez, para averiguar: su puesto/rol, a qué se dedica y a quién vende, su NIVEL real por materia (novato/intermedio/experto), cuánto tiempo puede dedicar, y qué busca: resolver algo concreto ya, o profesionalizarse a fondo.
Con eso recomienda un FLUJO DE APRENDIZAJE COMBINADO entre cursos, corto o largo según su interés y nivel. Usa SOLO módulos reales del catálogo y construye los enlaces con fichero + ancla (reclutamiento y marketing usan #mod-01..#mod-12).
Catálogo:
${CATALOG_TXT}
Responde SIEMPRE con JSON válido, sin markdown:
- si necesitas más info: {"done": false, "question": "..."}
- cuando tengas bastante: {"done": true, "perfil": {"rol":"...","sector":"...","audiencia":"B2B|B2C|canal","icp":"...","dolores":["..."]}, "nivel": {"materia":"novato|intermedio|experto"}, "plan": {"duracion":"corto|medio|largo","objetivo":"...","porque":"...","flujo":[{"curso":"...","tema":"...","href":"fichero.html#ancla","minutos":30}]}}`;

/* ===== Agente examinador (tests → badges) ===== */
function examGenSys(n) { return 'Eres examinador de Brandooers. Crea ' + n + ' preguntas tipo test (4 opciones, una sola correcta) en español de España, de dificultad acorde al nivel indicado, sobre el tema del curso indicado. Devuelve SOLO JSON, SIN revelar la respuesta correcta: {"questions":[{"q":"...","options":["a","b","c","d"]}]}'; }
const EXAM_GRADE_SYS = 'Eres examinador de Brandooers. Te doy un test respondido (cada pregunta con la respuesta elegida por el alumno) sobre un tema. Corrige, puntúa 0-100 y da feedback breve y constructivo en español de España. Aprobado si score>=70. Devuelve SOLO JSON: {"score":n,"aprobado":true|false,"feedback":"...","por_pregunta":[{"q":"...","correcta":"...","bien":true|false}]}';

/* ===== Agente personalizador (reescribe una sección) ===== */
const PERSONALIZE_SYS = `Eres un experto en formación comercial y copywriting B2B en español de España. Te doy una sección canónica de un curso de outbound/marketing y un PERFIL de usuario. Reescribe la sección para que resuene 100% con el mundo de ese perfil: titulares, ejemplos y práctica con dolores, vocabulario y ejemplos de SU sector concreto. Nada genérico, nada de "ahorra tiempo y dinero". Mensajes con un solo CTA, tono humano. No inventes cifras ni estudios.
Devuelve SOLO JSON válido con la misma forma que la sección canónica que recibas (mismos campos: title, desc, hooks[{title,msg}], practica). Mantén el nº de hooks.`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': ALLOWED_ORIGIN, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET' }); return res.end(); }

    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');

    if (req.method === 'POST' && req.url === '/api/onboard') {
      if (!rateOk(ip)) return json(res, 429, { error: 'demasiadas peticiones, espera unos minutos' });
      const { history = [] } = await readBody(req);
      const msgs = history.length ? history : [{ role: 'user', content: 'Hola, quiero adaptar la formación a mi caso.' }];
      const out = await claude(FAST_MODEL, ONBOARD_SYS, msgs, 600);
      return json(res, 200, firstJson(out));
    }

    if (req.method === 'POST' && req.url === '/api/personalize') {
      if (!rateOk(ip)) return json(res, 429, { error: 'demasiadas peticiones, espera unos minutos' });
      const { profile, section } = await readBody(req);
      if (!profile || !section) return json(res, 400, { error: 'faltan profile o section' });
      const user = `PERFIL:\n${typeof profile === 'string' ? profile : JSON.stringify(profile)}\n\nSECCIÓN CANÓNICA (JSON):\n${JSON.stringify(section)}`;
      const out = await claude(GEN_MODEL, PERSONALIZE_SYS, [{ role: 'user', content: user }], 1600);
      return json(res, 200, firstJson(out));
    }

    if (req.method === 'POST' && req.url === '/api/exam') {
      if (!rateOk(ip)) return json(res, 429, { error: 'demasiadas peticiones, espera unos minutos' });
      const b = await readBody(req);
      if (b.mode === 'generate') {
        const out = await claude(FAST_MODEL, examGenSys(b.n || 5), [{ role: 'user', content: `Curso: ${b.curso}. Tema: ${b.tema}. Nivel: ${b.nivel || 'intermedio'}.` }], 1300);
        return json(res, 200, firstJson(out));
      }
      if (b.mode === 'grade') {
        const out = await claude(GEN_MODEL, EXAM_GRADE_SYS, [{ role: 'user', content: `Curso: ${b.curso}. Tema: ${b.tema}.\nTest respondido:\n${JSON.stringify(b.respuestas || [])}` }], 1500);
        const r = firstJson(out);
        if (r.aprobado) r.badge = { id: slug((b.curso || '') + '-' + (b.tema || '')), label: 'Badge · ' + (b.tema || b.curso) };
        return json(res, 200, r);
      }
      return json(res, 400, { error: 'mode debe ser generate o grade' });
    }

    // estático
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/' || path === '') path = '/hub.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end('forbidden'); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    if (req.url && req.url.startsWith('/api/')) return json(res, 500, { error: String(e.message || e) });
    res.writeHead(404); res.end('not found');
  }
});
server.listen(PORT, () => console.log(`Brandooers server en http://localhost:${PORT} (gen=${GEN_MODEL}, fast=${FAST_MODEL})`));
