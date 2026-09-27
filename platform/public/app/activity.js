// Actividad en directo (1.3.0). Se carga JUSTO DESPUÉS de api.js en las páginas donde se aprende.
// Qué envía: página, curso, sección, % de lectura, segundos activos (con interacción real) y acciones
// (vídeo, test, roleplay, mensaje al tutor). Qué NO envía nunca: pantalla, teclas, texto que escribes ni cámara.
// A cambio recibe: quién sigue tu sesión (aviso visible obligatorio), avisos de tu responsable y, una vez,
// el aviso informativo de qué pueden ver. Dentro de una vista previa (iframe o ?preview=1) no envía nada.
(function () {
  'use strict';
  if (window.SkillUpActivity) return;
  var qs = new URLSearchParams(location.search);
  var PREVIEW = qs.get('preview') === '1' || window.top !== window;
  var noop = function () {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function onReady(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  /* ---------- scroll: % de lectura del contenedor que se está leyendo ---------- */
  var IGNORE = '.chatpanel,.cp-log,.mn,.idx,.cv-list,#sheet,.sunav-panel';
  function pctOf(el) {
    var max = el.scrollHeight - el.clientHeight;
    return max > 4 ? Math.max(0, Math.min(100, Math.round(el.scrollTop / max * 100))) : 0;
  }
  // En curso.html cada tarjeta tiene su propio scroll; en el resto, la página.
  function reader() {
    var cards = document.querySelectorAll('.track > .card');
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (r.width && r.left > -r.width / 2 && r.left < innerWidth / 2) return cards[i];
    }
    return document.scrollingElement || document.documentElement;
  }

  /* ---------- vista previa del responsable: reproduce la página con SU sesión, sin enviar nada ---------- */
  if (PREVIEW) {
    window.SkillUpActivity = { preview: true, section: noop, track: noop, onNudge: noop };
    onReady(function () {
      var st = document.createElement('style');
      st.textContent = '.sunav-fab,#gBtn,#gHelpBtn,#gHelp,.fab,#impBanner{display:none!important}' +
        '.su-prev{position:fixed;left:0;right:0;top:0;z-index:99999;background:rgba(26,154,160,.92);color:#fff;font:800 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:5px 8px;pointer-events:none}';
      document.head.appendChild(st);
      var b = document.createElement('div'); b.className = 'su-prev'; b.textContent = 'Vista previa con tu sesión · no es la pantalla de la persona';
      document.body.appendChild(b);
      var want = Number(qs.get('scroll'));
      function apply(p) { if (isNaN(p)) return; var el = reader(); el.scrollTop = (el.scrollHeight - el.clientHeight) * p / 100; }
      var tries = 0; (function wait() { if (tries++ > 40) return; if (document.querySelector('.track > .card') || document.readyState === 'complete') setTimeout(function () { apply(want); }, 400); else setTimeout(wait, 250); })();
      addEventListener('message', function (e) {
        if (e.origin !== location.origin || !e.data || e.data.type !== 'skillup-preview') return;
        apply(Number(e.data.scrollPct));
      });
    });
    return;
  }

  /* ---------- estado de la página ---------- */
  var srcParam = qs.get('src') || '';
  var SOURCE = (srcParam.match(/^\/?([a-z0-9-]+)\.html$/i) || [])[1] || (qs.get('slug') || '').replace(/[^a-z0-9-]/gi, '') || undefined;
  var S = { page: location.pathname.slice(0, 80), source: SOURCE, section: undefined, sectionTitle: undefined, scrollPct: 0 };
  var card = parseInt(qs.get('card'), 10); if (!isNaN(card) && card >= 0) S.section = card;
  var queue = [], lastInput = Date.now(), activeSec = 0, sending = false, timer = null;

  function base() {
    var e = { page: S.page };
    if (S.source) e.source = S.source;
    if (S.section != null) e.section = S.section;
    if (S.sectionTitle) e.sectionTitle = String(S.sectionTitle).slice(0, 200);
    e.scrollPct = S.scrollPct;
    return e;
  }
  function track(kind, meta, now) {
    var e = base(); e.kind = kind;
    if (meta) { var m = {}; Object.keys(meta).slice(0, 12).forEach(function (k) { var v = meta[k]; if (v == null || typeof v === 'number' || typeof v === 'boolean') m[k] = v; else m[k] = String(v).slice(0, 200); }); e.meta = m; }
    queue.push(e); if (queue.length > 38) queue.splice(0, queue.length - 38);
    if (now) { clearTimeout(timer); timer = setTimeout(flush, 800); }
  }
  function flush(final) {
    if (sending && !final) return;
    var sec = Math.min(60, activeSec); activeSec = 0;
    var hb = base(); hb.kind = 'hb'; hb.activeSec = sec;
    var events = queue.splice(0, queue.length).concat([hb]);
    sending = true;
    fetch('/api/analytics/activity', { method: 'POST', credentials: 'same-origin', keepalive: !!final, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: events }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) handle(d); })
      .catch(function () {}).then(function () { sending = false; });
  }

  // Segundos ACTIVOS: página visible y alguna interacción en el último minuto (no el reloj de pared).
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) { addEventListener(ev, function () { lastInput = Date.now(); }, { capture: true, passive: true }); });
  var mm = 0; addEventListener('mousemove', function () { var n = Date.now(); if (n - mm > 2000) { mm = n; lastInput = n; } }, { passive: true });
  setInterval(function () { if (document.visibilityState === 'visible' && Date.now() - lastInput < 60000) activeSec++; }, 1000);
  setInterval(function () { if (document.visibilityState === 'visible') flush(); }, 15000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); else { lastInput = Date.now(); flush(); } });
  document.addEventListener('scroll', function (e) {
    var t = e.target; if (t && t.closest && t.closest(IGNORE)) return;
    var el = (t === document || t === document.documentElement || t === document.body) ? (document.scrollingElement || document.documentElement) : t;
    if (el === reader()) S.scrollPct = pctOf(el);
  }, { capture: true, passive: true });

  /* ---------- acciones: se detectan en las llamadas que la página ya hace (sin tocar cada página) ---------- */
  function wrapApi() {
    if (!window.SkillUp || !SkillUp.api || SkillUp.api.__act) return;
    var orig = SkillUp.api;
    var wrapped = function (path, opts) {
      var p = orig.apply(this, arguments);
      var post = opts && opts.method === 'POST', body = (opts && opts.body) || {};
      if (!post) return p;
      var P = String(path).split('?')[0];
      if (/^\/api\/learning\/assess\/quiz$/.test(P)) track('quiz_start', { block: body.block }, true);
      else if (/^\/api\/learning\/assess\/final$/.test(P)) track('quiz_start', { final: true }, true);
      else if (/^\/api\/roleplay\/(start|checkpoint)$/.test(P)) track('roleplay_start', null, true);
      else if (/^\/api\/roleplay\/[^/]+\/reply$/.test(P)) track('roleplay_turn', null, true);
      else if (/^\/api\/agent\/chat$/.test(P) && body.display) track('chat_msg', null, true);
      else if (/^\/api\/learning\/videos\/watch$/.test(P)) track('video', { title: body.title }, true);
      if (/^\/api\/learning\/assess\/[^/]+\/submit$/.test(P)) p.then(function (r) { track('quiz_end', { score: r && r.score, passed: r && r.passed, final: r && r.kind === 'final' }, true); }).catch(noop);
      if (/^\/api\/roleplay\/[^/]+\/close$/.test(P)) p.then(function (r) { track('roleplay_end', { score: r && typeof r.score === 'number' ? r.score : null }, true); }).catch(noop);
      return p;
    };
    wrapped.__act = true; SkillUp.api = wrapped;
  }
  wrapApi();

  /* ---------- lo que devuelve el servidor: aviso de seguimiento, avisos humanos, aviso informativo ---------- */
  var css = '' +
    '.su-watch{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:1400;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(26,24,32,.94);border:1px solid rgba(63,216,224,.45);color:#F2EFF5;font:600 13px/1.3 Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
    '.su-watch span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.su-watch button{white-space:nowrap}@media(max-width:420px){.su-watch{font-size:12px;padding:7px 12px}}' +
    '.su-watch i{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#3FD8E0;box-shadow:0 0 0 0 rgba(63,216,224,.6);animation:suPulse 1.8s infinite}' +
    '.su-watch button{border:0;background:none;color:#3FD8E0;font:800 11px Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;padding:4px 0 4px 6px;min-height:28px}' +
    '@keyframes suPulse{70%{box-shadow:0 0 0 8px rgba(63,216,224,0)}100%{box-shadow:0 0 0 0 rgba(63,216,224,0)}}' +
    '@media(prefers-reduced-motion:reduce){.su-watch i{animation:none}}' +
    '.su-toast{position:fixed;right:16px;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:1401;max-width:420px;margin-left:auto;background:#221f2a;border:1px solid rgba(240,198,69,.45);border-radius:16px;padding:14px 16px;color:#DAD4E2;font:14px/1.5 Inter,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5)}' +
    '.su-toast .who{display:flex;align-items:center;gap:8px;margin-bottom:6px;color:#F2EFF5;font-weight:800}' +
    '.su-badge{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(240,198,69,.16);color:#F0C645}' +
    '.su-acts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
    '.su-btn{border:0;border-radius:10px;min-height:40px;padding:10px 14px;font:800 12px Inter,system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:#fff;cursor:pointer;background:linear-gradient(120deg,#1a9aa0,#8a5f7c);text-decoration:none;display:inline-flex;align-items:center}' +
    '.su-btn.ghost{background:none;border:1.5px solid rgba(180,150,205,.3)}' +
    '.su-modal{position:fixed;inset:0;z-index:1402;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,5,12,.66)}' +
    '.su-modal .in{width:min(520px,100%);background:#221f2a;border:1px solid rgba(180,150,205,.16);border-radius:20px 20px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom,0px));color:#DAD4E2;font:14.5px/1.55 Inter,system-ui,sans-serif}' +
    '.su-modal h3{color:#F2EFF5;font:800 19px/1.25 Inter,system-ui,sans-serif;margin:0 0 8px}.su-modal p{margin:0 0 10px}' +
    '@media(min-width:720px){.su-modal{align-items:center}.su-modal .in{border-radius:20px}}';
  var styled = false;
  function style() { if (styled) return; styled = true; var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }

  var NOTICE = '<h3>Tu formación, con acompañamiento</h3>' +
    '<p>Para poder ayudarte, tu coach, tu responsable y la administración de tu empresa pueden ver tu actividad en SkillUp: qué curso y sección estás viendo, el tiempo activo, tus resultados de tests y roleplays y tu conversación con el tutor. También pueden escribirte en el chat.</p>' +
    '<p>Nunca se graba tu pantalla, lo que tecleas ni tu cámara. Si alguien sigue tu sesión en directo, lo verás arriba con su nombre. Estos datos se guardan 90 días como máximo.</p>';
  function showNotice(ack) {
    style();
    var m = document.createElement('div'); m.className = 'su-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="in">' + NOTICE + '<div class="su-acts"><button class="su-btn" type="button">Entendido</button></div></div>';
    document.body.appendChild(m);
    var b = m.querySelector('button'); b.focus();
    b.onclick = function () { m.remove(); if (ack) fetch('/api/analytics/activity/notice', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(noop); };
  }

  var watchEl = null;
  function renderWatchers(list) {
    if (!list || !list.length) { if (watchEl) { watchEl.remove(); watchEl = null; } return; }
    style();
    if (!watchEl) { watchEl = document.createElement('div'); watchEl.className = 'su-watch'; watchEl.setAttribute('role', 'status'); document.body.appendChild(watchEl); }
    var names = list.map(function (w) { return 'Tu ' + String(w.role || 'responsable').toLowerCase() + ' ' + w.name; });
    var txt = names.length === 1 ? names[0] + ' está siguiendo tu sesión' : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] + ' están siguiendo tu sesión';
    watchEl.innerHTML = '<i aria-hidden="true"></i><span>' + esc(txt) + '</span><button type="button">Qué ve</button>';
    watchEl.querySelector('button').onclick = function () { showNotice(false); };
  }

  var nudgeFns = [], shown = {};
  function toast(n) {
    style();
    var t = document.createElement('div'); t.className = 'su-toast'; t.setAttribute('role', 'alert');
    var chat = n.source ? '/app/curso.html?src=' + encodeURIComponent('/' + n.source + '.html') + '&chat=1' : null;
    t.innerHTML = '<div class="who">' + esc(n.authorName || 'Tu responsable') + ' <span class="su-badge">' + esc(n.authorRole || 'Responsable') + '</span></div>' +
      '<div>' + esc(n.text || '') + '</div><div class="su-acts">' + (chat ? '<a class="su-btn" href="' + chat + '">Responder en el chat</a>' : '') +
      '<button class="su-btn ghost" type="button">Entendido</button></div>';
    document.body.appendChild(t);
    t.querySelector('button').onclick = function () { t.remove(); };
  }
  function handle(d) {
    onReady(function () {
      renderWatchers(d.watchers);
      (d.nudges || []).forEach(function (n) {
        var k = n.messageId || n.id; if (shown[k]) return; shown[k] = 1;
        for (var i = 0; i < nudgeFns.length; i++) { try { if (nudgeFns[i](n)) return; } catch (e) { } }
        toast(n);
      });
      if (d.notice && !document.querySelector('.su-modal')) showNotice(true);
    });
  }

  window.SkillUpActivity = {
    preview: false,
    // curso.html: al cambiar de sección.
    section: function (o) {
      if (!o) return;
      if (o.source) S.source = o.source;
      S.section = o.index; S.sectionTitle = o.title; S.scrollPct = 0;
      track('section', null, true);
    },
    track: function (kind, meta) { track(kind, meta, true); },
    // La página puede quedarse un aviso (p. ej. el chat del curso lo pinta dentro de la conversación).
    onNudge: function (fn) { nudgeFns.push(fn); },
  };

  track('page', { title: document.title }, false);
  onReady(function () { setTimeout(flush, 1200); });
})();
