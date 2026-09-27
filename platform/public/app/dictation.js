/* SkillUp · dictado compartido (una sola implementación para todas las pantallas).
   - Escucha continua: NO corta en una pausa normal; solo tras PAUSE_MS de silencio (o START_MS si aún no has hablado).
   - Volver a pulsar el micro corta al momento (y termina la conversación).
   - Modo conversación (chats con tutor): un toque y queda activo: hablas → se envía → el tutor responde → vuelve
     a escucharte solo. La página avisa con ctl.replyDone() cuando el tutor ha terminado de hablar.
   Uso: SkillUpDictation.attach(boton, { get, set, done, conversation }) */
(function () {
  'use strict';
  if (window.SkillUpDictation) return;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var START_MS = 8000; // desde que se abre el micro hasta empezar a hablar
  var PAUSE_MS = 5000; // silencio tras hablar antes de dar por terminado (pedido por Marc: 5 s, no cortar en una pausa)

  function attach(btn, o) {
    if (!btn) return null;
    if (!SR) { btn.style.display = 'none'; return null; }
    o = o || {};
    var rec = null, timer = null, convo = false, waiting = false, manual = false;
    function arm(ms) { clearTimeout(timer); timer = setTimeout(function () { if (rec) try { rec.stop(); } catch (e) { } }, ms); }
    function ui(on) {
      btn.classList.toggle('rec', on);
      btn.classList.toggle('convo', convo);
      btn.setAttribute('aria-pressed', on || convo ? 'true' : 'false');
      btn.title = on ? 'Te escucho · pulsa para terminar' : (convo ? 'Conversación activa · pulsa para terminar' : 'Hablar');
    }
    function start() {
      if (rec) return;
      var base = (o.append && o.get) ? String(o.get() || '').trim() : '';
      var fin = '', heard = false; manual = false;
      try { rec = new SR(); } catch (e) { return; }
      rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = function (ev) {
        var interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) { var r = ev.results[i]; if (r.isFinal) fin += r[0].transcript + ' '; else interim += r[0].transcript; }
        var t = (fin + interim).trim(); if (t) heard = true;
        if (o.set) o.set(((base ? base + ' ' : '') + t).trim());
        arm(PAUSE_MS); // cada trozo de voz reinicia el margen: no se corta mientras hablas o dudas
      };
      rec.onspeechstart = function () { clearTimeout(timer); };
      rec.onspeechend = function () { arm(PAUSE_MS); };
      rec.onerror = function (ev) {
        var c = ev && ev.error;
        if (c === 'not-allowed' || c === 'service-not-allowed' || c === 'audio-capture') { convo = false; if (o.error) o.error(c); }
      };
      rec.onend = function () {
        clearTimeout(timer); rec = null;
        if (!heard) convo = false; // silencio total: se cierra la conversación, no se queda escuchando para siempre
        if (manual) convo = false;
        ui(false);
        if (heard && o.done) { waiting = convo; o.done(o.get ? String(o.get() || '').trim() : fin.trim()); }
      };
      try { rec.start(); arm(START_MS); ui(true); } catch (e) { rec = null; ui(false); }
    }
    function stopNow() { manual = true; convo = false; waiting = false; clearTimeout(timer); if (rec) { try { rec.stop(); } catch (e) { } } ui(false); }
    btn.addEventListener('click', function () {
      if (rec || convo) { stopNow(); return; }
      convo = !!o.conversation; start();
    });
    var ctl = {
      // la página llama a esto cuando el tutor ha terminado de responder (o si no hay voz, tras mostrar la respuesta)
      replyDone: function () { if (convo && waiting && !rec) { waiting = false; setTimeout(start, 350); } },
      stop: stopNow,
      isActive: function () { return !!rec || convo; }
    };
    return ctl;
  }

  // aro turquesa = conversación activa entre turnos (el rojo de grabando lo pone cada página con .rec)
  try { var st = document.createElement('style'); st.textContent = '.convo:not(.rec){box-shadow:inset 0 0 0 2px #3FD8F0!important}'; document.head.appendChild(st); } catch (e) { }
  window.SkillUpDictation = { attach: attach, supported: !!SR };
})();
