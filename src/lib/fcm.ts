'use client';

// ═══════════════════════════════════════════════════════════
// ORBIT — Firebase Cloud Messaging (FCM)
// Handles push notification token registration, storage,
// and lifecycle management for background briefing delivery.
// ═══════════════════════════════════════════════════════════

import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { app, db } from './firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useSettingsStore } from './settings-store';

const FCM_TOKEN_COLLECTION = 'fcmTokens';
const FCM_TOKEN_LOCAL_KEY = 'orbit-fcm-token';

let messaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (messaging) return messaging;
  if (!app || typeof window === 'undefined') return null;
  try {
    messaging = getMessaging(app);
    return messaging;
  } catch (err) {
    console.warn('[ORBIT] FCM: getMessaging failed:', err);
    return null;
  }
}

// ── Token Management ──────────────────────────────────────

/**
 * Request permission and get FCM token.
 * Stores token in Firestore so the Cloud Function can send pushes.
 */
export async function registerFCMToken(userId: string): Promise<string | null> {
  const msg = getMessagingInstance();
  if (!msg) {
    console.warn('[ORBIT] FCM: messaging not available');
    return null;
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn('[ORBIT] FCM: NEXT_PUBLIC_FIREBASE_VAPID_KEY not set');
    return null;
  }

  try {
    // Ensure we have a service worker registration
    const swRegistration = await navigator.serviceWorker.ready;

    const token = await getToken(msg, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn('[ORBIT] FCM: no token returned');
      return null;
    }

    // Save to localStorage for quick reference
    localStorage.setItem(FCM_TOKEN_LOCAL_KEY, token);

    // Save to Firestore so the Cloud Function can look it up
    await saveFCMTokenToFirestore(userId, token);

    console.log('[ORBIT] FCM token registered');
    return token;
  } catch (err) {
    console.error('[ORBIT] FCM: registration failed:', err);
    return null;
  }
}

/**
 * Unregister FCM token (on sign-out).
 */
export async function unregisterFCMToken(userId: string): Promise<void> {
  const token = localStorage.getItem(FCM_TOKEN_LOCAL_KEY);
  if (!token || !db) return;

  try {
    const docRef = doc(db, FCM_TOKEN_COLLECTION, `${userId}_${tokenHash(token)}`);
    await deleteDoc(docRef);
    localStorage.removeItem(FCM_TOKEN_LOCAL_KEY);
    console.log('[ORBIT] FCM token unregistered');
  } catch (err) {
    console.error('[ORBIT] FCM: unregister failed:', err);
  }
}

/**
 * Save FCM token + user's briefing schedule to Firestore.
 * The Cloud Function reads this to know when/what to send.
 */
async function saveFCMTokenToFirestore(userId: string, token: string): Promise<void> {
  if (!db) return;

  const { settings } = useSettingsStore.getState();
  const docRef = doc(db, FCM_TOKEN_COLLECTION, `${userId}_${tokenHash(token)}`);

  await setDoc(docRef, {
    userId,
    token,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Briefing schedule — Cloud Function reads these
    morningEnabled: settings.notifications.enabled && settings.notifications.dailyBriefing,
    morningTime: settings.notifications.dailyBriefingTime,
    eveningEnabled: settings.notifications.enabled && settings.notifications.eveningBriefing,
    eveningTime: settings.notifications.eveningBriefingTime,
    // Timezone offset so the Cloud Function fires at the right local time
    timezoneOffset: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // User agent for debugging
    userAgent: navigator.userAgent,
  }, { merge: true });
}

/**
 * Update the briefing schedule in the FCM token doc.
 * Called whenever the user changes notification settings.
 */
export async function updateFCMSchedule(userId: string): Promise<void> {
  if (!db) return;

  const token = localStorage.getItem(FCM_TOKEN_LOCAL_KEY);
  if (!token) return;

  const { settings } = useSettingsStore.getState();
  const docRef = doc(db, FCM_TOKEN_COLLECTION, `${userId}_${tokenHash(token)}`);

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
    console.log('[ORBIT] FCM schedule updated in Firestore');
  } catch (err) {
    console.error('[ORBIT] FCM: schedule update failed:', err);
  }
}

// ── Foreground message handler ────────────────────────────

/**
 * Listen for FCM messages when the app is in the foreground.
 * Shows them as in-page notifications.
 */
export function setupForegroundMessageHandler(): void {
  const msg = getMessagingInstance();
  if (!msg) return;

  onMessage(msg, (payload) => {
    console.log('[ORBIT] FCM foreground message:', payload);

    const title = payload.notification?.title || 'ORBIT';
    const body = payload.notification?.body || '';

    // Show via service worker for consistency
    navigator.serviceWorker?.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.data?.tag || 'orbit-push',
        data: { url: payload.data?.url || '/today' },
      });
    }).catch(() => {
      // Fallback to in-page notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icons/icon-192.png' });
      }
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

/** Check if FCM is available and configured */
export function isFCMAvailable(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY &&
    app
  );
}

/** Check if user has an FCM token registered */
export function hasFCMToken(): boolean {
  return !!localStorage.getItem(FCM_TOKEN_LOCAL_KEY);
}
