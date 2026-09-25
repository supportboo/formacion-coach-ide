/* eyes-follow.js — los ojos grandes del hero (.hero-eyes) miran al cursor de verdad.
   Cada ojo calcula su centro real en pantalla y gira iris+pupila hacia el puntero,
   con recorrido amplio y suavizado (lerp). Respeta prefers-reduced-motion. */
(function () {
  var svgs = document.querySelectorAll('.hero-eyes');
  if (!svgs.length) return;
  var RM = false; try { RM = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}

  var eyes = [];
  Array.prototype.forEach.call(svgs, function (svg) {
    Array.prototype.forEach.call(svg.querySelectorAll('g'), function (g) {
      var c = g.querySelectorAll('circle'); // [iris, pupil, glint]
      if (c.length >= 2) eyes.push({ g: g, iris: c[0], pupil: c[1], glint: c[2] || null, ox: 0, oy: 0 });
    });
  });
  if (!eyes.length) return;

  var mx = window.innerWidth / 2, my = window.innerHeight * 0.4, seen = false;
  window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; seen = true; }, { passive: true });
  // móvil: si inclina el dispositivo, los ojos también reaccionan
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null) return;
    mx = window.innerWidth * (0.5 + Math.max(-1, Math.min(1, e.gamma / 45)) * 0.5);
    my = window.innerHeight * (0.5 + Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 45)) * 0.5);
    seen = true;
  }, { passive: true });

  var REACH = 9;      // recorrido máx del iris dentro del ojo (viewBox units; socket r=18)
  var FALLOFF = 240;  // px de distancia para llegar al recorrido máximo
  function frame() {
    for (var i = 0; i < eyes.length; i++) {
      var e = eyes[i];
      var r = e.g.getBoundingClientRect();
      var ecx = r.left + r.width / 2, ecy = r.top + r.height / 2;
      var dx = mx - ecx, dy = my - ecy, d = Math.hypot(dx, dy) || 1;
      var reach = Math.min(1, d / FALLOFF);
      var tox = dx / d * REACH * reach, toy = dy / d * REACH * reach;
      e.ox += (tox - e.ox) * 0.2; e.oy += (toy - e.oy) * 0.2;
      e.iris.setAttribute('cx', (20 + e.ox).toFixed(2)); e.iris.setAttribute('cy', (36 + e.oy).toFixed(2));
      e.pupil.setAttribute('cx', (20 + e.ox).toFixed(2)); e.pupil.setAttribute('cy', (36 + e.oy).toFixed(2));
      if (e.glint) { e.glint.setAttribute('cx', (23 + e.ox * 0.9).toFixed(2)); e.glint.setAttribute('cy', (33 + e.oy * 0.9).toFixed(2)); }
    }
    if (!RM) raf = requestAnimationFrame(frame);
  }
  var raf = requestAnimationFrame(frame);
  if (RM) { cancelAnimationFrame(raf); frame(); }
})();
