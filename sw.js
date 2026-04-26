/* ===========================================================
   FUEL.GAUGE — Service Worker
   Caches the app shell for offline use. Increment CACHE_VER
   whenever you deploy updated files so stale caches get busted.
   =========================================================== */

const CACHE_VER = 'fuelgauge-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// ── Install: cache the app shell ──────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VER).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for shell, network-first for API ───
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Always go to network for the OpenFoodFacts API and font APIs
  if (
    url.hostname.includes('openfoodfacts.org') ||
    url.hostname.includes('quotable.io') ||
    url.hostname.includes('fonts.g') // googleapis + gstatic
  ) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Cache-first for everything else (app shell, Chart.js, icons)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VER).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
