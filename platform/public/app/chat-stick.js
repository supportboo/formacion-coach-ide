/* SkillUp · los chats siempre muestran el último mensaje (abajo); los antiguos quedan arriba con scroll.
   Un solo sitio para todos los chats: al abrirse (aunque se llenaran estando ocultos) y cada vez que crecen
   (respuesta que sustituye al «…», pulgares de valoración, mensajes del coach, karaoke) se pegan abajo.
   Si la persona sube a propósito a leer algo antiguo, no se le arrastra: vuelve a pegarse al bajar del todo. */
(function () {
  'use strict';
  if (window.__chatStick) return; window.__chatStick = true;
  var SEL = '#log, #clog, #olog, #conv, .boo-chat';
  var NEAR = 80; // px desde abajo que cuentan como «estoy al final»

  function scroller(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    }
    var o = getComputedStyle(el).overflowY;
    return (o === 'auto' || o === 'scroll') ? el : (el.parentElement || el);
  }
  function attach(el) {
    if (el.__stick) return; el.__stick = true;
    var stick = true, box = null;
    function bottom() { box = scroller(el); if (stick) box.scrollTop = box.scrollHeight; }
    function onScroll() { stick = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR; }
    function bind() { var b = scroller(el); if (b !== box) { if (box) box.removeEventListener('scroll', onScroll); box = b; box.addEventListener('scroll', onScroll, { passive: true }); } }
    bind();
    new MutationObserver(function () { bind(); requestAnimationFrame(bottom); }).observe(el, { childList: true, subtree: true, characterData: true });
    if (window.ResizeObserver) {
      // Se dispara al abrir un panel oculto (de 0 a su tamaño real) y al cambiar de tamaño la ventana o el teclado móvil.
      var ro = new ResizeObserver(function () { bind(); bottom(); });
      ro.observe(el); if (el.parentElement) ro.observe(el.parentElement);
    }
    requestAnimationFrame(bottom);
  }
  // Barra «Tu práctica de hoy» bajo cada chat con tutor (lo útil nunca cuenta como desvío; ver contentGuard.ts).
  var QUOTA = null, bars = [];
  function renderBar(b) {
    if (!QUOTA || !QUOTA.cap) { b.hidden = true; return; }
    var p = Math.min(1, QUOTA.used / QUOTA.cap), left = Math.max(0, QUOTA.cap - QUOTA.used);
    var col = p < 0.7 ? '#2FBF71' : p < 0.9 ? '#F39C12' : '#E74C3C';
    var off = QUOTA.offTopic ? ' · fuera de tema ' + QUOTA.offTopic + '/' + QUOTA.offTopicCap : '';
    var tip = p >= 0.8 ? '<div style="margin-top:3px;color:#C7B6FF">Repartir la práctica en varios días fija mejor lo aprendido.</div>' : '';
    b.hidden = false;
    b.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><span>Tu práctica de hoy</span><span>' + QUOTA.used + ' de ' + QUOTA.cap + ' mensajes' + off + '</span></div>'
      + '<div style="height:4px;border-radius:4px;background:rgba(255,255,255,.08);margin-top:4px;overflow:hidden"><div style="height:100%;width:100%;transform:scaleX(' + p.toFixed(3) + ');transform-origin:left;background:' + col + ';transition:transform .4s"></div></div>' + tip;
    b.setAttribute('aria-label', 'Tu práctica de hoy: ' + QUOTA.used + ' de ' + QUOTA.cap + ' mensajes, quedan ' + left);
  }
  function addBar(el) {
    if (el.id === 'clog' || el.id === 'olog' || el.id === 'conv') return;
    if (/\/(reto|roleplays)\.html/.test(location.pathname)) return; // los roleplays no cuentan para el límite // supervisión, consola y onboarding no gastan práctica
    var b = document.createElement('div'); b.className = 'chat-quota'; b.hidden = true; b.setAttribute('role', 'status');
    b.style.cssText = 'font:600 11px/1.3 system-ui,sans-serif;color:#9AA9B8;padding:6px 10px 4px';
    el.insertAdjacentElement('afterend', b); bars.push(b); renderBar(b);
  }
  function setQuota(q) { if (q && typeof q.used === 'number') { QUOTA = q; bars = bars.filter(function (b) { return b.isConnected; }); bars.forEach(renderBar); } }
  function hookApi() {
    if (!window.SkillUp || !SkillUp.api || SkillUp.api.__quota) return;
    var orig = SkillUp.api;
    SkillUp.api = function (url) { var p = orig.apply(this, arguments); if (/\/api\/agent\/chat(\?|$)/.test(String(url))) p.then(function (r) { if (r && r.quota) setQuota(r.quota); }, function () { }); return p; };
    SkillUp.api.__quota = true;
    orig('/api/agent/quota').then(setQuota, function () { });
  }
  function scan(root) { (root.querySelectorAll ? root.querySelectorAll(SEL) : []).forEach(function (el) { var fresh = !el.__stick; attach(el); if (fresh) addBar(el); }); }
  function start() {
    hookApi(); setTimeout(hookApi, 1500);
    scan(document);
    // Los chats que se crean después (reto, roleplays, En directo) también se enganchan.
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; if (n.matches && n.matches(SEL)) attach(n); scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
