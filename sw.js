/* ============================================================
   BEAT THE BULK — Service worker
   Cache-first for the app shell (same-origin HTML/CSS/JS/manifest/
   icons) so the app installs and reloads offline. MediaPipe's CDN
   scripts are explicitly network-only/pass-through — caching a
   stale pose-detection build could silently break rep tracking
   after an upstream update, so we never freeze those into offline.
   Bump CACHE_NAME on any app-shell file change to invalidate.
   ============================================================ */
const CACHE_NAME = 'btb-cache-v9';

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
  'js/app.js',
  'img/characters/male-1.png',
  'img/characters/male-2.png',
  'img/characters/male-3.png',
  'img/characters/male-4.png',
  'img/characters/male-5.png',
  'img/characters/male-6.png',
  'img/characters/female-1.png',
  'img/characters/female-2.png',
  'img/characters/female-3.png',
  'img/characters/female-4.png',
  'img/characters/female-5.png',
  'img/characters/female-6.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
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

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
