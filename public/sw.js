const fallbackCache = 'sweet-rascal-offline-v1';
const offlinePage = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(fallbackCache).then(cache => cache.add(offlinePage)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sweet-rascal-offline-') && key !== fallbackCache).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // Only handle same-origin top-level navigation. Never cache app pages or operational data.
  if (request.mode !== 'navigate' || request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(offlinePage, { cacheName: fallbackCache })) ?? Response.error()));
});
