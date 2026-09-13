// Helper mínimo de fetch para la app real de SkillUp. Sin dependencias.
// Sesión: cookies de better-auth (credentials same-origin). Sin backend propio de sesión.
window.SkillUp = (function () {
  async function api(path, opts) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...opts,
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* respuesta vacía */ }
    if (!res.ok) throw new Error((data && (data.error || data.message)) || ('error ' + res.status));
    return data;
  }

  async function session() {
    try {
      const r = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const body = await r.json().catch(() => null);
      return (body && (body.data || body)) || null; // el shape exacto puede venir envuelto en {data:...}
    } catch { return null; }
  }

  async function requireSession(redirectTo) {
    const s = await session();
    if (!s || !s.user) { window.location.href = redirectTo || '/app/login.html'; return null; }
    return s;
  }

  function escHtml(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /**
   * Gráfica de línea mínima en SVG puro (sin librería: la app no tiene build ni deps de frontend).
   * points: [{day:'YYYY-MM-DD', <key>: number}, ...] ya ordenados por fecha.
   * Devuelve el string SVG listo para meter en innerHTML, o un mensaje si no hay serie (2+ puntos).
   */
  function lineChart(points, key, opts) {
    opts = opts || {};
    const w = opts.width || 560, h = opts.height || 160, pad = 28;
    if (!points || points.length < 2) {
      return '<p class="msg">Todavía no hay suficiente histórico (hace falta más de un día con datos).</p>';
    }
    const values = points.map((p) => Number(p[key]) || 0);
    const min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / (points.length - 1);
    const yOf = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
    const coords = values.map((v, i) => [pad + i * stepX, yOf(v)]);
    const line = coords.map((c) => c.join(',')).join(' ');
    const area = 'M' + pad + ',' + (h - pad) + ' L' + coords.map((c) => c.join(',')).join(' L') + ' L' + (w - pad) + ',' + (h - pad) + ' Z';
    const color = opts.color || '#8B5CF6';
    const fmt = opts.format || function (v) { return String(v); };
    const firstDay = points[0].day, lastDay = points[points.length - 1].day;
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;overflow:visible" role="img" aria-label="' + (opts.label || key) + '">' +
      '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="#E8E0E5" stroke-width="1"/>' +
      '<path d="' + area + '" fill="' + color + '" opacity="0.08"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + coords[coords.length - 1][0] + '" cy="' + coords[coords.length - 1][1] + '" r="4" fill="' + color + '"/>' +
      '<text x="' + pad + '" y="14" font-size="11" fill="#8F8F8F">' + escHtml(fmt(max)) + '</text>' +
      '<text x="' + pad + '" y="' + (h - pad + 16) + '" font-size="10.5" fill="#8F8F8F">' + escHtml(firstDay) + '</text>' +
      '<text x="' + (w - pad) + '" y="' + (h - pad + 16) + '" font-size="10.5" fill="#8F8F8F" text-anchor="end">' + escHtml(lastDay) + '</text>' +
      '<text x="' + (w - pad) + '" y="' + (coords[coords.length - 1][1] - 8) + '" font-size="12" font-weight="700" fill="' + color + '" text-anchor="end">' + escHtml(fmt(values[values.length - 1])) + '</text>' +
      '</svg>';
  }

  return { api, session, requireSession, escHtml, lineChart };
})();
