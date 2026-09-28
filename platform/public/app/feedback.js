// Feedback compartido (1.4.0): pulgar arriba/abajo bajo cada respuesta de la IA, sugerencias desde el menú
// y aviso cuando una sugerencia se resuelve. Cada chat llama a SUFeedback.attach(burbuja, contexto) al pintar
// una respuesta; no toca el resto del chat (voz, dictado, gestos, vídeo).
// API en /api/agent/feedback/* (no /api/feedback: esa ruta es del servicio antiguo).
(function () {
  if (window.SUFeedback) return;

  var REASONS = [['dato_incorrecto', 'Dato incorrecto'], ['fuera_de_tema', 'Fuera de tema'], ['no_lo_entiendo', 'No lo entiendo'],
    ['voz', 'Suena mal o falla la voz'], ['palabra_mal_escrita', 'Palabra mal escrita'], ['otro', 'Otro']];
  var TYPES = [['sugerencia', 'Sugerencia'], ['error', 'Error'], ['contenido', 'Petición de contenido'], ['otro', 'Otro']];
  var STATUS = { nuevo: 'Recibido', en_revision: 'En revisión', resuelto: 'Resuelto', descartado: 'Descartado' };
  function T(k, es) { return window.SUI18n ? SUI18n.t(k, es) : es; }
  var UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2.9 2.2L13 10h5.6a2 2 0 0 1 2 2.4l-1.4 6.4A2 2 0 0 1 17.2 20H7"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-2.9-2.2L11 14H5.4a2 2 0 0 1-2-2.4l1.4-6.4A2 2 0 0 1 6.8 4H17"/></svg>';

  var css = '' +
    '.sufb{display:flex;align-items:center;gap:2px;margin:2px 0 8px;flex-wrap:wrap;font:600 12.5px Inter,system-ui,sans-serif;color:var(--muted,#968EA4)}' +
    '.sufb-b{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;border:0;background:none;color:var(--muted,#968EA4);cursor:pointer;padding:0}' +
    '.sufb-b svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.sufb-b:hover{background:var(--soft,rgba(255,255,255,.06));color:var(--ink,#F2EFF5)}' +
    '.sufb-b:focus-visible{outline:2px solid var(--teal2,#3FD8E0);outline-offset:1px}' +
    '.sufb-b[aria-pressed="true"].up{color:var(--green,#54C79A)}.sufb-b[aria-pressed="true"].up svg{fill:currentColor;fill-opacity:.25}' +
    '.sufb-b[aria-pressed="true"].down{color:var(--red,#E2506A)}.sufb-b[aria-pressed="true"].down svg{fill:currentColor;fill-opacity:.25}' +
    '@media (pointer:coarse){.sufb-b{width:44px;height:44px}}' +
    '.sufb-ok{margin-left:4px}' +
    '.sufb-f{flex-basis:100%;background:var(--panel,#221f2a);border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;padding:10px;margin-top:4px;color:var(--body,#DAD4E2)}' +
    '.sufb-f p{margin:0 0 8px;font-size:12.5px;color:var(--muted,#968EA4)}' +
    '.sufb-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}' +
    '.sufb-chip{border:1px solid var(--line,rgba(255,255,255,.12));background:var(--soft,rgba(255,255,255,.05));color:var(--body,#DAD4E2);border-radius:999px;padding:7px 11px;font:700 12px Inter,system-ui,sans-serif;cursor:pointer;min-height:36px}' +
    '@media (pointer:coarse){.sufb-chip{min-height:44px}}' +
    '.sufb-chip[aria-pressed="true"]{background:var(--grad,linear-gradient(120deg,#1a9aa0,#8a5f7c));color:#fff;border-color:transparent}' +
    '.sufb-f textarea,.sufb-g textarea{width:100%;box-sizing:border-box;min-height:64px;font:15px Inter,system-ui,sans-serif;padding:9px 11px;border-radius:10px;border:1.5px solid var(--line,rgba(255,255,255,.12));background:var(--soft,rgba(255,255,255,.05));color:var(--ink,#F2EFF5);margin:0 0 8px;resize:vertical}' +
    '.sufb-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.sufb-go{border:0;border-radius:999px;padding:10px 18px;min-height:44px;background:var(--grad,linear-gradient(120deg,#1a9aa0,#8a5f7c));color:#fff;font:800 12.5px Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}' +
    '.sufb-go:disabled{opacity:.5;cursor:default}' +
    '.sufb-no{border:0;background:none;color:var(--muted,#968EA4);font:700 12.5px Inter,system-ui,sans-serif;cursor:pointer;min-height:44px;padding:0 10px;text-transform:uppercase;letter-spacing:.04em}' +
    '.sufb-ov{position:fixed;inset:0;z-index:2100;background:rgba(10,8,14,.6);display:flex;align-items:flex-end;justify-content:center}' +
    '@media(min-width:640px){.sufb-ov{align-items:center}}' +
    '.sufb-g{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;box-sizing:border-box;background:var(--panel,#221f2a);color:var(--body,#DAD4E2);border:1px solid var(--line,rgba(255,255,255,.1));border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));font:14px/1.45 Inter,system-ui,sans-serif}' +
    '@media(min-width:640px){.sufb-g{border-radius:20px}}' +
    '.sufb-g h2{margin:0 0 4px;font:800 19px Inter,system-ui,sans-serif;color:var(--ink,#F2EFF5)}' +
    '.sufb-g .sufb-sub{margin:0 0 12px;color:var(--muted,#968EA4);font-size:13px}' +
    '.sufb-g label{display:block;font-weight:700;font-size:12.5px;margin:4px 0 6px;color:var(--ink,#F2EFF5)}' +
    '.sufb-g textarea{min-height:110px}' +
    '.sufb-ctx{font-size:12px;color:var(--muted,#968EA4);margin:0 0 12px}' +
    '.sufb-mine{margin-top:14px;border-top:1px solid var(--line,rgba(255,255,255,.1));padding-top:10px}' +
    '.sufb-mine h3{margin:0 0 6px;font:800 13px Inter,system-ui,sans-serif;color:var(--ink,#F2EFF5)}' +
    '.sufb-it{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.06))}' +
    '.sufb-it span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.sufb-st{flex:none;font-weight:800;color:var(--teal2,#3FD8E0)}' +
    '.sufb-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2200;max-width:min(92vw,460px);background:var(--panel,#221f2a);color:var(--ink,#F2EFF5);border:1px solid var(--teal2,#3FD8E0);border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.4);font:600 13.5px/1.4 Inter,system-ui,sans-serif}' +
    '.sufb-toast button{margin-left:10px}';

  function injectCss() { if (document.getElementById('sufb-css')) return; var st = document.createElement('style'); st.id = 'sufb-css'; st.textContent = css; document.head.appendChild(st); }
  function api(path, body) {
    if (window.SkillUp && SkillUp.api) return SkillUp.api(path, body ? { method: 'POST', body: body } : undefined);
    return fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.error) || 'error'); return d; }); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hash(s) { var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function pageName() { return (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'app'; }
  function toast(html, ms) {
    injectCss();
    var t = document.createElement('div'); t.className = 'sufb-toast'; t.setAttribute('role', 'status'); t.innerHTML = html;
    document.body.appendChild(t);
    var close = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    t.addEventListener('click', close); setTimeout(close, ms || 3500);
  }

  /**
   * Pulgares bajo una respuesta de la IA. ctx: { messageId?, ref?, answer, prompt?, page?, course?, block?, agent? }.
   * Sin messageId se valora por referencia (página + texto) y se guarda la copia del texto.
   */
  function attach(el, ctx) {
    if (!el || !ctx || !(ctx.messageId || ctx.answer)) return null;
    injectCss();
    var old = el.nextElementSibling; if (old && old.classList && old.classList.contains('sufb')) old.parentNode.removeChild(old);
    var base = {
      messageId: ctx.messageId || undefined,
      ref: ctx.messageId ? undefined : (ctx.ref || (ctx.page || pageName()) + ':' + hash(ctx.answer)),
      answer: ctx.messageId ? undefined : String(ctx.answer || '').slice(0, 6000),
      prompt: ctx.prompt ? String(ctx.prompt).slice(0, 4000) : undefined,
      page: ctx.page || pageName(), course: ctx.course || undefined, block: ctx.block ? String(ctx.block).slice(0, 200) : undefined, agent: ctx.agent || undefined
    };
    var bar = document.createElement('div'); bar.className = 'sufb';
    bar.innerHTML = '<button type="button" class="sufb-b up" aria-pressed="false" aria-label="' + T('fb.useful', 'Respuesta útil') + '" title="' + T('fb.useful', 'Respuesta útil') + '">' + UP + '</button>' +
      '<button type="button" class="sufb-b down" aria-pressed="false" aria-label="' + T('fb.improvable', 'Respuesta mejorable') + '" title="' + T('fb.improvable', 'Respuesta mejorable') + '">' + DOWN + '</button><span class="sufb-ok" aria-live="polite"></span>';
    var bUp = bar.querySelector('.up'), bDown = bar.querySelector('.down'), ok = bar.querySelector('.sufb-ok'), state = null, form = null;
    // Dentro de burbujas que se cierran al tocarlas (p. ej. el bocadillo de los ojos) los toques no deben cerrarlas.
    bar.addEventListener('click', function (e) { e.stopPropagation(); });
    function paint() { bUp.setAttribute('aria-pressed', state === 'up'); bDown.setAttribute('aria-pressed', state === 'down'); }
    function save(rating, extra) {
      var prev = state; state = rating; paint();
      return api('/api/agent/feedback/rate', Object.assign({}, base, { rating: rating }, extra || {}))
        .then(function () { ok.textContent = rating ? T('fb.thanks', 'Gracias') : ''; setTimeout(function () { ok.textContent = ''; }, 2000); })
        .catch(function () { state = prev; paint(); ok.textContent = T('fb.saveErr', 'No se pudo guardar'); });
    }
    function closeForm() { if (form && form.parentNode) form.parentNode.removeChild(form); form = null; }
    function openForm() {
      closeForm();
      form = document.createElement('div'); form.className = 'sufb-f';
      form.innerHTML = '<p>' + T('fb.what', '¿Qué ha fallado? Nos ayuda a mejorar.') + '</p><div class="sufb-chips" role="group" aria-label="' + T('fb.reason', 'Motivo') + '">' +
        REASONS.map(function (r) { return '<button type="button" class="sufb-chip" aria-pressed="false" data-r="' + r[0] + '">' + T('fb.r.' + r[0], r[1]) + '</button>'; }).join('') +
        '</div><textarea maxlength="1000" aria-label="' + T('fb.comment', 'Comentario (opcional)') + '" placeholder="' + T('fb.comment', 'Comentario (opcional)') + '"></textarea>' +
        '<div class="sufb-row"><button type="button" class="sufb-go">' + T('fb.send', 'Enviar') + '</button><button type="button" class="sufb-no">' + T('fb.cancel', 'Cancelar') + '</button></div>';
      bar.appendChild(form);
      form.querySelector('.sufb-chips').addEventListener('click', function (e) {
        var c = e.target.closest('.sufb-chip'); if (c) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true');
      });
      form.querySelector('.sufb-no').onclick = closeForm;
      try { form.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
      form.querySelector('.sufb-go').onclick = function () {
        var reasons = [].slice.call(form.querySelectorAll('.sufb-chip[aria-pressed="true"]')).map(function (c) { return c.getAttribute('data-r'); });
        var comment = form.querySelector('textarea').value.trim();
        this.disabled = true;
        save('down', { reasons: reasons, comment: comment || undefined }).then(closeForm);
      };
    }
    bUp.onclick = function () { closeForm(); save(state === 'up' ? null : 'up'); };
    bDown.onclick = function () {
      if (state === 'down' && !form) { save(null); return; }
      if (state !== 'down') save('down'); // queda guardado aunque no rellene el formulario
      openForm();
    };
    el.insertAdjacentElement('afterend', bar);
    return bar;
  }

  /* ---------------- sugerencias desde el menú (cualquier rol) */
  var me = null;
  function getMe() { if (me) return Promise.resolve(me); return api('/api/org/me').then(function (m) { me = m || {}; return me; }).catch(function () { return {}; }); }
  function openGeneral() {
    injectCss();
    getMe().then(function (m) {
      var admin = m && (m.role === 'admin' || m.role === 'direccion');
      var title = admin ? T('fb.titleAdmin', 'Enviar sugerencia a Brandooers') : T('fb.title', 'Enviar sugerencia');
      var ov = document.createElement('div'); ov.className = 'sufb-ov';
      ov.innerHTML = '<div class="sufb-g" role="dialog" aria-modal="true" aria-labelledby="sufbT"><h2 id="sufbT">' + title + '</h2>' +
        '<p class="sufb-sub">' + (admin ? T('fb.subAdmin', 'Cuéntanos qué mejorarías de la plataforma para tu empresa. Lo lee el equipo de Brandooers.') : T('fb.sub', 'Una idea, un fallo o un contenido que echas en falta. Lo leemos todo.')) + '</p>' +
        '<label>' + T('fb.type', 'Tipo') + '</label><div class="sufb-chips" role="radiogroup" aria-label="' + T('fb.type', 'Tipo') + '">' +
        TYPES.map(function (t, i) { return '<button type="button" class="sufb-chip" role="radio" aria-checked="' + (i === 0) + '" aria-pressed="' + (i === 0) + '" data-t="' + t[0] + '">' + T('fb.t.' + t[0], t[1]) + '</button>'; }).join('') +
        '</div><label for="sufbTx">' + T('fb.yourMsg', 'Tu mensaje') + '</label><textarea id="sufbTx" maxlength="4000" placeholder="' + T('fb.ph', 'Escribe aquí…') + '"></textarea>' +
        '<p class="sufb-ctx">' + T('fb.ctx', 'Se adjunta automáticamente la página, tu rol, tu empresa y el navegador. Nada más.') + '</p>' +
        '<div class="sufb-row"><button type="button" class="sufb-go" id="sufbGo">' + T('fb.send', 'Enviar') + '</button><button type="button" class="sufb-no" id="sufbX">' + T('fb.close', 'Cerrar') + '</button><span class="sufb-ok" id="sufbMsg" aria-live="polite"></span></div>' +
        '<div class="sufb-mine" id="sufbMine" hidden><h3>' + T('fb.mine', 'Lo que ya has enviado') + '</h3><div id="sufbList"></div></div></div>';
      document.body.appendChild(ov);
      var type = 'sugerencia', tx = ov.querySelector('#sufbTx');
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      ov.querySelector('#sufbX').onclick = close;
      ov.querySelector('.sufb-chips').addEventListener('click', function (e) {
        var c = e.target.closest('.sufb-chip'); if (!c) return; type = c.getAttribute('data-t');
        ov.querySelectorAll('.sufb-chips .sufb-chip').forEach(function (x) { x.setAttribute('aria-pressed', x === c); x.setAttribute('aria-checked', x === c); });
      });
      ov.querySelector('#sufbGo').onclick = function () {
        var t = tx.value.trim(), msg = ov.querySelector('#sufbMsg'), b = this;
        if (t.length < 3) { msg.textContent = T('fb.more', 'Escribe un poco más'); tx.focus(); return; }
        b.disabled = true;
        api('/api/agent/feedback/general', { type: type, text: t, page: location.pathname + location.search })
          .then(function () { close(); toast(T('fb.ok', 'Gracias. Lo hemos recibido y te avisaremos cuando se resuelva.')); })
          .catch(function (e) { b.disabled = false; msg.textContent = e.message || T('fb.sendErr', 'No se pudo enviar'); });
      };
      tx.focus();
      api('/api/agent/feedback/mine').then(function (d) {
        var items = (d && d.items) || []; if (!items.length) return;
        ov.querySelector('#sufbMine').hidden = false;
        ov.querySelector('#sufbList').innerHTML = items.slice(0, 6).map(function (it) {
          var what = it.kind === 'general' ? (it.comment || '') : T('fb.rated', 'Respuesta valorada') + (it.course ? ' · ' + it.course : '');
          return '<div class="sufb-it"><span>' + esc(what) + '</span><span class="sufb-st">' + esc(T('fb.s.' + it.status, STATUS[it.status] || it.status)) + '</span></div>';
        }).join('');
      }).catch(function () { });
    });
  }

  /* ---------------- cerrar el círculo: aviso de lo resuelto (una vez) */
  function checkNotices() {
    if (/login|reset|aceptar-invitacion/.test(location.pathname)) return;
    api('/api/agent/feedback/notices').then(function (d) {
      (d && d.notices || []).slice(0, 2).forEach(function (n, i) {
        var what = n.kind === 'general' ? T('fb.yourSug', 'Tu sugerencia') : T('fb.yourRating', 'Tu valoración');
        setTimeout(function () { toast('<b>' + what + ' ' + T('fb.resolved', 'se ha resuelto:') + '</b> ' + esc(n.note || n.text), 9000); }, 1200 + i * 9500);
      });
    }).catch(function () { });
  }

  window.SUFeedback = { attach: attach, openGeneral: openGeneral, REASONS: REASONS, TYPES: TYPES, STATUS: STATUS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkNotices); else checkNotices();
})();
