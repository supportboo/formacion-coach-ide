/* webgl-hero.js — fondo 3D inmersivo del hero (Three.js).
   Campo de partículas con profundidad + cristales flotantes en colores de marca,
   reactivo al ratón y al scroll. Degrada con elegancia: si no hay WebGL o el usuario
   pide menos movimiento, no hace nada y el hero mantiene su imagen/degradado. */
(function () {
  var cv = document.getElementById('wgl');
  if (!cv || typeof THREE === 'undefined') return;
  var host = cv.parentElement || cv;
  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e0b14, 0.055);
  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.z = 15;

  // ---- Sprite de punto brillante (radial), generado sin assets externos ----
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'); var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,.55)');
    rg.addColorStop(0.7, 'rgba(255,255,255,.12)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    var t = new THREE.Texture(c); t.needsUpdate = true; return t;
  }

  var PAL = [0x00d4ff, 0x8b5cf6, 0xec4899, 0x67e8f9];
  var N = window.innerWidth < 700 ? 240 : 520;
  var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c3 = new THREE.Color();
  for (var i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 46;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
    c3.setHex(PAL[(Math.random() * PAL.length) | 0]);
    col[i * 3] = c3.r; col[i * 3 + 1] = c3.g; col[i * 3 + 2] = c3.b;
  }
  var pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  var points = new THREE.Points(pg, new THREE.PointsMaterial({
    size: 0.5, map: glowTexture(), vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
  }));
  scene.add(points);

  // ---- Cristales flotantes (icosaedros de alambre translúcidos) para dar 3D ----
  var crystals = [];
  var cgeo = new THREE.IcosahedronGeometry(1, 0);
  for (var k = 0; k < 5; k++) {
    var m = new THREE.Mesh(cgeo, new THREE.MeshBasicMaterial({
      color: PAL[k % PAL.length], wireframe: true, transparent: true, opacity: 0.28,
    }));
    var s = 1.4 + Math.random() * 2.6; m.scale.setScalar(s);
    m.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12 - 4);
    m.userData.sp = 0.1 + Math.random() * 0.25;
    scene.add(m); crystals.push(m);
  }

  var mx = 0, my = 0, tmx = 0, tmy = 0, scrollN = 0;
  window.addEventListener('pointermove', function (e) {
    tmx = (e.clientX / window.innerWidth - 0.5); tmy = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });
  function onScroll() {
    var h = host.getBoundingClientRect(); var vh = window.innerHeight || 1;
    scrollN = Math.min(1, Math.max(0, -h.top / (h.height || vh))); // 0 arriba → 1 al salir del hero
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  function size() {
    var w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', size); size();

  function frame(t) {
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    var e = t * 0.00005;
    points.rotation.y = e + mx * 0.5; points.rotation.x = my * 0.35;
    for (var j = 0; j < crystals.length; j++) {
      var cr = crystals[j]; cr.rotation.x += cr.userData.sp * 0.01; cr.rotation.y += cr.userData.sp * 0.014;
    }
    // scroll: la cámara se acerca y el campo se abre al salir del hero
    camera.position.z = 15 - scrollN * 7;
    camera.position.x = mx * 2.2; camera.position.y = -my * 1.6;
    camera.lookAt(0, 0, 0);
    scene.rotation.z = scrollN * 0.12;
    renderer.render(scene, camera);
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  var raf = requestAnimationFrame(frame);
  // Si se pide menos movimiento: un único fotograma estático (sin bucle).
  if (reduce) { cancelAnimationFrame(raf); renderer.render(scene, camera); }
})();
