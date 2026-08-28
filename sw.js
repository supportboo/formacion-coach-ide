/* Brandooers PWA · service worker (network-first con caché de respaldo para uso offline básico) */
const CACHE = 'brandooers-v1';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (r) {
      try { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {}); } catch (x) {}
      return r;
    }).catch(function () { return caches.match(e.request); })
  );
});
