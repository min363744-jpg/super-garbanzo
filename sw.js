/**
 * Voice Translator Service Worker
 * Provides offline caching for core assets and PWA installability.
 */

const CACHE_NAME = 'voice-translator-v1';

// Core assets to pre-cache
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// 1. Install Event: Cache essential app assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. Fetch Event: Cache-First strategy for static local assets
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // For translation API requests, always use network (do not serve stale cached translations)
  if (requestUrl.hostname.includes('mymemory.translated.net')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for app shell assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Cache successful local GET responses
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.method === 'GET' &&
          requestUrl.origin === location.origin
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Offline fallback: if HTML navigation fails, return cached index.html
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
