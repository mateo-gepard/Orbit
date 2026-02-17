/// <reference lib="webworker" />

// ORBIT — Minimal Service Worker for PWA
// Enables "Add to Home Screen" and basic offline caching

const CACHE_NAME = 'orbit-v2-' + Date.now(); // Force cache refresh
const OFFLINE_URLS = ['/', '/today', '/inbox', '/tasks', '/habits'];

// Install — pre-cache essential routes
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch(() => {
        // Non-critical: some routes may not cache in dev
        console.log('[SW] Some routes could not be cached');
      });
    })
  );
  self.skipWaiting(); // Force immediate activation
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and external resources
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  // Skip API calls and Firebase
  if (event.request.url.includes('/api/') || event.request.url.includes('firestore')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});
