/* SkillUp · Manos libres (G1) — gestos de mano + presencia, 100% en el navegador.
   La cámara NO se graba ni se envía a ningún sitio; el vídeo se procesa en local y se descarta.
   Opt-in: solo se activa si la persona pulsa el botón y da permiso de cámara.
   Gestos: ✋ bajar · ☝️ subir · mover la mano a la derecha/izquierda (o 👍/👎) pasa página · ✌️ tutor. */
(function () {
  'use strict';
  if (window.SkillUpGestures) return;
  var KEY = 'skillup-gestures';
  var HELP_KEY = 'skillup-gestures-help';   // 'closed' si el usuario cerró la ayuda (la reabre con "?")
  var CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8';
  var GEST_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
  var FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.task';
  // gesto de MediaPipe -> intención de la app (además del barrido horizontal para pasar página)
  var MAP = { Open_Palm: 'down', Pointing_Up: 'up', Thumb_Up: 'next', Thumb_Down: 'prev', Victory: 'ask' };
  // Barrido: si mueves la mano en horizontal, pasa de página. Si sale al revés, cambia SWIPE_SIGN a -1.
  var SWIPE_SIGN = 1;
  var HELP = [
    ['✋', 'Palma abierta', 'bajar'],
    ['☝️', 'Índice arriba', 'subir'],
    ['👉', 'Mano a la derecha (o 👍)', 'página siguiente'],
    ['👈', 'Mano a la izquierda (o 👎)', 'página anterior'],
    ['✌️', 'Victoria', 'preguntar al tutor']
  ];

  var on = false, video = null, gr = null, fd = null, raf = 0, cooldown = 0, awayT = 0, away = false;
  var trail = []; // últimas posiciones x de la muñeca, para detectar barridos
  var handlers = [];
  function onIntent(fn) { handlers.push(fn); }
  function emit(intent) {
    for (var i = 0; i < handlers.length; i++) { try { if (handlers[i](intent) === true) return; } catch (e) { } }
    def(intent);
  }
  function def(intent) {
    if (intent === 'down') window.scrollBy({ top: Math.round(innerHeight * 0.7), behavior: 'smooth' });
    else if (intent === 'up') window.scrollBy({ top: -Math.round(innerHeight * 0.7), behavior: 'smooth' });
    else if (intent === 'next') { var n = document.querySelector('[data-next],#next,.next,.nb.primary,.snd'); if (n) n.click(); else window.scrollBy({ top: innerHeight, behavior: 'smooth' }); }
    else if (intent === 'prev') { var p = document.querySelector('[data-prev],#prev,.prev'); if (p) p.click(); else window.scrollBy({ top: -innerHeight, behavior: 'smooth' }); }
    else if (intent === 'ask') { var b = document.querySelector('[data-ask-tutor],#chatFab,.boo-fab'); if (b) b.click(); }
  }

  function toast(t, ms) {
    var d = document.getElementById('gToast') || document.createElement('div');
    d.id = 'gToast'; d.textContent = t;
    d.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:60;background:rgba(20,28,38,.92);color:#eef3f8;border:1px solid #2b6;border-radius:12px;padding:9px 14px;font:13px/1.3 system-ui,sans-serif;max-width:88vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    document.body.appendChild(d); clearTimeout(d._t); d._t = setTimeout(function () { d.remove(); }, ms || 1400);
  }

  // Ayuda de gestos PERSISTENTE: no desaparece sola; la cierras tú cuando la aprendes y la reabres con "?".
  function helpHtml() {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="font-size:13px;color:#eef3f8;flex:1">Manos libres · gestos</b>'
      + '<button id="gHelpX" aria-label="Cerrar la ayuda" style="border:0;background:none;color:#9aa9b8;font-size:20px;line-height:1;cursor:pointer;padding:0 2px">×</button></div>'
      + HELP.map(function (h) { return '<div style="display:flex;align-items:center;gap:9px;padding:3px 0;font:13px/1.35 system-ui,sans-serif;color:#dfe7ef"><span style="width:22px;text-align:center;font-size:16px">' + h[0] + '</span><span style="color:#9aa9b8;min-width:150px">' + h[1] + '</span><span style="color:#3FD8F0;font-weight:600">' + h[2] + '</span></div>'; }).join('')
      + '<div style="color:#7f8ea0;font:11px/1.4 system-ui,sans-serif;margin-top:8px">La cámara solo se usa aquí; no se graba ni se envía nada.</div>';
  }
  function showHelp() {
    var c = document.getElementById('gHelp');
    if (!c) { c = document.createElement('div'); c.id = 'gHelp';
      c.style.cssText = 'position:fixed;left:16px;bottom:66px;z-index:58;background:rgba(18,24,33,.96);border:1px solid #2a3a4d;border-radius:14px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.5);max-width:min(320px,92vw);backdrop-filter:blur(6px)';
      document.body.appendChild(c); }
    c.innerHTML = helpHtml(); c.hidden = false;
    var hb = document.getElementById('gHelpBtn'); if (hb) hb.hidden = true;
    try { localStorage.removeItem(HELP_KEY); } catch (e) { }
    var x = document.getElementById('gHelpX'); if (x) x.onclick = closeHelp;
  }
  function closeHelp() {
    var c = document.getElementById('gHelp'); if (c) c.hidden = true;
    try { localStorage.setItem(HELP_KEY, 'closed'); } catch (e) { }
    mountHelpBtn(); // deja el "?" para reabrirla
  }
  function mountHelpBtn() {
    var b = document.getElementById('gHelpBtn');
    if (!b) { b = document.createElement('button'); b.id = 'gHelpBtn'; b.type = 'button'; b.textContent = '?'; b.title = 'Ver los gestos';
      b.setAttribute('aria-label', 'Ver la ayuda de gestos');
      b.style.cssText = 'position:fixed;left:16px;bottom:62px;z-index:58;width:34px;height:34px;border-radius:50%;border:1.5px solid #37506a;background:rgba(20,28,38,.92);color:#3FD8F0;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4)';
      b.onclick = showHelp; document.body.appendChild(b); }
    b.hidden = false;
  }

  function awayOverlay(show) {
    var o = document.getElementById('gAway');
    if (show) {
      if (o) return; o = document.createElement('div'); o.id = 'gAway';
      o.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(8,12,18,.72);display:grid;place-items:center;text-align:center;color:#eef3f8;font-family:system-ui,sans-serif;backdrop-filter:blur(3px)';
      o.innerHTML = '<div><div style="font-size:44px">👀</div><div style="font-size:20px;font-weight:700;margin:8px 0 4px">¿Sigues ahí?</div><div style="color:#9aa9b8;font-size:14px">La lección te espera. Vuelve cuando quieras.</div></div>';
      document.body.appendChild(o);
      document.querySelectorAll('video,audio').forEach(function (m) { try { if (!m.paused) { m.pause(); m._gPaused = true; } } catch (e) { } });
    } else if (o) { o.remove(); document.querySelectorAll('video,audio').forEach(function (m) { if (m._gPaused) { try { m.play(); } catch (e) { } m._gPaused = false; } }); }
  }

  function detectSwipe(landmarks, t) {
    if (!landmarks || !landmarks[0] || !landmarks[0][0]) { trail.length = 0; return false; }
    var x = landmarks[0][0].x; // muñeca (0..1)
    trail.push({ x: x, t: t }); while (trail.length && t - trail[0].t > 420) trail.shift();
    if (trail.length < 3) return false;
    var dx = x - trail[0].x;
    if (Math.abs(dx) > 0.20) { trail.length = 0; emit((dx * SWIPE_SIGN > 0) ? 'next' : 'prev'); toast(dx * SWIPE_SIGN > 0 ? '👉 Página siguiente' : '👈 Página anterior'); return true; }
    return false;
  }

  function loop() {
    if (!on || !video || video.readyState < 2) { raf = requestAnimationFrame(loop); return; }
    var t = performance.now(); var r = null, f = null;
    try {
      if (gr) {
        r = gr.recognizeForVideo(video, t);
        var swiped = (t > cooldown) && detectSwipe(r && r.landmarks, t);
        if (swiped) { cooldown = t + 900; }
        else {
          var g = r && r.gestures && r.gestures[0] && r.gestures[0][0];
          if (g && g.score > 0.6 && MAP[g.categoryName] && t > cooldown) { cooldown = t + 1100; toast(iconFor(g.categoryName)); emit(MAP[g.categoryName]); }
        }
      }
      if (fd) {
        f = fd.detectForVideo(video, t);
        var has = f && f.detections && f.detections.length > 0;
        if (has) { awayT = t; if (away) { away = false; awayOverlay(false); } }
        else if (t - awayT > 12000 && !away) { away = true; awayOverlay(true); }
      }
      drawPreview(r, f);
    } catch (e) { }
    raf = requestAnimationFrame(loop);
  }
  // Cuadro de cámara (como BOO Manager): vídeo en espejo + puntos de la mano + caja de la cara. En local.
  var HAND_CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  var pv = null; // {panel, canvas, ctx, min}
  function mkPreview() {
    if (pv) { pv.panel.hidden = false; return; }
    var panel = document.createElement('div'); panel.id = 'gPv';
    panel.style.cssText = 'position:fixed;right:16px;bottom:70px;z-index:59;width:200px;background:rgba(14,20,28,.96);border:1px solid #2a3a4d;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.5);overflow:hidden;user-select:none';
    var head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:grab;font:11px/1 system-ui,sans-serif;color:#9aa9b8;background:rgba(255,255,255,.04)';
    head.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#2fbf71;box-shadow:0 0 6px #2fbf71"></span><b style="color:#eef3f8;font-weight:700;flex:1">Cámara · gestos</b><button id="gPvMin" title="Minimizar" style="border:0;background:none;color:#9aa9b8;font-size:15px;line-height:1;cursor:pointer">–</button>';
    var cv = document.createElement('canvas'); cv.width = 200; cv.height = 150; cv.style.cssText = 'display:block;width:200px;height:150px;background:#0a0f16';
    panel.appendChild(head); panel.appendChild(cv);
    document.body.appendChild(panel);
    pv = { panel: panel, canvas: cv, ctx: cv.getContext('2d'), min: false };
    document.getElementById('gPvMin').onclick = function (e) { e.stopPropagation(); pv.min = !pv.min; cv.style.display = pv.min ? 'none' : 'block'; this.textContent = pv.min ? '+' : '–'; };
    // arrastrar por la cabecera
    head.addEventListener('pointerdown', function (e) {
      if (e.target.id === 'gPvMin') return;
      var r0 = panel.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      head.setPointerCapture && head.setPointerCapture(e.pointerId); head.style.cursor = 'grabbing';
      function mv(ev) { panel.style.left = Math.max(4, r0.left + ev.clientX - sx) + 'px'; panel.style.top = Math.max(4, r0.top + ev.clientY - sy) + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; }
      function up() { head.style.cursor = 'grab'; head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); }
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });
  }
  function rmPreview() { if (pv) { try { pv.panel.remove(); } catch (e) {} pv = null; } }
  function drawPreview(r, f) {
    if (!pv || pv.min || !video || !video.videoWidth) return;
    var c = pv.ctx, W = pv.canvas.width, H = pv.canvas.height, vw = video.videoWidth, vh = video.videoHeight;
    c.save(); c.clearRect(0, 0, W, H); c.translate(W, 0); c.scale(-1, 1); c.drawImage(video, 0, 0, W, H); c.restore(); // espejo
    var mx = function (nx) { return (1 - nx) * W; }; // x en espejo
    if (r && r.landmarks) r.landmarks.forEach(function (lm) {
      c.strokeStyle = '#3FD8F0'; c.lineWidth = 2;
      HAND_CONN.forEach(function (p) { var a = lm[p[0]], b = lm[p[1]]; if (!a || !b) return; c.beginPath(); c.moveTo(mx(a.x), a.y * H); c.lineTo(mx(b.x), b.y * H); c.stroke(); });
      lm.forEach(function (pt) { c.fillStyle = '#F0C645'; c.beginPath(); c.arc(mx(pt.x), pt.y * H, 3, 0, 7); c.fill(); });
    });
    if (f && f.detections) f.detections.forEach(function (d) {
      var bb = d.boundingBox; if (!bb) return;
      var x = W - (bb.originX + bb.width) / vw * W, y = bb.originY / vh * H, w = bb.width / vw * W, h = bb.height / vh * H;
      c.strokeStyle = '#EC6FA6'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
      c.fillStyle = '#EC6FA6'; c.font = '700 10px system-ui'; c.fillText('cara', x + 2, y - 3);
    });
  }
  function iconFor(name) { return ({ Thumb_Up: '👍 Siguiente', Thumb_Down: '👎 Anterior', Open_Palm: '✋ Bajar', Pointing_Up: '☝️ Subir', Victory: '✌️ Pregunto al tutor' })[name] || name; }

  async function enable() {
    if (on) return;
    var btn = document.getElementById('gBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Activando…'; }
    try {
      video = document.createElement('video'); video.muted = true; video.playsInline = true;
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';
      document.body.appendChild(video);
      var stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      video.srcObject = stream; await video.play();
      var vision = await import(CDN);
      var fileset = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      gr = await vision.GestureRecognizer.createFromOptions(fileset, { baseOptions: { modelAssetPath: GEST_MODEL }, runningMode: 'VIDEO', numHands: 1 });
      try { fd = await vision.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'VIDEO' }); } catch (e) { fd = null; }
      on = true; awayT = performance.now(); trail.length = 0;
      try { localStorage.setItem(KEY, '1'); } catch (e) { }
      if (btn) { btn.disabled = false; btn.textContent = '🖐 Manos libres: ON'; btn.style.borderColor = '#2fbf71'; }
      // Ayuda persistente: se muestra salvo que el usuario la cerrara antes (entonces queda el "?").
      var closed = false; try { closed = localStorage.getItem(HELP_KEY) === 'closed'; } catch (e) { }
      if (closed) mountHelpBtn(); else showHelp();
      mkPreview(); // cuadro de cámara con puntos de mano + caja de cara
      raf = requestAnimationFrame(loop);
    } catch (e) {
      disable();
      if (btn) { btn.disabled = false; btn.textContent = '🖐 Manos libres'; }
      toast(e && /denied|Permission/i.test(String(e.name || e)) ? 'Necesito permiso de cámara para las manos libres.' : 'No he podido activar las manos libres en este navegador.', 3200);
    }
  }
  function disable() {
    on = false; if (raf) cancelAnimationFrame(raf); awayOverlay(false); trail.length = 0; rmPreview();
    try { if (video && video.srcObject) video.srcObject.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
    if (video) { video.remove(); video = null; }
    try { if (gr && gr.close) gr.close(); } catch (e) { } try { if (fd && fd.close) fd.close(); } catch (e) { }
    gr = fd = null; try { localStorage.removeItem(KEY); } catch (e) { }
    var h = document.getElementById('gHelp'); if (h) h.hidden = true;
    var hb = document.getElementById('gHelpBtn'); if (hb) hb.hidden = true;
    var btn = document.getElementById('gBtn'); if (btn) { btn.textContent = '🖐 Manos libres'; btn.style.borderColor = ''; }
  }
  function toggle() { on ? disable() : enable(); }

  function mountButton() {
    if (document.getElementById('gBtn')) return;
    var b = document.createElement('button'); b.id = 'gBtn'; b.type = 'button';
    b.textContent = '🖐 Manos libres';
    b.title = 'Navega con gestos de la mano. La cámara solo se usa en tu navegador; no se graba ni se envía nada.';
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:55;background:rgba(20,28,38,.9);color:#eef3f8;border:1.5px solid #37506a;border-radius:999px;padding:9px 14px;font:13px/1 system-ui,sans-serif;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    b.onclick = toggle;
    document.body.appendChild(b);
  }

  window.SkillUpGestures = { enable: enable, disable: disable, toggle: toggle, onIntent: onIntent, isOn: function () { return on; }, mountButton: mountButton, showHelp: showHelp };
  if (document.readyState !== 'loading') mountButton(); else document.addEventListener('DOMContentLoaded', mountButton);
  // No auto-arranca aunque estuviera en ON antes: la cámara siempre requiere un gesto del usuario.
})();
