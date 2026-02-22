import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as webpush from 'web-push';

// ═══════════════════════════════════════════════════════════
// ORBIT — Briefing Push Notification Cloud Function
//
// Runs every minute via Cloud Scheduler.
// Queries fcmTokens collection for users whose briefing time
// matches the current minute (in their timezone), then sends
// a push notification.
//
// Supports two delivery methods:
//  1. FCM (type: 'fcm') — Chrome, Edge, Firefox on desktop/Android
//  2. Native Web Push (type: 'webpush') — iOS 16.4+ PWA, Safari
// ═══════════════════════════════════════════════════════════

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// VAPID keys for native Web Push (iOS/Safari)
const vapidPublicKey = defineSecret('VAPID_PUBLIC_KEY');
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');

const VAPID_SUBJECT = 'mailto:orbit@orbit-app.com';

/**
 * Get current HH:mm in a given IANA timezone.
 */
function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    return formatter.format(new Date());
  } catch {
    // Fallback: use offset-based calculation
    return '';
  }
}

/**
 * Get today's date string in a given IANA timezone.
 */
function getTodayInTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });
    return formatter.format(new Date()); // YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

interface PushTokenDoc {
  userId: string;
  type?: 'fcm' | 'webpush';
  // FCM token (type: 'fcm')
  token?: string;
  // Web Push subscription (type: 'webpush')
  subscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
    expirationTime?: number | null;
  };
  morningEnabled?: boolean;
  morningTime?: string;  // HH:mm
  eveningEnabled?: boolean;
  eveningTime?: string;   // HH:mm
  timezone?: string;
  timezoneOffset?: number;
  lastMorningSent?: string; // YYYY-MM-DD
  lastEveningSent?: string; // YYYY-MM-DD
}

// ── Scheduled Function: runs every minute ─────────────────

export const sendBriefingNotifications = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    retryCount: 0,
    memory: '256MiB',
    region: 'us-central1',
    secrets: [vapidPublicKey, vapidPrivateKey],
  },
  async () => {
    // Configure web-push with VAPID keys (injected as env vars by secrets config)
    let webPushReady = false;
    try {
      const pubKey = (vapidPublicKey.value() || process.env.VAPID_PUBLIC_KEY || '').trim();
      const privKey = (vapidPrivateKey.value() || process.env.VAPID_PRIVATE_KEY || '').trim();
      console.log(`[ORBIT] VAPID keys: pub=${pubKey ? 'set (' + pubKey.length + ' chars)' : 'MISSING'}, priv=${privKey ? 'set (' + privKey.length + ' chars)' : 'MISSING'}`);
      if (pubKey && privKey) {
        webpush.setVapidDetails(VAPID_SUBJECT, pubKey, privKey);
        webPushReady = true;
        console.log('[ORBIT] web-push configured with VAPID keys');
      }
    } catch (e) {
      console.warn('[ORBIT] VAPID secrets not available — native Web Push disabled:', e);
    }

    try {
      const snapshot = await db.collection('fcmTokens').get();

      if (snapshot.empty) {
        return;
      }

      const batch = db.batch();
      const promises: Promise<void>[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as PushTokenDoc;
        const tz = data.timezone || 'UTC';
        const currentTime = getCurrentTimeInTimezone(tz);
        const today = getTodayInTimezone(tz);

        if (!currentTime) continue;

        // Check morning briefing
        if (
          data.morningEnabled &&
          data.morningTime === currentTime &&
          data.lastMorningSent !== today
        ) {
          promises.push(
            sendPush(data, 'morning', docSnap.ref, batch, today, webPushReady)
          );
        }

        // Check evening briefing
        if (
          data.eveningEnabled &&
          data.eveningTime === currentTime &&
          data.lastEveningSent !== today
        ) {
          promises.push(
            sendPush(data, 'evening', docSnap.ref, batch, today, webPushReady)
          );
        }
      }

      if (promises.length > 0) {
        await Promise.allSettled(promises);
        await batch.commit();
        console.log(`[ORBIT] Sent ${promises.length} briefing notification(s)`);
      }
    } catch (err) {
      console.error('[ORBIT] Briefing cron error:', err);
    }
  }
);

async function sendPush(
  data: PushTokenDoc,
  type: 'morning' | 'evening',
  docRef: FirebaseFirestore.DocumentReference,
  batch: FirebaseFirestore.WriteBatch,
  today: string,
  webPushReady: boolean
): Promise<void> {
  const isMorning = type === 'morning';

  const morningGreetings = [
    'Good morning.',
    'Rise and shine.',
    'A new day awaits.',
    'Let\'s make it count.',
    'Fresh start.',
  ];
  const eveningGreetings = [
    'Day\'s winding down.',
    'Almost there.',
    'Evening check-in.',
    'Time to reflect.',
    'Wrapping up.',
  ];

  const title = isMorning
    ? morningGreetings[Math.floor(Math.random() * morningGreetings.length)]
    : eveningGreetings[Math.floor(Math.random() * eveningGreetings.length)];

  const body = isMorning
    ? 'Your morning briefing is ready — open ORBIT to see what\'s ahead.'
    : 'Your day is winding down — open ORBIT to review.';

  const tag = isMorning ? 'orbit-morning-briefing' : 'orbit-evening-briefing';

  try {
    if (data.type === 'webpush' && data.subscription) {
      // ── Native Web Push (iOS/Safari) ───────────────────
      if (!webPushReady) {
        console.warn('[ORBIT] Skipping Web Push — VAPID keys not configured');
        return;
      }

      const payload = JSON.stringify({
        title,
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag,
        url: '/today',
        type: 'briefing',
        briefingType: type,
      });

      await webpush.sendNotification(
        {
          endpoint: data.subscription.endpoint,
          keys: {
            p256dh: data.subscription.keys.p256dh,
            auth: data.subscription.keys.auth,
          },
        },
        payload,
        { TTL: 3600 }
      );

      console.log(`[ORBIT] ${type} Web Push sent to ${data.subscription.endpoint.slice(0, 40)}...`);
    } else if (data.token) {
      // ── FCM (Chrome, Edge, Firefox) ────────────────────
      await messaging.send({
        token: data.token,
        notification: {
          title,
          body,
        },
        webpush: {
          notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag,
            requireInteraction: false,
          },
          fcmOptions: {
            link: '/today',
          },
        },
        data: {
          type: 'briefing',
          briefingType: type,
          url: '/today',
          tag,
        },
      });

      console.log(`[ORBIT] ${type} FCM push sent to token ${data.token.slice(0, 8)}...`);
    } else {
      console.warn('[ORBIT] Doc has neither token nor subscription, skipping');
      return;
    }

    // Mark as sent for today
    if (isMorning) {
      batch.update(docRef, { lastMorningSent: today });
    } else {
      batch.update(docRef, { lastEveningSent: today });
    }
  } catch (err: unknown) {
    const error = err as { code?: string; statusCode?: number };

    // FCM invalid token
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      console.warn(`[ORBIT] Removing stale FCM token: ${data.token?.slice(0, 8)}...`);
      batch.delete(docRef);
    }
    // Web Push subscription expired (410 Gone)
    else if (error.statusCode === 410 || error.statusCode === 404) {
      console.warn(`[ORBIT] Removing expired Web Push subscription`);
      batch.delete(docRef);
    } else {
      console.error(`[ORBIT] Push send failed for ${type}:`, err);
    }
  }
}
