'use client';

import { app, cloudFunctions, db } from './firebase';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useSettingsStore } from './settings-store';
import { scopedStorageKey } from './account-storage';
import { removeLocalStorageVerified, writeLocalStorageVerified } from './verified-storage';

const PUSH_TOKEN_COLLECTION = 'fcmTokens';
const PUSH_TOKEN_LOCAL_KEY = 'orbit-fcm-token';
const PUSH_SUB_LOCAL_KEY = 'orbit-push-subscription';

let fcmMessaging: import('firebase/messaging').Messaging | null = null;
let foregroundUnsubscribe: (() => void) | null = null;
let activePushOwnerId: string | null = null;
let pushContextGeneration = 0;
let foregroundGeneration = 0;

/**
 * Bind asynchronous push work to one authenticated account. Calling this is
 * also a cancellation barrier: even the same UID gets a new generation so an
 * earlier provider effect cannot attach handlers after its cleanup ran.
 */
export function setFCMRegistrationOwner(userId: string | null): number {
  activePushOwnerId = userId;
  pushContextGeneration += 1;
  cleanupForegroundMessageHandler();
  return pushContextGeneration;
}

export function isFCMRegistrationContextCurrent(userId: string, generation: number): boolean {
  return activePushOwnerId === userId && pushContextGeneration === generation;
}

function capturePushContext(userId: string): number {
  if (!userId || activePushOwnerId !== userId) {
    throw new Error('The active account changed before push setup completed.');
  }
  return pushContextGeneration;
}

function assertPushContext(userId: string, generation: number): void {
  if (!isFCMRegistrationContextCurrent(userId, generation)) {
    throw new Error('The active account changed before push setup completed.');
  }
}

function canCleanBrowserTransport(userId: string): boolean {
  return activePushOwnerId === null || activePushOwnerId === userId;
}

function tokenKey(userId: string): string {
  return scopedStorageKey(PUSH_TOKEN_LOCAL_KEY, userId);
}

function subscriptionKey(userId: string): string {
  return scopedStorageKey(PUSH_SUB_LOCAL_KEY, userId);
}

function isIOSorSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Firefox'));
}

function shouldUseNativeWebPush(): boolean {
  return isIOSorSafari();
}

async function getMessagingInstance() {
  if (fcmMessaging) return fcmMessaging;
  if (!app || typeof window === 'undefined') return null;
  try {
    const { getMessaging } = await import('firebase/messaging');
    fcmMessaging = getMessaging(app);
    return fcmMessaging;
  } catch {
    return null;
  }
}

export async function tokenFingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function scheduleFields() {
  const notifications = useSettingsStore.getState().settings.notifications;
  const morningEnabled = notifications.enabled && notifications.dailyBriefing;
  const eveningEnabled = notifications.enabled && notifications.eveningBriefing;
  return {
    morningEnabled,
    morningTime: notifications.dailyBriefingTime,
    eveningEnabled,
    eveningTime: notifications.eveningBriefingTime,
    timezoneOffset: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export async function registerFCMToken(userId: string): Promise<string | null> {
  if (!userId || userId === 'demo-user') throw new Error('Sign in to enable push notifications.');
  if (!isFCMAvailable()) throw new Error('Push notifications are unavailable on this device.');
  const generation = capturePushContext(userId);

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    assertPushContext(userId, generation);
  }

  const registration = await navigator.serviceWorker.ready;
  assertPushContext(userId, generation);
  const vapidKey = shouldUseNativeWebPush()
    ? process.env.NEXT_PUBLIC_WEBPUSH_VAPID_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    : process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error('Push notification keys are not configured.');

  return shouldUseNativeWebPush()
    ? registerNativeWebPush(userId, vapidKey, registration, generation)
    : registerFCM(userId, vapidKey, registration, generation);
}

async function registerFCM(
  userId: string,
  vapidKey: string,
  registration: ServiceWorkerRegistration,
  generation: number,
): Promise<string | null> {
  const messaging = await getMessagingInstance();
  assertPushContext(userId, generation);
  if (!messaging) return registerNativeWebPush(userId, vapidKey, registration, generation);
  const { getToken } = await import('firebase/messaging');
  assertPushContext(userId, generation);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return null;
  let fingerprint: string | null = null;
  try {
    assertPushContext(userId, generation);
    const previousDocId = await currentDeviceId(userId);
    assertPushContext(userId, generation);
    fingerprint = await tokenFingerprint(token);
    assertPushContext(userId, generation);
    await persistDevice(userId, fingerprint, { type: 'fcm', token }, previousDocId);
    assertPushContext(userId, generation);
    writeLocalStorageVerified(tokenKey(userId), token);
    removeLocalStorageVerified(subscriptionKey(userId));
  } catch (error) {
    const invalidate = async () => {
      const { deleteToken } = await import('firebase/messaging');
      await deleteToken(messaging);
    };
    if (fingerprint) await compensateRegistration(userId, fingerprint, invalidate);
    else {
      if (canCleanBrowserTransport(userId)) await Promise.resolve(invalidate()).catch(() => undefined);
      clearLocalCredentialsBestEffort(userId);
    }
    throw error;
  }
  return fingerprint;
}

async function registerNativeWebPush(
  userId: string,
  vapidKey: string,
  registration: ServiceWorkerRegistration,
  generation: number,
): Promise<string | null> {
  assertPushContext(userId, generation);
  const previousDocId = await currentDeviceId(userId);
  assertPushContext(userId, generation);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  });
  let fingerprint: string | null = null;
  try {
    const subscriptionJson = subscription.toJSON();
    const serialized = JSON.stringify(subscriptionJson);
    fingerprint = await tokenFingerprint(subscriptionJson.endpoint || serialized);
    assertPushContext(userId, generation);
    await persistDevice(
      userId,
      fingerprint,
      { type: 'webpush', subscription: subscriptionJson },
      previousDocId
    );
    assertPushContext(userId, generation);
    writeLocalStorageVerified(subscriptionKey(userId), serialized);
    removeLocalStorageVerified(tokenKey(userId));
  } catch (error) {
    if (fingerprint) {
      await compensateRegistration(userId, fingerprint, () => subscription.unsubscribe());
    } else {
      if (canCleanBrowserTransport(userId)) {
        await Promise.resolve(subscription.unsubscribe()).catch(() => undefined);
      }
      clearLocalCredentialsBestEffort(userId);
    }
    throw error;
  }
  return fingerprint;
}

function clearLocalCredentialsBestEffort(userId: string): void {
  for (const key of [tokenKey(userId), subscriptionKey(userId)]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // External registration invalidation is the privacy boundary. Browser
      // storage may be unavailable, and inaccessible values cannot be reused.
    }
  }
}

async function compensateRegistration(
  userId: string,
  fingerprint: string,
  invalidateBrowserRegistration: () => Promise<unknown>
): Promise<void> {
  const cleanups: Promise<unknown>[] = [deleteRemoteDevice(userId, `${userId}_${fingerprint}`)];
  // Push transports are browser-global. Once another account owns them, an
  // old account's compensation must not tear down the new registration.
  if (canCleanBrowserTransport(userId)) cleanups.push(invalidateBrowserRegistration());
  await Promise.allSettled(cleanups);
  clearLocalCredentialsBestEffort(userId);
}

async function persistDevice(
  userId: string,
  fingerprint: string,
  credentials: { type: 'fcm'; token: string } | { type: 'webpush'; subscription: PushSubscriptionJSON },
  replaceDeviceId: string | null
): Promise<void> {
  if (!cloudFunctions) throw new Error('Push registration is unavailable.');
  const callable = httpsCallable<
    {
      userId: string;
      fingerprint: string;
      credentials: typeof credentials;
      schedule: ReturnType<typeof scheduleFields>;
      userAgent: string;
      replaceDeviceId: string | null;
    },
    { success: boolean; docId: string }
  >(cloudFunctions, 'upsertThreadmapPushDevice');
  const result = await callable({
    userId,
    fingerprint,
    credentials,
    schedule: scheduleFields(),
    userAgent: navigator.userAgent.slice(0, 512),
    replaceDeviceId,
  });
  if (!result.data.success || result.data.docId !== `${userId}_${fingerprint}`) {
    throw new Error('Push registration could not be verified.');
  }
}

async function deleteRemoteDevice(userId: string, docId: string): Promise<void> {
  if (!cloudFunctions) throw new Error('Push device removal is unavailable.');
  const callable = httpsCallable<
    { userId: string; docId: string },
    { success: boolean }
  >(cloudFunctions, 'deleteThreadmapPushDevice');
  const result = await callable({ userId, docId });
  if (!result.data.success) throw new Error('Push device removal did not complete.');
}

async function currentDeviceId(userId: string): Promise<string | null> {
  const token = localStorage.getItem(tokenKey(userId));
  if (token) return `${userId}_${await tokenFingerprint(token)}`;
  const serialized = localStorage.getItem(subscriptionKey(userId));
  if (!serialized) return null;
  try {
    const subscription = JSON.parse(serialized) as PushSubscriptionJSON;
    return `${userId}_${await tokenFingerprint(subscription.endpoint || serialized)}`;
  } catch {
    return `${userId}_${await tokenFingerprint(serialized)}`;
  }
}

export function hasFCMToken(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      localStorage.getItem(tokenKey(userId)) ||
      localStorage.getItem(subscriptionKey(userId))
    );
  } catch {
    return false;
  }
}

export async function unregisterFCMToken(userId: string): Promise<void> {
  if (activePushOwnerId === userId) pushContextGeneration += 1;
  let cleanupError: unknown;
  let docId: string | null = null;
  try {
    docId = await currentDeviceId(userId);
  } catch (error) {
    cleanupError = error;
  }

  try {
    if (docId) await deleteRemoteDevice(userId, docId);
  } catch (error) {
    cleanupError ??= error;
  }

  // Invalidate both possible browser-side transports even when the remote
  // Firestore record could not be removed. This prevents an orphaned FCM
  // record from continuing to deliver private notifications after sign-out.
  try {
    if (canCleanBrowserTransport(userId)) {
      const messaging = await getMessagingInstance();
      if (messaging && canCleanBrowserTransport(userId)) {
        const { deleteToken } = await import('firebase/messaging');
        if (canCleanBrowserTransport(userId)) await deleteToken(messaging);
      }
    }
  } catch (error) {
    cleanupError ??= error;
  }

  try {
    if (canCleanBrowserTransport(userId)) {
      const registration = 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
      if (canCleanBrowserTransport(userId)) {
        const subscription = await registration?.pushManager.getSubscription();
        if (canCleanBrowserTransport(userId)) await subscription?.unsubscribe();
      }
    }
  } catch (error) {
    cleanupError ??= error;
  }

  // Never let one failed removal skip the rest of the local cleanup.
  clearLocalCredentialsBestEffort(userId);
  if (canCleanBrowserTransport(userId)) cleanupForegroundMessageHandler();

  if (cleanupError) throw cleanupError;
}

export async function updateFCMSchedule(userId: string): Promise<void> {
  const generation = capturePushContext(userId);
  const docId = await currentDeviceId(userId);
  assertPushContext(userId, generation);
  if (!docId) return;
  if (!cloudFunctions) throw new Error('Push scheduling is unavailable.');
  const callable = httpsCallable<
    { userId: string; docId: string; schedule: ReturnType<typeof scheduleFields> },
    { success: boolean }
  >(cloudFunctions, 'updateThreadmapPushSchedule');
  const result = await callable({ userId, docId, schedule: scheduleFields() });
  assertPushContext(userId, generation);
  if (!result.data.success) throw new Error('Push schedule update did not complete.');
}

export async function refreshPushSubscription(userId: string): Promise<void> {
  if (!isFCMAvailable() || Notification.permission !== 'granted' || !hasFCMToken(userId)) return;
  if (!useSettingsStore.getState().settings.notifications.enabled) return;
  const generation = capturePushContext(userId);
  const registration = await navigator.serviceWorker.ready;
  assertPushContext(userId, generation);
  const subscription = await registration.pushManager.getSubscription();
  assertPushContext(userId, generation);
  if (subscription || !shouldUseNativeWebPush()) {
    await updateFCMSchedule(userId);
  } else {
    await registerFCMToken(userId);
  }
}

export function setupForegroundMessageHandler(userId: string): void {
  if (foregroundUnsubscribe || shouldUseNativeWebPush()) return;
  const generation = capturePushContext(userId);
  const setupGeneration = foregroundGeneration;
  void getMessagingInstance().then(async (messaging) => {
    if (!messaging
        || foregroundUnsubscribe
        || foregroundGeneration !== setupGeneration
        || !isFCMRegistrationContextCurrent(userId, generation)) return;
    const { onMessage } = await import('firebase/messaging');
    if (foregroundUnsubscribe
        || foregroundGeneration !== setupGeneration
        || !isFCMRegistrationContextCurrent(userId, generation)) return;
    foregroundUnsubscribe = onMessage(messaging, (payload) => {
      if (foregroundGeneration !== setupGeneration
          || !isFCMRegistrationContextCurrent(userId, generation)) return;
      const title = payload.notification?.title || 'Threadmap';
      const body = payload.notification?.body || '';
      void navigator.serviceWorker?.ready.then((registration) => {
        if (foregroundGeneration !== setupGeneration
            || !isFCMRegistrationContextCurrent(userId, generation)) return;
        return registration.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: String(payload.data?.tag || 'threadmap-push'),
          data: { url: String(payload.data?.url || '/') },
        });
      });
    });
  });
}

export function cleanupForegroundMessageHandler(): void {
  foregroundGeneration += 1;
  foregroundUnsubscribe?.();
  foregroundUnsubscribe = null;
}

export interface RegisteredDevice {
  docId: string;
  type: 'fcm' | 'webpush';
  userAgent: string;
  updatedAt: number;
  isCurrentDevice: boolean;
}

export async function getRegisteredDevices(userId: string): Promise<RegisteredDevice[]> {
  if (!db) return [];
  const snapshot = await getDocs(query(
    collection(db, PUSH_TOKEN_COLLECTION),
    where('userId', '==', userId)
  ));
  const currentId = await currentDeviceId(userId);
  return snapshot.docs
    .filter((device) => device.id.startsWith(`${userId}_`) && device.data().userId === userId)
    .map((device) => {
    const data = device.data();
    return {
      docId: device.id,
      type: data.type === 'webpush' ? 'webpush' : 'fcm',
      userAgent: String(data.userAgent || ''),
      updatedAt: Number(data.updatedAt || data.createdAt || 0),
      isCurrentDevice: device.id === currentId,
    };
    });
}

export async function removeDevice(userId: string, docId: string): Promise<void> {
  if (!docId.startsWith(`${userId}_`)) throw new Error('Device does not belong to this account.');
  const currentId = await currentDeviceId(userId);
  if (docId === currentId) {
    await unregisterFCMToken(userId);
    return;
  }
  await deleteRemoteDevice(userId, docId);
}

function parseDeviceName(userAgent: string): string {
  if (!userAgent) return 'Unknown device';
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows PC';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Browser';
}

function parseBrowserName(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari';
  return '';
}

export function getDeviceLabel(userAgent: string): string {
  const device = parseDeviceName(userAgent);
  const browser = parseBrowserName(userAgent);
  return browser ? `${device} · ${browser}` : device;
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function isFCMAvailable(): boolean {
  const configuredKey = shouldUseNativeWebPush()
    ? process.env.NEXT_PUBLIC_WEBPUSH_VAPID_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    : process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  return Boolean(
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    configuredKey
  );
}
