/* Eclesia One — Service Worker (PWA)
   - App shell em cache: network-first com fallback offline.
   - /api/* NUNCA em cache (dados sensíveis, sempre atuais).
   Publicado na raiz do site, o que dá escopo total (requisito para instalar). */
const CACHE = 'eclesia-one-v5';
const SHELL = ['/', '/index.html', '/config.js', '/css/app.css', '/js/app.js', '/js/ui.js', '/js/charts.js',
  '/js/modules.js', '/js/static-demo.js', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png',
  '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;          // dados sempre da rede
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
  );
});
