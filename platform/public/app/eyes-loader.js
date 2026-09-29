/* SkillUp · pantalla de espera con los ojos + minijuego «Corre, ojos».
   Uso: EyesLoader.mount(elemento, 'Preparando tus preguntas…', 'Unos segundos…')
   - Ojos de marca que miran al dedo/ratón y parpadean, anillo que gira con chispas, frases que rotan y segundos.
   - Minijuego tipo dinosaurio: los ojos corren y saltan (toque, clic, espacio o flecha arriba) perseguidos por
     algo distinto cada vez (el lunes, la bandeja de entrada, la objeción…). Récord guardado en este navegador.
   - Se para solo cuando la página sustituye el contenido del elemento (fin de la espera). Sin movimiento
     automático si la persona pidió menos movimiento; el juego solo arranca si lo toca. */
(function () {
  'use strict';
  if (window.EyesLoader) return;
  function T(k, es, v) { return window.SUI18n ? SUI18n.t(k, es, v) : (v ? String(es).replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? v[x] : m; }) : es); }
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var LINES_ES = [
    'Afilando las preguntas…', 'Leyendo lo que has contado, sin cotillear…', 'Descartando las preguntas fáciles…',
    'Calentando la neurona del examinador…', 'Buscando el caso que más te haga pensar…', 'Quitando las trampas… casi todas…',
    'Ordenando ideas para que te cueste lo justo…', 'Pidiéndole al tutor que no se pase…', 'Casi está: últimos retoques…'
  ];
  // Quién persigue a los ojos (cambia cada vez) y con qué tropiezan.
  var THEMES_ES = [
    { who: 'el lunes', draw: drawMonday, obs: ['Reunión', 'Otra reunión', 'Café frío'] },
    { who: 'la bandeja de entrada', draw: drawInbox, obs: ['RE: RE:', 'Urgente', 'Spam'] },
    { who: 'la objeción', draw: drawObjection, obs: ['No tengo tiempo', 'Ya tengo proveedor', 'Mándame info'] },
    { who: 'el Excel infinito', draw: drawExcel, obs: ['#¡REF!', 'Celda fusionada', 'Macro'] },
    { who: 'el KPI del trimestre', draw: drawKpi, obs: ['Forecast', 'Churn', 'Q4'] },
    { who: 'la notificación', draw: drawBell, obs: ['Ping', '¿Tienes 5 min?', 'Recordatorio'] }
  ];

  var css = ''
    + '.eyl{display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 12px;text-align:center;max-width:560px;margin:0 auto}'
    + '.eyl-stage{position:relative;width:150px;height:150px;display:grid;place-items:center}'
    + '.eyl-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#22D3EE,#8B5CF6,#EC4899,#F0C645,#22D3EE);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px));mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px));filter:drop-shadow(0 0 10px rgba(139,92,246,.55))}'
    + '.eyl-glow{position:absolute;inset:18px;border-radius:50%;background:radial-gradient(circle,rgba(34,211,238,.18),rgba(139,92,246,.08) 60%,transparent 72%)}'
    + '.eyl-orb{position:absolute;inset:0}.eyl-orb i{position:absolute;top:-4px;left:50%;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:#fff;box-shadow:0 0 10px 3px rgba(34,211,238,.9)}'
    + '.eyl-orb.o2 i{background:#F0C645;box-shadow:0 0 10px 3px rgba(240,198,69,.85);width:6px;height:6px}.eyl-orb.o3 i{background:#EC4899;box-shadow:0 0 10px 3px rgba(236,72,153,.85);width:5px;height:5px}'
    + '.eyl-prog{position:absolute;inset:0;transform:rotate(-90deg);transition:opacity .6s;filter:drop-shadow(0 0 8px var(--pc,#E74C3C))}.eyl-prog circle{fill:none;stroke-width:5}.eyl-prog .bg{stroke:rgba(255,255,255,.08)}.eyl-prog .fg{stroke:var(--pc,#E74C3C);stroke-linecap:round;stroke-dasharray:289;stroke-dashoffset:289;transition:stroke-dashoffset .3s linear}'
    + '.eyl-ring{opacity:0;transition:opacity .6s}.eyl-stage.full .eyl-ring{opacity:1}.eyl-stage.full .eyl-prog{opacity:0}'
    + '.eyl-glow{background:radial-gradient(circle,color-mix(in srgb,var(--pc,#E74C3C) 22%,transparent),transparent 72%)!important}.eyl-stage.full .eyl-glow{background:radial-gradient(circle,rgba(34,211,238,.18),rgba(139,92,246,.08) 60%,transparent 72%)!important}'
    + '.eyl-next{font-size:12px;color:var(--muted,#9AA9B8);margin-top:-6px}.eyl-next b{color:#C7B6FF}'
    + '.eyl-eyes{width:104px;height:60px;position:relative;z-index:1}'
    + '.eyl-msg{font-weight:800;font-size:17px;color:var(--ink,#EEF3F8)}.eyl-sub{color:var(--muted,#9AA9B8);font-size:13.5px;margin-top:-8px}'
    + '.eyl-line{min-height:20px;font-size:14px;color:#C7B6FF;transition:opacity .35s}.eyl-t{font-variant-numeric:tabular-nums;color:var(--muted,#9AA9B8);font-size:12px}'
    + '.eyl-game{width:100%;border:1px solid rgba(150,120,255,.28);border-radius:16px;background:rgba(14,10,24,.6);overflow:hidden;position:relative;touch-action:manipulation;cursor:pointer;user-select:none;-webkit-user-select:none}'
    + '.eyl-game canvas{display:block;width:100%;height:170px}'
    + '.eyl-hud{position:absolute;left:10px;right:10px;top:8px;display:flex;justify-content:space-between;font:700 12px/1.2 system-ui,sans-serif;color:#C9C2DA;pointer-events:none}'
    + '.eyl-cta{position:absolute;inset:0;display:grid;place-items:center;font:800 13px/1.3 system-ui,sans-serif;letter-spacing:.06em;color:#fff;text-transform:uppercase;background:rgba(10,8,18,.35);pointer-events:none}'
    + '@media(prefers-reduced-motion:no-preference){.eyl-ring{animation:eylSpin 2.4s linear infinite}.eyl-orb{animation:eylSpin 3.2s linear infinite}.eyl-orb.o2{animation-duration:4.6s;animation-direction:reverse}.eyl-orb.o3{animation-duration:6.4s}.eyl-glow{animation:eylPulse 2.2s ease-in-out infinite}}'
    + '@keyframes eylSpin{to{transform:rotate(360deg)}}@keyframes eylPulse{50%{transform:scale(1.12);opacity:.7}}';

  // Textos en el idioma de la persona (1.5.0); dibujos y lógica de cada tema son los mismos.
  function lines() { return T('loader.lines', LINES_ES); }
  function themes() { var tr = T('loader.themes', null); return THEMES_ES.map(function (th, i) { var x = tr && tr[i]; return x ? { who: x.who, draw: th.draw, obs: x.obs } : th; }); }
  function games() { var tr = T('loader.games', null); return GAMES.map(function (g, i) { var x = tr && tr[i]; return x ? { id: g.id, name: x.name, hint: x.hint } : g; }); }
  function injectCss() { if (document.getElementById('eyl-css')) return; var s = document.createElement('style'); s.id = 'eyl-css'; s.textContent = css; document.head.appendChild(s); }

  var EYES_SVG = '<svg class="eyl-eyes" viewBox="0 0 100 58" aria-hidden="true"><defs>'
    + '<linearGradient id="eylE1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#22D3EE"/><stop offset="50%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#EC4899"/></linearGradient>'
    + '<linearGradient id="eylE2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#EC4899"/></linearGradient>'
    + '<radialGradient id="eylI1"><stop offset="0%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#5B21B6"/></radialGradient>'
    + '<radialGradient id="eylI2"><stop offset="0%" stop-color="#67E8F9"/><stop offset="100%" stop-color="#0891B2"/></radialGradient></defs>'
    + '<g class="eyl-lid"><g transform="translate(5,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="#0b0712" stroke="url(#eylE1)" stroke-width="3"/><g class="eyl-p"><circle cx="20" cy="36" r="7.5" fill="url(#eylI1)"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/><circle cx="22.5" cy="33.5" r="1.6" fill="#fff"/></g></g>'
    + '<g transform="translate(53,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="#0b0712" stroke="url(#eylE2)" stroke-width="3"/><g class="eyl-p"><circle cx="20" cy="36" r="7.5" fill="url(#eylI2)"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/><circle cx="22.5" cy="33.5" r="1.6" fill="#fff"/></g></g></g></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function mount(el, msg, sub, opts) {
    if (!el) return;
    injectCss();
    msg = T('lp.' + (msg || ''), msg); sub = sub ? T('lp.' + sub, sub) : sub;
    var LINES = lines(), THS = themes();
    var theme = THS[Math.floor(Math.random() * THS.length)], pick = pickGame(), spec = pick.game;
    var EXPECT = Math.max(5, (opts && opts.expect) || 40); // segundos esperados: el círculo se llena en ese tiempo
    el.innerHTML = '<div class="eyl" role="status" aria-live="polite">'
      + '<div class="eyl-stage"><div class="eyl-glow"></div><svg class="eyl-prog" viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg><div class="eyl-ring"></div><div class="eyl-orb"><i></i></div><div class="eyl-orb o2"><i></i></div><div class="eyl-orb o3"><i></i></div>' + EYES_SVG + '</div>'
      + '<div class="eyl-msg">' + esc(msg || T('loader.wait', 'Un momento…')) + '</div>' + (sub ? '<div class="eyl-sub">' + esc(sub) + '</div>' : '')
      + '<div class="eyl-line"></div><div class="eyl-t">0 s</div>'
      + '<div class="eyl-game" tabindex="0" role="button" aria-label="' + esc(T('loader.gameAria', 'Minijuego mientras esperas: {name}. {hint}', { name: spec.name, hint: spec.hint })) + '">'
      + '<canvas></canvas><div class="eyl-hud"><span>' + esc(spec.name) + (spec.id === 'runner' ? ' · ' + esc(T('loader.chasing', 'te persigue {who}', { who: theme.who })) : '') + '</span><span class="eyl-sc">' + esc(T('loader.record', 'Récord {n}', { n: bestOf(spec.id) })) + '</span></div>'
      + '<div class="eyl-cta">' + esc(T('loader.today', 'Juego de hoy: {name} · {hint}', { name: spec.name, hint: spec.hint })) + '</div></div>'
      + '<div class="eyl-next">' + esc(T('loader.next', 'En tu próxima espera:')) + ' <b>' + esc(pick.next.name) + '</b></div></div>';
    var root = el.firstChild, t0 = Date.now(), timers = [];
    var line = root.querySelector('.eyl-line'), tEl = root.querySelector('.eyl-t');
    var li = Math.floor(Math.random() * LINES.length); line.textContent = LINES[li];
    timers.push(setInterval(function () {
      if (!root.isConnected) return stop();
      tEl.textContent = Math.round((Date.now() - t0) / 1000) + ' s';
    }, 1000));
    // Círculo de carga: se llena de rojo → naranja → verde en el tiempo esperado y luego pasa a los colores de marca girando.
    var stage = root.querySelector('.eyl-stage'), fg = root.querySelector('.eyl-prog .fg');
    function mix(a, b, k) { return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); }).join(',') + ')'; }
    var RED = [231, 76, 60], ORANGE = [243, 156, 18], GREEN = [46, 204, 113];
    function prog() {
      if (!root.isConnected) return stop();
      var p = Math.min(1, (Date.now() - t0) / 1000 / EXPECT);
      fg.style.strokeDashoffset = String(289 * (1 - p));
      stage.style.setProperty('--pc', p < 0.5 ? mix(RED, ORANGE, p / 0.5) : mix(ORANGE, GREEN, (p - 0.5) / 0.5));
      if (p >= 1) stage.classList.add('full');
    }
    prog(); timers.push(setInterval(prog, 250));
    timers.push(setInterval(function () {
      if (!root.isConnected) return stop();
      line.style.opacity = 0;
      setTimeout(function () { li = (li + 1) % LINES.length; line.textContent = LINES[li]; line.style.opacity = 1; }, 350);
    }, 3200));

    // ojos que miran al puntero y parpadean
    var pupils = root.querySelectorAll('.eyl-p'), lid = root.querySelector('.eyl-lid');
    function look(e) {
      var r = root.querySelector('.eyl-eyes').getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e; if (!p) return;
      var dx = p.clientX - (r.left + r.width / 2), dy = p.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, d / 200) * 6;
      pupils.forEach(function (g) { g.setAttribute('transform', 'translate(' + (dx / d * k).toFixed(1) + ',' + (dy / d * k).toFixed(1) + ')'); });
    }
    if (!REDUCED) {
      document.addEventListener('pointermove', look);
      timers.push(setInterval(function () {
        if (!root.isConnected) return stop();
        lid.style.transformOrigin = '50% 62%'; lid.style.transition = 'transform .09s'; lid.style.transform = 'scaleY(.08)';
        setTimeout(function () { lid.style.transform = ''; }, 120);
      }, 3600));
    }

    var game = makeGame(root.querySelector('.eyl-game'), theme, root, spec);
    function stop() {
      timers.forEach(clearInterval); timers = [];
      document.removeEventListener('pointermove', look);
      game.stop();
    }
    return { stop: stop };
  }


  // ---------- minijuegos (rotan: cada espera trae el siguiente) ----------
  var GAMES = [
    { id: 'runner', name: 'Corre, ojos', hint: 'Toca para saltar' },
    { id: 'catch', name: 'Atrapa ideas', hint: 'Toca a un lado u otro para moverte' },
    { id: 'fly', name: 'Vuela, ojos', hint: 'Toca para volar' },
    { id: 'whack', name: 'Caza objeciones', hint: 'Toca las objeciones antes de que escapen' }
  ];
  var NEXT_KEY = 'eyes-game-next';
  function pickGame() {
    var i = 0; try { i = (parseInt(localStorage.getItem(NEXT_KEY) || '0', 10) || 0) % GAMES.length; localStorage.setItem(NEXT_KEY, String((i + 1) % GAMES.length)); } catch (e) { i = Math.floor(Math.random() * GAMES.length); }
    var G = games(); return { game: G[i], next: G[(i + 1) % G.length] };
  }
  function bestOf(id) { try { return parseInt(localStorage.getItem('eyes-best-' + id) || '0', 10) || 0; } catch (e) { return 0; } }
  function saveBestOf(id, v) { try { if (v > bestOf(id)) localStorage.setItem('eyes-best-' + id, String(v)); } catch (e) { } }

  function makeGame(box, theme, root, spec) {
    var cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), cta = box.querySelector('.eyl-cta'), sc = box.querySelector('.eyl-sc');
    var W = 0, H = 170, G = 0, raf = 0, running = false, over = false, t = 0, S = null, lastTap = null;
    function size() { var dpr = Math.min(2, window.devicePixelRatio || 1); W = box.clientWidth || 320; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); G = H - 26; }
    var impl = { runner: runner, catch: catcher, fly: fly, whack: whack }[spec.id]();
    function reset() { t = 0; S = { score: 0, speed: Math.max(3.4, W / 150) }; impl.init(); over = false; }
    size(); reset(); drawFrame();
    function tap(x, y) {
      if (over) { reset(); }
      if (!running) { running = true; cta.style.display = 'none'; loop(); }
      impl.tap(x, y);
    }
    function onKey(e) {
      if (!root.isConnected) return;
      var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); tap(W / 2, H / 2); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); tap(W * 0.1, H / 2); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); tap(W * 0.9, H / 2); }
    }
    box.addEventListener('pointerdown', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); tap(e.clientX - r.left, e.clientY - r.top); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', size);
    function loop() {
      if (!root.isConnected) return stop();
      if (!running) return;
      if (!document.hidden) { t++; impl.step(); if (t % 6 === 0 && !over) sc.textContent = impl.points() + ' · ' + T('loader.recordLow', 'récord') + ' ' + bestOf(spec.id); }
      drawFrame();
      if (running) raf = requestAnimationFrame(loop);
    }
    function end(msg) {
      running = false; over = true; var pts = impl.points(); saveBestOf(spec.id, pts);
      sc.textContent = T('loader.record', 'Récord {n}', { n: bestOf(spec.id) });
      cta.textContent = T('loader.points', '{msg} {n} puntos · toca para repetir', { msg: msg, n: pts }); cta.style.display = 'grid';
    }
    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(150,120,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, G + 1); ctx.lineTo(W, G + 1); ctx.stroke();
      impl.draw();
    }
    function stop() {
      running = false; cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey); window.removeEventListener('resize', size);
      if (S && S.score) saveBestOf(spec.id, impl.points());
    }
    function label(txt, x, y, w, h, fill, stroke, ink) {
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; roundRect(ctx, x, y, w, h, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '700 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
    }
    function textW(txt) { ctx.font = '700 11px system-ui,sans-serif'; return ctx.measureText(txt).width; }
    function pickObs() { return theme.obs[Math.floor(Math.random() * theme.obs.length)]; }

    // 1) Corre, ojos: saltar obstáculos huyendo del perseguidor
    function runner() {
      var P, obs, nextIn, legT;
      return {
        init: function () { P = { x: Math.max(78, W * 0.24), y: G, vy: 0 }; obs = []; nextIn = 60; legT = 0; },
        tap: function () { if (P.y >= G - 0.5) P.vy = -10.2; },
        points: function () { return Math.floor(S.score / 6); },
        step: function () {
          legT += S.speed * 0.08; P.vy += 0.55; P.y = Math.min(G, P.y + P.vy); if (P.y >= G) P.vy = 0;
          if (--nextIn <= 0) { var l = pickObs(); obs.push({ x: W + 10, w: Math.max(34, textW(l) + 14), h: 22 + Math.floor(Math.random() * 12), label: l }); nextIn = Math.floor(70 + Math.random() * 70 - Math.min(35, S.score / 40)); }
          for (var i = obs.length - 1; i >= 0; i--) { obs[i].x -= S.speed; if (obs[i].x + obs[i].w < -10) obs.splice(i, 1); }
          S.speed += 0.0025; S.score++;
          var px = P.x - 20, py = P.y - 26;
          for (var j = 0; j < obs.length; j++) { var o = obs[j]; if (px < o.x + o.w - 4 && px + 40 > o.x + 4 && py + 22 > G - o.h + 3) return end(T('loader.caught', '¡Te ha pillado {who}!', { who: theme.who })); }
        },
        draw: function () {
          ctx.strokeStyle = 'rgba(150,120,255,.18)'; ctx.lineWidth = 1;
          for (var x = -((S.score * S.speed) % 40); x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, G + 8); ctx.lineTo(x + 14, G + 8); ctx.stroke(); }
          theme.draw(ctx, 30, G - 6 - Math.abs(Math.sin(t / 7)) * 6);
          obs.forEach(function (o) { label(o.label, o.x, G - o.h, o.w, o.h, 'rgba(236,72,153,.18)', '#EC6FA6', '#F6D5E6'); });
          drawEyes(ctx, P.x, P.y, legT, P.y < G);
        }
      };
    }
    // 2) Atrapa ideas: bombillas suman, distracciones quitan vida (3 vidas)
    function catcher() {
      var P, items, tx, lives, nextIn, caught;
      return {
        init: function () { P = { x: W / 2 }; tx = W / 2; items = []; lives = 3; nextIn = 30; caught = 0; },
        tap: function (x) { tx = x < W / 2 ? Math.max(24, P.x - W * 0.28) : Math.min(W - 24, P.x + W * 0.28); if (Math.abs(x - P.x) < 30) tx = x; },
        points: function () { return caught; },
        step: function () {
          P.x += (tx - P.x) * 0.22; S.score++;
          if (--nextIn <= 0) { var bad = Math.random() < 0.3; var l = bad ? pickObs() : ''; items.push({ x: 20 + Math.random() * (W - 40), y: -10, bad: bad, label: l, w: bad ? Math.max(34, textW(l) + 12) : 18, v: 1.6 + Math.random() * 0.8 + Math.min(2, S.score / 900) }); nextIn = Math.floor(34 + Math.random() * 30 - Math.min(18, S.score / 120)); }
          for (var i = items.length - 1; i >= 0; i--) {
            var it = items[i]; it.y += it.v;
            if (it.y > G - 34 && it.y < G - 6 && Math.abs(it.x - P.x) < 26 + it.w / 2 - 9) { items.splice(i, 1); if (it.bad) { if (--lives <= 0) return end(T('loader.distract', 'Demasiadas distracciones.')); } else caught++; continue; }
            if (it.y > H + 10) items.splice(i, 1);
          }
        },
        draw: function () {
          items.forEach(function (it) {
            if (it.bad) label(it.label, it.x - it.w / 2, it.y - 11, it.w, 22, 'rgba(231,76,60,.2)', '#E74C3C', '#F8D1CC');
            else { ctx.fillStyle = '#F0C645'; ctx.shadowColor = '#F0C645'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(it.x, it.y, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#b8860b'; ctx.fillRect(it.x - 4, it.y + 7, 8, 5); }
          });
          drawEyes(ctx, P.x, G, t * 0.3, false);
          ctx.fillStyle = '#EC6FA6'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(T('loader.lives', 'Vidas') + ' ' + '●●●'.slice(0, lives), W - 10, 28);
        }
      };
    }
    // 3) Vuela, ojos: aletear entre columnas de reuniones
    function fly() {
      var P, cols, nextIn, passed;
      return {
        init: function () { P = { x: Math.max(70, W * 0.25), y: H / 2, vy: 0 }; cols = []; nextIn = 40; passed = 0; },
        tap: function () { P.vy = -5.6; },
        points: function () { return passed; },
        step: function () {
          P.vy = Math.min(7, P.vy + 0.32); P.y += P.vy; S.score++;
          if (P.y > G - 4 || P.y < 22) return end(T('loader.crash', '¡Choque de agendas!'));
          if (--nextIn <= 0) { var gap = 78, top = 30 + Math.random() * (G - 60 - gap); cols.push({ x: W + 10, top: top, gap: gap, done: false, label: pickObs() }); nextIn = Math.floor(W / 2.6 / (S.speed * 0.8)); }
          for (var i = cols.length - 1; i >= 0; i--) {
            var c = cols[i]; c.x -= S.speed * 0.8;
            if (!c.done && c.x + 34 < P.x) { c.done = true; passed++; }
            if (P.x + 14 > c.x && P.x - 14 < c.x + 34 && (P.y - 14 < c.top || P.y + 6 > c.top + c.gap)) return end(T('loader.ate', '¡Te has comido {who}!', { who: theme.who }));
            if (c.x < -50) cols.splice(i, 1);
          }
        },
        draw: function () {
          cols.forEach(function (c) {
            ctx.fillStyle = 'rgba(139,92,246,.35)'; ctx.strokeStyle = '#8B5CF6'; ctx.lineWidth = 1.5;
            roundRect(ctx, c.x, 18, 34, c.top - 18, 5); ctx.fill(); ctx.stroke();
            roundRect(ctx, c.x, c.top + c.gap, 34, G - c.top - c.gap, 5); ctx.fill(); ctx.stroke();
            ctx.save(); ctx.translate(c.x + 17, (c.top + 18) / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#E4DBFF'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.label.slice(0, 12), 0, 0); ctx.restore();
          });
          drawEyes(ctx, P.x, P.y + 20, 0, true, P.vy < 0);
        }
      };
    }
    // 4) Caza objeciones: tocar los bocadillos antes de que escapen (3 escapadas = fin)
    function whack() {
      var bubbles, nextIn, hits, escaped, look;
      return {
        init: function () { bubbles = []; nextIn = 20; hits = 0; escaped = 0; look = { x: W / 2, y: 60 }; },
        tap: function (x, y) {
          for (var i = bubbles.length - 1; i >= 0; i--) { var b = bubbles[i]; if (x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 10 && y < b.y + 34) { bubbles.splice(i, 1); hits++; b.pop = 1; return; } }
        },
        points: function () { return hits; },
        step: function () {
          S.score++;
          if (--nextIn <= 0) { var l = pickObs(), w = Math.max(40, textW(l) + 16); var b = { x: 10 + Math.random() * (W - w - 20), y: 26 + Math.random() * (G - 70), w: w, label: l, life: Math.max(60, 110 - S.score / 40) }; bubbles.push(b); look = { x: b.x + w / 2, y: b.y }; nextIn = Math.floor(38 + Math.random() * 30 - Math.min(20, S.score / 90)); }
          for (var i = bubbles.length - 1; i >= 0; i--) { if (--bubbles[i].life <= 0) { bubbles.splice(i, 1); if (++escaped >= 3) return end(T('loader.escaped3', 'Se te escaparon tres objeciones.')); } }
        },
        draw: function () {
          bubbles.forEach(function (b) {
            var a = Math.min(1, b.life / 20);
            ctx.globalAlpha = a; label(b.label, b.x, b.y, b.w, 24, 'rgba(240,198,69,.95)', '#F0C645', '#1b1226');
            ctx.fillStyle = '#F0C645'; ctx.beginPath(); ctx.moveTo(b.x + 12, b.y + 24); ctx.lineTo(b.x + 8, b.y + 32); ctx.lineTo(b.x + 20, b.y + 24); ctx.fill(); ctx.globalAlpha = 1;
          });
          var ex = W / 2, dx = look.x - ex, dy = look.y - G, d = Math.hypot(dx, dy) || 1;
          drawEyes(ctx, ex, G, 0, false, null, dx / d, dy / d);
          ctx.fillStyle = '#EC6FA6'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(T('loader.escapes', 'Escapadas') + ' ' + escaped + '/3', W - 10, 28);
        }
      };
    }
    return { stop: stop };
  }

  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // Los ojos corriendo: dos ojos mirando hacia delante + patitas
  function drawEyes(c, x, y, legT, air, flap, lx, ly) {
    var s = Math.sin(legT) * 7, ox = lx == null ? 3.5 : lx * 4, oy = ly == null ? 0 : ly * 4;
    c.strokeStyle = '#C7B6FF'; c.lineWidth = 3; c.lineCap = 'round';
    if (flap != null) { var w = flap ? -9 : 5; c.beginPath(); c.moveTo(x - 20, y - 20); c.lineTo(x - 32, y - 20 + w); c.moveTo(x + 20, y - 20); c.lineTo(x + 32, y - 20 + w); c.stroke(); }
    else { c.beginPath(); c.moveTo(x - 8, y - 6); c.lineTo(x - 8 + (air ? -6 : s), y); c.moveTo(x + 8, y - 6); c.lineTo(x + 8 + (air ? 6 : -s), y); c.stroke(); }
    [[x - 11, '#22D3EE'], [x + 11, '#EC4899']].forEach(function (e) {
      var g = c.createLinearGradient(e[0] - 10, y - 32, e[0] + 10, y - 12); g.addColorStop(0, e[1]); g.addColorStop(1, '#8B5CF6');
      c.fillStyle = '#0b0712'; c.strokeStyle = g; c.lineWidth = 2.5;
      c.beginPath(); c.arc(e[0], y - 20, 10, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = e[1]; c.beginPath(); c.arc(e[0] + ox, y - 20 + oy, 4.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0a0a0f'; c.beginPath(); c.arc(e[0] + ox * 1.25, y - 20 + oy * 1.25, 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(e[0] + ox * 1.25 + 1, y - 22 + oy * 1.25, 1, 0, Math.PI * 2); c.fill();
    });
  }
  function face(c, x, y) { c.fillStyle = '#0a0a0f'; c.beginPath(); c.arc(x - 5, y, 2, 0, 7); c.arc(x + 5, y, 2, 0, 7); c.fill(); c.strokeStyle = '#0a0a0f'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y - 5); c.lineTo(x - 2, y - 3); c.moveTo(x + 8, y - 5); c.lineTo(x + 2, y - 3); c.stroke(); }
  function drawMonday(c, x, y) { c.fillStyle = '#F4F1FA'; roundRect(c, x - 18, y - 40, 36, 40, 5); c.fill(); c.fillStyle = '#E74C3C'; roundRect(c, x - 18, y - 40, 36, 12, 5); c.fill(); c.fillStyle = '#fff'; c.font = '800 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('loader.mon', 'LUN'), x, y - 34); face(c, x, y - 15); }
  function drawInbox(c, x, y) { c.fillStyle = '#F4F1FA'; roundRect(c, x - 20, y - 28, 40, 28, 4); c.fill(); c.strokeStyle = '#8B5CF6'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 20, y - 28); c.lineTo(x, y - 12); c.lineTo(x + 20, y - 28); c.stroke(); c.fillStyle = '#E74C3C'; c.beginPath(); c.arc(x + 18, y - 30, 9, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 8px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('99+', x + 18, y - 30); }
  function drawObjection(c, x, y) { c.fillStyle = '#F0C645'; roundRect(c, x - 26, y - 38, 52, 26, 8); c.fill(); c.beginPath(); c.moveTo(x - 6, y - 12); c.lineTo(x - 12, y - 2); c.lineTo(x + 2, y - 12); c.fill(); c.fillStyle = '#1b1226'; c.font = '800 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('loader.pricey', 'Es muy caro'), x, y - 25); }
  function drawExcel(c, x, y) { c.fillStyle = '#1D6F42'; roundRect(c, x - 20, y - 36, 40, 36, 4); c.fill(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; for (var i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x - 20, y - 36 + i * 9); c.lineTo(x + 20, y - 36 + i * 9); c.stroke(); c.beginPath(); c.moveTo(x - 20 + i * 10, y - 36); c.lineTo(x - 20 + i * 10, y); c.stroke(); } face(c, x, y - 20); }
  function drawKpi(c, x, y) { c.fillStyle = '#F4F1FA'; roundRect(c, x - 20, y - 34, 40, 34, 5); c.fill(); c.strokeStyle = '#E74C3C'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 14, y - 26); c.lineTo(x - 4, y - 18); c.lineTo(x + 2, y - 22); c.lineTo(x + 14, y - 8); c.stroke(); c.beginPath(); c.moveTo(x + 14, y - 8); c.lineTo(x + 7, y - 9); c.moveTo(x + 14, y - 8); c.lineTo(x + 13, y - 15); c.stroke(); }
  function drawBell(c, x, y) { c.fillStyle = '#F0C645'; c.beginPath(); c.moveTo(x - 16, y - 8); c.quadraticCurveTo(x - 14, y - 38, x, y - 38); c.quadraticCurveTo(x + 14, y - 38, x + 16, y - 8); c.closePath(); c.fill(); c.beginPath(); c.arc(x, y - 5, 4, 0, 7); c.fill(); c.fillStyle = '#E74C3C'; c.beginPath(); c.arc(x + 14, y - 36, 7, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 8px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('9', x + 14, y - 36); face(c, x, y - 22); }

  window.EyesLoader = { mount: mount };
})();
