/* Brandooers PWA · service worker. Navegaciones SIEMPRE por red (nunca HTML cacheado);
   otros GET: red primero con caché de respaldo offline. Limpia cachés viejas al activar. */
const CACHE = 'brandooers-v4';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  // Solo GET de nuestro propio dominio: extensiones (chrome-extension:), fuentes, YouTube, etc. no se tocan.
  if (req.method !== 'GET' || req.url.indexOf(self.location.origin + '/') !== 0) return;
  // Navegación: la hace el navegador tal cual (siempre fresca). Antes se pasaba fetch(req, {cache}) y una petición
  // de navegación no admite opciones, así que fallaba siempre y la página acababa en «error de red».
  if (req.mode === 'navigate') return;
  // Otros recursos: red primero; copia en caché solo de respuestas buenas, para un mínimo sin conexión.
  e.respondWith(
    fetch(req).then(function (r) {
      if (r.ok && r.type === 'basic') { var copy = r.clone(); caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {}); }
      return r;
    }).catch(function () { return caches.match(req).then(function (hit) { return hit || Response.error(); }); })
  );
});
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data.json(); } catch (x) { d = { title: 'Brandooers', body: (e.data && e.data.text && e.data.text()) || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Brandooers', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || 'brandooers', data: { url: d.url || '/hub.html' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/hub.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
    for (var i = 0; i < cl.length; i++) { if ('focus' in cl[i]) { cl[i].focus(); if (cl[i].navigate) cl[i].navigate(url); return; } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
