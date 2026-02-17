/// <reference lib="webworker" />

// ORBIT — Minimal Service Worker for PWA
// Enables "Add to Home Screen" and basic offline caching

const CACHE_VERSION = 3; // Increment this to force cache refresh
const CACHE_NAME = `orbit-v${CACHE_VERSION}`;
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
  // Force immediate activation, don't wait for old SW to close
  self.skipWaiting();
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate — clean old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete ALL old caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      ),
      // Take control of all clients immediately
      self.clients.claim()
    ])
  );
});

// Fetch — network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and external resources
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  // Skip API calls and Firebase
  if (event.request.url.includes('/api/') || event.request.url.includes('firestore')) return;
  
  // NEVER cache JavaScript files - always fetch fresh to prevent stale code
  if (event.request.url.match(/\.(js|jsx|ts|tsx)$/) || event.request.url.includes('/_next/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses (but not JS - handled above)
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
