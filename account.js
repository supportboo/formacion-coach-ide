/* Brandooers · menú de usuario (se inyecta en el VPS en cada página tras iniciar sesión).
   Muestra la cuenta, enlace a perfil, (si admin) usuarios + afiliación, y cerrar sesión.
   Lee /auth/me; la cookie de sesión es HttpOnly (no accesible por JS). */
(function () {
  "use strict";
  if (window.__bdAccount) return; window.__bdAccount = 1;
  function urlB64(b) { var p = '='.repeat((4 - b.length % 4) % 4); var s = (b + p).replace(/-/g, '+').replace(/_/g, '/'); var r = atob(s); var a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  async function enablePush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert('Este navegador no soporta notificaciones.'); return; }
      var perm = await Notification.requestPermission(); if (perm !== 'granted') { alert('Permiso de notificaciones denegado.'); return; }
      var reg = await navigator.serviceWorker.ready;
      var key = (await (await fetch('/api/push/key')).json()).key; if (!key) { alert('Notificaciones no configuradas en el servidor.'); return; }
      var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) });
      alert('Notificaciones activadas. Te avisaremos de peticiones, feedback y leads nuevos.');
    } catch (e) { alert('No se pudo activar: ' + (e.message || e)); }
  }
  function applyPrompt(course) {
    if (document.getElementById('bd-apply')) return;
    var s = document.createElement('style');
    s.textContent = '#bd-apply{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:3200;background:#fff;border:1px solid #E8E0E5;border-radius:16px;box-shadow:0 12px 40px rgba(139,92,246,.22);padding:16px 18px;width:min(440px,92vw);font-family:Inter,sans-serif}'
      + '#bd-apply h4{font-size:15px;color:#2D2D2D;margin:0 0 4px}#bd-apply p{font-size:12.5px;color:#8F8F8F;margin:0 0 10px;line-height:1.5}'
      + '#bd-apply .r{display:flex;gap:8px}#bd-apply input{flex:1;font-family:inherit;font-size:14px;padding:10px 12px;border:1px solid #E8E0E5;border-radius:10px}'
      + '#bd-apply button.go{font-family:inherit;font-size:13px;font-weight:700;border:0;border-radius:10px;padding:10px 14px;background:#8B5CF6;color:#fff;cursor:pointer;white-space:nowrap}'
      + '#bd-apply .x{position:absolute;top:8px;right:12px;background:none;border:0;color:#8F8F8F;font-size:20px;cursor:pointer;padding:0}';
    document.head.appendChild(s);
    var w = document.createElement('div'); w.id = 'bd-apply';
    w.innerHTML = '<button class="x" aria-label="Cerrar">×</button><h4>🎯 ¡Curso completado! Ahora aplícalo.</h4><p>¿Qué vas a poner en práctica esta semana? Compromételo: suma puntos y tu coach lo verá.</p><div class="r"><input id="bd-apply-in" placeholder="Ej.: usar el guion de objeciones con 3 clientes"><button class="go" id="bd-apply-go">Comprometerme</button></div>';
    document.body.appendChild(w);
    w.querySelector('.x').onclick = function () { w.remove(); };
    w.querySelector('#bd-apply-go').onclick = function () {
      var v = w.querySelector('#bd-apply-in').value.trim(); if (!v) { w.querySelector('#bd-apply-in').focus(); return; }
      fetch('/api/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course: course, commit: v }) });
      w.innerHTML = '<h4>¡Hecho! 💪</h4><p style="margin:0">Compromiso guardado. Cuéntanos el resultado cuando lo apliques.</p>';
      setTimeout(function () { w.remove(); }, 3500);
    };
  }
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
            applyPrompt(course);
          }
        };
        window.addEventListener('scroll', chk, { passive: true }); setTimeout(chk, 2000);
      }
    } catch (e) {}
    var css = document.createElement('style');
    css.textContent =
      '.bd-acc{position:fixed;top:9px;right:14px;z-index:3000;font-family:Inter,system-ui,sans-serif}' +
      '.bd-chip{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E8E0E5;border-radius:100px;padding:4px 6px 4px 4px;cursor:pointer;box-shadow:0 1px 4px rgba(139,92,246,.08)}' +
      '.bd-av{width:28px;height:28px;border-radius:50%;background:#8B5CF6;color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}' +
      '.bd-nm{font-size:13px;font-weight:600;color:#2D2D2D;padding-right:4px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.bd-menu{position:absolute;top:44px;right:0;background:#fff;border:1px solid #E8E0E5;border-radius:12px;box-shadow:0 8px 30px rgba(139,92,246,.14);min-width:190px;padding:6px;display:none}' +
      '.bd-menu.open{display:block}' +
      '.bd-menu .who{padding:8px 10px 10px;border-bottom:1px solid #F0EAEE;margin-bottom:6px}' +
      '.bd-menu .who b{display:block;font-size:13px;color:#2D2D2D}' +
      '.bd-menu .who span{font-size:11px;color:#8F8F8F;text-transform:uppercase;letter-spacing:.04em}' +
      '.bd-menu a{display:block;padding:9px 10px;font-size:13px;color:#4A4A4A;text-decoration:none;border-radius:8px}' +
      '.bd-menu a:hover{background:#F5F0EE;color:#8B5CF6}' +
      '.bd-menu a.out{color:#c92a2a;border-top:1px solid #F0EAEE;margin-top:4px;padding-top:11px}' +
      '.bd-prep{position:fixed;left:14px;bottom:14px;z-index:3000;font-family:Inter,sans-serif}' +
      '.bd-prep .pill{display:flex;align-items:center;gap:8px;background:#2D2D2D;color:#fff;border-radius:100px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.22)}' +
      '.bd-prep .spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#67E8F9;border-radius:50%;animation:bdspin .8s linear infinite}' +
      '@keyframes bdspin{to{transform:rotate(360deg)}}' +
      '.bd-prep .box{position:absolute;left:0;bottom:46px;background:#fff;border:1px solid #E8E0E5;border-radius:12px;box-shadow:0 10px 34px rgba(139,92,246,.16);width:288px;padding:8px;display:none}' +
      '.bd-prep.open .box{display:block}' +
      '.bd-prep .it{padding:9px 8px;border-bottom:1px solid #F0EAEE}.bd-prep .it:last-child{border-bottom:0}' +
      '.bd-prep .it b{display:block;font-size:12.5px;color:#2D2D2D;line-height:1.3}' +
      '.bd-prep .it .s{font-size:11px;color:#8F8F8F;margin-top:2px}' +
      '.bd-prep .it .ready{color:#0891B2;font-weight:700;font-size:12px;text-decoration:none}' +
      '.bd-prep .barp{height:5px;background:#F0EAEE;border-radius:3px;margin-top:5px;overflow:hidden}' +
      '.bd-prep .barp i{display:block;height:100%;background:linear-gradient(90deg,#00D4FF,#8B5CF6,#EC4899);transition:width .4s}';
    document.head.appendChild(css);
    var wrap = document.createElement('div'); wrap.className = 'bd-acc';
    wrap.innerHTML =
      '<div class="bd-chip" id="bdChip"><span class="bd-av">' + me.user.charAt(0).toUpperCase() + '</span><span class="bd-nm">' + me.user + '</span></div>' +
      '<div class="bd-menu" id="bdMenu">' +
      '<div class="who"><b>' + me.user + '</b><span>' + (isAdmin ? 'Administrador' : 'Miembro') + '</span></div>' +
      '<a href="/perfil.html">Mi perfil</a>' +
      (isAdmin ? '<a href="/panel.html">Panel de control</a><a href="#" class="bd-push">🔔 Activar notificaciones</a><a href="/insights.html">Insights &amp; ranking</a><a href="/revisiones.html">Revisiones</a><a href="/produccion.html">Producción</a><a href="/usuarios.html">Usuarios del equipo</a><a href="/aff/">Panel de afiliación</a>' : '') +
      '<a class="out" href="/auth/logout">Cerrar sesión</a>' +
      '</div>';
    document.body.appendChild(wrap);
    var menu = document.getElementById('bdMenu');
    document.getElementById('bdChip').addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', function () { menu.classList.remove('open'); });
    var pb = wrap.querySelector('.bd-push'); if (pb) pb.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); menu.classList.remove('open'); enablePush(); });
    fetch('/api/coach/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (!c) return;
      var who = menu.querySelector('.who span'); if (who && c.rank) who.textContent = (isAdmin ? 'Administrador · ' : '') + c.rank + ' · ' + c.points + ' pts';
      if (c.isCoach) { var link = document.createElement('a'); link.href = '/equipo.html'; link.textContent = '👥 Mi equipo (' + c.coachees + ')'; var out = menu.querySelector('a.out'); if (out) menu.insertBefore(link, out); }
    }).catch(function () {});
    // indicador de cursos en preparación (barra lateral) para el alumno
    var STG = { solicitado: ['Solicitado', 10], cola: ['En cola', 20], research: ['Investigando', 40], verify: ['Verificando', 55], build: ['Construyendo', 70], validate: ['Validando', 88], publish: ['Publicado', 100] };
    fetch('/api/mis-cursos', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (mc) {
      if (!mc || !mc.cursos || !mc.cursos.length) return;
      var prep = mc.cursos.filter(function (c) { return !(c.stage === 'publish' && c.courseUrl); });
      var items = mc.cursos.map(function (c) {
        var st = STG[c.stage] || STG.cola, pub = (c.stage === 'publish' && c.courseUrl), safe = (c.topic || '').replace(/[&<>"]/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]; });
        return '<div class="it"><b>' + safe + '</b>' + (pub ? '<a class="ready" href="' + c.courseUrl + '">✓ Listo · abrir curso →</a>' : '<div class="s">' + st[0] + ' · ' + (c.eta || 'ETA 24 h') + '</div><div class="barp"><i style="width:' + st[1] + '%"></i></div>') + '</div>';
      }).join('');
      var w = document.createElement('div'); w.className = 'bd-prep';
      w.innerHTML = '<div class="pill" id="bdPrepPill">' + (prep.length ? '<span class="spin"></span> ' + prep.length + ' curso' + (prep.length > 1 ? 's' : '') + ' en preparación' : '✓ tus cursos listos') + '</div><div class="box">' + items + '</div>';
      document.body.appendChild(w);
      document.getElementById('bdPrepPill').addEventListener('click', function (e) { e.stopPropagation(); w.classList.toggle('open'); });
      document.addEventListener('click', function () { w.classList.remove('open'); });
    }).catch(function () {});
  }).catch(function () {});
})();
