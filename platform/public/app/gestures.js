/* SkillUp · Manos libres (G2) — gestos de mano + presencia, 100% en el navegador.
   La cámara NO se graba ni se envía a ningún sitio; el vídeo se procesa en local y se descarta.
   Opt-in: solo se activa si la persona pulsa el botón y da permiso de cámara.
   Gestos: ✋ palma = puntero · 🤏 pinza = clic · barrido rápido ↔ pasa página · barrido rápido ↕ sube/baja ·
   🙌 pinza con las dos manos y separar/juntar = zoom · ✌️ tutor · 👍/👎 página · ✊ puño 1 s = apagar.
   Gestos propios: «Enseñar un gesto» graba tu postura de mano con la cámara y la asocia a una acción
   (se guarda solo en este navegador). */
(function () {
  'use strict';
  if (window.SkillUpGestures) return;
  var KEY = 'skillup-gestures';
  var HELP_KEY = 'skillup-gestures-help';     // 'closed' si el usuario cerró la ayuda (la reabre con "?")
  var CUSTOM_KEY = 'skillup-gestures-custom'; // gestos aprendidos: [{action, pose:[[x,y]x21]}]
  var CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8';
  var GEST_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
  var FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.task';
  // gesto de MediaPipe -> intención (la palma abierta ya no baja: ahora saca el puntero)
  var MAP = { Thumb_Up: 'next', Thumb_Down: 'prev', Victory: 'ask' };
  // Calibración (el mundo real no es el papel): si algo cuesta o salta solo, se toca aquí.
  var SWIPE_SIGN = 1;      // si el barrido lateral sale al revés, cambia a -1
  var SWIPE_X = 0.22;      // recorrido lateral mínimo (fracción del ancho de cámara) para pasar página
  var SWIPE_Y = 0.18;      // recorrido vertical mínimo para subir/bajar
  var SWIPE_MS = 380;      // en cuánto tiempo: más lento que esto = mover el puntero, no barrido
  var PINCH_ON = 0.33, PINCH_OFF = 0.5; // pinza: distancia pulgar-índice / tamaño de la mano
  var MATCH_MAX = 0.28;    // cuánto se puede parecer (menos = más estricto) un gesto aprendido
  var ACTIONS = [['down', 'Bajar'], ['up', 'Subir'], ['next', 'Página siguiente'], ['prev', 'Página anterior'], ['click', 'Clic'], ['ask', 'Preguntar al tutor'], ['zoomin', 'Ampliar'], ['zoomout', 'Reducir'], ['off', 'Apagar manos libres']];
  var HELP = [
    ['✋', 'Palma abierta', 'aparece el puntero'],
    ['🤏', 'Pinza pulgar + índice', 'clic'],
    ['↔️', 'Barrido rápido a un lado', 'pasar página'],
    ['↕️', 'Barrido rápido arriba/abajo', 'subir / bajar'],
    ['🙌', 'Pinza con las 2 manos, separar/juntar', 'ampliar / reducir'],
    ['✌️', 'Victoria', 'preguntar al tutor'],
    ['✊', 'Puño 1 segundo', 'apagar']
  ];

  var on = false, video = null, gr = null, fd = null, raf = 0, cooldown = 0, awayT = 0, away = false;
  var trail = [];   // posiciones recientes del centro de la palma, para detectar barridos
  var fistT = 0, zoom = { d0: 0, z0: 1 }, hold = { a: null, t: 0 }, teach = null;
  var cur = { el: null, active: false, x: innerWidth / 2, y: innerHeight / 2, seen: 0, pinched: false, cd: 0, hover: null };
  var custom = loadCustom();
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
    else if (intent === 'click') clickAt(cur.active ? cur.x : innerWidth / 2, cur.active ? cur.y : innerHeight / 2);
    else if (intent === 'zoomin') setZoom(getZoom() + 0.15, true);
    else if (intent === 'zoomout') setZoom(getZoom() - 0.15, true);
    else if (intent === 'off') { toast('✊ Manos libres apagadas'); disable(); }
  }
  function labelOf(a) { for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i][0] === a) return ACTIONS[i][1]; return a; }

  function toast(t, ms) {
    var d = document.getElementById('gToast') || document.createElement('div');
    d.id = 'gToast'; d.textContent = t;
    d.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483000;background:rgba(20,28,38,.92);color:#eef3f8;border:1px solid #2b6;border-radius:12px;padding:9px 14px;font:13px/1.3 system-ui,sans-serif;max-width:88vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    document.documentElement.appendChild(d); clearTimeout(d._t); d._t = setTimeout(function () { d.remove(); }, ms || 1400);
  }

  // --- geometría de la mano (coordenadas normalizadas de MediaPipe, 0..1) ---
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function handSize(lm) { return dist(lm[0], lm[9]) || 1e-3; } // muñeca -> nudillo medio
  function pinchRatio(lm) { return dist(lm[4], lm[8]) / handSize(lm); }
  function norm(lm) { var s = handSize(lm), o = lm[0]; return lm.map(function (p) { return [(p.x - o.x) / s, (p.y - o.y) / s]; }); }
  function mirror(n) { return n.map(function (p) { return [-p[0], p[1]]; }); }
  function poseDist(a, b) { var t = 0; for (var i = 0; i < 21; i++) { var dx = a[i][0] - b[i][0], dy = a[i][1] - b[i][1]; t += Math.sqrt(dx * dx + dy * dy); } return t / 21; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // --- zoom de página (CSS zoom; la interfaz de gestos vive fuera del body para no escalarse) ---
  function getZoom() { return parseFloat(document.body.style.zoom) || 1; }
  function setZoom(z, say) {
    z = Math.round(clamp(z, 0.6, 2.2) * 20) / 20;
    if (z === getZoom()) return;
    document.body.style.zoom = z === 1 ? '' : String(z);
    if (say) toast('🔍 ' + Math.round(z * 100) + ' %');
  }

  // --- puntero en pantalla ---
  function showCursor() {
    if (!cur.el) {
      cur.el = document.createElement('div'); cur.el.id = 'gCursor'; cur.el.setAttribute('aria-hidden', 'true');
      cur.el.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2.5px solid #3FD8F0;background:rgba(63,216,240,.14);box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 18px rgba(63,216,240,.55);pointer-events:none;z-index:2147483001;transition:transform .12s,background .12s;display:none';
      cur.el.innerHTML = '<span style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#3FD8F0"></span>';
      document.documentElement.appendChild(cur.el);
    }
    cur.el.style.display = cur.active ? 'block' : 'none';
    if (!cur.active) { hoverTo(null); return; }
    cur.el.style.left = cur.x + 'px'; cur.el.style.top = cur.y + 'px';
    cur.el.style.transform = cur.pinched ? 'scale(.72)' : 'none';
    cur.el.style.background = cur.pinched ? 'rgba(63,216,240,.55)' : 'rgba(63,216,240,.14)';
    hoverTo(document.elementFromPoint(cur.x, cur.y));
  }
  // «pasar el ratón»: las páginas que reaccionan al hover (mapa de burbujas, tarjetas) también lo notan
  function hoverTo(el) {
    if (el === cur.hover) return;
    var o = { bubbles: true, clientX: cur.x, clientY: cur.y };
    try { if (cur.hover) { cur.hover.dispatchEvent(new MouseEvent('mouseout', o)); cur.hover.dispatchEvent(new PointerEvent('pointerleave', o)); } } catch (e) { }
    cur.hover = el;
    try { if (el) { el.dispatchEvent(new MouseEvent('mouseover', o)); el.dispatchEvent(new PointerEvent('pointerenter', o)); el.dispatchEvent(new MouseEvent('mousemove', o)); } } catch (e) { }
  }
  function clickAt(x, y) {
    var el = document.elementFromPoint(x, y); if (!el) return;
    var t = el.closest('a,button,input,select,textarea,label,summary,[role=button],[onclick],[tabindex]') || el;
    try { if (t.focus) t.focus({ preventScroll: true }); } catch (e) { }
    try { t.click(); } catch (e) { }
    if (cur.el) { cur.el.animate && cur.el.animate([{ boxShadow: '0 0 0 2px rgba(0,0,0,.35),0 0 0 0 rgba(63,216,240,.8)' }, { boxShadow: '0 0 0 2px rgba(0,0,0,.35),0 0 0 22px rgba(63,216,240,0)' }], { duration: 380 }); }
  }
  function cursorTick(lm, t) {
    if (!lm) { if (cur.active && t - cur.seen > 700) { cur.active = false; cur.pinched = false; } showCursor(); return; }
    cur.seen = t;
    if (!cur.active) { showCursor(); return; }
    var p = lm[9]; // centro de la palma: apenas se mueve al hacer la pinza, así el clic no se desvía
    var tx = clamp((1 - p.x - 0.15) / 0.7, 0, 1) * innerWidth, ty = clamp((p.y - 0.2) / 0.6, 0, 1) * innerHeight;
    cur.x += (tx - cur.x) * 0.35; cur.y += (ty - cur.y) * 0.35;
    var pr = pinchRatio(lm);
    if (!cur.pinched && pr < PINCH_ON) { cur.pinched = true; if (t > cur.cd) { cur.cd = t + 500; clickAt(cur.x, cur.y); } }
    else if (cur.pinched && pr > PINCH_OFF) cur.pinched = false;
    showCursor();
  }

  // --- barridos: movimiento RÁPIDO de la palma (lento = mover el puntero) ---
  function detectSwipe(lm, t) {
    var p = lm[9];
    trail.push({ x: p.x, y: p.y, t: t }); while (trail.length && t - trail[0].t > SWIPE_MS) trail.shift();
    if (trail.length < 3) return false;
    var dx = p.x - trail[0].x, dy = p.y - trail[0].y;
    if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > 1.6 * Math.abs(dy)) {
      trail.length = 0; var nx = dx * SWIPE_SIGN > 0;
      toast(nx ? '👉 Página siguiente' : '👈 Página anterior'); emit(nx ? 'next' : 'prev'); return true;
    }
    if (Math.abs(dy) > SWIPE_Y && Math.abs(dy) > 1.6 * Math.abs(dx)) {
      trail.length = 0; var dn = dy > 0;
      toast(dn ? '👇 Bajar' : '👆 Subir'); emit(dn ? 'down' : 'up'); return true;
    }
    return false;
  }

  // --- zoom con las dos manos en pinza ---
  function zoomTick(hands) {
    var a = hands[0], b = hands[1];
    if (pinchRatio(a) < PINCH_OFF && pinchRatio(b) < PINCH_OFF) {
      var d = dist(a[8], b[8]);
      if (!zoom.d0) { zoom.d0 = d; zoom.z0 = getZoom(); }
      else setZoom(zoom.z0 * d / zoom.d0, true);
    } else zoom.d0 = 0;
  }

  // --- gestos aprendidos ---
  function loadCustom() { try { var c = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function saveCustom() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch (e) { } }
  function matchCustom(lm, t) {
    if (!custom.length) return false;
    var n = norm(lm), m = mirror(n), best = null, bd = 1e9;
    custom.forEach(function (c) { var d = Math.min(poseDist(n, c.pose), poseDist(m, c.pose)); if (d < bd) { bd = d; best = c; } });
    if (!best || bd > MATCH_MAX) { hold.a = null; return false; }
    if (hold.a !== best.action) { hold.a = best.action; hold.t = t; return true; }
    if (t - hold.t > 350 && t > cooldown) { cooldown = t + 1100; toast('⭐ ' + labelOf(best.action)); emit(best.action); }
    return true; // mientras mantienes tu gesto, no se disparan los de serie
  }
  function startTeach(action) {
    if (!on) { toast('Activa primero las manos libres.', 2400); return; }
    var t0 = performance.now();
    teach = { action: action, start: t0 + 3000, end: t0 + 4500, samples: [] };
    toast('Prepara el gesto para «' + labelOf(action) + '»… 3', 1100);
    setTimeout(function () { if (teach) toast('2', 1100); }, 1000);
    setTimeout(function () { if (teach) toast('1', 1100); }, 2000);
    setTimeout(function () { if (teach) toast('Grabando… mantén la mano quieta', 1600); }, 3000);
    setTimeout(finishTeach, 4600);
  }
  function finishTeach() {
    if (!teach) return;
    var s = teach.samples, a = teach.action; teach = null;
    if (s.length < 8) { toast('No he visto bien tu mano. Ponla frente a la cámara y prueba otra vez.', 3000); return; }
    var pose = [];
    for (var i = 0; i < 21; i++) { var x = 0, y = 0; s.forEach(function (f) { x += f[i][0]; y += f[i][1]; }); pose.push([+(x / s.length).toFixed(3), +(y / s.length).toFixed(3)]); }
    custom.push({ action: a, pose: pose }); saveCustom(); renderTeach();
    toast('Aprendido: tu gesto ahora hace «' + labelOf(a) + '»', 2600);
  }

  // Ayuda de gestos PERSISTENTE: no desaparece sola; la cierras tú cuando la aprendes y la reabres con "?".
  function helpHtml() {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="font-size:13px;color:#eef3f8;flex:1">Manos libres · gestos</b>'
      + '<button id="gHelpX" aria-label="Cerrar la ayuda" style="border:0;background:none;color:#9aa9b8;font-size:20px;line-height:1;cursor:pointer;padding:0 2px">×</button></div>'
      + HELP.map(function (h) { return '<div style="display:flex;align-items:center;gap:9px;padding:3px 0;font:13px/1.35 system-ui,sans-serif;color:#dfe7ef"><span style="width:22px;text-align:center;font-size:16px">' + h[0] + '</span><span style="color:#9aa9b8;flex:1">' + h[1] + '</span><span style="color:#3FD8F0;font-weight:600;text-align:right">' + h[2] + '</span></div>'; }).join('')
      + '<div style="border-top:1px solid #2a3a4d;margin-top:9px;padding-top:9px"><b style="font:700 12px system-ui,sans-serif;color:#eef3f8">Enseña tus propios gestos</b>'
      + '<div style="display:flex;gap:6px;margin-top:7px"><select id="gTeachAct" aria-label="Acción del gesto" style="flex:1;min-width:0;background:#0f1620;color:#eef3f8;border:1px solid #37506a;border-radius:8px;padding:6px;font:12px system-ui,sans-serif">'
      + ACTIONS.map(function (a) { return '<option value="' + a[0] + '">' + a[1] + '</option>'; }).join('')
      + '</select><button id="gTeachGo" type="button" style="border:0;border-radius:8px;background:#1f8fa3;color:#fff;font:700 11px system-ui,sans-serif;letter-spacing:.04em;padding:0 10px;cursor:pointer">GRABAR</button></div>'
      + '<div id="gTeachList" style="margin-top:6px"></div></div>'
      + '<div style="color:#7f8ea0;font:11px/1.4 system-ui,sans-serif;margin-top:8px">La cámara solo se usa aquí; no se graba ni se envía nada. Tus gestos se guardan solo en este navegador.</div>';
  }
  function renderTeach() {
    var l = document.getElementById('gTeachList'); if (!l) return;
    l.innerHTML = custom.map(function (c, i) { return '<div style="display:flex;align-items:center;gap:6px;font:12px system-ui,sans-serif;color:#dfe7ef;padding:2px 0"><span style="flex:1">⭐ Tu gesto → <b style="color:#3FD8F0">' + labelOf(c.action) + '</b></span><button data-i="' + i + '" aria-label="Borrar este gesto" style="border:0;background:none;color:#9aa9b8;cursor:pointer;font-size:15px">×</button></div>'; }).join('');
    l.onclick = function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; custom.splice(+b.getAttribute('data-i'), 1); saveCustom(); renderTeach(); };
  }
  function showHelp() {
    var c = document.getElementById('gHelp');
    if (!c) { c = document.createElement('div'); c.id = 'gHelp';
      c.style.cssText = 'position:fixed;left:16px;bottom:66px;z-index:58;background:rgba(18,24,33,.96);border:1px solid #2a3a4d;border-radius:14px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.5);width:min(330px,calc(100vw - 32px));max-height:calc(100vh - 90px);overflow-y:auto;backdrop-filter:blur(6px)';
      document.body.appendChild(c); }
    c.innerHTML = helpHtml(); c.hidden = false; renderTeach();
    var hb = document.getElementById('gHelpBtn'); if (hb) hb.hidden = true;
    try { localStorage.removeItem(HELP_KEY); } catch (e) { }
    var x = document.getElementById('gHelpX'); if (x) x.onclick = closeHelp;
    var go = document.getElementById('gTeachGo'); if (go) go.onclick = function () { startTeach(document.getElementById('gTeachAct').value); };
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

  function handle(r, t) {
    var hands = (r && r.landmarks) || [], gests = (r && r.gestures) || [];
    if (teach) { if (hands[0] && t >= teach.start && t <= teach.end) teach.samples.push(norm(hands[0])); cursorTick(null, t); return; }
    if (hands.length >= 2) { trail.length = 0; fistT = 0; zoomTick(hands); cursorTick(null, t); return; }
    zoom.d0 = 0;
    var lm = hands[0];
    if (!lm) { trail.length = 0; fistT = 0; hold.a = null; cursorTick(null, t); return; }
    var g = gests[0] && gests[0][0], name = g && g.score > 0.6 ? g.categoryName : '';
    if (name === 'Closed_Fist') { if (!fistT) fistT = t; else if (t - fistT > 1000) { fistT = 0; emit('off'); return; } } else fistT = 0;
    if (matchCustom(lm, t)) { cursorTick(lm, t); return; }
    if (t > cooldown && detectSwipe(lm, t)) { cooldown = t + 800; return; }
    if (name === 'Open_Palm') cur.active = true;
    cursorTick(lm, t);
    if (name && MAP[name] && t > cooldown) { cooldown = t + 1100; toast(iconFor(name)); emit(MAP[name]); }
  }
  function loop() {
    if (!on || !video || video.readyState < 2) { raf = requestAnimationFrame(loop); return; }
    var t = performance.now(); var r = null, f = null;
    try {
      if (gr) { r = gr.recognizeForVideo(video, t); handle(r, t); }
      if (!on) return; // el puño puede haber apagado
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
    document.documentElement.appendChild(panel);
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
      c.strokeStyle = teach ? '#F0C645' : '#3FD8F0'; c.lineWidth = 2;
      HAND_CONN.forEach(function (p) { var a = lm[p[0]], b = lm[p[1]]; if (!a || !b) return; c.beginPath(); c.moveTo(mx(a.x), a.y * H); c.lineTo(mx(b.x), b.y * H); c.stroke(); });
      lm.forEach(function (pt) { c.fillStyle = '#F0C645'; c.beginPath(); c.arc(mx(pt.x), pt.y * H, 3, 0, 7); c.fill(); });
    });
    if (f && f.detections) f.detections.forEach(function (d) {
      var bb = d.boundingBox; if (!bb) return;
      var x = W - (bb.originX + bb.width) / vw * W, y = bb.originY / vh * H, w = bb.width / vw * W, h = bb.height / vh * H;
      c.strokeStyle = '#EC6FA6'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
      c.fillStyle = '#EC6FA6'; c.font = '700 10px system-ui'; c.fillText('cara', x + 2, y - 3);
    });
    if (teach) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, H - 20, W, 20); c.fillStyle = '#F0C645'; c.font = '700 11px system-ui'; c.fillText(performance.now() < teach.start ? 'Prepara el gesto…' : '● Grabando', 8, H - 6); }
  }
  function iconFor(name) { return ({ Thumb_Up: '👍 Siguiente', Thumb_Down: '👎 Anterior', Victory: '✌️ Pregunto al tutor' })[name] || name; }

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
      gr = await vision.GestureRecognizer.createFromOptions(fileset, { baseOptions: { modelAssetPath: GEST_MODEL }, runningMode: 'VIDEO', numHands: 2 });
      try { fd = await vision.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'VIDEO' }); } catch (e) { fd = null; }
      on = true; awayT = performance.now(); trail.length = 0;
      try { localStorage.setItem(KEY, '1'); } catch (e) { }
      if (btn) { btn.disabled = false; btn.textContent = 'Manos libres: ON'; btn.style.borderColor = '#2fbf71'; }
      // Ayuda persistente: se muestra salvo que el usuario la cerrara antes (entonces queda el "?").
      var closed = false; try { closed = localStorage.getItem(HELP_KEY) === 'closed'; } catch (e) { }
      if (closed) mountHelpBtn(); else showHelp();
      mkPreview(); // cuadro de cámara con puntos de mano + caja de cara
      raf = requestAnimationFrame(loop);
    } catch (e) {
      disable();
      if (btn) { btn.disabled = false; btn.textContent = 'Manos libres'; }
      toast(e && /denied|Permission/i.test(String(e.name || e)) ? 'Necesito permiso de cámara para las manos libres.' : 'No he podido activar las manos libres en este navegador.', 3200);
    }
  }
  function disable() {
    on = false; if (raf) cancelAnimationFrame(raf); awayOverlay(false); trail.length = 0; rmPreview();
    teach = null; cur.active = false; cur.pinched = false; zoom.d0 = 0; showCursor();
    try { if (video && video.srcObject) video.srcObject.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
    if (video) { video.remove(); video = null; }
    try { if (gr && gr.close) gr.close(); } catch (e) { } try { if (fd && fd.close) fd.close(); } catch (e) { }
    gr = fd = null; try { localStorage.removeItem(KEY); } catch (e) { }
    var h = document.getElementById('gHelp'); if (h) h.hidden = true;
    var hb = document.getElementById('gHelpBtn'); if (hb) hb.hidden = true;
    var btn = document.getElementById('gBtn'); if (btn) { btn.textContent = 'Manos libres'; btn.style.borderColor = ''; }
  }
  function toggle() { on ? disable() : enable(); }

  function mountButton() {
    if (document.getElementById('gBtn')) return;
    var b = document.createElement('button'); b.id = 'gBtn'; b.type = 'button';
    b.textContent = 'Manos libres';
    b.title = 'Navega con gestos de la mano. La cámara solo se usa en tu navegador; no se graba ni se envía nada.';
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:55;background:rgba(20,28,38,.9);color:#eef3f8;border:1.5px solid #37506a;border-radius:999px;padding:9px 14px;font:13px/1 system-ui,sans-serif;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    b.onclick = toggle;
    document.body.appendChild(b);
  }

  window.SkillUpGestures = { enable: enable, disable: disable, toggle: toggle, onIntent: onIntent, isOn: function () { return on; }, mountButton: mountButton, showHelp: showHelp };
  if (document.readyState !== 'loading') mountButton(); else document.addEventListener('DOMContentLoaded', mountButton);
  // No auto-arranca aunque estuviera en ON antes: la cámara siempre requiere un gesto del usuario.
})();
