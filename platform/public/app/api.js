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
      const s = (body && (body.data || body)) || null; // el shape exacto puede venir envuelto en {data:...}
      // Perfiles de prueba: el banner se engancha aqui (no en requireSession) porque no todas las
      // paginas llaman a requireSession - inicio.html, por ejemplo, usa session() directamente.
      if (s && s.session && s.session.impersonatedBy) showImpersonationBanner(s);
      return s;
    } catch { return null; }
  }

  async function requireSession(redirectTo) {
    const s = await session();
    if (!s || !s.user) { window.location.href = redirectTo || '/app/login.html'; return null; }
    return s;
  }

  // Perfiles de prueba (Consola > Perfiles de prueba): banner fijo mientras el superadmin esta
  // "dentro" de un usuario de prueba, con salida de un click. Se engancha solo desde requireSession,
  // asi que aparece en cualquier pagina de la app sin tocarlas una a una.
  var ROLE_LABEL = { empleado: 'Empleado', coach: 'Coach', team_leader: 'Team Leader', inspirador: 'Inspirador', admin: 'Admin', direccion: 'Dirección' };
  function showImpersonationBanner(s) {
    if (document.getElementById('impBanner')) return;
    var b = document.createElement('div');
    b.id = 'impBanner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;align-items:center;gap:10px;' +
      'justify-content:center;padding:8px 14px;background:linear-gradient(120deg,#F0C645,#8a5f7c);color:#1a1820;' +
      'font:700 13px Inter,system-ui,sans-serif;box-shadow:0 2px 14px rgba(0,0,0,.35)';
    b.innerHTML = '<span>🧪 Perfil de prueba: ' + escHtml(s.user.name || s.user.email) + '</span>' +
      '<select id="impSwitch" style="border:0;border-radius:8px;padding:5px 8px;font:inherit;font-weight:700;cursor:pointer;background:rgba(26,24,32,.25);color:#1a1820"><option value="">Cambiar a…</option></select>' +
      '<button id="impExit" style="border:0;border-radius:8px;padding:5px 12px;font:inherit;font-weight:800;cursor:pointer;background:#1a1820;color:#fff">Salir</button>';
    document.body.appendChild(b);
    api('/api/org/me').then(function (me) {
      var lbl = ROLE_LABEL[me && me.role] || (me && me.role);
      if (lbl) b.querySelector('span').textContent = '🧪 Perfil de prueba: ' + (s.user.name || s.user.email) + ' · ' + lbl;
    }).catch(function () {});
    api('/api/platform/test-profiles').then(function (d) {
      var sel = document.getElementById('impSwitch');
      (d && d.profiles || []).forEach(function (p) {
        if (p.userId === s.user.id) return; // no listarse a si mismo
        var o = document.createElement('option');
        o.value = p.userId; o.dataset.org = p.organizationId;
        o.textContent = ROLE_LABEL[p.orgRole] || p.orgRole;
        sel.appendChild(o);
      });
    }).catch(function () {});
    document.getElementById('impSwitch').onchange = async function () {
      var opt = this.selectedOptions[0]; if (!opt || !opt.value) return;
      this.disabled = true;
      await fetch('/api/auth/admin/stop-impersonating', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(function () {});
      await fetch('/api/auth/admin/impersonate-user', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: opt.value }) }).catch(function () {});
      await fetch('/api/auth/organization/set-active', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: opt.dataset.org }) }).catch(function () {});
      window.location.href = '/app/inicio.html';
    };
    document.getElementById('impExit').onclick = function () {
      this.disabled = true; this.textContent = 'Saliendo…';
      fetch('/api/auth/admin/stop-impersonating', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })
        .finally(function () { window.location.href = '/app/superadmin.html'; });
    };
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
