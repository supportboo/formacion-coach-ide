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
  function scan(root) { (root.querySelectorAll ? root.querySelectorAll(SEL) : []).forEach(attach); }
  function start() {
    scan(document);
    // Los chats que se crean después (reto, roleplays, En directo) también se enganchan.
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; if (n.matches && n.matches(SEL)) attach(n); scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
