/* SkillUp · migas de navegación (breadcrumbs) dentro de la app, para no depender de la flecha "atrás"
   del navegador. Es aditivo y seguro de incluir en cualquier página: si la página YA tiene su propio
   enlace interno de vuelta (.back / .ctx / .top con enlace a /app/…), no pinta nada (evita duplicar).
   Donde no hay navegación interna, pinta una miga flotante arriba a la izquierda con el camino real. */
(function () {
  'use strict';
  if (window.__bcInjected) return; window.__bcInjected = 1;
  var MAP = {
    'inicio.html': { label: 'Inicio', parent: null },
    'ruta.html': { label: 'Mi ruta', parent: 'inicio.html' },
    'ruta-crear.html': { label: 'Crear ruta', parent: 'ruta.html' },
    'curso.html': { label: 'Curso', parent: 'ruta.html' },
    'leccion.html': { label: 'Lección', parent: 'curso.html' },
    'explorar.html': { label: 'Explorar', parent: 'inicio.html' },
    'videos.html': { label: 'Vídeos', parent: 'inicio.html' },
    'reto.html': { label: 'Reto', parent: 'inicio.html' },
    'ranking.html': { label: 'Ranking', parent: 'inicio.html' },
    'validar.html': { label: 'Validar', parent: 'inicio.html' },
    'panel.html': { label: 'Panel', parent: 'inicio.html' },
    'workforce.html': { label: 'Equipo', parent: 'panel.html' },
    'team-dna.html': { label: 'Tu ADN', parent: 'inicio.html' },
    'dashboard.html': { label: 'Panel', parent: 'inicio.html' }
  };
  var cur = location.pathname.split('/').pop() || 'inicio.html';
  if (!MAP[cur] || cur === 'inicio.html') return;                 // inicio ya es el hogar (tiene su menú)

  // Camino real siguiendo la cadena de padres.
  var chain = [], k = cur, guard = 0;
  while (k && MAP[k] && guard++ < 8) { chain.unshift(k); k = MAP[k].parent; }
  function hrefFor(key) {
    if (key === cur) return null;
    var h = '/app/' + key;
    if (key === 'curso.html') { var m = location.search.match(/[?&]src=([^&]+)/); if (m) h += '?src=' + m[1]; } // conserva el curso actual
    return h;
  }
  function build() {
    var css = '.bc-crumbs{display:flex;align-items:center;gap:6px;font-family:Inter,system-ui,sans-serif;font-size:12.5px;font-weight:600;flex-wrap:wrap}'
      + '.bc-crumbs a{color:var(--muted,#968EA4);text-decoration:none}.bc-crumbs a:hover{color:var(--teal2,#3FD8E0)}'
      + '.bc-crumbs .bc-sep{color:var(--muted,#968EA4);opacity:.55}.bc-crumbs .bc-cur{color:var(--ink,#F2EFF5)}'
      + '.bc-crumbs.bc-inline{flex:0 1 auto;min-width:0;margin-right:10px}'
      + '.bc-crumbs.bc-float{position:fixed;top:12px;left:14px;z-index:40;max-width:min(70vw,420px);background:var(--panel,#221f2a);border:1px solid var(--line,rgba(180,150,205,.16));border-radius:999px;padding:7px 14px;box-shadow:0 8px 24px rgba(0,0,0,.35)}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var wrap = document.createElement('nav'); wrap.className = 'bc-crumbs'; wrap.setAttribute('aria-label', 'Migas de navegación');
    chain.forEach(function (key, i) {
      if (i > 0) { var sep = document.createElement('span'); sep.className = 'bc-sep'; sep.textContent = '›'; wrap.appendChild(sep); }
      var href = hrefFor(key);
      if (href) { var a = document.createElement('a'); a.href = href; a.textContent = MAP[key].label; wrap.appendChild(a); }
      else { var s = document.createElement('span'); s.className = 'bc-cur'; s.textContent = MAP[key].label; wrap.appendChild(s); }
    });
    // Si hay una barra superior, la miga va DENTRO de ella (en línea, sin solaparse). Algunas páginas
    // (curso) construyen su barra tras cargar: esperamos a que aparezca antes de flotar, para no taparla.
    function place() {
      var bar = document.querySelector('.topbar') || document.querySelector('.ctx') || document.querySelector('.top');
      if (!bar) return false;
      wrap.classList.remove('bc-float'); wrap.classList.add('bc-inline'); bar.insertBefore(wrap, bar.firstChild); return true;
    }
    if (place()) return;
    var tries = 0, iv = setInterval(function () {
      tries++;
      if (place()) { clearInterval(iv); return; }
      if (tries >= 10) { clearInterval(iv); wrap.classList.add('bc-float'); document.body.appendChild(wrap); } // sin barra: flota
    }, 150);
  }
  if (document.readyState !== 'loading') build(); else document.addEventListener('DOMContentLoaded', build);
})();
