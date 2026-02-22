/// <reference lib="webworker" />

// ORBIT — Service Worker for PWA
// Handles caching, push notifications, and scheduled briefings

// ─── Firebase Cloud Messaging (background push) ───────────
// Import Firebase compat SDK so FCM can deliver push messages
// when the app is closed or in background.
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

// Initialize Firebase in the SW (minimal config — only needs for message delivery)
firebase.initializeApp({
  apiKey: 'AIzaSyBOqJE0MVXrfBwTope_4vgCTMeAM_omY-E',
  authDomain: 'orbit-9e0b6.firebaseapp.com',
  projectId: 'orbit-9e0b6',
  storageBucket: 'orbit-9e0b6.firebasestorage.app',
  messagingSenderId: '631355120389',
  appId: '1:631355120389:web:42c163eae64bc3dfe5f56c',
});

// Get messaging instance — this hooks into the push event automatically
const fcmMessaging = firebase.messaging();

// Handle background FCM messages (when app is NOT in foreground)
fcmMessaging.onBackgroundMessage((payload) => {
  console.log('[SW] FCM background message:', payload);

  const title = payload.notification?.title || payload.data?.title || 'ORBIT';
  const body = payload.notification?.body || payload.data?.body || '';
  const tag = payload.data?.tag || 'orbit-push';

  // Don't show duplicate — FCM already shows notification from `notification` payload.
  // But if it's data-only, we need to show it ourselves.
  if (!payload.notification) {
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url: payload.data?.url || '/today' },
      renotify: true,
    });
  }
});

const CACHE_VERSION = 4; // Increment this to force cache refresh
const CACHE_NAME = `orbit-v${CACHE_VERSION}`;
const OFFLINE_URLS = ['/', '/today', '/inbox', '/tasks', '/habits'];

// ─── Briefing notification state ───────────────────────────
// Stored in IndexedDB so it persists across SW restarts
const DB_NAME = 'orbit-sw';
const DB_VERSION = 1;
const STORE_NAME = 'briefing-schedule';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getSchedule() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('config');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveSchedule(config) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(config, 'config');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch (e) {
    console.log('[SW] Failed to save schedule:', e);
  }
}

async function getLastFired() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('lastFired');
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

async function setLastFired(data) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = await new Promise((resolve) => {
      const req = store.get('lastFired');
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => resolve({});
    });
    store.put({ ...existing, ...data }, 'lastFired');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch (e) {
    console.log('[SW] Failed to save lastFired:', e);
  }
}

// ─── Scheduled check timer ─────────────────────────────────
let checkTimer = null;

function getTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function msUntilTime(targetHHMM) {
  const [h, m] = targetHHMM.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  let diff = target.getTime() - now.getTime();
  if (diff < 0) diff += 24 * 60 * 60 * 1000; // next day
  return diff;
}

async function checkAndFireBriefings() {
  const config = await getSchedule();
  if (!config) return;

  const now = getTimeStr();
  const today = getDateStr();
  const lastFired = await getLastFired();

  // Morning briefing
  if (
    config.morningEnabled &&
    config.morningTime === now &&
    lastFired.morning !== today
  ) {
    await setLastFired({ morning: today });
    await showBriefingNotification('morning', config);
    // Notify all clients to generate a proper briefing
    notifyClients({ type: 'BRIEFING_FIRE', briefing: 'morning' });
  }

  // Evening briefing
  if (
    config.eveningEnabled &&
    config.eveningTime === now &&
    lastFired.evening !== today
  ) {
    await setLastFired({ evening: today });
    await showBriefingNotification('evening', config);
    notifyClients({ type: 'BRIEFING_FIRE', briefing: 'evening' });
  }
}

async function showBriefingNotification(type, config) {
  const isMorning = type === 'morning';
  const title = isMorning ? 'Good morning.' : 'Evening check-in.';
  const body = isMorning
    ? 'Your morning briefing is ready — open ORBIT to see what\'s ahead.'
    : 'Your day is winding down — open ORBIT to review.';

  try {
    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: isMorning ? 'orbit-morning-briefing' : 'orbit-evening-briefing',
      data: { url: '/today', type: 'briefing', briefingType: type },
      renotify: true,
      requireInteraction: false,
    });
    console.log(`[SW] ${type} briefing notification shown`);
  } catch (e) {
    console.error(`[SW] Failed to show ${type} notification:`, e);
  }
}

function scheduleNextCheck() {
  if (checkTimer) clearTimeout(checkTimer);
  // Check every 30 seconds
  checkTimer = setTimeout(async () => {
    await checkAndFireBriefings();
    scheduleNextCheck();
  }, 30_000);
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// ─── Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch(() => {
        console.log('[SW] Some routes could not be cached');
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
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
      self.clients.claim()
    ]).then(() => {
      // Start the briefing check loop
      scheduleNextCheck();
      console.log('[SW] Activated + briefing scheduler started');
    })
  );
});

// ─── Messages from main app ───────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'UPDATE_BRIEFING_SCHEDULE') {
    // App sends us the schedule config
    saveSchedule(event.data.config).then(() => {
      console.log('[SW] Briefing schedule updated:', event.data.config);
      // Restart check loop
      scheduleNextCheck();
    });
  }

  if (event.data.type === 'SHOW_BRIEFING_NOW') {
    // App sends a pre-built notification to show via SW
    const { title, body, tag } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url: '/today' },
      renotify: true,
    }).catch((e) => console.error('[SW] showNotification failed:', e));
  }
});

// ─── Push events (FCM / web push) ──────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ORBIT';
  const options = {
    body: data.body || 'You have a notification.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'orbit-push',
    data: { url: data.url || '/' },
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification click ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if any
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});

// ─── Periodic Background Sync (Chrome 80+) ────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'orbit-briefing-check') {
    event.waitUntil(checkAndFireBriefings());
  }
});

// ─── Fetch — network-first with cache fallback ────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.url.includes('/api/') || event.request.url.includes('firestore')) return;
  
  if (event.request.url.match(/\.(js|jsx|ts|tsx)$/) || event.request.url.includes('/_next/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});
