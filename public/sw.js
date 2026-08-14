/// <reference lib="webworker" />

// Threadmap service worker: offline shell, push notifications, and briefing checks.
// Push credentials stay in the app runtime; this worker handles standards-based
// Web Push payloads and the Firebase Messaging payload shape without a CDN SDK.

const CACHE_VERSION = 13;
const CACHE_PREFIX = 'threadmap-';
const STATIC_CACHE = `${CACHE_PREFIX}static-v${CACHE_VERSION}`;
const NAVIGATION_CACHE = `${CACHE_PREFIX}navigation-v${CACHE_VERSION}`;
const APP_SHELL_URL = '/';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
const DB_NAME = 'threadmap-sw';
const DB_VERSION = 1;
const STORE_NAME = 'briefing-schedule';
const MAX_STATIC_ENTRIES = 100;
const MAX_NAVIGATION_ENTRIES = 24;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readState(key, fallback = null) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? fallback);
      request.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

async function writeState(key, value) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteState(key) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function clearBriefingSchedule(ownerId) {
  const config = await readState('config');
  if (config?.ownerId === ownerId) await deleteState('config');
  if (typeof ownerId === 'string' && ownerId) await deleteState(`last-fired:${ownerId}`);
}

function scheduleOwnerKey(config) {
  return typeof config?.ownerId === 'string' && config.ownerId
    ? `last-fired:${config.ownerId}`
    : null;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isBriefingDueToday(type, time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return false;
  const [hour, minute] = time.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  const difference = now.getTime() - target.getTime();
  // Periodic Background Sync wake-ups are intentionally browser-controlled.
  // A useful once-per-day grace period prevents routine misses without firing
  // yesterday's schedule after the local date rolls over.
  const graceMinutes = type === 'morning' ? 4 * 60 : 6 * 60;
  return difference >= 0 && difference <= graceMinutes * 60_000;
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage(message);
  return clients.length;
}

function notificationLanguage(preferredLanguage) {
  const language = typeof preferredLanguage === 'string' && preferredLanguage
    ? preferredLanguage
    : self.navigator?.language;
  return language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function notificationCopy(type, preferredLanguage) {
  const german = notificationLanguage(preferredLanguage) === 'de';
  const morning = type === 'morning';
  return {
    title: morning
      ? (german ? 'Guten Morgen.' : 'Good morning.')
      : (german ? 'Abendlicher Check-in.' : 'Evening check-in.'),
    body: morning
      ? (german ? 'Dein Morgenbriefing ist bereit.' : 'Your morning briefing is ready.')
      : (german ? 'Zeit, deinen Tag zu reflektieren.' : 'Time to review your day.'),
    fallbackBody: german ? 'Du hast eine neue Benachrichtigung.' : 'You have a notification.',
  };
}

async function showBriefingNotification(type, preferredLanguage) {
  const morning = type === 'morning';
  const copy = notificationCopy(type, preferredLanguage);
  await self.registration.showNotification(copy.title, {
    body: copy.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: morning ? 'threadmap-morning-briefing' : 'threadmap-evening-briefing',
    data: { url: `/briefing?type=${type}` },
    renotify: false,
  });
}

async function checkAndFireBriefings() {
  const config = await readState('config');
  const ownerKey = scheduleOwnerKey(config);
  if (!config || !ownerKey) return;

  const lastFired = await readState(ownerKey, {});
  const today = todayKey();
  const checks = [
    ['morning', config.morningEnabled, config.morningTime],
    ['evening', config.eveningEnabled, config.eveningTime],
  ];

  for (const [type, enabled, time] of checks) {
    if (!enabled || lastFired[type] === today || !isBriefingDueToday(type, time)) continue;
    lastFired[type] = today;
    await writeState(ownerKey, lastFired);
    const openClients = await notifyClients({ type: 'BRIEFING_FIRE', briefing: type });
    if (!openClients) await showBriefingNotification(type, config.language);
  }
}

function internalPath(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin);
    if (url.origin !== self.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

async function trimCache(cacheName, maximumEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maximumEntries)).map((key) => cache.delete(key)));
}

async function cacheResponse(cacheName, request, response, maximumEntries) {
  if (!response.ok || response.type !== 'basic') return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  await trimCache(cacheName, maximumEntries);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await cacheResponse(STATIC_CACHE, request, response, MAX_STATIC_ENTRIES);
  return response;
}

function navigationCacheKey(value) {
  const requestUrl = typeof value === 'string' ? value : value.url;
  const url = new URL(requestUrl, self.location.origin);
  return `${url.origin}${url.pathname}`;
}

function extractAppShellAssets(html) {
  const assets = new Set();
  const attributePattern = /(?:src|href)=["']([^"'#]+)["']/g;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin !== self.location.origin) continue;
      if (!url.pathname.startsWith('/_next/static/') && !url.pathname.startsWith('/icons/')) continue;
      assets.add(`${url.pathname}${url.search}`);
    } catch {
      // Ignore malformed and non-URL attributes in the shell document.
    }
  }

  return [...assets];
}

async function precacheAppShell() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(PRECACHE_URLS);

  const shellRequest = new Request(new URL(APP_SHELL_URL, self.location.origin), { cache: 'reload' });
  const shellResponse = await fetch(shellRequest);
  if (!shellResponse.ok || shellResponse.type !== 'basic') {
    throw new Error('The app shell could not be precached.');
  }

  await cache.put(navigationCacheKey(shellRequest), shellResponse.clone());
  const assets = extractAppShellAssets(await shellResponse.text());
  await Promise.allSettled(assets.map((asset) => cache.add(asset)));
  await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
}

async function navigationWithOfflineFallback(request) {
  const cacheKey = navigationCacheKey(request);
  try {
    const response = await fetch(request);
    const url = new URL(request.url);
    if (!url.search) {
      await cacheResponse(NAVIGATION_CACHE, cacheKey, response, MAX_NAVIGATION_ENTRIES);
    }
    return response;
  } catch {
    return (await caches.match(cacheKey))
      || (await caches.match(navigationCacheKey(APP_SHELL_URL)))
      || (await caches.match(OFFLINE_URL));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) =>
          (key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== NAVIGATION_CACHE) || /^orbit-v\d+$/.test(key)
        )
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
    await checkAndFireBriefings();
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'UPDATE_BRIEFING_SCHEDULE') {
    event.waitUntil(writeState('config', event.data.config).then(checkAndFireBriefings));
    return;
  }

  if (event.data.type === 'CLEAR_BRIEFING_SCHEDULE') {
    event.waitUntil(clearBriefingSchedule(event.data.ownerId));
    return;
  }

  if (event.data.type === 'SHOW_BRIEFING_NOW') {
    const { title = 'Threadmap', body = '', tag = 'threadmap-briefing' } = event.data;
    event.waitUntil(self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url: internalPath(event.data.url) },
      renotify: false,
    }));
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        payload = { body: event.data.text() };
      }
    }

    const notification = payload.notification || {};
    const data = payload.data || payload;
    const config = await readState('config');
    const copy = notificationCopy(
      data.briefingType || (String(data.tag || notification.tag).includes('evening') ? 'evening' : 'morning'),
      data.language || data.lang || notification.lang || config?.language,
    );
    const title = notification.title || data.title || 'Threadmap';
    const tag = data.tag || notification.tag || 'threadmap-push';
    const ownerKey = scheduleOwnerKey(config);

    if (ownerKey && (tag === 'threadmap-morning-briefing' || tag === 'threadmap-evening-briefing')) {
      const lastFired = await readState(ownerKey, {});
      lastFired[tag.includes('morning') ? 'morning' : 'evening'] = todayKey();
      await writeState(ownerKey, lastFired);
    }

    await self.registration.showNotification(title, {
      body: notification.body || data.body || copy.fallbackBody,
      icon: notification.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url: internalPath(data.url || payload.fcmOptions?.link) },
      renotify: false,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = internalPath(event.notification.data?.url);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin !== self.location.origin || !('focus' in client)) continue;
      await client.focus();
      client.postMessage({ type: 'NAVIGATE', url: path });
      return;
    }
    await self.clients.openWindow(path);
  })());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'threadmap-briefing-check' || event.tag === 'orbit-briefing-check') {
    event.waitUntil(checkAndFireBriefings());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationWithOfflineFallback(request));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpe?g|gif|svg|webp|avif|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});
