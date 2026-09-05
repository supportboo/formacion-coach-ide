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
    if (!res.ok) throw new Error((data && data.error) || ('error ' + res.status));
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

  return { api, session, requireSession, escHtml };
})();
