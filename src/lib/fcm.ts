'use client';

// ═══════════════════════════════════════════════════════════
// ORBIT — Push Notification Registration (FCM + Web Push)
//
// Two strategies:
//  1. FCM (Firebase Cloud Messaging) — works on Chrome, Edge, Firefox
//  2. Native Web Push API — works on iOS 16.4+ PWAs and Safari
//
// The Cloud Function reads Firestore docs from `pushTokens` and
// dispatches via FCM (for `token` docs) or web-push (for
// `subscription` docs).
// ═══════════════════════════════════════════════════════════

import { app, db } from './firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useSettingsStore } from './settings-store';

const PUSH_TOKEN_COLLECTION = 'fcmTokens';
const PUSH_TOKEN_LOCAL_KEY = 'orbit-fcm-token';
const PUSH_SUB_LOCAL_KEY = 'orbit-push-subscription';

// ── Platform detection ────────────────────────────────────

function isIOSorSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iOS (iPhone/iPad/iPod) or macOS Safari (not Chrome/Firefox on Mac)
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Firefox'));
}

function useNativeWebPush(): boolean {
  // On iOS/Safari, Firebase messaging doesn't work — use native Web Push
  return isIOSorSafari();
}

// ── FCM (non-Safari) ─────────────────────────────────────

let fcmMessaging: import('firebase/messaging').Messaging | null = null;

async function getMessagingInstance() {
  if (fcmMessaging) return fcmMessaging;
  if (!app || typeof window === 'undefined') return null;
  try {
    const { getMessaging } = await import('firebase/messaging');
    fcmMessaging = getMessaging(app);
    return fcmMessaging;
  } catch (err) {
    console.warn('[ORBIT] FCM: getMessaging failed:', err);
    return null;
  }
}

// ── Token/Subscription Registration ──────────────────────

/**
 * Register for push notifications.
 * Uses native Web Push on iOS/Safari, FCM elsewhere.
 * Returns a truthy string identifier on success.
 */
export async function registerFCMToken(userId: string): Promise<string | null> {
  try {
    // Ensure notification permission
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        console.warn('[ORBIT] Push: permission denied');
        return null;
      }
    }

    const swRegistration = await navigator.serviceWorker.ready;

    if (useNativeWebPush()) {
      // Native Web Push uses the web push VAPID key (for iOS/Safari)
      const vapidKey = process.env.NEXT_PUBLIC_WEBPUSH_VAPID_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.warn('[ORBIT] Push: no VAPID key configured');
        return null;
      }
      return await registerNativeWebPush(userId, vapidKey, swRegistration);
    } else {
      // FCM uses the Firebase VAPID key
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.warn('[ORBIT] Push: Firebase VAPID key not set');
        return null;
      }
      return await registerFCM(userId, vapidKey, swRegistration);
    }
  } catch (err) {
    console.error('[ORBIT] Push: registration failed:', err);
    return null;
  }
}

/** FCM registration (Chrome, Edge, Firefox on desktop/Android) */
async function registerFCM(
  userId: string,
  vapidKey: string,
  swRegistration: ServiceWorkerRegistration
): Promise<string | null> {
  const msg = await getMessagingInstance();
  if (!msg) {
    console.warn('[ORBIT] FCM: messaging not available, falling back to native Web Push');
    return registerNativeWebPush(userId, vapidKey, swRegistration);
  }

  try {
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(msg, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn('[ORBIT] FCM: no token returned');
      return null;
    }

    localStorage.setItem(PUSH_TOKEN_LOCAL_KEY, token);
    localStorage.removeItem(PUSH_SUB_LOCAL_KEY);

    await saveTokenToFirestore(userId, token);
    console.log('[ORBIT] FCM token registered');
    return token;
  } catch (err) {
    console.error('[ORBIT] FCM: getToken failed, falling back to native Web Push:', err);
    return registerNativeWebPush(userId, vapidKey, swRegistration);
  }
}

/** Native Web Push registration (iOS 16.4+ PWA, Safari) */
async function registerNativeWebPush(
  userId: string,
  vapidKey: string,
  swRegistration: ServiceWorkerRegistration
): Promise<string | null> {
  try {
    // Convert VAPID key from base64url to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    const subJson = JSON.stringify(subscription.toJSON());
    localStorage.setItem(PUSH_SUB_LOCAL_KEY, subJson);
    localStorage.removeItem(PUSH_TOKEN_LOCAL_KEY);

    await saveSubscriptionToFirestore(userId, subscription);
    console.log('[ORBIT] Native Web Push subscription registered');
    return subJson;
  } catch (err) {
    console.error('[ORBIT] Native Web Push: subscribe failed:', err);
    return null;
  }
}

/**
 * Unregister push token (on sign-out).
 */
export async function unregisterFCMToken(userId: string): Promise<void> {
  if (!db) return;

  try {
    // Try FCM token first
    const token = localStorage.getItem(PUSH_TOKEN_LOCAL_KEY);
    if (token) {
      const docRef = doc(db, PUSH_TOKEN_COLLECTION, `${userId}_${tokenHash(token)}`);
      await deleteDoc(docRef);
      localStorage.removeItem(PUSH_TOKEN_LOCAL_KEY);
      console.log('[ORBIT] FCM token unregistered');
      return;
    }

    // Try Web Push subscription
    const subJson = localStorage.getItem(PUSH_SUB_LOCAL_KEY);
    if (subJson) {
      const sub = JSON.parse(subJson);
      const subId = tokenHash(sub.endpoint || subJson);
      const docRef = doc(db, PUSH_TOKEN_COLLECTION, `${userId}_${subId}`);
      await deleteDoc(docRef);
      localStorage.removeItem(PUSH_SUB_LOCAL_KEY);

      // Also unsubscribe from PushManager
      const swReg = await navigator.serviceWorker?.ready;
      const existingSub = await swReg?.pushManager?.getSubscription();
      if (existingSub) await existingSub.unsubscribe();

      console.log('[ORBIT] Web Push subscription unregistered');
    }
  } catch (err) {
    console.error('[ORBIT] Push: unregister failed:', err);
  }
}

// ── Firestore persistence ─────────────────────────────────

/** Save an FCM token to Firestore */
async function saveTokenToFirestore(userId: string, token: string): Promise<void> {
  if (!db) return;

  const { settings } = useSettingsStore.getState();
  const docRef = doc(db, PUSH_TOKEN_COLLECTION, `${userId}_${tokenHash(token)}`);

  await setDoc(docRef, {
    userId,
    type: 'fcm',
    token,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    morningEnabled: settings.notifications.enabled && settings.notifications.dailyBriefing,
    morningTime: settings.notifications.dailyBriefingTime,
    eveningEnabled: settings.notifications.enabled && settings.notifications.eveningBriefing,
    eveningTime: settings.notifications.eveningBriefingTime,
    timezoneOffset: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  }, { merge: true });
}

/** Save a Web Push subscription to Firestore */
async function saveSubscriptionToFirestore(
  userId: string,
  subscription: PushSubscription
): Promise<void> {
  if (!db) return;

  const { settings } = useSettingsStore.getState();
  const subJson = subscription.toJSON();
  const subId = tokenHash(subJson.endpoint || JSON.stringify(subJson));
  const docRef = doc(db, PUSH_TOKEN_COLLECTION, `${userId}_${subId}`);

  await setDoc(docRef, {
    userId,
    type: 'webpush',
    subscription: subJson,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    morningEnabled: settings.notifications.enabled && settings.notifications.dailyBriefing,
    morningTime: settings.notifications.dailyBriefingTime,
    eveningEnabled: settings.notifications.enabled && settings.notifications.eveningBriefing,
    eveningTime: settings.notifications.eveningBriefingTime,
    timezoneOffset: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  }, { merge: true });
}

/**
 * Update the briefing schedule in the push token doc.
 * Called whenever the user changes notification settings.
 */
export async function updateFCMSchedule(userId: string): Promise<void> {
  if (!db) return;

  // Find the right doc ID
  const token = localStorage.getItem(PUSH_TOKEN_LOCAL_KEY);
  const subJson = localStorage.getItem(PUSH_SUB_LOCAL_KEY);
  if (!token && !subJson) return;

  let docId: string;
  if (token) {
    docId = `${userId}_${tokenHash(token)}`;
  } else {
    const sub = JSON.parse(subJson!);
    docId = `${userId}_${tokenHash(sub.endpoint || subJson!)}`;
  }

  const { settings } = useSettingsStore.getState();
  const docRef = doc(db, PUSH_TOKEN_COLLECTION, docId);

  try {
    await setDoc(docRef, {
      updatedAt: Date.now(),
      morningEnabled: settings.notifications.enabled && settings.notifications.dailyBriefing,
      morningTime: settings.notifications.dailyBriefingTime,
      eveningEnabled: settings.notifications.enabled && settings.notifications.eveningBriefing,
      eveningTime: settings.notifications.eveningBriefingTime,
      timezoneOffset: new Date().getTimezoneOffset(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }, { merge: true });
    console.log('[ORBIT] Push schedule updated in Firestore');
  } catch (err) {
    console.error('[ORBIT] Push: schedule update failed:', err);
  }
}

// ── Foreground message handler ────────────────────────────

/**
 * Listen for FCM messages when the app is in the foreground.
 * Only works with FCM (non-Safari). Web Push messages always
 * go through the SW push event handler.
 */
export function setupForegroundMessageHandler(): void {
  if (useNativeWebPush()) {
    // On iOS/Safari, foreground messages come through SW push event
    // which already calls showNotification. Nothing extra needed.
    console.log('[ORBIT] Push: foreground handler skipped (native Web Push — handled by SW)');
    return;
  }

  getMessagingInstance().then((msg) => {
    if (!msg) return;
    import('firebase/messaging').then(({ onMessage }) => {
      onMessage(msg, (payload) => {
        console.log('[ORBIT] FCM foreground message:', payload);

        const title = payload.notification?.title || 'ORBIT';
        const body = payload.notification?.body || '';

        navigator.serviceWorker?.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: (payload.data?.tag as string) || 'orbit-push',
            data: { url: (payload.data?.url as string) || '/today' },
          });
        }).catch(() => {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/icons/icon-192.png' });
          }
        });
      });
    });
  });
}

// ── Helpers ────────────────────────────────────────────────

/** Simple hash to make doc IDs shorter */
function tokenHash(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** Convert a base64url VAPID key to Uint8Array for pushManager.subscribe() */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Check if push notifications are available (FCM or native Web Push) */
export function isFCMAvailable(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  );
}

/** Check if user has a push token/subscription registered */
export function hasFCMToken(): boolean {
  return !!(
    localStorage.getItem(PUSH_TOKEN_LOCAL_KEY) ||
    localStorage.getItem(PUSH_SUB_LOCAL_KEY)
  );
}
