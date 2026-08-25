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

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.pdf':'application/pdf'};

async function claude(model, system, messages, max = 1400) {
  if (!KEY) throw new Error('Falta ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: max, system, messages })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'error API');
  return (d.content || []).map(c => c.text || '').join('');
}
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(b); }
function firstJson(s) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); return JSON.parse(s.slice(a, b + 1)); }
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); }); }

/* ===== Agente entrevistador (onboarding en lenguaje natural) ===== */
const ONBOARD_SYS = `Eres el asesor de onboarding de una plataforma de formación comercial (Brandooers). Entrevistas al usuario en español de España, cercano y breve, para entender su caso real y poder adaptar la formación a su mundo.
Haz UNA pregunta a la vez, máximo 4-5 en total. Cubre: a qué se dedica y a quién vende (B2B/B2C, sector concreto), qué le cuesta más hoy, ticket (pocos clientes de valor alto o volumen), y por qué canal le llegan clientes ahora.
Cuando ya tengas suficiente, deja de preguntar y devuelve el perfil.
Responde SIEMPRE con JSON válido, sin markdown:
- si necesitas más info: {"done": false, "question": "tu siguiente pregunta"}
- cuando tengas bastante: {"done": true, "profile": {"resumen": "1-2 frases de quién es", "sector": "...", "audiencia": "B2B|B2C|canal", "icp": "a quién capta", "ticket": "bajo|medio|alto", "canal": "...", "dolores": ["...","..."]}}`;

/* ===== Agente personalizador (reescribe una sección) ===== */
const PERSONALIZE_SYS = `Eres un experto en formación comercial y copywriting B2B en español de España. Te doy una sección canónica de un curso de outbound/marketing y un PERFIL de usuario. Reescribe la sección para que resuene 100% con el mundo de ese perfil: titulares, ejemplos y práctica con dolores, vocabulario y ejemplos de SU sector concreto. Nada genérico, nada de "ahorra tiempo y dinero". Mensajes con un solo CTA, tono humano. No inventes cifras ni estudios.
Devuelve SOLO JSON válido con la misma forma que la sección canónica que recibas (mismos campos: title, desc, hooks[{title,msg}], practica). Mantén el nº de hooks.`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET' }); return res.end(); }

    if (req.method === 'POST' && req.url === '/api/onboard') {
      const { history = [] } = await readBody(req);
      const msgs = history.length ? history : [{ role: 'user', content: 'Hola, quiero adaptar la formación a mi caso.' }];
      const out = await claude(FAST_MODEL, ONBOARD_SYS, msgs, 600);
      return json(res, 200, firstJson(out));
    }

    if (req.method === 'POST' && req.url === '/api/personalize') {
      const { profile, section } = await readBody(req);
      if (!profile || !section) return json(res, 400, { error: 'faltan profile o section' });
      const user = `PERFIL:\n${typeof profile === 'string' ? profile : JSON.stringify(profile)}\n\nSECCIÓN CANÓNICA (JSON):\n${JSON.stringify(section)}`;
      const out = await claude(GEN_MODEL, PERSONALIZE_SYS, [{ role: 'user', content: user }], 1600);
      return json(res, 200, firstJson(out));
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
