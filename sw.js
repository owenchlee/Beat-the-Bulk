/* ============================================================
   BEAT THE BULK — Service worker
   Network-first (cache fallback) for the app shell (same-origin HTML/CSS/JS/manifest/
   icons) so the app installs and reloads offline. MediaPipe's CDN
   scripts are explicitly network-only/pass-through — caching a
   stale pose-detection build could silently break rep tracking
   after an upstream update, so we never freeze those into offline.
   Bump CACHE_NAME on any app-shell file change to invalidate.
   ============================================================ */
const CACHE_NAME = 'btb-cache-v1';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon.svg',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/animations.css',
  'js/icons.js',
  'js/character.js',
  'js/audio.js',
  'js/voice.js',
  'js/pose-tracker.js',
  'js/workouts.js',
  'js/foods.js',
  'js/tracker.js',
  'js/achievements.js',
  'js/share-card.js',
  'js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // One file at a time so a single 404 doesn't abort the whole install.
      .then(cache => Promise.all(APP_SHELL.map(a => cache.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache cross-origin requests (MediaPipe CDN, Google Fonts) — let
  // the browser's own HTTP cache handle those, so they stay fresh.
  if (url.origin !== self.location.origin) return;

  if (event.request.method !== 'GET') return;

  // Network-first so redeploys reach users; cache fallback keeps it offline-capable.
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(c => c || Response.error()))
  );
});
