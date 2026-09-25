// Menú lateral plegable con burbujas, compartido por todas las páginas de la app.
// Objetivo (petición de Marc): en móvil no tener menú arriba + scroll; una burbuja flotante que
// despliega un cajón lateral con los destinos según el rol. Sin emojis: iconos SVG de marca.
// Se auto-inyecta al cargar. Depende de window.SkillUp (api.js) para saber el rol.
(function () {
  if (window.__sunav) return; window.__sunav = true;

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
    exit: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h9"/>'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[k] || ICON.home) + '</svg>'; }

  // destino: [href, label, icon, grupo]  grupo: 'base' | 'manager' | 'super'
  var LINKS = [
    ['/app/dashboard.html', 'Mi panel', 'home', 'base'],
    ['/app/inicio.html', 'Formaciones', 'route', 'base'],
    ['/app/explorar.html', 'Explorar', 'compass', 'base'],
    ['/app/videos.html', 'Vídeos', 'video', 'base'],
    ['/app/ranking.html', 'Ranking', 'trophy', 'base'],
    ['/app/team-dna.html', 'Team DNA', 'dna', 'base'],
    ['/app/ayuda.html', 'Ayuda', 'help', 'base'],
    ['/app/validar.html', 'Validar casos', 'check', 'manager'],
    ['/app/panel.html', 'Panel de empresa', 'building', 'manager'],
    ['/app/piramides.html', 'Pirámides', 'pyramid', 'manager'],
    ['/app/informe-roi.html', 'Informe de ROI', 'chart', 'manager'],
    ['/app/superadmin.html', 'Consola', 'gear', 'super']
  ];

  var css = '' +
    '.sunav-fab{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:1200;width:40px;height:56px;border-radius:0 16px 16px 0;border:none;cursor:pointer;background:var(--grad,#8a5f7c);color:#fff;box-shadow:3px 4px 16px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;padding-left:4px}' +
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
    '.sunav-sep{height:1px;background:var(--line,rgba(120,90,120,.14));margin:8px 10px}';

  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var fab = document.createElement('button'); fab.className = 'sunav-fab'; fab.setAttribute('aria-label', 'Abrir menú');
    fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    var ov = document.createElement('div'); ov.className = 'sunav-ov';
    var panel = document.createElement('nav'); panel.className = 'sunav-panel'; panel.setAttribute('aria-label', 'Navegación');
    var here = location.pathname;
    var rows = LINKS.map(function (l) {
      var active = here.indexOf(l[0]) !== -1 ? ' active' : '';
      return '<a class="sunav-item' + active + '" data-grp="' + l[3] + '" href="' + l[0] + '"><span class="sunav-bub">' + svg(l[2]) + '</span>' + l[1] + '</a>';
    }).join('');
    panel.innerHTML = '<div class="sunav-head"><b>SkillUp</b><button class="sunav-x" aria-label="Cerrar">&times;</button></div>' +
      rows + '<div class="sunav-sep"></div>' +
      '<a class="sunav-item" href="#" id="sunav-out"><span class="sunav-bub">' + svg('exit') + '</span>Salir</a>';
    document.body.appendChild(ov); document.body.appendChild(panel); document.body.appendChild(fab);

    function open() { ov.classList.add('open'); panel.classList.add('open'); }
    function close() { ov.classList.remove('open'); panel.classList.remove('open'); }
    fab.onclick = open; ov.onclick = close;
    panel.querySelector('.sunav-x').onclick = close;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    panel.querySelectorAll('.sunav-item').forEach(function (a) { if (a.id !== 'sunav-out') a.addEventListener('click', close); });
    var out = panel.querySelector('#sunav-out');
    if (out) out.onclick = async function (e) {
      e.preventDefault();
      try { await (window.SkillUp ? SkillUp.api('/api/auth/sign-out', { method: 'POST' }) : fetch('/api/auth/sign-out', { method: 'POST' })); } catch (x) { }
      location.href = '/app/login.html';
    };

    // Rol: ocultar destinos que no correspondan.
    var show = { base: true, manager: false, super: false };
    (window.SkillUp ? SkillUp.api('/api/org/me') : Promise.reject()).then(function (me) {
      if (me && ['team_leader', 'direccion', 'admin', 'inspirador'].indexOf(me.role) !== -1) show.manager = true;
      if (me && me.platformAdmin) { show.manager = true; show.super = true; }
    }).catch(function () { }).finally(function () {
      panel.querySelectorAll('.sunav-item[data-grp]').forEach(function (a) {
        if (!show[a.getAttribute('data-grp')]) a.style.display = 'none';
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
