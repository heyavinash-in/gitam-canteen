// GITAM Canteen PWA - Service Worker
const CACHE_NAME = 'gitam-canteen-v11';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css?v=11',
  './app.js?v=11',
  './manifest.json',
  './canteen_logo.jpg',
  './veg_thali.jpg',
  './nonveg_thali.jpg'
];

// 1. Install event: Cache all vital files
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install Event');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching vital static files');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate event: Clean up old cache schemas
self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activate Event');
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing expired cache store:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch event: Cache-First strategy falling back to network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Fallback to fetch from live internet
      return fetch(e.request).then((networkResponse) => {
        // Only cache valid standard GET requests
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || e.request.method !== 'GET') {
          return networkResponse;
        }

        // Cache the newly fetched file dynamically
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // If both cache and network fail (offline), serve index.html if request is navigation
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
