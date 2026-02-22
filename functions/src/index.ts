import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// ═══════════════════════════════════════════════════════════
// ORBIT — Briefing Push Notification Cloud Function
//
// Runs every minute via Cloud Scheduler.
// Queries fcmTokens collection for users whose briefing time
// matches the current minute (in their timezone), then sends
// a push notification via FCM.
// ═══════════════════════════════════════════════════════════

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

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

interface FCMTokenDoc {
  userId: string;
  token: string;
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
    // Set your region — change if your Firestore is elsewhere
    region: 'us-central1',
  },
  async () => {
    try {
      const snapshot = await db.collection('fcmTokens').get();

      if (snapshot.empty) {
        return;
      }

      const batch = db.batch();
      const promises: Promise<void>[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as FCMTokenDoc;
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
            sendPush(data.token, 'morning', docSnap.ref, batch, today)
          );
        }

        // Check evening briefing
        if (
          data.eveningEnabled &&
          data.eveningTime === currentTime &&
          data.lastEveningSent !== today
        ) {
          promises.push(
            sendPush(data.token, 'evening', docSnap.ref, batch, today)
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
  token: string,
  type: 'morning' | 'evening',
  docRef: FirebaseFirestore.DocumentReference,
  batch: FirebaseFirestore.WriteBatch,
  today: string
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

  try {
    await messaging.send({
      token,
      notification: {
        title,
        body,
      },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: isMorning ? 'orbit-morning-briefing' : 'orbit-evening-briefing',
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
        tag: isMorning ? 'orbit-morning-briefing' : 'orbit-evening-briefing',
      },
    });

    // Mark as sent for today
    if (isMorning) {
      batch.update(docRef, { lastMorningSent: today });
    } else {
      batch.update(docRef, { lastEveningSent: today });
    }

    console.log(`[ORBIT] ${type} push sent to token ${token.slice(0, 8)}...`);
  } catch (err: unknown) {
    const error = err as { code?: string };
    // If token is invalid/expired, clean it up
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      console.warn(`[ORBIT] Removing stale FCM token: ${token.slice(0, 8)}...`);
      batch.delete(docRef);
    } else {
      console.error(`[ORBIT] FCM send failed for ${type}:`, err);
    }
  }
}
