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
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BEST_KEY = 'eyes-run-best';

  var LINES = [
    'Afilando las preguntas…', 'Leyendo lo que has contado, sin cotillear…', 'Descartando las preguntas fáciles…',
    'Calentando la neurona del examinador…', 'Buscando el caso que más te haga pensar…', 'Quitando las trampas… casi todas…',
    'Ordenando ideas para que te cueste lo justo…', 'Pidiéndole al tutor que no se pase…', 'Casi está: últimos retoques…'
  ];
  // Quién persigue a los ojos (cambia cada vez) y con qué tropiezan.
  var THEMES = [
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
    + '.eyl-eyes{width:104px;height:60px;position:relative;z-index:1}'
    + '.eyl-msg{font-weight:800;font-size:17px;color:var(--ink,#EEF3F8)}.eyl-sub{color:var(--muted,#9AA9B8);font-size:13.5px;margin-top:-8px}'
    + '.eyl-line{min-height:20px;font-size:14px;color:#C7B6FF;transition:opacity .35s}.eyl-t{font-variant-numeric:tabular-nums;color:var(--muted,#9AA9B8);font-size:12px}'
    + '.eyl-game{width:100%;border:1px solid rgba(150,120,255,.28);border-radius:16px;background:rgba(14,10,24,.6);overflow:hidden;position:relative;touch-action:manipulation;cursor:pointer;user-select:none;-webkit-user-select:none}'
    + '.eyl-game canvas{display:block;width:100%;height:170px}'
    + '.eyl-hud{position:absolute;left:10px;right:10px;top:8px;display:flex;justify-content:space-between;font:700 12px/1.2 system-ui,sans-serif;color:#C9C2DA;pointer-events:none}'
    + '.eyl-cta{position:absolute;inset:0;display:grid;place-items:center;font:800 13px/1.3 system-ui,sans-serif;letter-spacing:.06em;color:#fff;text-transform:uppercase;background:rgba(10,8,18,.35);pointer-events:none}'
    + '@media(prefers-reduced-motion:no-preference){.eyl-ring{animation:eylSpin 2.4s linear infinite}.eyl-orb{animation:eylSpin 3.2s linear infinite}.eyl-orb.o2{animation-duration:4.6s;animation-direction:reverse}.eyl-orb.o3{animation-duration:6.4s}.eyl-glow{animation:eylPulse 2.2s ease-in-out infinite}}'
    + '@keyframes eylSpin{to{transform:rotate(360deg)}}@keyframes eylPulse{50%{transform:scale(1.12);opacity:.7}}';

  function injectCss() { if (document.getElementById('eyl-css')) return; var s = document.createElement('style'); s.id = 'eyl-css'; s.textContent = css; document.head.appendChild(s); }

  var EYES_SVG = '<svg class="eyl-eyes" viewBox="0 0 100 58" aria-hidden="true"><defs>'
    + '<linearGradient id="eylE1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#22D3EE"/><stop offset="50%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#EC4899"/></linearGradient>'
    + '<linearGradient id="eylE2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#EC4899"/></linearGradient>'
    + '<radialGradient id="eylI1"><stop offset="0%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#5B21B6"/></radialGradient>'
    + '<radialGradient id="eylI2"><stop offset="0%" stop-color="#67E8F9"/><stop offset="100%" stop-color="#0891B2"/></radialGradient></defs>'
    + '<g class="eyl-lid"><g transform="translate(5,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="#0b0712" stroke="url(#eylE1)" stroke-width="3"/><g class="eyl-p"><circle cx="20" cy="36" r="7.5" fill="url(#eylI1)"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/><circle cx="22.5" cy="33.5" r="1.6" fill="#fff"/></g></g>'
    + '<g transform="translate(53,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="#0b0712" stroke="url(#eylE2)" stroke-width="3"/><g class="eyl-p"><circle cx="20" cy="36" r="7.5" fill="url(#eylI2)"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/><circle cx="22.5" cy="33.5" r="1.6" fill="#fff"/></g></g></g></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function mount(el, msg, sub) {
    if (!el) return;
    injectCss();
    var theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    el.innerHTML = '<div class="eyl" role="status" aria-live="polite">'
      + '<div class="eyl-stage"><div class="eyl-glow"></div><div class="eyl-ring"></div><div class="eyl-orb"><i></i></div><div class="eyl-orb o2"><i></i></div><div class="eyl-orb o3"><i></i></div>' + EYES_SVG + '</div>'
      + '<div class="eyl-msg">' + esc(msg || 'Un momento…') + '</div>' + (sub ? '<div class="eyl-sub">' + esc(sub) + '</div>' : '')
      + '<div class="eyl-line"></div><div class="eyl-t">0 s</div>'
      + '<div class="eyl-game" tabindex="0" role="button" aria-label="Minijuego mientras esperas: toca o pulsa espacio para saltar">'
      + '<canvas></canvas><div class="eyl-hud"><span>Te persigue ' + esc(theme.who) + '</span><span class="eyl-sc">Récord ' + best() + '</span></div>'
      + '<div class="eyl-cta">Toca para jugar mientras esperas</div></div></div>';
    var root = el.firstChild, t0 = Date.now(), timers = [];
    var line = root.querySelector('.eyl-line'), tEl = root.querySelector('.eyl-t');
    var li = Math.floor(Math.random() * LINES.length); line.textContent = LINES[li];
    timers.push(setInterval(function () {
      if (!root.isConnected) return stop();
      tEl.textContent = Math.round((Date.now() - t0) / 1000) + ' s';
    }, 1000));
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

    var game = makeGame(root.querySelector('.eyl-game'), theme, root);
    function stop() {
      timers.forEach(clearInterval); timers = [];
      document.removeEventListener('pointermove', look);
      game.stop();
    }
    return { stop: stop };
  }

  function best() { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { if (v > best()) localStorage.setItem(BEST_KEY, String(v)); } catch (e) { } }

  // ---------- minijuego ----------
  function makeGame(box, theme, root) {
    var cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), cta = box.querySelector('.eyl-cta'), sc = box.querySelector('.eyl-sc');
    var W = 0, H = 170, G = 0, raf = 0, running = false, over = false, t = 0;
    var P, obs, speed, score, nextIn, legT;
    function size() { var dpr = Math.min(2, window.devicePixelRatio || 1); W = box.clientWidth || 320; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); G = H - 26; }
    function reset() { P = { x: Math.max(78, W * 0.24), y: G, vy: 0 }; obs = []; speed = Math.max(3.4, W / 150); score = 0; nextIn = 60; legT = 0; over = false; }
    size(); reset(); drawFrame();
    function jump() {
      if (over) { reset(); over = false; }
      if (!running) { running = true; cta.style.display = 'none'; loop(); }
      if (P.y >= G - 0.5) P.vy = -10.2;
    }
    function onKey(e) {
      if (!root.isConnected) return;
      var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); jump(); }
    }
    box.addEventListener('pointerdown', function (e) { e.preventDefault(); jump(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', size);
    function loop() {
      if (!root.isConnected) return stop();
      if (!running) return;
      if (!document.hidden) step();
      drawFrame();
      raf = requestAnimationFrame(loop);
    }
    function step() {
      t++; legT += speed * 0.08;
      P.vy += 0.55; P.y = Math.min(G, P.y + P.vy); if (P.y >= G) P.vy = 0;
      if (--nextIn <= 0) {
        var label = theme.obs[Math.floor(Math.random() * theme.obs.length)];
        ctx.font = '700 11px system-ui,sans-serif';
        var w = Math.max(34, ctx.measureText(label).width + 14), h = 22 + Math.floor(Math.random() * 12);
        obs.push({ x: W + 10, w: w, h: h, label: label });
        nextIn = Math.floor(70 + Math.random() * 70 - Math.min(35, score / 40));
      }
      for (var i = obs.length - 1; i >= 0; i--) { obs[i].x -= speed; if (obs[i].x + obs[i].w < -10) obs.splice(i, 1); }
      speed += 0.0025; score++;
      // choque (caja de los ojos algo más pequeña que el dibujo: más fácil)
      var px = P.x - 20, py = P.y - 26, pw = 40, ph = 22;
      for (var j = 0; j < obs.length; j++) {
        var o = obs[j];
        if (px < o.x + o.w - 4 && px + pw > o.x + 4 && py + ph > G - o.h + 3) { running = false; over = true; var pts = Math.floor(score / 6); saveBest(pts); sc.textContent = 'Récord ' + best(); cta.textContent = '¡Te ha pillado ' + theme.who + '! ' + pts + ' puntos · toca para repetir'; cta.style.display = 'grid'; return; }
      }
      if (t % 6 === 0) sc.textContent = Math.floor(score / 6) + ' · récord ' + best();
    }
    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      // suelo con líneas que corren
      ctx.strokeStyle = 'rgba(150,120,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, G + 1); ctx.lineTo(W, G + 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,120,255,.18)'; ctx.lineWidth = 1;
      for (var x = -((score * speed) % 40); x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, G + 8); ctx.lineTo(x + 14, G + 8); ctx.stroke(); }
      // perseguidor, a la izquierda, dando saltitos
      theme.draw(ctx, 30, G - 6 - Math.abs(Math.sin(t / 7)) * 6);
      // obstáculos
      obs.forEach(function (o) {
        ctx.fillStyle = 'rgba(236,72,153,.18)'; ctx.strokeStyle = '#EC6FA6'; ctx.lineWidth = 1.5;
        roundRect(ctx, o.x, G - o.h, o.w, o.h, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#F6D5E6'; ctx.font = '700 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(o.label, o.x + o.w / 2, G - o.h / 2 + 1);
      });
      drawEyes(ctx, P.x, P.y, legT, P.y < G);
    }
    function stop() {
      running = false; cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey); window.removeEventListener('resize', size);
      if (score) saveBest(Math.floor(score / 6));
    }
    return { stop: stop };
  }

  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // Los ojos corriendo: dos ojos mirando hacia delante + patitas
  function drawEyes(c, x, y, legT, air) {
    var s = Math.sin(legT) * 7;
    c.strokeStyle = '#C7B6FF'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 8, y - 6); c.lineTo(x - 8 + (air ? -6 : s), y); c.moveTo(x + 8, y - 6); c.lineTo(x + 8 + (air ? 6 : -s), y); c.stroke();
    [[x - 11, '#22D3EE'], [x + 11, '#EC4899']].forEach(function (e) {
      var g = c.createLinearGradient(e[0] - 10, y - 32, e[0] + 10, y - 12); g.addColorStop(0, e[1]); g.addColorStop(1, '#8B5CF6');
      c.fillStyle = '#0b0712'; c.strokeStyle = g; c.lineWidth = 2.5;
      c.beginPath(); c.arc(e[0], y - 20, 10, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = e[1]; c.beginPath(); c.arc(e[0] + 3.5, y - 20, 4.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0a0a0f'; c.beginPath(); c.arc(e[0] + 4.5, y - 20, 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(e[0] + 5.5, y - 22, 1, 0, Math.PI * 2); c.fill();
    });
  }
  function face(c, x, y) { c.fillStyle = '#0a0a0f'; c.beginPath(); c.arc(x - 5, y, 2, 0, 7); c.arc(x + 5, y, 2, 0, 7); c.fill(); c.strokeStyle = '#0a0a0f'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y - 5); c.lineTo(x - 2, y - 3); c.moveTo(x + 8, y - 5); c.lineTo(x + 2, y - 3); c.stroke(); }
  function drawMonday(c, x, y) { c.fillStyle = '#F4F1FA'; roundRect(c, x - 18, y - 40, 36, 40, 5); c.fill(); c.fillStyle = '#E74C3C'; roundRect(c, x - 18, y - 40, 36, 12, 5); c.fill(); c.fillStyle = '#fff'; c.font = '800 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LUN', x, y - 34); face(c, x, y - 15); }
  function drawInbox(c, x, y) { c.fillStyle = '#F4F1FA'; roundRect(c, x - 20, y - 28, 40, 28, 4); c.fill(); c.strokeStyle = '#8B5CF6'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 20, y - 28); c.lineTo(x, y - 12); c.lineTo(x + 20, y - 28); c.stroke(); c.fillStyle = '#E74C3C'; c.beginPath(); c.arc(x + 18, y - 30, 9, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 8px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('99+', x + 18, y - 30); }
  function drawObjection(c, x, y) { c.fillStyle = '#F0C645'; roundRect(c, x - 26, y - 38, 52, 26, 8); c.fill(); c.beginPath(); c.moveTo(x - 6, y - 12); c.lineTo(x - 12, y - 2); c.lineTo(x + 2, y - 12); c.fill(); c.fillStyle = '#1b1226'; c.font = '800 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Es muy caro', x, y - 25); }
  function drawExcel(c, x, y) { c.fillStyle = '#1D6F42'; roundRect(c, x - 20, y - 36, 40, 36, 4); c.fill(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; for (var i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x - 20, y - 36 + i * 9); c.lineTo(x + 20, y - 36 + i * 9); c.stroke(); c.beginPath(); c.moveTo(x - 20 + i * 10, y - 36); c.lineTo(x - 20 + i * 10, y); c.stroke(); } face(c, x, y - 20); }
  function drawKpi(c, x, y) { c.fillStyle = '#F4F1FA'; roundRect(c, x - 20, y - 34, 40, 34, 5); c.fill(); c.strokeStyle = '#E74C3C'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 14, y - 26); c.lineTo(x - 4, y - 18); c.lineTo(x + 2, y - 22); c.lineTo(x + 14, y - 8); c.stroke(); c.beginPath(); c.moveTo(x + 14, y - 8); c.lineTo(x + 7, y - 9); c.moveTo(x + 14, y - 8); c.lineTo(x + 13, y - 15); c.stroke(); }
  function drawBell(c, x, y) { c.fillStyle = '#F0C645'; c.beginPath(); c.moveTo(x - 16, y - 8); c.quadraticCurveTo(x - 14, y - 38, x, y - 38); c.quadraticCurveTo(x + 14, y - 38, x + 16, y - 8); c.closePath(); c.fill(); c.beginPath(); c.arc(x, y - 5, 4, 0, 7); c.fill(); c.fillStyle = '#E74C3C'; c.beginPath(); c.arc(x + 14, y - 36, 7, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 8px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('9', x + 14, y - 36); face(c, x, y - 22); }

  window.EyesLoader = { mount: mount };
})();
