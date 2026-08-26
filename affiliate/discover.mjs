/* Brandooers · afiliación — descubre si cada dominio tiene programa de afiliados.
   Heurística: known-map + sondeo de rutas + firmas de red. Ejecutar: node affiliate/discover.mjs
   Salida: affiliate/opportunities.json  { domain: {status, network, programUrl, note, checkedTs, resources} } */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Casos conocidos (evita sondear lo obvio y no monetizable)
const KNOWN = {
  'amazon.es': { status: 'DISPONIBLE', network: 'Amazon Associates', programUrl: 'https://afiliados.amazon.es/', note: 'Alta manual + regla 3 ventas/180d. Libros ~5-7% (0% instituciones educativas).' },
  'amazon.com': { status: 'DISPONIBLE', network: 'Amazon Associates', programUrl: 'https://affiliate-program.amazon.com/', note: 'Tag por locale.' },
  'youtube.com': { status: 'SIN_PROGRAMA', network: '', note: 'Embed: manda visitas al autor, no monetizable por nosotros.' },
  'youtu.be': { status: 'SIN_PROGRAMA', network: '', note: 'Embed.' },
  'open.spotify.com': { status: 'SIN_PROGRAMA', network: '', note: 'Enlace al pódcast del autor.' },
  'es.wikipedia.org': { status: 'SIN_PROGRAMA', network: '', note: 'Fuente, sin afiliación.' },
  'linkedin.com': { status: 'SIN_PROGRAMA', network: '', note: 'Perfil de experto, sin afiliación.' },
  'business.linkedin.com': { status: 'SIN_PROGRAMA', network: '' },
};

// Firmas de red en el HTML → a qué red aplicar
const SIGNS = [
  [/impact\.com|impactradius|\.impact\.com/i, 'Impact.com'],
  [/partnerstack|prtnr\.link/i, 'PartnerStack'],
  [/shareasale|awin\.com|dwin1\.com/i, 'Awin (ex-ShareASale)'],
  [/cj\.com|commission junction|dpbolvw|anrdoezrs|tkqlhce/i, 'CJ'],
  [/rakuten|linksynergy/i, 'Rakuten'],
  [/refersion/i, 'Refersion'],
  [/tapfiliate/i, 'Tapfiliate'],
  [/rewardful/i, 'Rewardful'],
  [/firstpromoter|fprom/i, 'FirstPromoter'],
  [/getambassador|partnerize/i, 'Partnerize'],
];
const AFF_WORDS = /(afiliad|affiliate|partner program|programa de partners|referral program|programa de referidos|become a partner|partners? program)/i;
const AFF_PATHS = ['/affiliates', '/affiliate', '/affiliate-program', '/partners', '/partner-program', '/partners/affiliate', '/es/afiliados', '/referral', '/programa-de-afiliados'];

async function get(url, ms = 8000) {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    const r = await fetch(url, { redirect: 'follow', signal: c.signal, headers: { 'user-agent': 'BrandooersBot/1.0 (+afiliacion; contacto)' } });
    clearTimeout(t);
    if (!r.ok) return { ok: false, status: r.status, html: '' };
    return { ok: true, status: r.status, url: r.url, html: (await r.text()).slice(0, 200000) };
  } catch { return { ok: false, status: 0, html: '' }; }
}
function detectNet(html) { for (const [re, name] of SIGNS) if (re.test(html)) return name; return ''; }

async function probe(domain) {
  const base = `https://${domain}`;
  const home = await get(base);
  let net = home.ok ? detectNet(home.html) : '';
  let programUrl = '', hint = home.ok && AFF_WORDS.test(home.html);
  // buscar enlace explícito a página de afiliados en el home
  if (home.ok) {
    const m = home.html.match(/href="([^"]*(?:afili|affiliate|partner|referr)[^"]*)"/i);
    if (m) { try { programUrl = new URL(m[1], base).href; } catch {} }
  }
  // sondear rutas comunes si aún no hay señal fuerte
  if (!net || !programUrl) {
    for (const p of AFF_PATHS.slice(0, 5)) {
      const r = await get(base + p, 6000);
      if (r.ok && (AFF_WORDS.test(r.html) || detectNet(r.html))) { programUrl = programUrl || r.url; net = net || detectNet(r.html); hint = true; break; }
    }
  }
  const status = (net || programUrl || hint) ? 'DISPONIBLE' : 'SIN_PROGRAMA';
  return { status, network: net, programUrl, note: hint && !net ? 'Señal de programa; confirmar red.' : '' };
}

const domains = JSON.parse(await readFile(join(HERE, 'domains.json'), 'utf8'));
let prev = {}; try { prev = JSON.parse(await readFile(join(HERE, 'opportunities.json'), 'utf8')); } catch {}
const out = {};
const list = Object.keys(domains);
for (const d of list) {
  if (KNOWN[d]) { out[d] = { ...KNOWN[d], resources: domains[d], checkedTs: new Date().toISOString(), userStatus: prev[d]?.userStatus, tag: prev[d]?.tag }; continue; }
  process.stdout.write(`· ${d} … `);
  const r = await probe(d);
  out[d] = { ...r, resources: domains[d], checkedTs: new Date().toISOString(), userStatus: prev[d]?.userStatus, tag: prev[d]?.tag };
  console.log(r.status + (r.network ? ` [${r.network}]` : ''));
}
await writeFile(join(HERE, 'opportunities.json'), JSON.stringify(out, null, 0), 'utf8');
const avail = Object.values(out).filter(o => o.status === 'DISPONIBLE').length;
console.log(`\nOK opportunities.json · ${avail}/${list.length} dominios con programa detectado`);
