/* Brandooers · afiliación — utilidades compartidas (sin dependencias). */

// Mismo hash que resources.js (para que los ids del registro casen con los del front)
export function resId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'r' + (h >>> 0).toString(36);
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Extrae recursos externos (enlaces de valor) de un HTML. Mismo criterio que resources.js.
export function extractResources(html) {
  const out = [];
  const re = /<a\b[^>]*?href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!/^https?:\/\//i.test(href)) continue;
    const attrs = m[0];
    // solo enlaces "recurso": clases rsrc/bthumb, dentro de listas de recursos, amazon, o data-res explícito
    const isResource =
      /class="[^"]*\b(rsrc|bthumb)\b/i.test(attrs) ||
      /data-res=/i.test(attrs) ||
      /amazon\./i.test(href) ||
      /(youtube\.com|youtu\.be|open\.spotify|linkedin\.com\/in|joshbraun|gong\.io|crossbeam|predictablerevenue|30mpc|outboundsquad|partnershipleaders|cognism|lavender|backlinko|ahrefs|sparktoro|agorapulse)/i.test(href);
    if (!isResource) continue;
    const label = m[2].replace(/<[^>]+>/g, '').trim().slice(0, 80);
    out.push({ id: resId(href), url: href, domain: domainOf(href), label });
  }
  return out;
}
