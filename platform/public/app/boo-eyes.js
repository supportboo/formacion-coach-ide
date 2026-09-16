/* Brandooers · botón de los ojos (M1.1 + voz de M2.3) — asistente conversacional flotante.
   Aditivo y demo-safe: se autoinyecta, usa /api/agent/chat (IA ya activa) vía SkillUp.api.
   Voz: ElevenLabs (voz de Marc + peninsulares humanas) para responder; dictado con Web Speech.
   Si hablas por voz, te contesta por voz. Sin voz del navegador (nada robótico). */
(function () {
  "use strict";
  if (window.__booEyes) return; window.__booEyes = true;
  if (!window.SkillUp || !SkillUp.api) return; // requiere /app/api.js

  if (!document.querySelector('link[href*="Caveat"]')) {
    var lf = document.createElement('link'); lf.rel = 'stylesheet';
    lf.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap';
    document.head.appendChild(lf);
  }
  var WAVE = '<span class="bg-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

  // Guía por página: qué es esto y qué puedes hacer aquí. Solo páginas reales, texto real (nada inventado).
  var GUIDES = [
    { m: /\/app\/inicio\.html/, t: 'Aquí ves tu progreso y tus cursos. Toca una tarjeta para seguir donde lo dejaste.' },
    { m: /\/app\/ruta\.html/, t: 'Este es tu mapa de conocimiento. Pasa el ratón por las burbujas y haz clic para entrar a un tema.' },
    { m: /\/app\/explorar\.html/, t: 'Pregúntame lo que sea, o busca un curso. Te dejo recursos aquí al lado de la respuesta.' },
    { m: /\/app\/workforce\.html/, t: 'Aquí ves cómo aprende todo el equipo, agrupado por cómo aporta cada uno.' },
    { m: /^\/panel\.html/, t: 'Aquí ves las peticiones y el feedback del equipo, con gráficas reales.' },
    { m: /^\/revisiones\.html/, t: 'Aquí ajustas cómo responde el motor de cada curso.' },
    { m: /^\/usuarios\.html/, t: 'Aquí gestionas quién tiene acceso y con qué rol.' },
    { m: /affiliate\/admin/, t: 'Aquí ves el estado de tus dominios de afiliación.' }
  ];
  function currentGuide() { for (var i = 0; i < GUIDES.length; i++) if (GUIDES[i].m.test(location.pathname)) return GUIDES[i]; }

  var EYES = '<svg viewBox="0 0 100 58" aria-hidden="true"><defs>' +
    '<linearGradient id="booE1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00D4FF"/><stop offset="50%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#EC4899"/></linearGradient>' +
    '<linearGradient id="booE2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#EC4899"/></linearGradient>' +
    '<radialGradient id="booI1"><stop offset="0%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#5B21B6"/></radialGradient>' +
    '<radialGradient id="booI2"><stop offset="0%" stop-color="#67E8F9"/><stop offset="100%" stop-color="#0891B2"/></radialGradient></defs>' +
    '<g transform="translate(5,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="none" stroke="url(#booE1)" stroke-width="3"/><circle class="booIris" cx="20" cy="36" r="7.5" fill="url(#booI1)"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/></g>' +
    '<g transform="translate(53,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="none" stroke="url(#booE2)" stroke-width="3"/><circle class="booIris" cx="20" cy="36" r="7.5" fill="url(#booI2)"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/></g></svg>';
  var MIC = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>';
  var SPK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var HOME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';

  // El asistente de los ojos = ORQUESTADOR: conoce Brandooers y a los tutores, y deriva al especialista.
  var ORCH = '[Eres el asistente guía de Brandooers (el botón de los ojos): el orquestador que acompaña y deriva al tutor adecuado. '
    + 'QUÉ ES BRANDOOERS/SKILLUP: la formación que se queda dentro de la empresa y se propaga; no cursos que se olvidan. Se aprende haciendo, un referente de la empresa valida que de verdad se domina (la máquina simula y puntúa, la persona firma: eso es lo diferencial, lo que nadie más tiene), y el conocimiento pasa al resto del equipo. Se mide capacidad que se queda, no cursos completados. '
    + 'CÓMO EMPEZAR: pregunta objetivo y nivel y di por dónde entrar y en qué orden; o entra a un curso y el tutor te acompaña. '
    + 'EXPERIENCIA EN VIVO: mientras lees, los tutores interactúan en tiempo real segun dónde miras, hover, clic y scroll, con preguntas, ejemplos y avisos, y puedes hablar con ellos por texto o voz. '
    + 'TUTORES ESPECIALISTAS (deriva por temática y nómbralos): Diego (comercial: venta, prospección, reclutamiento de partners, outbound); Marta (marketing B2B y generación de demanda); Álvaro (negociación y objeciones); Elena (acompañamiento: coaching y onboarding de equipos). Cuando la pregunta sea de una especialidad, di qué tutor la lleva y ofrece llevar a ese curso. '
    + 'CONOCES AL USUARIO: por su onboarding (empresa, rol, objetivo) y por lo que va trabajando con los tutores (sus casos, lo que le cuesta, lo que quiere lograr). Refiérete a ello con naturalidad para que sienta que es un mismo cerebro que le conoce y aprende de él; nunca lo recites literal. '
    + 'ESPEJA con MODERACIÓN cómo habla el usuario para resonar: adapta un poco su registro (tú/usted) y tono; si te habla de colega, responde algo más cercano; si es formal, formal. No lo imites literalmente ni caricaturices. Escribe con ritmo natural (frases de distinta longitud) y CON SU PUNTUACIÓN CORRECTA (comas, puntos, puntos suspensivos): de ahí sale la pausa real al leerlo en voz alta, sin puntuación suena atropellado. Ni monótono ni acelerado; sé cercano y sorprende. Nunca digas «excelente pregunta», «por supuesto» ni frases corporativas o serviles. '
    + 'Responde SIEMPRE MUY breve y ágil, 2-3 frases, sin enrollarte, sin markdown ni símbolos.]';
  var TUTORS = [
    { name: 'Diego', spec: 'Comercial', course: '/reclutamiento-partners.html', c1: '#22D3EE', c2: '#0891B2' },
    { name: 'Marta', spec: 'Marketing', course: '/marketing-partners.html', c1: '#EC6FA6', c2: '#B0347A' },
    { name: 'Álvaro', spec: 'Negociación', course: '/negociacion-partner-manager.html', c1: '#F0C645', c2: '#B8860B' },
    { name: 'Elena', spec: 'Acompañamiento', course: '/index.html', c1: '#54C79A', c2: '#1a9aa0' }
  ];
  function tutorEyes(t) {
    return '<svg viewBox="0 0 100 58" width="26" height="16" aria-hidden="true"><g transform="translate(5,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="none" stroke="' + t.c1 + '" stroke-width="4"/><circle cx="20" cy="36" r="8" fill="' + t.c2 + '"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/></g><g transform="translate(53,0)"><ellipse cx="20" cy="36" rx="18" ry="18" fill="none" stroke="' + t.c2 + '" stroke-width="4"/><circle cx="20" cy="36" r="8" fill="' + t.c1 + '"/><circle cx="20" cy="36" r="3.5" fill="#0a0a0f"/></g></svg>';
  }

  var css = ''
    + ':root{--lvl:0}'
    + '.boo-fab{position:fixed;right:22px;bottom:22px;z-index:2000;width:64px;height:64px;border-radius:50%;border:2.5px solid transparent;cursor:grab;touch-action:none;display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,#1d1128,#0b0611) padding-box,conic-gradient(from 210deg,#22D3EE,#8B5CF6,#EC4899,#FFD700,#22D3EE) border-box;box-shadow:0 10px 28px rgba(139,92,246,.5),0 0 26px rgba(47,211,198,.4),0 0 44px rgba(236,111,166,.22);transition:transform .2s}'
    + '.boo-fab:hover{transform:translateY(-2px) scale(1.06)}'
    // el icono de los ojos se ilumina y las pupilas laten con la intensidad real de la voz (--lvl 0..1, de Web Audio)
    + '.boo-fab svg{width:38px;height:23px;filter:drop-shadow(0 0 calc(6px + 22px*var(--lvl)) rgba(103,232,249,calc(.7 + .3*var(--lvl)))) drop-shadow(0 2px 5px rgba(0,0,0,.55));transition:filter .05s linear}'
    + '.booIris{transform-box:fill-box;transform-origin:center;transform:scale(calc(1 + .55*var(--lvl)));transition:transform .05s linear}'
    + '@media(prefers-reduced-motion:no-preference){.boo-fab{animation:booGlow 2.8s ease-in-out infinite}@keyframes booGlow{0%,100%{box-shadow:0 10px 28px rgba(139,92,246,.5),0 0 22px rgba(47,211,198,.4)}50%{box-shadow:0 12px 32px rgba(236,111,166,.6),0 0 38px rgba(47,211,198,.65)}}.boo-fab .booIris{animation:booBlink 5s infinite}@keyframes booBlink{0%,93%,100%{opacity:1}96%{opacity:0}98%{opacity:1}}}'
    + '.boo-panel{position:fixed;right:22px;bottom:94px;z-index:2000;width:min(380px,92vw);max-height:70vh;background:rgba(22,16,34,.85);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3);border:1px solid rgba(150,120,255,.28);border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 60px rgba(120,90,255,.14);display:flex;flex-direction:column;transform:translateY(12px) scale(.98);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;font-family:Inter,system-ui,sans-serif}'
    + '.boo-panel.open{opacity:1;transform:none;pointer-events:auto}'
    + '.boo-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.07)}'
    + '.boo-head svg.beyes,.boo-head>svg{width:30px;height:18px}'
    + '.boo-head b{flex:1;color:#F3EFFA;font-size:14px;font-weight:800;min-width:0}'
    + '.boo-vsel{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#E9E4F5;font-size:11.5px;border-radius:8px;padding:4px 6px;max-width:104px;cursor:pointer;font-family:inherit;outline:none}'
    + '.boo-vsel:focus{border-color:#8B5CF6}'
    + '.boo-vsel option{background:#1b1226;color:#EDE7F5}'
    + '.boo-voice{background:none;border:0;color:#7E7691;cursor:pointer;padding:5px;border-radius:8px;display:grid;place-items:center}'
    + '.boo-voice.on{color:#3FD8F0}'
    + '.boo-home{background:none;border:0;color:#A78BFA;cursor:pointer;padding:5px;border-radius:8px;display:grid;place-items:center}'
    + '.boo-home:hover{background:rgba(167,139,250,.16);color:#C7B6FF}'
    + '.boo-x{background:none;border:0;color:#8A82A0;font-size:22px;cursor:pointer;line-height:1;width:30px;height:30px;border-radius:8px}'
    + '.boo-x:hover{background:rgba(255,255,255,.06);color:#fff}'
    + '.boo-chat{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:130px}'
    + '.boo-m{max-width:86%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap}'
    + '.boo-m.agent{align-self:flex-start;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#EEE9F7;border-bottom-left-radius:4px}'
    + '.boo-m.user{align-self:flex-end;background:linear-gradient(100deg,#22D3EE,#8B5CF6,#EC4899);color:#fff;border-bottom-right-radius:4px}'
    + '.boo-in{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.07)}'
    + '.boo-mic{width:42px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.06);color:#A78BFA;cursor:pointer;flex:none;display:grid;place-items:center}'
    + '.boo-mic.rec{background:#e74c3c;color:#fff;border-color:#e74c3c;animation:booRec 1s infinite}@keyframes booRec{50%{opacity:.5}}'
    + '.boo-in input{flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:11px;color:#fff;padding:10px 13px;font-size:14px;font-family:inherit;outline:none}'
    + '.boo-in input:focus{border-color:#8B5CF6}'
    + '.boo-in input::placeholder{color:#8A82A0}'
    + '.boo-send{width:42px;border:0;border-radius:11px;background:linear-gradient(100deg,#22D3EE,#8B5CF6);color:#fff;font-size:16px;cursor:pointer;flex:none}'
    + '.boo-roster{align-self:stretch;display:flex;flex-direction:column;gap:6px;margin:2px 0}'
    + '.boo-roster-t{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8A82A0;margin:2px 2px}'
    + '.boo-tutor{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);border-radius:12px;padding:8px 11px;cursor:pointer;font-family:inherit}'
    + '.boo-tutor:hover{background:rgba(181,136,168,.14);border-color:rgba(181,136,168,.4)}'
    + '.boo-tav{width:36px;height:36px;border-radius:9px;background:#0f0a16;display:grid;place-items:center;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}'
    + '.boo-tinfo b{display:block;font-size:13.5px;color:#F3EFFA}.boo-tinfo small{color:#9A90AC;font-size:11.5px}'
    + '.boo-acts{align-self:flex-start;display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 4px}'
    + '.boo-act{border:0;border-radius:10px;padding:8px 13px;font-size:12.5px;font-weight:700;cursor:pointer;color:#fff;background:linear-gradient(120deg,#22D3EE,#8B5CF6);font-family:inherit}'
    + '.boo-act.ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#EEE9F7}'
    + '@media(max-width:600px){.boo-panel{right:12px;left:12px;width:auto}}'
    // ondas de voz "Jarvis": barras que laten mientras habla el asistente (reutilizadas en el panel y en la burbuja-guía)
    // barras movidas por JS con datos reales de audio (Web Audio Analyser), no por una animación enlatada
    + '.bg-wave{display:inline-flex;gap:3px;align-items:flex-end;height:15px;flex:none;opacity:.3}'
    + '.bg-wave i{width:3px;background:linear-gradient(180deg,#67E8F9,#8B5CF6);border-radius:2px;height:4px;display:block;font-style:normal;transition:height .08s linear}'
    + '.bg-wave.active{opacity:1}'
    // burbuja-guía: saluda en cada página, letra grande handwriting (accesible), sigue a los ojos si los mueves
    + '.boo-guide{position:fixed;z-index:1999;max-width:min(300px,78vw);display:flex;flex-direction:column;gap:8px;background:rgba(22,16,34,.93);backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3);border:1px solid rgba(150,120,255,.32);border-radius:18px 18px 4px 18px;box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 40px rgba(120,90,255,.18);padding:14px 17px;cursor:pointer;opacity:0;transform:translateY(10px) scale(.96);transition:opacity .35s,transform .35s}'
    + '.boo-guide.show{opacity:1;transform:none}'
    + '.boo-guide p{margin:0;color:#F6F2FC;font-family:"Caveat",cursive;font-size:clamp(27px,4.4vw,36px);line-height:1.28;font-weight:700}'
    + '.boo-guide{max-width:min(340px,80vw)}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var fab = document.createElement('button');
  fab.className = 'boo-fab'; fab.setAttribute('aria-label', 'Abrir asistente Brandooers');
  fab.innerHTML = EYES; document.body.appendChild(fab);

  var panel = document.createElement('div'); panel.className = 'boo-panel';
  panel.innerHTML = '<div class="boo-head">' + EYES + WAVE + '<b>Asistente</b>'
    + '<select class="boo-vsel" aria-label="Voz" title="Voz" hidden></select>'
    + '<button class="boo-voice" aria-label="Leer respuestas en voz alta" title="Leer respuestas en voz alta" hidden>' + SPK + '</button>'
    + '<button class="boo-home" aria-label="Ir al menú principal" title="Menú principal">' + HOME + '</button>'
    + '<button class="boo-x" aria-label="Cerrar">×</button></div>'
    + '<div class="boo-chat"></div>'
    + '<div class="boo-in"><button class="boo-mic" aria-label="Dictar" title="Hablar">' + MIC + '</button>'
    + '<input type="text" placeholder="Escribe o habla…" aria-label="Mensaje">'
    + '<button class="boo-send" aria-label="Enviar">→</button></div>';
  document.body.appendChild(panel);

  var chat = panel.querySelector('.boo-chat');
  var input = panel.querySelector('input');
  var micBtn = panel.querySelector('.boo-mic');
  var voiceBtn = panel.querySelector('.boo-voice');
  var vsel = panel.querySelector('.boo-vsel');
  var threadId = null, open = false, greeted = false, orchProfile = [], recentLearning = [], userName = '', contextCard = '';
  // perfil del onboarding (empresa, rol, objetivo…) + CONTEXTO ACUMULADO ([sintesis], el más reciente) para conocer mejor al usuario cada vez
  try { SkillUp.api('/api/notes/list?source=onboarding').then(function (d) { (d && d.items || []).forEach(function (a) { if (a.kind !== 'insight' || !a.body) return; if (a.body.indexOf('[sintesis]') === 0) { if (!contextCard) contextCard = a.body.replace(/^\[sintesis\]\s*/, ''); return; } orchProfile.push(a.body); }); }).catch(function () {}); } catch (e) {}
  // aprendizaje en curso: lo que los tutores ya le han sacado (casos, objetivos, emociones). El orquestador aprende todo en uno.
  try { SkillUp.api('/api/notes/list').then(function (d) { (d && d.items || []).forEach(function (a) { if (a.kind === 'insight' && a.body && a.source && a.source !== 'onboarding') recentLearning.push(a.body); }); }).catch(function () {}); } catch (e) {}
  // nombre para saludar humano
  try { if (SkillUp.session) SkillUp.session().then(function (s) { if (s && s.user && s.user.name) userName = String(s.user.name).split(' ')[0]; showGuide(); }).catch(function () { showGuide(); }); else showGuide(); } catch (e) { showGuide(); }
  var voiceOn = true;           // leer TODA respuesta en voz alta por defecto (botón altavoz para silenciar)
  var ttsEnabled = true;        // se intenta hablar; si el servidor no puede, la respuesta 4xx corta sola
  var voiceId = 'bkcxugbRtulPFV1CinBX'; // voz de Marc por defecto desde el arranque (evita carrera con carga de voces)
  var voicesLoaded = false;
  var curAudio = null;
  var waveEls = [panel.querySelector('.boo-head .bg-wave')];
  function setSpeaking(v) { waveEls.forEach(function (w) { if (w) w.classList.toggle('active', v); }); }

  // --- ritmo e intensidad REALES de la voz: Web Audio Analyser, mueve las barras y las pupilas (--lvl) ---
  var audioCtx = null, analyser = null, freqData = null, levelRaf = null;
  function ensureAnalyser(el) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
      var src = audioCtx.createMediaElementSource(el);
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 64; analyser.smoothingTimeConstant = 0.6;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser); analyser.connect(audioCtx.destination);
    } catch (e) { analyser = null; }
  }
  function levelLoop() {
    if (!analyser || !curAudio || curAudio.paused) { stopLevel(); return; }
    analyser.getByteFrequencyData(freqData);
    var n = freqData.length, groups = 4, sums = [0, 0, 0, 0], per = n / groups, total = 0;
    for (var i = 0; i < n; i++) { sums[Math.min(groups - 1, Math.floor(i / per))] += freqData[i]; total += freqData[i]; }
    document.documentElement.style.setProperty('--lvl', (total / n / 255).toFixed(3));
    waveEls.forEach(function (w) { if (!w) return; var bars = w.children; for (var k = 0; k < bars.length && k < groups; k++) bars[k].style.height = (4 + 15 * Math.min(1, sums[k] / per / 255)) + 'px'; });
    levelRaf = requestAnimationFrame(levelLoop);
  }
  function stopLevel() {
    if (levelRaf) cancelAnimationFrame(levelRaf); levelRaf = null;
    document.documentElement.style.setProperty('--lvl', '0');
    waveEls.forEach(function (w) { if (!w) return; Array.prototype.forEach.call(w.children, function (b) { b.style.height = '4px'; }); });
  }

  // --- voz de salida: ElevenLabs (nunca navegador) ---
  function stopAudio() { if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; } setSpeaking(false); stopLevel(); }
  async function playTTS(text) {
    if (!ttsEnabled || !voiceId || !text) return;
    stopAudio();
    try {
      var r = await fetch('/api/voice/tts', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: String(text).slice(0, 1200), voiceId: voiceId })
      });
      if (!r.ok) return;
      setSpeaking(true);
      var url = URL.createObjectURL(await r.blob());
      var a = new Audio(url); curAudio = a; a.playbackRate = 1; // ritmo natural (1.12 sonaba acelerada y perdía tono)
      a.onended = function () { URL.revokeObjectURL(url); if (curAudio === a) curAudio = null; setSpeaking(false); stopLevel(); };
      ensureAnalyser(a);
      await a.play().catch(function () { setSpeaking(false); }); // si el navegador bloquea autoplay, degradamos a solo texto
      if (analyser) levelLoop();
    } catch (e) { setSpeaking(false); }
  }
  async function loadVoices() {
    if (voicesLoaded) return; voicesLoaded = true;
    try {
      var d = await SkillUp.api('/api/voice/voices');
      if (d && d.provider === 'elevenlabs' && d.voices && d.voices.length) {
        ttsEnabled = true;
        // El orquestador (asistente principal) habla con la voz de Marc si está disponible.
        var marc = d.voices.filter(function (v) { return v.id === 'bkcxugbRtulPFV1CinBX'; })[0];
        voiceId = marc ? marc.id : d.voices[0].id;
        vsel.innerHTML = '';
        d.voices.forEach(function (v) { var o = document.createElement('option'); o.value = v.id; o.textContent = v.name; if (v.id === voiceId) o.selected = true; vsel.appendChild(o); });
        vsel.hidden = false; voiceBtn.hidden = false; voiceBtn.classList.toggle('on', voiceOn); voiceBtn.title = voiceOn ? 'Silenciar la voz' : 'Que te hable en voz alta';
      }
      // provider 'none' => sin voz configurada: no mostramos controles ni usamos la del navegador
    } catch (e) {}
  }
  vsel.addEventListener('change', function () { voiceId = vsel.value; });
  voiceBtn.addEventListener('click', function () {
    voiceOn = !voiceOn; voiceBtn.classList.toggle('on', voiceOn);
    voiceBtn.title = voiceOn ? 'Silenciar la voz' : 'Que te hable en voz alta';
    if (!voiceOn) stopAudio();
  });

  // --- voz de entrada: dictado (Web Speech). No es TTS, no es la voz robótica. ---
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  if (SR) {
    micBtn.addEventListener('click', function () {
      if (rec) { try { rec.stop(); } catch (e) {} return; }
      rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = false; rec.maxAlternatives = 1;
      micBtn.classList.add('rec');
      rec.onresult = function (ev) { input.value = ev.results[0][0].transcript; };
      rec.onend = function () { micBtn.classList.remove('rec'); rec = null; if (input.value.trim()) send(true); };
      rec.onerror = function () { micBtn.classList.remove('rec'); rec = null; };
      try { rec.start(); } catch (e) { micBtn.classList.remove('rec'); rec = null; }
    });
  } else { micBtn.style.display = 'none'; }

  function toggle(v) {
    open = (v == null) ? !open : v;
    panel.classList.toggle('open', open);
    if (open) {
      loadVoices();
      input.focus();
      if (!greeted) { greeted = true; bubble('agent', 'Hola' + (userName ? ', ' + userName : '') + '. Soy tu guía en Brandooers. Te llevo con el tutor adecuado, o al menú principal con la casita de arriba. Pregúntame qué es Brandooers, por dónde empezar, o dime tu objetivo.'); showRoster(); }
    } else { stopAudio(); }
  }
  function bubble(role, text) {
    var d = document.createElement('div'); d.className = 'boo-m ' + role; d.textContent = text;
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  function showRoster() {
    var d = document.createElement('div'); d.className = 'boo-roster';
    d.innerHTML = '<div class="boo-roster-t">Tus tutores</div>' + TUTORS.map(function (t) {
      return '<button class="boo-tutor" data-c="' + t.course + '"><span class="boo-tav">' + tutorEyes(t) + '</span><span class="boo-tinfo"><b>' + t.name + '</b><small>Tutor de ' + t.spec + '</small></span></button>';
    }).join('');
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
    d.addEventListener('click', function (e) { var b = e.target.closest('.boo-tutor'); if (b) location.href = '/app/curso.html?src=' + b.getAttribute('data-c'); });
  }
  // Botones de acceso: si la respuesta menciona a un tutor, ofrece abrir su curso.
  function addActions(text) {
    var low = (text || '').toLowerCase();
    var found = TUTORS.filter(function (t) { return low.indexOf(t.name.toLowerCase()) >= 0; });
    if (!found.length) return;
    var wrap = document.createElement('div'); wrap.className = 'boo-acts';
    wrap.innerHTML = found.map(function (t) { return '<button class="boo-act" data-c="' + t.course + '">Abrir curso de ' + t.name + '</button>'; }).join('');
    wrap.addEventListener('click', function (e) { var b = e.target.closest('.boo-act'); if (b) location.href = '/app/curso.html?src=' + b.getAttribute('data-c'); });
    chat.appendChild(wrap); chat.scrollTop = chat.scrollHeight;
  }
  async function send(fromVoice) {
    var t = input.value.trim(); if (!t) return; input.value = '';
    var wasVoice = !!fromVoice;
    bubble('user', t);
    var thinking = bubble('agent', '…');
    try {
      var perf = orchProfile.length ? (' Perfil del usuario (de su onboarding, úsalo para personalizar): ' + orchProfile.slice(0, 6).join(' | ') + '.') : '';
      var ctx = contextCard ? (' CONTEXTO ACUMULADO del usuario (lo que ya sabes de él de conversaciones anteriores; úsalo para responder mejor y más personal, no lo repitas literal): ' + contextCard + '.') : '';
      var learn = recentLearning.length ? (' Lo que ya está trabajando y te ha contado con los tutores (refiérete a ello con naturalidad, no lo repitas literal): ' + recentLearning.slice(0, 4).join(' | ') + '.') : '';
      var msg = threadId ? t : (ORCH + ctx + perf + learn + '\n\n' + t); // primer mensaje: orquestador + contexto acumulado + perfil + aprendizaje
      var r = await SkillUp.api('/api/agent/chat', { method: 'POST', body: { message: msg, threadId: threadId || undefined } });
      threadId = r.threadId; thinking.textContent = r.reply || '—';
      chat.scrollTop = chat.scrollHeight; // el último mensaje siempre visible, lo demás sube
      addActions(r.reply || ''); // botones de acceso al curso del tutor que menciona
      // item B: si hablé por voz, me contesta por voz; o si el altavoz está activado.
      if (r.reply && (voiceOn || wasVoice)) playTTS(r.reply);
    } catch (ex) { thinking.textContent = 'Ahora mismo no puedo responder. Inténtalo en un momento.'; chat.scrollTop = chat.scrollHeight; }
  }

  // Burbuja-guía: saluda una vez por página (por pestaña) y explica qué se puede hacer aquí, en voz
  // y en handwriting grande (accesible). Vive anclada a donde estén los ojos en ese momento.
  var guideEl = null, guideDismissed = false, guideTimer = null;
  function positionGuide(el) {
    var r = fab.getBoundingClientRect();
    el.style.right = Math.max(6, innerWidth - r.right) + 'px';
    el.style.bottom = Math.max(6, innerHeight - r.top + 14) + 'px';
  }
  function dismissGuide() {
    if (!guideEl) return;
    guideEl.classList.remove('show');
    var el = guideEl; guideEl = null;
    document.removeEventListener('click', outsideDismiss, true);
    document.removeEventListener('keydown', outsideDismiss, true);
    setTimeout(function () { el.remove(); }, 320);
  }
  function outsideDismiss(e) {
    if (!guideEl || guideEl.contains(e.target) || e.target === fab) return;
    guideDismissed = true; clearTimeout(guideTimer); dismissGuide();
  }
  function showGuide() {
    var g = currentGuide(); if (!g) return;
    var key = 'skillup-guided:' + location.pathname;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    setTimeout(function () {
      if (guideDismissed) return;
      var el = document.createElement('div'); el.className = 'boo-guide';
      el.innerHTML = WAVE; var p = document.createElement('p'); p.textContent = g.t; el.appendChild(p);
      document.body.appendChild(el); guideEl = el; waveEls.push(el.querySelector('.bg-wave'));
      positionGuide(el);
      requestAnimationFrame(function () { el.classList.add('show'); });
      el.addEventListener('click', function () { guideDismissed = true; dismissGuide(); });
      // se cierra sola si el usuario ya está interactuando con la página (buscar, escribir…), para no estorbar
      document.addEventListener('click', outsideDismiss, true);
      document.addEventListener('keydown', outsideDismiss, true);
      guideTimer = setTimeout(function () { guideDismissed = true; dismissGuide(); }, 10000);
      if (voiceOn) playTTS((userName ? 'Hola ' + userName + '. ' : 'Hola. ') + g.t);
    }, 900);
  }

  // Arrastrar el FAB (Marc: "clic y mantener para arrastrar y colocarlo donde quiera"). Posición
  // persistida (mismo botón en todas las páginas), un simple movimiento no cuenta como arrastre.
  // La burbuja-guía desaparece mientras arrastras y vuelve a salir justo donde dejas los ojos.
  (function () {
    var dragging = false, moved = false, startX = 0, startY = 0, origLeft = 0, origTop = 0, justDragged = false;
    function applyPos(left, top) {
      left = Math.max(6, Math.min(innerWidth - 70, left));
      top = Math.max(6, Math.min(innerHeight - 70, top));
      fab.style.left = left + 'px'; fab.style.top = top + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
    }
    try { var saved = JSON.parse(localStorage.getItem('skillup-fab-pos') || 'null'); if (saved) applyPos(saved.left, saved.top); } catch (e) {}
    fab.addEventListener('pointerdown', function (e) {
      dragging = true; moved = false;
      var r = fab.getBoundingClientRect(); origLeft = r.left; origTop = r.top; startX = e.clientX; startY = e.clientY;
      try { fab.setPointerCapture(e.pointerId); } catch (e2) {}
    });
    fab.addEventListener('pointermove', function (e) {
      if (!dragging) return; var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        if (!moved && guideEl) { clearTimeout(guideTimer); guideEl.classList.remove('show'); } // se esconde justo al empezar a arrastrar
        moved = true; applyPos(origLeft + dx, origTop + dy);
      }
    });
    fab.addEventListener('pointerup', function () {
      if (!dragging) return; dragging = false;
      if (moved) {
        justDragged = true; var r = fab.getBoundingClientRect(); try { localStorage.setItem('skillup-fab-pos', JSON.stringify({ left: r.left, top: r.top })); } catch (e) {}
        if (guideEl) { positionGuide(guideEl); requestAnimationFrame(function () { guideEl.classList.add('show'); }); guideTimer = setTimeout(function () { guideDismissed = true; dismissGuide(); }, 6000); } // reaparece donde dejas los ojos
      }
    });
    fab.addEventListener('click', function (e) { if (justDragged) { justDragged = false; e.preventDefault(); e.stopPropagation(); return; } toggle(); });
  })();
  panel.querySelector('.boo-x').addEventListener('click', function () { toggle(false); });
  panel.querySelector('.boo-home').addEventListener('click', function () { location.href = '/app/inicio.html'; });
  panel.querySelector('.boo-send').addEventListener('click', function () { send(false); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) toggle(false); });
})();
