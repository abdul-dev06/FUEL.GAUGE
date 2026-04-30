/* ===========================================================
   FUEL.GAUGE — Service Worker (v3)
   Network-first for app shell so updates are picked up.
   Cache only used as offline fallback.
   ALWAYS bump CACHE_VER when deploying new code.
   =========================================================== */

const CACHE_VER = 'fuelgauge-v10';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './coach.js',
  './exercises-data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Install: pre-cache the shell, take over immediately ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VER)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: nuke ALL old caches, claim every client ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ──
// • App shell (HTML/CSS/JS/icons under our origin) → network-first, cache fallback
// • External APIs (Quotable, Groq, JSONBin) → network-only (no caching)
// • Everything else (CDN scripts, fonts) → cache-first
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;

  // Network-only for live APIs
  if (url.hostname.includes('quotable.io') || url.hostname.includes('groq.com') || url.hostname.includes('jsonbin.io')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Network-first for our own shell (so updates land quickly)
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VER).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || new Response('', { status: 503 })))
    );
    return;
  }

  // Cache-first for CDN assets (fonts, Chart.js)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VER).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
