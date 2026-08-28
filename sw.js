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
