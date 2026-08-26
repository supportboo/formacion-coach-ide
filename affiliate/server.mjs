/* Brandooers · afiliación — servicio (Node, sin dependencias, escucha solo en 127.0.0.1).
   - GET /r/:id           redirector SEGURO (registro/allowlist; añade tag afiliado + UTM; registra clic anónimo)
   - GET /aff/            panel de admin (Nginx pone Basic Auth delante)
   - GET /aff/api/data    oportunidades + clics
   - POST /aff/api/status cambiar estado (se guarda en overrides, no toca el JSON versionado)
   - POST /aff/api/tag    fijar el tag de afiliado de un dominio
   Lectura del registro desde su carpeta; ESCRITURA solo en AFF_DATA (para correr como usuario sin privilegios).
   Arranque: AFF_PORT=8090 AFF_DATA=/var/lib/brandooers-aff node server.mjs */
import http from 'node:http';
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
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

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
server.listen(PORT, '127.0.0.1', () => console.log(`Brandooers afiliación en http://127.0.0.1:${PORT} (data=${DATA})`));
