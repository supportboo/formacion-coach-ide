/* Brandooers · menú de usuario (se inyecta en el VPS en cada página tras iniciar sesión).
   Muestra la cuenta, enlace a perfil, (si admin) usuarios + afiliación, y cerrar sesión.
   Lee /auth/me; la cookie de sesión es HttpOnly (no accesible por JS). */
(function () {
  "use strict";
  if (window.__bdAccount) return; window.__bdAccount = 1;
  fetch('/auth/me', { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) { if (!/\/login\.html$/.test(location.pathname)) location.href = '/login.html'; return null; }
    return r.json();
  }).then(function (me) {
    if (!me || !me.user) return;
    var path = location.pathname;
    var isAdmin = me.role === 'admin';
    // onboarding automático: un alumno sin perfil va a hacerlo antes de nada
    if (!isAdmin && !/\/onboarding\.html$/.test(path)) {
      var prof0 = null; try { prof0 = JSON.parse(localStorage.getItem('brand_prefs') || 'null'); } catch (_) {}
      if (!prof0 || !prof0.archetype) { location.href = '/onboarding.html'; return; }
    }
    // registro de uso (vista de página)
    try { fetch('/api/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: path, user: me.user }) }); } catch (e) {}
    // compleción de curso: al llegar al ~90% de una página de curso
    try {
      if (/(index|outbound-sales|reclutamiento-partners|marketing-partners|guia-coach-odoo)\.html$/.test(path)) {
        var cs = document.querySelector('script[data-course]');
        var course = (cs && cs.getAttribute('data-course')) || document.title || path;
        var doneSent = false;
        var chk = function () {
          if (doneSent) return;
          var h = document.documentElement;
          if ((h.scrollTop + window.innerHeight) / (h.scrollHeight || 1) > 0.9) {
            doneSent = true;
            fetch('/api/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course: course, done: true, user: me.user }) });
          }
        };
        window.addEventListener('scroll', chk, { passive: true }); setTimeout(chk, 2000);
      }
    } catch (e) {}
    var css = document.createElement('style');
    css.textContent =
      '.bd-acc{position:fixed;top:9px;right:14px;z-index:3000;font-family:Inter,system-ui,sans-serif}' +
      '.bd-chip{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E8E0E5;border-radius:100px;padding:4px 6px 4px 4px;cursor:pointer;box-shadow:0 1px 4px rgba(113,75,103,.08)}' +
      '.bd-av{width:28px;height:28px;border-radius:50%;background:#714B67;color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}' +
      '.bd-nm{font-size:13px;font-weight:600;color:#2D2D2D;padding-right:4px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.bd-menu{position:absolute;top:44px;right:0;background:#fff;border:1px solid #E8E0E5;border-radius:12px;box-shadow:0 8px 30px rgba(113,75,103,.14);min-width:190px;padding:6px;display:none}' +
      '.bd-menu.open{display:block}' +
      '.bd-menu .who{padding:8px 10px 10px;border-bottom:1px solid #F0EAEE;margin-bottom:6px}' +
      '.bd-menu .who b{display:block;font-size:13px;color:#2D2D2D}' +
      '.bd-menu .who span{font-size:11px;color:#8F8F8F;text-transform:uppercase;letter-spacing:.04em}' +
      '.bd-menu a{display:block;padding:9px 10px;font-size:13px;color:#4A4A4A;text-decoration:none;border-radius:8px}' +
      '.bd-menu a:hover{background:#F5F0EE;color:#714B67}' +
      '.bd-menu a.out{color:#c92a2a;border-top:1px solid #F0EAEE;margin-top:4px;padding-top:11px}';
    document.head.appendChild(css);
    var wrap = document.createElement('div'); wrap.className = 'bd-acc';
    wrap.innerHTML =
      '<div class="bd-chip" id="bdChip"><span class="bd-av">' + me.user.charAt(0).toUpperCase() + '</span><span class="bd-nm">' + me.user + '</span></div>' +
      '<div class="bd-menu" id="bdMenu">' +
      '<div class="who"><b>' + me.user + '</b><span>' + (isAdmin ? 'Administrador' : 'Miembro') + '</span></div>' +
      '<a href="/perfil.html">Mi perfil</a>' +
      (isAdmin ? '<a href="/panel.html">Panel de control</a><a href="/insights.html">Insights &amp; ranking</a><a href="/revisiones.html">Revisiones</a><a href="/usuarios.html">Usuarios del equipo</a><a href="/aff/">Panel de afiliación</a>' : '') +
      '<a class="out" href="/auth/logout">Cerrar sesión</a>' +
      '</div>';
    document.body.appendChild(wrap);
    var menu = document.getElementById('bdMenu');
    document.getElementById('bdChip').addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', function () { menu.classList.remove('open'); });
  }).catch(function () {});
})();
