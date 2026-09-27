// Evaluación dentro del curso (1.2.0): al terminar un bloque ofrece su test personalizado; cada N bloques,
// un roleplay de control; al final, el examen final. curso.html solo llama a init/onCard/finish/open.
// Los bloques los define el servidor (/api/learning/assess/outline) y cada tarjeta se asigna a su bloque
// por su título (misma normalización que el servidor).
window.SkillUpAssess = (function () {
  'use strict';
  var S = { ready: false, o: null, slug: '', src: '', course: '', cards: [], cardBlock: [], last: -1, idx: 0, dismissed: {} };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').replace(/[▲▼►◄▸▾▶◀‹›]+\s*$/, '').trim().toLowerCase(); }

  var css = '' +
    '#sheet{position:fixed;inset:0;z-index:1300;display:none;align-items:flex-end;justify-content:center;background:rgba(8,5,12,.66);backdrop-filter:blur(3px)}' +
    '#sheet.open{display:flex}' +
    '#sheet .sh{width:min(560px,100%);max-height:88dvh;overflow:auto;background:var(--panel,#201d28);border:1px solid var(--line);border-bottom:0;border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -20px 60px rgba(0,0,0,.45);animation:shup .28s cubic-bezier(.22,1,.36,1)}' +
    '@keyframes shup{from{transform:translateY(30px);opacity:0}}' +
    '@media(min-width:720px){#sheet{align-items:center}#sheet .sh{border-radius:20px;border-bottom:1px solid var(--line)}}' +
    '@media(prefers-reduced-motion:reduce){#sheet .sh{animation:none}}' +
    '#sheet .k{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--teal2)}' +
    '#sheet h3{font-family:var(--fh);color:var(--ink);font-size:clamp(20px,5vw,24px);line-height:1.2;margin:6px 0 6px}' +
    '#sheet p{font-size:14px;line-height:1.55;color:var(--body);margin:0 0 12px}' +
    '#sheet .hand{font-family:var(--fc);color:var(--gold);font-size:19px}' +
    '#sheet .acts{display:flex;flex-direction:column;gap:9px;margin-top:14px}' +
    '#sheet .ab{display:flex;align-items:center;justify-content:center;min-height:48px;border:0;border-radius:12px;padding:12px 16px;font:800 13px/1.1 var(--ff);letter-spacing:.07em;text-transform:uppercase;color:#fff;cursor:pointer;background:linear-gradient(120deg,var(--teal),var(--aub));text-decoration:none;text-align:center}' +
    '#sheet .ab.gold{background:linear-gradient(120deg,#b8860b,var(--aub))}' +
    '#sheet .ab.ghost{background:none;border:1.5px solid var(--line);color:var(--ink)}' +
    '#sheet .ab[aria-disabled=true]{opacity:.45;pointer-events:none}' +
    '#sheet .rows{display:flex;flex-direction:column;gap:7px;margin:10px 0}' +
    '#sheet .r{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:12px;font-size:13.5px;color:var(--body)}' +
    '#sheet .r b{flex:1;min-width:0;color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#sheet .r a{color:var(--teal2);font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.05em;min-height:32px;display:inline-flex;align-items:center}' +
    '#sheet .tag{font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px;background:rgba(255,255,255,.06);white-space:nowrap}' +
    '#sheet .ok{color:var(--green,#54C79A)}#sheet .warn{color:var(--gold)}#sheet .mut{color:var(--muted)}';

  function sheet(html) {
    var el = document.getElementById('sheet');
    if (!el) {
      var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      el = document.createElement('div'); el.id = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      document.body.appendChild(el);
      el.addEventListener('click', function (e) { if (e.target === el || e.target.closest('[data-x]')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
    }
    el.innerHTML = '<div class="sh">' + html + '</div>';
    el.classList.add('open');
    var f = el.querySelector('.ab'); if (f) f.focus();
  }
  function close() { var el = document.getElementById('sheet'); if (el) el.classList.remove('open'); }

  function q(extra) { return 'src=' + encodeURIComponent(S.src) + '&card=' + S.idx + (extra || ''); }
  function testHref(b) { return '/app/evaluacion.html?' + q('&block=' + b); }
  function finalHref() { return '/app/evaluacion.html?' + q('&final=1'); }
  function rpHref(b) { return '/app/roleplays.html?' + q('&upTo=' + b); }
  function checkpointDue(b) { var n = S.o.roleplayEvery || 0; return n > 0 && (b + 1) % n === 0 && (S.o.checkpointsDone || []).indexOf(b) < 0; }
  function blk(b) { return S.o.blocks[b]; }

  function blockDone(b) {
    var B = blk(b); if (!B) return;
    var due = checkpointDue(b), tested = B.attempts > 0;
    if (tested && !due) return;
    var h = '<div class="k">Bloque ' + (b + 1) + ' de ' + S.o.blocks.length + ' completado</div><h3>' + esc(B.title) + '</h3>';
    if (!tested) h += '<p>Haz ahora el <b>test del bloque</b>: 6 preguntas creadas para ti con lo que has visto y lo que has hablado con tu tutor. Te da puntos y desbloquea el examen final.</p>';
    if (due) h += '<p class="hand">toca practicar</p><p>Llevas ' + (b + 1) + ' bloques: un <b>roleplay</b> corto con un caso de tu trabajo. Antes te hago 2-4 preguntas sobre tu situación real.</p>';
    h += '<div class="acts">' + (!tested ? '<a class="ab" href="' + testHref(b) + '">Hacer el test del bloque</a>' : '') +
      (due ? '<a class="ab' + (tested ? '' : ' ghost') + '" href="' + rpHref(b) + '">Practicar con un roleplay</a>' : '') +
      '<button class="ab ghost" data-x>Más tarde</button></div>';
    sheet(h);
  }

  function overview(end) {
    var o = S.o, f = o.final;
    var rows = o.blocks.map(function (B) {
      var tag = B.attempts ? '<span class="tag ' + (B.passed ? 'ok' : 'warn') + '">' + B.best + '/100</span>' : '<span class="tag mut">Pendiente</span>';
      return '<div class="r"><b>' + (B.i + 1) + '. ' + esc(B.title) + '</b>' + tag + '<a href="' + testHref(B.i) + '">' + (B.attempts ? 'Repetir' : 'Test') + '</a></div>';
    }).join('');
    var fin;
    if (f.passed && f.certificate) fin = '<a class="ab gold" href="/app/certificado.html?code=' + encodeURIComponent(f.certificate.code) + '">Ver tu certificado</a>';
    else if (!f.unlocked) fin = '<a class="ab gold" aria-disabled="true">Examen final · te faltan ' + f.missing.length + ' test' + (f.missing.length > 1 ? 's' : '') + '</a>';
    else if (!f.canStart) fin = '<a class="ab gold" aria-disabled="true">Examen final · no disponible ahora</a><p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">' + esc(f.reason || '') + '</p>';
    else fin = '<a class="ab gold" href="' + finalHref() + '">' + (f.open ? 'Continuar el examen final' : 'Hacer el examen final') + '</a>';
    var h = '<div class="k">' + (end ? 'Has llegado al final' : 'Evaluación del curso') + '</div><h3>' + esc(o.course) + '</h3>' +
      '<p>' + (end ? 'Para certificarte: test de cada bloque y examen final (mínimo ' + o.passMarks.final + '/100). ' : '') + 'Tu progreso:</p>' +
      '<div class="rows">' + rows + '</div><div class="acts">' + fin +
      '<a class="ab ghost" href="/app/roleplays.html?' + q('') + '">Practicar con un roleplay</a>' +
      (end ? '<a class="ab ghost" href="/app/inicio.html">Salir al inicio</a>' : '<button class="ab ghost" data-x>Seguir leyendo</button>') + '</div>';
    sheet(h);
  }

  function init(opts) {
    S.slug = opts.slug; S.src = opts.src; S.course = opts.course; S.cards = opts.cards || [];
    return SkillUp.api('/api/learning/assess/outline?slug=' + encodeURIComponent(S.slug)).then(function (o) {
      S.o = o;
      // Casado por SECUENCIA (los títulos se repiten entre módulos: «Objetivo», «Contenido»…): cada tarjeta busca su
      // título en la lista ordenada del servidor a partir del último casado. Sin coincidencia, hereda el bloque anterior.
      var seq = []; (o.blocks || []).forEach(function (B) { (B.headings || []).forEach(function (h) { seq.push({ h: h, b: B.i }); }); });
      var p = 0, cur = 0;
      S.cardBlock = S.cards.map(function (t) {
        var n = norm(t);
        for (var k = p; k < seq.length; k++) { if (seq[k].h === n) { p = k + 1; if (seq[k].b > cur) cur = seq[k].b; break; } }
        return cur;
      });
      S.ready = true;
      var btn = document.getElementById('asBtn'); if (btn) { btn.hidden = false; btn.onclick = function () { overview(false); }; }
    }).catch(function () { /* curso sin evaluación: el curso sigue funcionando igual */ });
  }
  // Paso normal hacia delante que cruza a otro bloque = el bloque anterior está terminado.
  function onCard(i) {
    var prev = S.last; S.last = i; S.idx = i;
    if (!S.ready || prev < 0 || i !== prev + 1) return;
    var a = S.cardBlock[prev], b = S.cardBlock[i];
    if (a !== undefined && b !== undefined && b > a && !S.dismissed[a]) { S.dismissed[a] = 1; setTimeout(function () { blockDone(a); }, 350); }
  }
  // Botón «Terminar» en la última tarjeta: resumen de evaluación en vez de salir sin más.
  function finish() {
    if (!S.ready) return false;
    var last = S.cardBlock[S.cardBlock.length - 1];
    var B = blk(last);
    if (B && !B.attempts && !S.dismissed['end' + last]) { S.dismissed['end' + last] = 1; blockDone(last); return true; }
    overview(true); return true;
  }
  return { init: init, onCard: onCard, finish: finish, open: function () { if (S.ready) overview(false); }, _state: S };
})();
