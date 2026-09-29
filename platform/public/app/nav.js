// Menú lateral plegable con burbujas, compartido por todas las páginas de la app.
// Objetivo (petición de Marc): en móvil no tener menú arriba + scroll; una burbuja flotante que
// despliega un cajón lateral con los destinos según el rol. Sin emojis: iconos SVG de marca.
// Se auto-inyecta al cargar. Depende de window.SkillUp (api.js) para saber el rol.
(function () {
  if (window.__sunav) return; window.__sunav = true;

  var LANGS = (window.SUI18n && SUI18n.LANGS) || { es: 'Español', en: 'English', ca: 'Català', pt: 'Português', fr: 'Français' };
  var ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h7a3 3 0 0 1 3 3v6M6 8v7a3 3 0 0 0 3 3h7"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/>',
    trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 15h6M10 15v4M14 15v4M8 19h8"/>',
    dna: '<path d="M7 3c0 5 10 5 10 10s-10 5-10 10M17 3c0 5-10 5-10 10s10 5 10 10"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.5a2.8 2.8 0 1 1 3.6 2.7c-.8.3-1.3 1-1.3 1.8v.3"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none"/>',
    pyramid: '<path d="M12 3l9 17H3z"/><path d="M7.5 12h9M9.7 7.5h4.6"/>',
    exit: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    chat: '<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M17 9h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-3"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
    live: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    assign: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 12l2.5 2.5L16 9"/>'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[k] || ICON.home) + '</svg>'; }

  // destino: [href, etiqueta (es), 'clave i18n|icono', grupo]  grupo: 'base' | 'manager' | 'super'
  var LINKS = [
    ['/app/dashboard.html', 'Mi panel', 'nav.dashboard|home', 'base'],
    ['/app/inicio.html', 'Formaciones', 'nav.courses|route', 'base'],
    ['/app/explorar.html', 'Explorar', 'nav.explore|compass', 'base'],
    ['/app/videos.html', 'Vídeos', 'nav.videos|video', 'base'],
    ['/app/roleplays.html', 'Roleplays', 'nav.roleplays|chat', 'base'],
    ['/app/sesiones.html', 'Formaciones que impartes', 'nav.sessions|chat', 'base'],
    ['/app/ranking.html', 'Ranking', 'nav.ranking|trophy', 'base'],
    ['/app/certificado.html', 'Certificados', 'nav.certs|award', 'base'],
    ['/app/team-dna.html', 'Team DNA', 'nav.teamdna|dna', 'base'],
    ['/app/ayuda.html', 'Ayuda', 'nav.help|help', 'base'],
    ['/app/privacidad.html', 'Tus datos', 'nav.privacy|check', 'base'],
    ['/app/asignar.html', 'Asignar pruebas', 'nav.assign|assign', 'manager'],
    ['/app/validar.html', 'Validar casos', 'nav.validate|check', 'manager'],
    ['/app/metricas.html', 'Métricas e insights', 'nav.metrics|chart', 'live'],
    ['/app/en-directo.html', 'En directo', 'nav.live|live', 'live'],
    ['/app/panel.html', 'Panel de empresa', 'nav.company|building', 'manager'],
    ['/app/palabras.html', 'Uso del chat', 'nav.chatuse|gear', 'fb'],
    ['/app/piramides.html', 'Pirámides', 'nav.pyramids|pyramid', 'manager'],
    ['/app/informe-roi.html', 'Informe de ROI', 'nav.roi|chart', 'manager'],
    ['/app/feedback.html', 'Feedback', 'nav.feedback|inbox', 'fb'],
    ['/app/superadmin.html', 'Consola', 'nav.console|gear', 'super']
  ];

  var css = '' +
    // Botón redondo abajo a la izquierda, apilado ENCIMA de «Manos libres» (bottom:16) y su «?» (bottom:62):
    // zona del pulgar, no tapa el texto (la pestaña a media altura tapaba el inicio de cada línea).
    // --su-bbar = alto de la barra inferior propia de la página (inicio/lección), para no pisarla.
    '.sunav-fab{position:fixed;left:14px;bottom:calc(var(--su-bbar,0px) + 106px + env(safe-area-inset-bottom,0px));z-index:1200;width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;background:var(--grad,#8a5f7c);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}' +
    'body:has(#gHelp:not([hidden])) .sunav-fab{display:none}' +
    '.sunav-fab svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round}' +
    '.sunav-ov{position:fixed;inset:0;z-index:1199;background:rgba(10,8,14,.5);opacity:0;pointer-events:none;transition:opacity .2s}' +
    '.sunav-ov.open{opacity:1;pointer-events:auto}' +
    '.sunav-panel{position:fixed;top:0;left:0;bottom:0;z-index:1201;width:280px;max-width:84vw;background:var(--panel,#fff);border-right:1px solid var(--line,rgba(120,90,120,.16));box-shadow:6px 0 30px rgba(0,0,0,.22);transform:translateX(-104%);transition:transform .24s cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column;padding:16px 12px calc(16px + env(safe-area-inset-bottom,0));overflow-y:auto}' +
    '.sunav-panel.open{transform:none}' +
    '.sunav-head{display:flex;align-items:center;justify-content:space-between;padding:4px 8px 12px}' +
    '.sunav-head b{font-weight:900;color:var(--ink,#2a2230);letter-spacing:-.02em}' +
    '.sunav-x{background:none;border:none;color:var(--muted,#8a7f8f);font-size:22px;cursor:pointer;line-height:1;padding:4px 8px}' +
    '.sunav-item{display:flex;align-items:center;gap:12px;padding:11px 10px;border-radius:12px;text-decoration:none;color:var(--body,#3a323f);font-weight:600;font-size:14.5px}' +
    '.sunav-item:hover{background:var(--soft,rgba(120,90,120,.08))}' +
    '.sunav-item.active{background:var(--soft,rgba(120,90,120,.12));color:var(--ink,#2a2230)}' +
    '.sunav-bub{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:var(--warm,#eee);display:flex;align-items:center;justify-content:center;color:var(--p,#8a5f7c)}' +
    '.sunav-item.active .sunav-bub{background:var(--grad,#8a5f7c);color:#fff}' +
    '.sunav-bub svg{width:18px;height:18px}' +
    '.sunav-sep{height:1px;background:var(--line,rgba(120,90,120,.14));margin:8px 10px}' +
    '.sunav-item{min-height:48px}' +
    '.sunav-lang{cursor:pointer}.sunav-lang select{margin-left:auto;min-height:36px;max-width:118px;border-radius:10px;border:1px solid var(--line,rgba(120,90,120,.25));background:var(--soft,rgba(120,90,120,.08));color:var(--ink,#2a2230);font-family:inherit;font-size:13.5px;font-weight:600;padding:4px 8px}' +
    // Los botones flotantes de «Manos libres» suben por encima de la barra inferior propia de la página.
    '#gBtn{bottom:calc(var(--su-bbar,0px) + 16px + env(safe-area-inset-bottom,0px))!important}' +
    '#gHelpBtn{bottom:calc(var(--su-bbar,0px) + 62px + env(safe-area-inset-bottom,0px))!important}' +
    '#gHelp{bottom:calc(var(--su-bbar,0px) + 66px + env(safe-area-inset-bottom,0px))!important}' +
    // Hueco al final de la página para que lo último no quede bajo los botones flotantes.
    'body::after{content:"";display:block;height:calc(96px + env(safe-area-inset-bottom,0px))}' +
    // Móvil: cabecera que no se come la pantalla, enlaces tocables, sin zoom de iOS en campos.
    '@media(max-width:640px){' +
      'body .topbar{position:relative;top:auto}' +
      'body .topbar nav{flex-wrap:nowrap;overflow-x:auto;max-width:100%;scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
      'body .topbar nav::-webkit-scrollbar{display:none}' +
      'body .topbar nav>*{white-space:nowrap;flex:none}' +
      'body .topbar nav a{min-height:40px;display:inline-flex;align-items:center}' +
      '.bc-crumbs a{display:inline-flex;align-items:center;min-height:36px}' +
      'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),select,textarea{font-size:16px}' +
    '}';

  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var fab = document.createElement('button'); fab.className = 'sunav-fab'; fab.setAttribute('aria-label', 'Abrir menú'); fab.setAttribute('data-i18n-attr', 'aria-label:nav.open');
    fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    var ov = document.createElement('div'); ov.className = 'sunav-ov';
    var panel = document.createElement('nav'); panel.className = 'sunav-panel'; panel.setAttribute('aria-label', 'Navegación'); panel.setAttribute('data-i18n-attr', 'aria-label:nav.nav');
    var here = location.pathname;
    var rows = LINKS.map(function (l) {
      var active = here.indexOf(l[0]) !== -1 ? ' active' : '';
      var ki = l[2].split('|'); // 'nav.clave|icono'
      return '<a class="sunav-item' + active + '" data-grp="' + l[3] + '" href="' + l[0] + '"><span class="sunav-bub">' + svg(ki[1]) + '</span><span data-i18n="' + ki[0] + '">' + l[1] + '</span></a>';
    }).join('');
    panel.innerHTML = '<div class="sunav-head"><b>SkillUp</b><button class="sunav-x" aria-label="Cerrar" data-i18n-attr="aria-label:nav.close">&times;</button></div>' +
      rows + '<div class="sunav-sep"></div>' +
      // Ajustes: cualquier rol puede enviar una sugerencia (feedback.js); el admin la dirige a Brandooers.
      // Idioma de toda la plataforma (1.5.0): se guarda en la cuenta y se aplica al momento (i18n.js).
      '<label class="sunav-item sunav-lang" for="sunav-lsel"><span class="sunav-bub">' + svg('globe') + '</span><span data-i18n="nav.lang">Idioma</span>' +
      '<select id="sunav-lsel" data-i18n-attr="aria-label:nav.lang" aria-label="Idioma">' + Object.keys(LANGS).map(function (k) { return '<option value="' + k + '" lang="' + k + '">' + LANGS[k] + '</option>'; }).join('') + '</select></label>' +
      '<a class="sunav-item" href="#" id="sunav-fb"><span class="sunav-bub">' + svg('idea') + '</span><span id="sunav-fbl" data-i18n="nav.suggest">Enviar sugerencia</span></a>' +
      '<a class="sunav-item" href="#" id="sunav-out"><span class="sunav-bub">' + svg('exit') + '</span><span data-i18n="nav.exit">Salir</span></a>';
    document.body.appendChild(ov); document.body.appendChild(panel); document.body.appendChild(fab);

    // Alto de la barra inferior de la propia página (.tabbar y, en la lección, el pie .dfoot encima).
    function bbar() {
      var top = innerHeight;
      [].slice.call(document.querySelectorAll('.tabbar,.dfoot')).map(function (el) { return el.getBoundingClientRect(); })
        .filter(function (r) { return r.height; }).sort(function (a, b) { return b.bottom - a.bottom; })
        .forEach(function (r) { if (r.bottom >= top - 2) top = Math.min(top, r.top); }); // barras pegadas desde abajo
      document.documentElement.style.setProperty('--su-bbar', Math.max(0, Math.round(innerHeight - top)) + 'px');
    }
    bbar(); addEventListener('resize', bbar);
    new MutationObserver(function () { clearTimeout(bbar.t); bbar.t = setTimeout(bbar, 120); }).observe(document.body, { childList: true, subtree: true });

    function open() { ov.classList.add('open'); panel.classList.add('open'); }
    function close() { ov.classList.remove('open'); panel.classList.remove('open'); }
    fab.onclick = open; ov.onclick = close;
    panel.querySelector('.sunav-x').onclick = close;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    panel.querySelectorAll('a.sunav-item').forEach(function (a) { if (a.id !== 'sunav-out' && a.id !== 'sunav-fb') a.addEventListener('click', close); });
    var lsel = panel.querySelector('#sunav-lsel');
    if (window.SUI18n) {
      lsel.value = SUI18n.lang;
      SUI18n.onChange(function (l) { lsel.value = l; });
      lsel.onchange = function () {
        var prev = SUI18n.lang, want = lsel.value; lsel.disabled = true;
        SUI18n.set(want).catch(function () { lsel.value = prev; alert(SUI18n.t('nav.langErr', 'No se ha podido guardar el idioma')); })
          .then(function () { lsel.disabled = false; });
      };
    } else { lsel.parentNode.style.display = 'none'; }
    // Chats siempre con el último mensaje a la vista (chat-stick.js).
    if (!window.__chatStick) { var cs = document.createElement('script'); cs.src = '/app/chat-stick.js'; document.head.appendChild(cs); }
    if (!window.SUFeedback && !document.querySelector('script[src^="/app/feedback.js"]')) {
      var fs = document.createElement('script'); fs.src = '/app/feedback.js'; document.head.appendChild(fs);
    }
    panel.querySelector('#sunav-fb').onclick = function (e) { e.preventDefault(); close(); if (window.SUFeedback) SUFeedback.openGeneral(); };
    var out = panel.querySelector('#sunav-out');
    if (out) out.onclick = async function (e) {
      e.preventDefault();
      try { await (window.SkillUp ? SkillUp.api('/api/auth/sign-out', { method: 'POST' }) : fetch('/api/auth/sign-out', { method: 'POST' })); } catch (x) { }
      location.href = '/app/login.html';
    };

    // Rol: ocultar destinos que no correspondan.
    var show = { base: true, manager: false, super: false, live: false, fb: false };
    // Una sola petición a /api/org/me por página: i18n.js ya la hace (SUI18n.ready).
    (window.SUI18n ? SUI18n.ready.then(function (m) { if (!m) throw new Error('sin sesión'); return m; }) : window.SkillUp ? SkillUp.api('/api/org/me') : Promise.reject()).then(function (me) {
      if (me && ['team_leader', 'direccion', 'admin', 'inspirador'].indexOf(me.role) !== -1) show.manager = true;
      if (me && me.platformAdmin) { show.manager = true; show.super = true; }
      // Bandeja de feedback: superadmin (todas las empresas) y admin/dirección (la suya, solo lectura).
      if (me && (me.platformAdmin || me.role === 'admin' || me.role === 'direccion')) show.fb = true;
      if (me && (me.role === 'admin' || me.role === 'direccion')) { var fl = panel.querySelector('#sunav-fbl'); if (fl) { fl.setAttribute('data-i18n', 'nav.suggestB'); fl.__i18nEs = 'Enviar sugerencia a Brandooers'; fl.textContent = window.SUI18n ? SUI18n.t('nav.suggestB', fl.__i18nEs) : fl.__i18nEs; } }
      // Supervisión en directo: por capacidad real (coach, team leader, admin, dirección; inspirador solo métricas).
      var cp = (me && me.capabilities) || {};
      if (cp['activity.read'] || cp['activity.metrics']) show.live = true;
    }).catch(function () { }).finally(function () {
      panel.querySelectorAll('.sunav-item[data-grp]').forEach(function (a) {
        if (!show[a.getAttribute('data-grp')]) a.style.display = 'none';
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
