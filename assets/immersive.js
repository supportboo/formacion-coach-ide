/* Brandooers · immersive layer
 * Vanilla JS, no deps except optional Lenis (window.Lenis) for smooth scroll.
 * - Net: 3D knowledge network (Canvas 2D, own projection) with mouse parallax.
 *   Programs: "hero" (time loop: knowledge propagates through the team) and
 *   "story" (scroll-driven, pinned: 5 chapters ending in the manager panel).
 * - Eyes of the logo follow the pointer. Magnetic CTAs. Hero H1 word stagger.
 * Hard rules: only transform/opacity in DOM, prefers-reduced-motion respected,
 * canvases are aria-hidden, no text in canvas. Mobile keeps a lighter scene.
 */
(function () {
  'use strict';
  var html = document.documentElement;
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HOVER = matchMedia('(hover: hover)').matches;
  var SMALL = matchMedia('(max-width: 900px)').matches;
  html.classList.add('js');
  html.classList.add(RM ? 'no-motion' : 'imm'); // .imm gates the pinned story + clip reveals in CSS

  /* ---------- shared eased pointer (0..1) ---------- */
  var px = 0.5, py = 0.5, ex = 0.5, ey = 0.5, moved = false;
  if (HOVER) addEventListener('pointermove', function (e) {
    px = e.clientX / innerWidth; py = e.clientY / innerHeight; moved = true;
  }, { passive: true });

  /* ---------- Lenis smooth scroll ---------- */
  var lenis = null;
  if (!RM && window.Lenis) {
    lenis = new Lenis({ wheelMultiplier: 0.85, lerp: 0.1, autoRaf: true }); // autoRaf: without it Lenis eats the wheel and never scrolls
    html.classList.add('lenis');
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href'); if (id.length < 2) return;
    var t = document.querySelector(id); if (!t) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(t, { offset: -64 }); else t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
  });

  /* ---------- glow sprites (pre-rendered, cheap to blit) ---------- */
  var HUES = ['0,212,255', '139,92,246', '236,72,153'];
  var sprites = HUES.map(function (rgb) {
    var c = document.createElement('canvas'), s = 64; c.width = c.height = s;
    var g = c.getContext('2d'), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(' + rgb + ',0.95)');
    grd.addColorStop(0.45, 'rgba(' + rgb + ',0.28)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    return c;
  });

  /* ---------- Net: 3D knowledge network ---------- */
  function Net(canvas, opts) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var N = opts.nodes, K = 3, w = 0, h = 0;
    var seed = opts.seed || 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

    var nodes = [], edges = [], i, j;
    for (i = 0; i < N; i++) {
      var u = rnd(), v = rnd(), r = Math.cbrt(rnd()) * 0.55 + 0.45;
      var th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      nodes.push({
        x: r * Math.sin(ph) * Math.cos(th), y: r * Math.sin(ph) * Math.sin(th) * 0.74, z: r * Math.cos(ph),
        gx: 0, gy: 0, gz: 0, lit: 0, sz: 0.65 + rnd() * 0.8, hue: i % 3, depth: 99, off: rnd() * 6.28, nb: []
      });
    }
    // k-nearest edges (deduped)
    var seen = {};
    for (i = 0; i < N; i++) {
      var d = [];
      for (j = 0; j < N; j++) if (i !== j) {
        var a = nodes[i], b = nodes[j];
        d.push([(a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z), j]);
      }
      d.sort(function (p, q) { return p[0] - q[0]; });
      for (j = 0; j < K; j++) {
        var k = d[j][1], key = i < k ? i + '-' + k : k + '-' + i;
        if (seen[key]) continue; seen[key] = 1;
        edges.push([i, k]); nodes[i].nb.push(k); nodes[k].nb.push(i);
      }
    }
    // seed = node closest to the centre; BFS depth from it (the knowledge that propagates)
    var s = 0, best = 9;
    for (i = 0; i < N; i++) { var dd = nodes[i].x * nodes[i].x + nodes[i].y * nodes[i].y + nodes[i].z * nodes[i].z; if (dd < best) { best = dd; s = i; } }
    nodes[s].depth = 0; var q = [s], maxDepth = 0;
    while (q.length) {
      var n0 = q.shift();
      nodes[n0].nb.forEach(function (m) { if (nodes[m].depth === 99) { nodes[m].depth = nodes[n0].depth + 1; maxDepth = Math.max(maxDepth, nodes[m].depth); q.push(m); } });
    }
    for (i = 0; i < N; i++) if (nodes[i].depth === 99) nodes[i].depth = maxDepth; // isolated → lit last
    // validator = a neighbour of the seed (the colleague who reviews the real case)
    var validator = nodes[s].nb[0];
    // grid targets = the manager panel (ordered by depth so the cascade reads left→right)
    var order = nodes.map(function (n, idx) { return [n.depth, idx]; }).sort(function (p, q) { return p[0] - q[0]; });
    var cols = Math.ceil(Math.sqrt(N * 1.7)), rows = Math.ceil(N / cols);
    order.forEach(function (o, idx) {
      var n = nodes[o[1]], c = idx % cols, rr = Math.floor(idx / cols);
      n.gx = (c / (cols - 1) - 0.5) * 2.3; n.gy = (rr / Math.max(1, rows - 1) - 0.5) * 1.35; n.gz = 0;
    });

    var st = { rotY: 0, rotX: 0.18, morph: 0, litDepth: 0, ring: 0, pair: 0, zoom: 1, breathe: 0 };
    var running = false, visible = true, t0 = performance.now(), last = t0;

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    resize(); addEventListener('resize', resize, { passive: true });

    function draw(now) {
      var t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (opts.program && !RM) opts.program(st, t, dt);
      ex += (px - ex) * 0.06; ey += (py - ey) * 0.06;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      var cx = w * (opts.cx || 0.5), cy = h * (opts.cy || 0.5);
      var S = Math.min(w, h) * (opts.scale || 0.44) * st.zoom, f = 2.7;
      var m = st.morph, mx = (ex - 0.5) * 0.55, my = (ey - 0.5) * 0.35;
      var ry = st.rotY * (1 - m) + mx * (1 - m * 0.6), rx = st.rotX * (1 - m) + my;
      var cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
      var n, k;
      for (k = 0; k < N; k++) {
        n = nodes[k];
        var x = n.x * (1 - m) + n.gx * m, y = n.y * (1 - m) + n.gy * m, z = n.z * (1 - m) + n.gz * m;
        if (st.breathe) { var b = 1 + Math.sin(t * 1.3 + n.off) * 0.02 * st.breathe; x *= b; y *= b; z *= b; }
        var x1 = x * cY - z * sY, z1 = x * sY + z * cY;
        var y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        var pz = f / (f + z2);
        n.sx = cx + x1 * S * pz; n.sy = cy + y1 * S * pz; n.pz = pz;
        var target = Math.max(0, Math.min(1, st.litDepth - n.depth + 1));
        n.lit += (target - n.lit) * 0.07;
      }
      // edges
      ctx.lineWidth = 1;
      for (k = 0; k < edges.length; k++) {
        var a = nodes[edges[k][0]], bb = nodes[edges[k][1]];
        var lit = Math.min(a.lit, bb.lit), dep = (a.pz + bb.pz) * 0.5;
        var isPair = st.pair && ((edges[k][0] === s && edges[k][1] === validator) || (edges[k][1] === s && edges[k][0] === validator));
        var al = ((0.05 + 0.4 * lit) * Math.max(0.15, dep - 0.35) + (isPair ? 0.5 * st.pair : 0)) * (1 - st.morph * 0.8); // edges fade as the grid (panel) forms
        if (al < 0.02) continue;
        ctx.strokeStyle = lit > 0.6 || isPair ? 'rgba(103,232,249,' + al + ')' : 'rgba(139,92,246,' + al + ')';
        ctx.lineWidth = isPair ? 1.6 : 1;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(bb.sx, bb.sy); ctx.stroke();
      }
      // nodes (far → near)
      var ord = nodes.slice().sort(function (p, q) { return p.pz - q.pz; });
      for (k = 0; k < N; k++) {
        n = ord[k];
        var base = n.sz * 2.2 * n.pz, dz = Math.max(0.12, n.pz - 0.3);
        if (n.lit > 0.03) {
          var g = base * (5 + 3 * n.lit) * (1 + 0.15 * Math.sin(t * 2 + n.off));
          if (n === nodes[s] && st.ring) g *= 1 + 0.9 * st.ring;
          ctx.globalAlpha = Math.min(1, n.lit * dz * 1.6);
          ctx.drawImage(sprites[n.hue], n.sx - g, n.sy - g, g * 2, g * 2);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = n.lit > 0.5 ? 'rgba(255,255,255,' + (0.5 + 0.5 * dz) + ')' : 'rgba(190,182,210,' + (0.18 + 0.4 * dz) + ')';
        ctx.beginPath(); ctx.arc(n.sx, n.sy, base * (1 + n.lit * 0.6), 0, 6.283); ctx.fill();
      }
      if (running && visible) requestAnimationFrame(draw);
    }
    function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(draw); } }
    function stop() { running = false; }
    // only animate when on screen / tab visible
    try {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.02 }).observe(canvas);
    } catch (e) { start(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible) start(); });
    if (RM) { st.litDepth = maxDepth; st.breathe = 0; draw(performance.now()); running = false; }
    return { state: st, maxDepth: maxDepth, draw: draw, start: start, stop: stop };
  }

  /* ---------- programs ---------- */
  function heroProgram(st, t, dt) {
    // 18 s loop: propagates (0-55 %), stays and breathes (55-90 %), soft reset (90-100 %)
    var ph = (t % 18) / 18, md = this.maxDepth;
    st.rotY += dt * 0.11;
    if (ph < 0.55) { st.litDepth = (ph / 0.55) * (md + 1); st.breathe = 0; }
    else if (ph < 0.9) { st.litDepth = md + 1; st.breathe = Math.min(1, (ph - 0.55) / 0.1); }
    else { st.litDepth = (md + 1) * (1 - (ph - 0.9) / 0.1); st.breathe = 1 - (ph - 0.9) / 0.1; }
  }
  function storyProgram(getP) {
    return function (st, t, dt) {
      var p = getP(), md = this.maxDepth;
      st.rotY += dt * 0.07;
      if (p < 0.2) { st.litDepth = 0; st.ring = 0; st.pair = 0; st.morph = 0; }
      else if (p < 0.4) { var a = (p - 0.2) / 0.2; st.ring = a; st.litDepth = 0.35 * a; st.pair = 0; st.morph = 0; }
      else if (p < 0.6) { var b = (p - 0.4) / 0.2; st.ring = 1 - b * 0.5; st.litDepth = 0.35 + 0.65 * b; st.pair = Math.min(1, b * 1.6); st.morph = 0; }
      else if (p < 0.8) { var c = (p - 0.6) / 0.2; st.litDepth = 1 + c * md; st.pair = 1 - c; st.ring = 0.5 - c * 0.5; st.morph = 0; }
      else { var d = (p - 0.8) / 0.2, e = d * d * (3 - 2 * d); st.litDepth = md + 1; st.morph = e; st.zoom = 1 - 0.08 * e; st.breathe = e; }
    };
  }

  /* ---------- mount canvases ---------- */
  var nets = document.querySelectorAll('canvas[data-net]');
  var story = null;
  Array.prototype.forEach.call(nets, function (c) {
    var kind = c.getAttribute('data-net');
    var opts = { nodes: SMALL ? 84 : 150, seed: kind === 'story' ? 11 : 7, cx: parseFloat(c.getAttribute('data-cx') || (SMALL ? 0.5 : 0.66)), cy: parseFloat(c.getAttribute('data-cy') || (SMALL ? 0.3 : 0.5)), scale: SMALL ? 0.4 : 0.44 };
    var net;
    if (kind === 'story') {
      var sec = c.closest('.flowsec'), prog = 0;
      var getP = function () { return prog; };
      opts.program = storyProgram(getP);
      net = Net(c, opts);
      story = { net: net, sec: sec, set: function (p) { prog = p; } };
    } else {
      opts.program = heroProgram; net = Net(c, opts);
    }
    opts.program = opts.program.bind(net);
  });

  /* ---------- pinned story (scroll-driven chapters) ---------- */
  if (story && !RM) {
    var steps = story.sec.querySelectorAll('.fstep'), ticks = story.sec.querySelectorAll('.ftick'), cta = story.sec.querySelector('.fcta-wrap');
    var cur = -1;
    function tick() {
      var r = story.sec.getBoundingClientRect(), vh = innerHeight;
      var p = Math.max(0, Math.min(1, -r.top / (r.height - vh)));
      story.set(p);
      var idx = Math.min(steps.length - 1, Math.floor(p * steps.length));
      if (p >= 0.995) idx = steps.length - 1;
      if (idx !== cur) {
        cur = idx;
        Array.prototype.forEach.call(steps, function (el, i) { el.classList.toggle('on', i === idx); });
        Array.prototype.forEach.call(ticks, function (el, i) { el.classList.toggle('on', i <= idx); });
      }
      if (cta) cta.classList.toggle('on', p > 0.93);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- logo eyes follow the pointer ---------- */
  var eyes = Array.prototype.map.call(document.querySelectorAll('.beyes'), function (svg) {
    return Array.prototype.map.call(svg.querySelectorAll('g'), function (g) {
      var circles = g.querySelectorAll('circle');
      return { g: g, iris: circles[0], pupil: circles[1], glint: circles[2] || null };
    });
  });
  if (HOVER && !RM && eyes.length) {
    var eyeLoop = function () {
      if (moved) {
        var dx = (ex - 0.5) * 2, dy = (ey - 0.5) * 2, len = Math.hypot(dx, dy) || 1, k = Math.min(1, len);
        var ox = dx / len * 4.2 * k, oy = dy / len * 3 * k;
        eyes.forEach(function (svgEyes) {
          svgEyes.forEach(function (e) {
            if (!e.iris) return;
            e.iris.setAttribute('cx', 20 + ox); e.iris.setAttribute('cy', 36 + oy);
            e.pupil.setAttribute('cx', 20 + ox * 1.15); e.pupil.setAttribute('cy', 36 + oy * 1.15);
            if (e.glint) { e.glint.setAttribute('cx', 23 + ox); e.glint.setAttribute('cy', 33 + oy); }
          });
        });
      }
      requestAnimationFrame(eyeLoop);
    };
    requestAnimationFrame(eyeLoop);
  }

  /* ---------- hero: mascot depth parallax + counter-parallax on text ---------- */
  var heroes = document.querySelectorAll('.hero');
  if (HOVER && !RM && heroes.length) {
    var heroLoop = function () {
      var mx = (ex - 0.5) * -22, my = (ey - 0.5) * -14;
      Array.prototype.forEach.call(heroes, function (hh) {
        hh.style.setProperty('--mx', mx.toFixed(2) + 'px'); hh.style.setProperty('--my', my.toFixed(2) + 'px');
      });
      requestAnimationFrame(heroLoop);
    };
    requestAnimationFrame(heroLoop);
  }

  /* ---------- magnetic CTAs (transform only) ---------- */
  if (HOVER && !RM) {
    Array.prototype.forEach.call(document.querySelectorAll('.btn-grad'), function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.22, y = (e.clientY - r.top - r.height / 2) * 0.28;
        b.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 2).toFixed(1) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  /* ---------- hero H1 word stagger ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.hero h1'), function (h1) {
    var i = 0, lastW = null;
    function wrap(node) {
      if (node.nodeType === 3) {
        var frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          // bare punctuation ("." after a gradient span) glues to the previous word so it never wraps alone
          if (lastW && !/[\p{L}\p{N}]/u.test(part)) { lastW.appendChild(document.createTextNode(part)); return; }
          var sp = document.createElement('span'); sp.className = 'w'; sp.style.setProperty('--i', i++); sp.textContent = part; frag.appendChild(sp); lastW = sp;
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1) {
        // gradient text (.grad) must stay one box: background-clip:text does not reach inline-block children
        if (node.classList.contains('grad')) { node.classList.add('w'); node.style.setProperty('--i', i++); lastW = node; return; }
        Array.prototype.slice.call(node.childNodes).forEach(wrap);
      }
    }
    Array.prototype.slice.call(h1.childNodes).forEach(wrap);
    h1.classList.add('words');
  });

  /* ---------- reveal on scroll (shared) ---------- */
  try {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.12 });
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) { io.observe(el); });
  } catch (e) { Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) { el.classList.add('in'); }); }

  /* ---------- sticky nav ---------- */
  var nav = document.getElementById('nav');
  if (nav) { var onS = function () { nav.classList.toggle('solid', scrollY > 20); }; onS(); addEventListener('scroll', onS, { passive: true }); }

  /* ---------- lead form (home): POST /auth/lead, same contract as SkillUp ---------- */
  var pf = document.getElementById('pilotForm');
  if (pf) {
    var msg = document.getElementById('pilotMsg');
    pf.addEventListener('submit', function (ev) {
      ev.preventDefault(); msg.textContent = ''; msg.className = 'msg';
      var g = function (id) { return (document.getElementById(id).value || '').trim(); };
      var company = [g('pCompany'), g('pSector'), g('pSize')].filter(Boolean).join(' · ');
      var btn = pf.querySelector('button'); btn.disabled = true;
      fetch('/auth/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: g('pName'), email: g('pEmail'), company: company }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok && d.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok) { msg.className = 'msg ok'; msg.textContent = 'Recibido. Te escribimos en breve para preparar el piloto.'; pf.reset(); }
          else { msg.className = 'msg err'; msg.textContent = (x.d && x.d.error) || 'No se pudo enviar.'; }
        })
        .catch(function () { msg.className = 'msg err'; msg.innerHTML = 'No se pudo enviar. Escríbenos a <a href="mailto:hola@brandooers.com">hola@brandooers.com</a>.'; })
        .then(function () { btn.disabled = false; });
    });
  }
})();
