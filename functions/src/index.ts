import { initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions, type Change } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  onDocumentUpdated,
  type FirestoreEvent,
} from 'firebase-functions/v2/firestore';
import * as webpush from 'web-push';
import { isSafeAttachmentPath, safeAttachmentPaths } from './attachment-paths';
import {
  McpConfigurationError,
  resolveMcpEndpoints,
  resolveMcpOAuthConfiguration,
  resolveMcpRequestOrigin,
} from './mcp/config';
import { createMcpRouter, runMcpRouterOnNode, type McpRouter } from './mcp/http';
import {
  createThreadmapOAuthService,
  type ThreadmapOAuthService,
} from './mcp/oauth';
import { ThreadmapDal } from './mcp/dal';
import {
  GoogleWorkspaceService,
  type GoogleWorkspaceConfiguration,
} from './mcp/google-workspace';
import {
  createMfaRecoveryCodeSet,
  isCurrentMfaRecoveryCode,
  MFA_RECOVERY_CODE_COUNT,
  mfaRecoveryDigest,
  normalizeMfaRecoveryCode,
} from './mfa-recovery';
import {
  createThreadmapAuthEmailFunction,
  resolveThreadmapAppOrigin,
} from './auth-email';
import {
  RESUMABLE_UPLOAD_SESSION_RISK_MS,
  UPLOAD_CLEANUP_INTERVAL_MS,
  attachmentUploadOriginAllowed,
  decideUploadCleanup,
  resumableUploadMetadata,
  shouldReleaseUploadRegistry,
} from './upload-cleanup-policy';
import {
  ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT,
  accountDeletionFixedDocumentPaths,
  accountDeletionPageSize,
  accountDeletionSweepDecision,
} from './account-deletion-policy';
import {
  ACCOUNT_EXPORT_STORAGE_CONCURRENCY,
  ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES,
  ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES,
  ACCOUNT_EXPORT_RESPONSE_OVERHEAD_BYTES,
  accountExportAttachmentCountAllowed,
  accountExportAttachmentBytesAllowed,
  accountExportMayReturn,
  accountExportSerializedByteLength,
  accountExportSerializedBytesAllowed,
  mapWithConcurrency,
  sanitizeAccountExportAuditEvent,
} from './account-export-policy';
import { mergeAccountOwnedDocumentIfActive } from './account-write-barrier';
import {
  scrapeQuotaExpireAtMillis,
  securityAuditExpireAtMillis,
} from './retention-policy';
import { hasOnlyBackgroundBriefingScheduleFields } from './push-schedule-policy';
import { privateOwnerAuthorized } from './private-access';

initializeApp();

const FUNCTION_REGION = 'europe-west1';

// A compromised account or abusive client must not be able to scale every
// function without bound. Individual functions can override this when measured
// production traffic demonstrates a legitimate need.
setGlobalOptions({ maxInstances: 20 });

const db = getFirestore();
const messaging = getMessaging();
const auth = getAuth();
const storage = getStorage();
const adminAppCheck = getAppCheck();

export const sendThreadmapAuthEmail = createThreadmapAuthEmailFunction(
  auth,
  db,
  FUNCTION_REGION,
);

const vapidPublicKey = defineSecret('VAPID_PUBLIC_KEY');
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');
const scrapeRateLimitSharedSecret = defineSecret('SCRAPE_RATE_LIMIT_SHARED_SECRET');
const mfaRecoveryHmacKey = defineSecret('MFA_RECOVERY_HMAC_KEY');
const googleWorkspaceClientSecret = defineSecret('GOOGLE_WORKSPACE_CLIENT_SECRET');
const googleWorkspaceTokenEncryptionKey = defineSecret('GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_KEY');
const VAPID_SUBJECT = 'mailto:notifications@threadmap.app';
const PAGE_SIZE = 100;
const MAX_DUE_PER_RUN = 500;
const LEASE_MS = 2 * 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;
const MAX_DELETION_JOBS_PER_RUN = 500;
// Callable responses have a hard payload limit. Fail explicitly before an
// unbounded account inventory exhausts function memory; deletion uses its own
// incremental sweep and is never subject to this export guard.
const ACCOUNT_EXPORT_MAX_DOCUMENTS = 10_000;
const RECENT_AUTH_WINDOW_SECONDS = 10 * 60;
// Firebase refresh tokens and MCP refresh tokens can remain valid after the
// primary Auth user is removed. Keep the minimal server-only tombstone for
// twice the maximum MCP refresh-token lifetime (90 days) so stale credentials
// and delayed uploads cannot recreate a supposedly deleted account.
const ACCOUNT_DELETION_TOMBSTONE_RETENTION_MS = 180 * 24 * 60 * 60_000;
// A Cloud Storage resumable-session URI is bearer authorization and can remain
// usable for one week. Keep deletion in a non-terminal cleanup state for the
// full provider lifetime plus a small clock/scheduler safety margin, sweeping
// the owner prefix every hour before publishing a completed tombstone.
const MAX_PUSH_DEVICES_PER_ACCOUNT = 5;
const SCRAPE_RATE_WINDOW_MS = 10 * 60_000;
const SCRAPE_UID_LIMIT = 60;
const SCRAPE_IP_LIMIT = 180;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const UPLOAD_INTENT_TTL_MS = 60 * 60_000;
const UPLOAD_INTENT_WINDOW_MS = 10 * 60_000;
const MAX_ACTIVE_UPLOAD_INTENTS = 10;
const MAX_RESERVED_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_INTENTS_PER_WINDOW = 20;
const MFA_RECOVERY_LIFETIME_MS = 365 * 24 * 60 * 60_000;
const MFA_RECOVERY_RATE_WINDOW_MS = 15 * 60_000;
const MFA_RECOVERY_RATE_LIMIT = 8;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/zip',
  'application/x-zip-compressed',
]);
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

type BriefingType = 'morning' | 'evening';
function allowedHierarchyParent(childType: unknown, parentType: unknown, parentStatus: unknown): boolean {
  if (parentStatus === 'archived') return false;
  if (childType === 'goal') return parentType === 'project';
  return ['task', 'event', 'note', 'habit'].includes(String(childType))
    && (parentType === 'project' || parentType === 'goal');
}

interface PushTokenDoc {
  userId: string;
  type?: 'fcm' | 'webpush';
  token?: string;
  subscription?: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    expirationTime?: number | null;
  };
  morningEnabled?: boolean;
  morningTime?: string;
  nextMorningAt?: number | null;
  eveningEnabled?: boolean;
  eveningTime?: string;
  nextEveningAt?: number | null;
  timezone?: string;
  retryCount?: number;
  leaseUntil?: number;
  leaseType?: BriefingType;
  leaseDueAt?: number;
}

interface PushSchedule {
  morningEnabled: boolean;
  morningTime: string;
  nextMorningAt: number | null;
  eveningEnabled: boolean;
  eveningTime: string;
  nextEveningAt: number | null;
  timezoneOffset: number;
  timezone: string;
}

interface PushDeviceRegistry {
  userId: string;
  deviceIds: string[];
  deviceCount: number;
  createdAt: number;
  updatedAt: number;
}

const fieldNames = (type: BriefingType) => type === 'morning'
  ? {
      enabled: 'morningEnabled',
      time: 'morningTime',
      next: 'nextMorningAt',
      lastSentAt: 'lastMorningSentAt',
      lastSentDate: 'lastMorningSent',
      lastDueAt: 'lastMorningDueAt',
    }
  : {
      enabled: 'eveningEnabled',
      time: 'eveningTime',
      next: 'nextEveningAt',
      lastSentAt: 'lastEveningSentAt',
      lastSentDate: 'lastEveningSent',
      lastDueAt: 'lastEveningDueAt',
    };

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function localDateKey(date: Date, timezone: string): string {
  const parts = zonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addLocalDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function localDateTimeToUtc(dateKey: string, time: string, timezone: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const rendered = zonedParts(new Date(candidate), timezone);
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second
    );
    candidate += targetAsUtc - renderedAsUtc;
  }
  return candidate;
}

function nextDailyAt(time: string | undefined, timezone: string | undefined, now: number): number {
  const safeTime = /^\d{2}:\d{2}$/.test(time || '') ? time! : '08:00';
  const safeTimezone = timezone || 'UTC';
  try {
    const today = localDateKey(new Date(now), safeTimezone);
    for (let dayOffset = 1; dayOffset <= 3; dayOffset += 1) {
      const candidate = localDateTimeToUtc(addLocalDays(today, dayOffset), safeTime, safeTimezone);
      if (candidate > now) return candidate;
    }
  } catch {
    // Fall through to a stable UTC fallback for invalid legacy timezones.
  }
  return now + 24 * 60 * 60_000;
}

function nextDailyOccurrence(time: string, timezone: string, now: number): number {
  const today = localDateKey(new Date(now), timezone);
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    const candidate = localDateTimeToUtc(addLocalDays(today, dayOffset), time, timezone);
    if (candidate > now) return candidate;
  }
  return nextDailyAt(time, timezone, now);
}

function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function validBriefingTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new HttpsError('invalid-argument', `${field} must use HH:MM format.`);
  }
  const [hour, minute] = value.split(':').map(Number);
  if (hour > 23 || minute > 59) {
    throw new HttpsError('invalid-argument', `${field} is outside the valid clock range.`);
  }
  return value;
}

function validatedPushSchedule(value: unknown): PushSchedule {
  const schedule = recordValue(value, 'schedule');
  if (!hasOnlyBackgroundBriefingScheduleFields(schedule)) {
    throw new HttpsError('invalid-argument', 'The push schedule contains unsupported fields.');
  }
  if (typeof schedule.morningEnabled !== 'boolean' || typeof schedule.eveningEnabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Push schedule switches must be boolean values.');
  }
  const morningTime = validBriefingTime(schedule.morningTime, 'morningTime');
  const eveningTime = validBriefingTime(schedule.eveningTime, 'eveningTime');
  if (!Number.isInteger(schedule.timezoneOffset) || Number(schedule.timezoneOffset) < -840 || Number(schedule.timezoneOffset) > 840) {
    throw new HttpsError('invalid-argument', 'timezoneOffset is invalid.');
  }
  if (typeof schedule.timezone !== 'string' || schedule.timezone.length < 1 || schedule.timezone.length > 100) {
    throw new HttpsError('invalid-argument', 'timezone is invalid.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone }).format(new Date());
  } catch {
    throw new HttpsError('invalid-argument', 'timezone is not recognized.');
  }
  const now = Date.now();
  return {
    morningEnabled: schedule.morningEnabled,
    morningTime,
    nextMorningAt: schedule.morningEnabled
      ? nextDailyOccurrence(morningTime, schedule.timezone, now)
      : null,
    eveningEnabled: schedule.eveningEnabled,
    eveningTime,
    nextEveningAt: schedule.eveningEnabled
      ? nextDailyOccurrence(eveningTime, schedule.timezone, now)
      : null,
    timezoneOffset: Number(schedule.timezoneOffset),
    timezone: schedule.timezone,
  };
}

function isPrintableAscii(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 33 || code > 126) return false;
  }
  return true;
}

function validatedPushCredentials(value: unknown): {
  credentials: Pick<PushTokenDoc, 'type' | 'token' | 'subscription'>;
  fingerprintSource: string;
} {
  const credentials = recordValue(value, 'credentials');
  if (credentials.type === 'fcm') {
    if (!hasOnlyKeys(credentials, ['type', 'token']) ||
        typeof credentials.token !== 'string' ||
        credentials.token.length < 20 ||
        credentials.token.length > 4096 ||
        !isPrintableAscii(credentials.token)) {
      throw new HttpsError('invalid-argument', 'The FCM delivery token is invalid.');
    }
    return {
      credentials: { type: 'fcm', token: credentials.token },
      fingerprintSource: credentials.token,
    };
  }

  if (credentials.type !== 'webpush' || !hasOnlyKeys(credentials, ['type', 'subscription'])) {
    throw new HttpsError('invalid-argument', 'The push credential type is invalid.');
  }
  const subscription = recordValue(credentials.subscription, 'subscription');
  if (!hasOnlyKeys(subscription, ['endpoint', 'expirationTime', 'keys']) ||
      typeof subscription.endpoint !== 'string' ||
      subscription.endpoint.length < 1 ||
      subscription.endpoint.length > 2048) {
    throw new HttpsError('invalid-argument', 'The Web Push subscription is invalid.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch {
    throw new HttpsError('invalid-argument', 'The Web Push endpoint is invalid.');
  }
  const allowedHosts = new Set([
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
    'android.googleapis.com',
  ]);
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password ||
      !allowedHosts.has(endpoint.hostname.toLowerCase())) {
    throw new HttpsError('invalid-argument', 'The Web Push endpoint host is not supported.');
  }
  if (subscription.expirationTime !== undefined && subscription.expirationTime !== null &&
      (!Number.isInteger(subscription.expirationTime) || Number(subscription.expirationTime) <= 0)) {
    throw new HttpsError('invalid-argument', 'The Web Push expiration time is invalid.');
  }
  const keys = recordValue(subscription.keys, 'subscription.keys');
  const validKey = (candidate: unknown, minimum: number, maximum: number) =>
    typeof candidate === 'string' &&
    candidate.length >= minimum &&
    candidate.length <= maximum &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(candidate);
  if (!hasOnlyKeys(keys, ['p256dh', 'auth']) ||
      !validKey(keys.p256dh, 40, 256) ||
      !validKey(keys.auth, 8, 128)) {
    throw new HttpsError('invalid-argument', 'The Web Push subscription keys are invalid.');
  }
  return {
    credentials: {
      type: 'webpush',
      subscription: {
        endpoint: endpoint.toString(),
        expirationTime: subscription.expirationTime === undefined
          ? null
          : subscription.expirationTime as number | null,
        keys: { p256dh: keys.p256dh as string, auth: keys.auth as string },
      },
    },
    fingerprintSource: subscription.endpoint,
  };
}

function pushRegistryRef(uid: string): FirebaseFirestore.DocumentReference {
  return db.doc(`pushDeviceRegistries/${uid}`);
}

function validPushDeviceId(uid: string, value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > uid.length + 1 &&
    value.length <= 1500 &&
    value.startsWith(`${uid}_`) &&
    !value.includes('/');
}

function registryDeviceIds(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  uid: string
): string[] | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Partial<PushDeviceRegistry>;
  if (data.userId !== uid || !Array.isArray(data.deviceIds)) return null;
  const unique = [...new Set(data.deviceIds)];
  if (unique.length !== data.deviceIds.length ||
      unique.length > MAX_PUSH_DEVICES_PER_ACCOUNT ||
      unique.some((deviceId) => !validPushDeviceId(uid, deviceId)) ||
      data.deviceCount !== unique.length) {
    return null;
  }
  return unique;
}

function writePushRegistry(
  transaction: FirebaseFirestore.Transaction,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  uid: string,
  deviceIds: string[],
  now: number
): void {
  const registryRef = pushRegistryRef(uid);
  if (deviceIds.length === 0) {
    transaction.delete(registryRef);
    return;
  }
  transaction.set(registryRef, {
    userId: uid,
    deviceIds: [...new Set(deviceIds)].sort(),
    deviceCount: deviceIds.length,
    createdAt: snapshot.exists && Number.isInteger(snapshot.data()?.createdAt)
      ? snapshot.data()!.createdAt
      : now,
    updatedAt: now,
  } satisfies PushDeviceRegistry);
}

function syncRegistryAfterDeviceDeletion(
  transaction: FirebaseFirestore.Transaction,
  registrySnapshot: FirebaseFirestore.DocumentSnapshot,
  uid: string,
  docId: string,
  now: number
): void {
  const ids = registryDeviceIds(registrySnapshot, uid);
  if (!ids) {
    if (registrySnapshot.exists) transaction.delete(registrySnapshot.ref);
    return;
  }
  writePushRegistry(transaction, registrySnapshot, uid, ids.filter((id) => id !== docId), now);
}

async function claimDue(
  ref: FirebaseFirestore.DocumentReference,
  type: BriefingType,
  now: number
): Promise<{ data: PushTokenDoc; dueAt: number } | null> {
  const fields = fieldNames(type);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() as PushTokenDoc & Record<string, unknown>;
    if (typeof data.userId !== 'string' || !data.userId) return null;
    const dueAt = Number(data[fields.next] || 0);
    if (!data[fields.enabled] || dueAt <= 0 || dueAt > now) return null;
    if (Number(data.leaseUntil || 0) > now) return null;
    if (Number(data[fields.lastDueAt] || 0) === dueAt) return null;
    // Serialize the delivery lease against account deletion. A concurrent
    // tombstone create changes the missing-document read version and forces
    // this transaction to retry before any external push side effect runs.
    const deletion = await transaction.get(accountDeletionRef(data.userId));
    if (deletion.exists) return null;
    transaction.update(ref, {
      leaseUntil: now + LEASE_MS,
      leaseType: type,
      leaseDueAt: dueAt,
      updatedAt: now,
    });
    return { data, dueAt };
  });
}

function isPermanentPushFailure(error: unknown): boolean {
  const pushError = error as { code?: string; statusCode?: number };
  return pushError.code === 'messaging/invalid-registration-token' ||
    pushError.code === 'messaging/registration-token-not-registered' ||
    pushError.statusCode === 404 ||
    pushError.statusCode === 410;
}

function samePushCredential(left: PushTokenDoc, right: PushTokenDoc): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'webpush') {
    return left.subscription?.endpoint === right.subscription?.endpoint
      && left.subscription?.keys?.p256dh === right.subscription?.keys?.p256dh
      && left.subscription?.keys?.auth === right.subscription?.keys?.auth;
  }
  return left.token === right.token;
}

async function deletePermanentlyFailedClaim(
  ref: FirebaseFirestore.DocumentReference,
  claim: { data: PushTokenDoc; dueAt: number },
  type: BriefingType
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const registryRef = pushRegistryRef(claim.data.userId);
    const [current, registrySnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(registryRef),
    ]);
    if (!current.exists) return;
    const data = current.data() as PushTokenDoc;
    if (
      data.leaseType !== type ||
      Number(data.leaseDueAt) !== claim.dueAt ||
      !samePushCredential(data, claim.data)
    ) return;
    transaction.delete(ref);
    syncRegistryAfterDeviceDeletion(
      transaction,
      registrySnapshot,
      claim.data.userId,
      ref.id,
      Date.now()
    );
  });
}

async function sendPush(data: PushTokenDoc, type: BriefingType, webPushReady: boolean): Promise<void> {
  const isMorning = type === 'morning';
  const title = isMorning ? 'Good morning.' : 'Evening check-in.';
  const body = isMorning ? 'Your morning briefing is ready.' : 'Time to review your day.';
  const tag = isMorning ? 'threadmap-morning-briefing' : 'threadmap-evening-briefing';
  const url = `/briefing?type=${type}`;

  if (data.type === 'webpush' && data.subscription) {
    if (!webPushReady) throw new Error('Native Web Push is temporarily unavailable.');
    await webpush.sendNotification(
      {
        endpoint: data.subscription.endpoint,
        keys: data.subscription.keys,
      },
      JSON.stringify({
        title,
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag,
        url,
        type: 'briefing',
        briefingType: type,
      }),
      { TTL: 3600 }
    );
    return;
  }

  if (!data.token) throw new Error('Push device has no delivery credentials.');
  await messaging.send({
    token: data.token,
    notification: { title, body },
    webpush: {
      notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag },
      fcmOptions: { link: url },
    },
    data: { type: 'briefing', briefingType: type, url, tag },
  });
}

async function finalizeDelivery(
  ref: FirebaseFirestore.DocumentReference,
  claim: { data: PushTokenDoc; dueAt: number },
  type: BriefingType,
  now: number
): Promise<void> {
  const fields = fieldNames(type);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return;
    const data = current.data() as PushTokenDoc;
    if (data.leaseType !== type || Number(data.leaseDueAt) !== claim.dueAt) return;
    transaction.update(ref, {
      [fields.lastSentAt]: now,
      [fields.lastSentDate]: localDateKey(new Date(now), claim.data.timezone || 'UTC'),
      [fields.lastDueAt]: claim.dueAt,
      [fields.next]: nextDailyAt(claim.data[fields.time as keyof PushTokenDoc] as string, claim.data.timezone, now),
      leaseUntil: 0,
      leaseType: FieldValue.delete(),
      leaseDueAt: FieldValue.delete(),
      retryCount: 0,
      lastErrorCode: FieldValue.delete(),
      updatedAt: now,
    });
  });
}

async function releaseForRetry(
  ref: FirebaseFirestore.DocumentReference,
  claim: { data: PushTokenDoc; dueAt: number },
  type: BriefingType,
  now: number,
  error: unknown
): Promise<void> {
  const fields = fieldNames(type);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return;
    const data = current.data() as PushTokenDoc;
    if (data.leaseType !== type || Number(data.leaseDueAt) !== claim.dueAt) return;
    const retryCount = Math.min(10, Number(data.retryCount || 0) + 1);
    const retryDelay = Math.min(MAX_RETRY_DELAY_MS, (2 ** Math.min(retryCount, 6)) * 60_000);
    transaction.update(ref, {
      [fields.next]: now + retryDelay,
      leaseUntil: 0,
      leaseType: FieldValue.delete(),
      leaseDueAt: FieldValue.delete(),
      retryCount,
      lastErrorCode: String((error as { code?: unknown })?.code || 'push-failed').slice(0, 120),
      updatedAt: now,
    });
  });
}

async function processDueType(type: BriefingType, webPushReady: boolean): Promise<number> {
  const now = Date.now();
  const fields = fieldNames(type);
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let processed = 0;
  let delivered = 0;

  while (processed < MAX_DUE_PER_RUN) {
    let dueQuery: FirebaseFirestore.Query = db.collection('fcmTokens')
      .where(fields.enabled, '==', true)
      .where(fields.next, '<=', now)
      .orderBy(fields.next, 'asc')
      .limit(PAGE_SIZE);
    if (cursor) dueQuery = dueQuery.startAfter(cursor);
    const snapshot = await dueQuery.get();
    if (snapshot.empty) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];

    for (let index = 0; index < snapshot.docs.length; index += 10) {
      const group = snapshot.docs.slice(index, index + 10);
      const results = await Promise.all(group.map(async (device) => {
        const claim = await claimDue(device.ref, type, now);
        if (!claim) return false;
        try {
          await sendPush(claim.data, type, webPushReady);
          await finalizeDelivery(device.ref, claim, type, Date.now());
          return true;
        } catch (error) {
          if (isPermanentPushFailure(error)) {
            await deletePermanentlyFailedClaim(device.ref, claim, type);
          } else {
            await releaseForRetry(device.ref, claim, type, Date.now(), error);
          }
          return false;
        }
      }));
      delivered += results.filter(Boolean).length;
      processed += group.length;
    }
    if (snapshot.size < PAGE_SIZE) break;
  }
  return delivered;
}

async function sendBriefingNotifications(): Promise<void> {
  const publicKey = (vapidPublicKey.value() || process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (vapidPrivateKey.value() || process.env.VAPID_PRIVATE_KEY || '').trim();
  const webPushReady = Boolean(publicKey && privateKey);
  if (webPushReady) webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  const morning = await processDueType('morning', webPushReady);
  const evening = await processDueType('evening', webPushReady);
  console.info(`[THREADMAP] Briefing run delivered ${morning + evening} notification(s).`);
}

export const sendBriefingNotificationsEu = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    retryCount: 3,
    memory: '256MiB',
    region: FUNCTION_REGION,
    secrets: [vapidPublicKey, vapidPrivateKey],
  },
  sendBriefingNotifications,
);

function requireUid(request: {
  auth?: { uid: string; token?: Record<string, unknown> } | null;
}): string {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  if (!privateOwnerAuthorized(request.auth.token)) {
    throw new HttpsError('permission-denied', 'This Threadmap deployment is private.');
  }
  return request.auth.uid;
}

function accountDeletionRef(uid: string): FirebaseFirestore.DocumentReference {
  return db.doc(`accountDeletionJobs/${uid}`);
}

function assertAccountActiveSnapshot(snapshot: FirebaseFirestore.DocumentSnapshot): void {
  if (snapshot.exists) {
    throw new HttpsError(
      'failed-precondition',
      'This account is being deleted or has already been deleted.'
    );
  }
}

async function assertAccountActive(uid: string): Promise<void> {
  assertAccountActiveSnapshot(await accountDeletionRef(uid).get());
}

function requireRecentUid(request: {
  auth?: { uid: string; token?: Record<string, unknown> & { auth_time?: unknown } } | null;
}): string {
  const uid = requireUid(request);
  const authTime = Number(request.auth?.token?.auth_time || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!authTime || nowSeconds - authTime > RECENT_AUTH_WINDOW_SECONDS) {
    throw new HttpsError(
      'failed-precondition',
      'For your security, sign in again before deleting your account.'
    );
  }
  return uid;
}

function requireExpectedUid(
  request: { auth?: { uid: string; token?: Record<string, unknown> } | null },
  data: Record<string, unknown>
): string {
  const uid = requireUid(request);
  if (typeof data.userId !== 'string' || data.userId !== uid) {
    throw new HttpsError('permission-denied', 'The requested account does not match the signed-in account.');
  }
  return uid;
}

function mfaRecoverySecret(): string {
  const secret = mfaRecoveryHmacKey.value();
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new HttpsError('internal', 'Account recovery is temporarily unavailable.');
  }
  return secret;
}

async function enforceMfaRecoveryRateLimit(request: unknown, secret: string): Promise<void> {
  const rawRequest = (request as {
    rawRequest?: { ip?: string; socket?: { remoteAddress?: string } };
  }).rawRequest;
  const address = rawRequest?.ip || rawRequest?.socket?.remoteAddress;
  if (!address) return;

  const addressDigest = createHash('sha256').update(`mfa-recovery-ip:${secret}:${address}`).digest('hex');
  const ref = db.doc(`mfaRecoveryRateLimits/${addressDigest}`);
  const now = Date.now();
  const windowStart = Math.floor(now / MFA_RECOVERY_RATE_WINDOW_MS) * MFA_RECOVERY_RATE_WINDOW_MS;
  let limited = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() || {};
    const sameWindow = Number(current.windowStart || 0) === windowStart;
    const attempts = sameWindow ? Number(current.attempts || 0) : 0;
    if (attempts >= MFA_RECOVERY_RATE_LIMIT) {
      limited = true;
      return;
    }
    transaction.set(ref, {
      windowStart,
      attempts: attempts + 1,
      updatedAt: now,
      expireAt: Timestamp.fromMillis(windowStart + (2 * MFA_RECOVERY_RATE_WINDOW_MS)),
    });
  });
  if (limited) {
    throw new HttpsError('resource-exhausted', 'Too many recovery attempts. Try again later.');
  }
}

export const getMfaRecoveryCodeStatus = onCall(
  {
    region: FUNCTION_REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, [])) {
      throw new HttpsError('invalid-argument', 'The recovery status request contains unsupported fields.');
    }
    const uid = requireUid(request);
    await assertAccountActive(uid);
    const snapshot = await db.doc(`mfaRecoverySets/${uid}`).get();
    const status = snapshot.data() || {};
    return {
      generatedAt: Number(status.generatedAt || 0) || null,
      expiresAt: Number(status.expiresAt || 0) || null,
      remaining: Math.max(0, Number(status.remaining || 0)),
    };
  }
);

export const generateMfaRecoveryCodes = onCall(
  {
    region: FUNCTION_REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    secrets: [mfaRecoveryHmacKey],
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, [])) {
      throw new HttpsError('invalid-argument', 'The recovery-code request contains unsupported fields.');
    }
    const uid = requireRecentUid(request);
    await assertAccountActive(uid);
    const user = await auth.getUser(uid);
    if (!user.multiFactor?.enrolledFactors.length) {
      throw new HttpsError('failed-precondition', 'Add an authenticator before creating recovery codes.');
    }

    const secret = mfaRecoverySecret();
    const codes = createMfaRecoveryCodeSet();
    const now = Date.now();
    const expiresAt = now + MFA_RECOVERY_LIFETIME_MS;
    const generationId = randomUUID();
    const previous = await db.collection('mfaRecoveryCodes').where('uid', '==', uid).limit(100).get();
    await db.runTransaction(async (transaction) => {
      // Reading the tombstone in the same transaction serializes code creation
      // against account deletion. A concurrent deletion write forces a retry
      // that observes the account as unavailable.
      const [deletion, currentSet] = await Promise.all([
        transaction.get(accountDeletionRef(uid)),
        transaction.get(db.doc(`mfaRecoverySets/${uid}`)),
      ]);
      assertAccountActiveSnapshot(deletion);
      // The set read serializes concurrent generations. Superseded code docs
      // may remain until TTL, but recovery validates generationId below.
      void currentSet;
      for (const snapshot of previous.docs) transaction.delete(snapshot.ref);
      for (const code of codes) {
        const digest = mfaRecoveryDigest(code, secret);
        transaction.set(db.doc(`mfaRecoveryCodes/${digest}`), {
          uid,
          generationId,
          createdAt: now,
          expiresAt,
          status: 'active',
          expireAt: Timestamp.fromMillis(expiresAt),
        });
      }
      transaction.set(db.doc(`mfaRecoverySets/${uid}`), {
        uid,
        generationId,
        generatedAt: now,
        expiresAt,
        remaining: MFA_RECOVERY_CODE_COUNT,
        updatedAt: now,
      });
    });
    console.info(JSON.stringify({ component: 'mfa-recovery', event: 'codes-generated', uid }));
    return { codes, generatedAt: now, expiresAt };
  }
);

export const recoverMfaWithCode = onCall(
  {
    region: FUNCTION_REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    secrets: [mfaRecoveryHmacKey],
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, ['code'])) {
      throw new HttpsError('invalid-argument', 'The recovery request contains unsupported fields.');
    }
    const normalized = normalizeMfaRecoveryCode(data.code);
    if (!normalized) {
      throw new HttpsError('invalid-argument', 'That recovery code is invalid or no longer available.');
    }
    const secret = mfaRecoverySecret();
    await enforceMfaRecoveryRateLimit(request, secret);

    const digest = mfaRecoveryDigest(normalized, secret);
    const codeRef = db.doc(`mfaRecoveryCodes/${digest}`);
    const claimId = randomUUID();
    const now = Date.now();
    const claimedUid = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(codeRef);
      const code = snapshot.data() || {};
      if (!snapshot.exists || typeof code.uid !== 'string') return null;
      const [deletion, currentSet] = await Promise.all([
        transaction.get(accountDeletionRef(code.uid)),
        transaction.get(db.doc(`mfaRecoverySets/${code.uid}`)),
      ]);
      if (!isCurrentMfaRecoveryCode(code, currentSet.data() || {}, now)) return null;
      assertAccountActiveSnapshot(deletion);
      transaction.update(codeRef, {
        status: 'consuming',
        claimId,
        claimedAt: now,
      });
      return code.uid;
    });
    if (!claimedUid) {
      throw new HttpsError('invalid-argument', 'That recovery code is invalid or no longer available.');
    }

    try {
      const user = await auth.getUser(claimedUid);
      if (user.multiFactor?.enrolledFactors.length) {
        await auth.updateUser(claimedUid, { multiFactor: { enrolledFactors: [] } });
      }
      await auth.revokeRefreshTokens(claimedUid);

      const allCodes = await db.collection('mfaRecoveryCodes').where('uid', '==', claimedUid).limit(100).get();
      const auditRef = db.collection('mfaRecoveryAudits').doc();
      await db.runTransaction(async (transaction) => {
        // The Auth operations above cannot share a Firestore transaction, so
        // gate their derivative persistence again. If deletion started in the
        // meantime, suppress every account-scoped create and only remove code
        // snapshots that were already visible.
        const deletion = await transaction.get(accountDeletionRef(claimedUid));
        for (const snapshot of allCodes.docs) transaction.delete(snapshot.ref);
        if (deletion.exists) return;
        transaction.set(db.doc(`mfaRecoverySets/${claimedUid}`), {
          uid: claimedUid,
          remaining: 0,
          recoveredAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.set(auditRef, {
          uid: claimedUid,
          event: 'mfa-recovered',
          createdAt: now,
          expireAt: Timestamp.fromMillis(securityAuditExpireAtMillis(now)),
        });
      });
      console.warn(JSON.stringify({ component: 'mfa-recovery', event: 'mfa-recovered', uid: claimedUid }));
      return { success: true };
    } catch (error) {
      await db.runTransaction(async (transaction) => {
        const [snapshot, deletion] = await Promise.all([
          transaction.get(codeRef),
          transaction.get(accountDeletionRef(claimedUid)),
        ]);
        if (deletion.exists) {
          if (snapshot.exists) transaction.delete(codeRef);
          return;
        }
        if (snapshot.data()?.claimId === claimId) {
          transaction.update(codeRef, {
            status: 'active',
            claimId: FieldValue.delete(),
            claimedAt: FieldValue.delete(),
          });
        }
      }).catch(() => undefined);
      console.error('[THREADMAP] MFA recovery failed after code claim:', error);
      throw new HttpsError('internal', 'Account recovery could not be completed. Try again.');
    }
  }
);

async function loadPushRegistryIds(
  transaction: FirebaseFirestore.Transaction,
  uid: string
): Promise<string[]> {
  // Token documents stay authoritative while the registry provides the
  // per-account serialization lock. Re-reading the bounded collection also
  // self-heals legacy registries and out-of-band administrative cleanup.
  const devices = await transaction.get(
    db.collection('fcmTokens').where('userId', '==', uid)
  );
  return devices.docs
    .filter((snapshot) => validPushDeviceId(uid, snapshot.id))
    .sort((left, right) => {
      const timeDifference = Number(right.data().updatedAt || 0) - Number(left.data().updatedAt || 0);
      return timeDifference || left.id.localeCompare(right.id);
    })
    .map((snapshot) => snapshot.id);
}

function trimPushDevicesToQuota(
  transaction: FirebaseFirestore.Transaction,
  deviceIds: string[],
  preferredId: string
): string[] {
  if (deviceIds.length <= MAX_PUSH_DEVICES_PER_ACCOUNT) return deviceIds;
  const retained = [preferredId, ...deviceIds.filter((deviceId) => deviceId !== preferredId)]
    .slice(0, MAX_PUSH_DEVICES_PER_ACCOUNT);
  const retainedSet = new Set(retained);
  for (const deviceId of deviceIds) {
    if (!retainedSet.has(deviceId)) transaction.delete(db.doc(`fcmTokens/${deviceId}`));
  }
  return retained;
}

export const upsertThreadmapPushDevice = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, [
      'userId',
      'fingerprint',
      'credentials',
      'schedule',
      'userAgent',
      'replaceDeviceId',
    ])) {
      throw new HttpsError('invalid-argument', 'The push registration contains unsupported fields.');
    }
    const uid = requireExpectedUid(request, data);
    const { credentials, fingerprintSource } = validatedPushCredentials(data.credentials);
    const schedule = validatedPushSchedule(data.schedule);
    const expectedFingerprint = createHash('sha256')
      .update(fingerprintSource)
      .digest('hex')
      .slice(0, 32);
    if (typeof data.fingerprint !== 'string' || data.fingerprint !== expectedFingerprint) {
      throw new HttpsError('invalid-argument', 'The push credential fingerprint is invalid.');
    }
    if (typeof data.userAgent !== 'string' || data.userAgent.length > 512) {
      throw new HttpsError('invalid-argument', 'The device description is invalid.');
    }
    const docId = `${uid}_${expectedFingerprint}`;
    const replaceDeviceId = data.replaceDeviceId === null
      ? null
      : data.replaceDeviceId;
    if (replaceDeviceId !== null && !validPushDeviceId(uid, replaceDeviceId)) {
      throw new HttpsError('invalid-argument', 'The replacement device ID is invalid.');
    }

    const deviceRef = db.doc(`fcmTokens/${docId}`);
    const registryRef = pushRegistryRef(uid);
    const tombstoneRef = accountDeletionRef(uid);
    const replacementRef = replaceDeviceId && replaceDeviceId !== docId
      ? db.doc(`fcmTokens/${replaceDeviceId}`)
      : null;
    await db.runTransaction(async (transaction) => {
      const reads = [
        transaction.get(registryRef),
        transaction.get(deviceRef),
        transaction.get(tombstoneRef),
      ] as const;
      const [registrySnapshot, deviceSnapshot, tombstoneSnapshot] = await Promise.all(reads);
      const replacementSnapshot = replacementRef
        ? await transaction.get(replacementRef)
        : null;
      assertAccountActiveSnapshot(tombstoneSnapshot);
      if (replacementSnapshot?.exists && replacementSnapshot.data()?.userId !== uid) {
        throw new HttpsError('permission-denied', 'The replacement device does not belong to this account.');
      }

      let deviceIds = await loadPushRegistryIds(transaction, uid);
      if (replacementRef) deviceIds = deviceIds.filter((id) => id !== replacementRef.id);
      if (!deviceIds.includes(docId)) {
        if (!deviceSnapshot.exists && deviceIds.length >= MAX_PUSH_DEVICES_PER_ACCOUNT) {
          throw new HttpsError(
            'resource-exhausted',
            `An account can register at most ${MAX_PUSH_DEVICES_PER_ACCOUNT} push devices.`
          );
        }
        deviceIds.push(docId);
      }
      deviceIds = trimPushDevicesToQuota(transaction, deviceIds, docId);

      const existing = deviceSnapshot.data() as PushTokenDoc | undefined;
      const now = Date.now();
      transaction.set(deviceRef, {
        userId: uid,
        fingerprint: expectedFingerprint,
        ...credentials,
        ...schedule,
        createdAt: deviceSnapshot.exists && Number.isInteger(deviceSnapshot.data()?.createdAt)
          ? deviceSnapshot.data()!.createdAt
          : now,
        updatedAt: now,
        leaseUntil: Number.isInteger(existing?.leaseUntil) ? existing!.leaseUntil : 0,
        retryCount: Number.isInteger(existing?.retryCount) ? existing!.retryCount : 0,
        userAgent: data.userAgent,
        ...(credentials.type === 'fcm'
          ? { subscription: FieldValue.delete() }
          : { token: FieldValue.delete() }),
      }, { merge: true });
      if (replacementRef) transaction.delete(replacementRef);
      writePushRegistry(transaction, registrySnapshot, uid, deviceIds, now);
    });
    return { success: true, docId };
  }
);

export const updateThreadmapPushSchedule = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, ['userId', 'docId', 'schedule'])) {
      throw new HttpsError('invalid-argument', 'The push schedule request contains unsupported fields.');
    }
    const uid = requireExpectedUid(request, data);
    if (!validPushDeviceId(uid, data.docId)) {
      throw new HttpsError('invalid-argument', 'The push device ID is invalid.');
    }
    const schedule = validatedPushSchedule(data.schedule);
    const deviceRef = db.doc(`fcmTokens/${data.docId}`);
    const registryRef = pushRegistryRef(uid);
    const tombstoneRef = accountDeletionRef(uid);
    await db.runTransaction(async (transaction) => {
      const [registrySnapshot, deviceSnapshot, tombstoneSnapshot] = await Promise.all([
        transaction.get(registryRef),
        transaction.get(deviceRef),
        transaction.get(tombstoneRef),
      ]);
      assertAccountActiveSnapshot(tombstoneSnapshot);
      if (!deviceSnapshot.exists || deviceSnapshot.data()?.userId !== uid) {
        throw new HttpsError('not-found', 'Push device not found.');
      }
      let deviceIds = await loadPushRegistryIds(transaction, uid);
      if (!deviceIds.includes(deviceRef.id)) deviceIds.push(deviceRef.id);
      deviceIds = trimPushDevicesToQuota(transaction, deviceIds, deviceRef.id);
      const now = Date.now();
      transaction.update(deviceRef, { ...schedule, updatedAt: now });
      writePushRegistry(transaction, registrySnapshot, uid, deviceIds, now);
    });
    return { success: true };
  }
);

export const deleteThreadmapPushDevice = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, ['userId', 'docId'])) {
      throw new HttpsError('invalid-argument', 'The push removal request contains unsupported fields.');
    }
    const uid = requireExpectedUid(request, data);
    if (!validPushDeviceId(uid, data.docId)) {
      throw new HttpsError('invalid-argument', 'The push device ID is invalid.');
    }
    const deviceRef = db.doc(`fcmTokens/${data.docId}`);
    const registryRef = pushRegistryRef(uid);
    const tombstoneRef = accountDeletionRef(uid);
    await db.runTransaction(async (transaction) => {
      const [registrySnapshot, deviceSnapshot, tombstoneSnapshot] = await Promise.all([
        transaction.get(registryRef),
        transaction.get(deviceRef),
        transaction.get(tombstoneRef),
      ]);
      assertAccountActiveSnapshot(tombstoneSnapshot);
      if (deviceSnapshot.exists && deviceSnapshot.data()?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Push device not found.');
      }
      let deviceIds = await loadPushRegistryIds(transaction, uid);
      deviceIds = deviceIds.filter((deviceId) => deviceId !== deviceRef.id);
      if (deviceIds.length > MAX_PUSH_DEVICES_PER_ACCOUNT) {
        const retained = deviceIds.slice(0, MAX_PUSH_DEVICES_PER_ACCOUNT);
        const retainedSet = new Set(retained);
        for (const deviceId of deviceIds) {
          if (!retainedSet.has(deviceId)) transaction.delete(db.doc(`fcmTokens/${deviceId}`));
        }
        deviceIds = retained;
      }
      transaction.delete(deviceRef);
      writePushRegistry(transaction, registrySnapshot, uid, deviceIds, Date.now());
    });
    return { success: true };
  }
);

function sharedSecretMatches(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return providedBytes.length === expectedBytes.length &&
    providedBytes.length > 0 &&
    timingSafeEqual(providedBytes, expectedBytes);
}

export const consumeThreadmapScrapeQuota = onRequest(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [scrapeRateLimitSharedSecret],
  },
  async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (request.method !== 'POST') {
      response.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const configuredSecret = scrapeRateLimitSharedSecret.value();
    const providedSecret = request.get('x-threadmap-scrape-secret') || '';
    if (!configuredSecret || !sharedSecretMatches(providedSecret, configuredSecret)) {
      response.status(403).json({ error: 'forbidden' });
      return;
    }

    if (ENFORCE_APP_CHECK) {
      const appCheckToken = request.get('x-firebase-appcheck') || '';
      if (!/^[A-Za-z0-9._-]{20,8192}$/.test(appCheckToken)) {
        response.status(401).json({ error: 'invalid_app_check' });
        return;
      }
      try {
        await adminAppCheck.verifyToken(appCheckToken);
      } catch {
        response.status(401).json({ error: 'invalid_app_check' });
        return;
      }
    }

    const authorization = request.get('authorization') || '';
    const bearerMatch = /^Bearer ([A-Za-z0-9._-]{20,8192})$/.exec(authorization);
    if (!bearerMatch) {
      response.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'unauthorized' });
      return;
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(bearerMatch[1]);
    } catch {
      response.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!privateOwnerAuthorized(decodedToken)) {
      response.status(403).json({ error: 'forbidden' });
      return;
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !hasOnlyKeys(body as Record<string, unknown>, ['userId', 'ipHash'])) {
      response.status(400).json({ error: 'invalid_request' });
      return;
    }
    const userId = (body as Record<string, unknown>).userId;
    const ipHash = (body as Record<string, unknown>).ipHash;
    if (typeof userId !== 'string' || userId !== decodedToken.uid) {
      response.status(403).json({ error: 'account_mismatch' });
      return;
    }
    if (typeof ipHash !== 'string' || !/^[a-f0-9]{64}$/.test(ipHash)) {
      response.status(400).json({ error: 'invalid_ip_identifier' });
      return;
    }

    const now = Date.now();
    const windowStart = Math.floor(now / SCRAPE_RATE_WINDOW_MS) * SCRAPE_RATE_WINDOW_MS;
    const windowEnd = windowStart + SCRAPE_RATE_WINDOW_MS;
    const uidHash = createHash('sha256').update(userId).digest('hex');
    const uidRef = db.doc(`scrapeRateLimits/uid_${uidHash}`);
    const ipRef = db.doc(`scrapeRateLimits/ip_${ipHash}`);
    const tombstoneRef = accountDeletionRef(userId);
    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const [uidSnapshot, ipSnapshot, tombstoneSnapshot] = await Promise.all([
          transaction.get(uidRef),
          transaction.get(ipRef),
          transaction.get(tombstoneRef),
        ]);
        if (tombstoneSnapshot.exists) return 'account-deleting' as const;
        const windowCount = (
          snapshot: FirebaseFirestore.DocumentSnapshot,
          expectedWindow: number
        ) => {
          if (Number(snapshot.data()?.windowStart) !== expectedWindow) return 0;
          const count = Number(snapshot.data()?.count);
          return Number.isInteger(count) && count >= 0 ? count : 0;
        };
        const uidCount = windowCount(uidSnapshot, windowStart);
        const ipCount = windowCount(ipSnapshot, windowStart);
        if (uidCount >= SCRAPE_UID_LIMIT || ipCount >= SCRAPE_IP_LIMIT) {
          return 'rate-limited' as const;
        }

        const sharedFields = {
          windowStart,
          windowEnd,
          updatedAt: now,
          expireAt: Timestamp.fromMillis(
            scrapeQuotaExpireAtMillis(windowEnd, SCRAPE_RATE_WINDOW_MS)
          ),
        };
        transaction.set(uidRef, {
          ...sharedFields,
          kind: 'uid',
          subjectHash: uidHash,
          count: uidCount + 1,
        });
        transaction.set(ipRef, {
          ...sharedFields,
          kind: 'ip',
          subjectHash: ipHash,
          count: ipCount + 1,
        });
        return 'allowed' as const;
      });
      if (outcome === 'account-deleting') {
        response.status(403).json({ error: 'account_unavailable' });
        return;
      }
      if (outcome === 'rate-limited') {
        const retryAfter = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
        response.set('Retry-After', String(retryAfter)).status(429).json({
          error: 'rate_limit_exceeded',
          retryAfter,
        });
        return;
      }
      response.status(204).end();
    } catch (error) {
      console.error('[THREADMAP] Shared scrape quota check failed:', error);
      response.status(503).json({ error: 'quota_unavailable' });
    }
  }
);

async function queryAll(
  query: FirebaseFirestore.Query,
  maximum = Number.POSITIVE_INFINITY,
  acceptPage?: (documents: readonly FirebaseFirestore.QueryDocumentSnapshot[]) => void,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const results: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    const remaining = maximum - results.length;
    const pageSize = Number.isFinite(maximum)
      ? Math.min(400, Math.max(1, remaining + 1))
      : 400;
    let pageQuery = query.limit(pageSize);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const snapshot = await pageQuery.get();
    if (results.length + snapshot.size > maximum) {
      throw new HttpsError(
        'resource-exhausted',
        'This account is too large for the single-file export endpoint. Contact support for a paged export.'
      );
    }
    // Export callers use this hook to enforce the response-byte budget before
    // retaining another page in memory. Other queryAll users remain unchanged.
    acceptPage?.(snapshot.docs);
    results.push(...snapshot.docs);
    if (snapshot.size < pageSize) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return results;
}

/**
 * Parent eligibility depends on the parent document's type and lifecycle.
 * Security rules validate every new child assignment; this trigger repairs
 * existing children if a project/goal is later converted or archived.
 */
async function repairThreadmapHierarchy(
  event: FirestoreEvent<
    Change<FirebaseFirestore.QueryDocumentSnapshot> | undefined,
    { itemId: string }
  >,
): Promise<void> {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after
        || (before.type === after.type && before.status === after.status)) {
      return;
    }
    const parentId = event.params.itemId;
    const uid = typeof after.userId === 'string' ? after.userId : '';
    if (!uid) return;
    const children = await queryAll(db.collection('items').where('parentId', '==', parentId));
    for (let index = 0; index < children.length; index += 20) {
      await Promise.all(children.slice(index, index + 20).map(async (candidate) => {
        await db.runTransaction(async (transaction) => {
          const [child, parent] = await Promise.all([
            transaction.get(candidate.ref),
            transaction.get(db.doc(`items/${parentId}`)),
          ]);
          if (!child.exists || child.data()?.userId !== uid || child.data()?.parentId !== parentId) return;
          if (parent.exists
              && parent.data()?.userId === uid
              && allowedHierarchyParent(child.data()?.type, parent.data()?.type, parent.data()?.status)) {
            return;
          }
          transaction.update(child.ref, {
            parentId: FieldValue.delete(),
            updatedAt: Date.now(),
            revision: Number(child.data()?.revision || 0) + 1,
          });
        });
      }));
    }
}

export const repairThreadmapHierarchyEu = onDocumentUpdated(
  {
    document: 'items/{itemId}',
    region: FUNCTION_REGION,
    retry: true,
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  repairThreadmapHierarchy,
);

async function ownedDocuments(uid: string) {
  let remaining = ACCOUNT_EXPORT_MAX_DOCUMENTS;
  let serializedBytes = ACCOUNT_EXPORT_RESPONSE_OVERHEAD_BYTES;
  const consumeSerializedPage = (
    documents: readonly FirebaseFirestore.QueryDocumentSnapshot[],
  ) => {
    for (const document of documents) {
      const incoming = accountExportSerializedByteLength(plainData(document));
      if (!accountExportSerializedBytesAllowed(serializedBytes, incoming)) {
        throw new HttpsError(
          'resource-exhausted',
          'This account exceeds the single-response export size limit. Contact support for a paged export.'
        );
      }
      serializedBytes += incoming;
    }
  };
  const collect = async (query: FirebaseFirestore.Query) => {
    const documents = await queryAll(query, remaining, consumeSerializedPage);
    remaining -= documents.length;
    return documents;
  };

  // Inventory sequentially so the aggregate export bound is enforced before
  // the next collection is materialized. This keeps the access endpoint
  // explicit about its single-response limitation while deletion remains
  // independently incremental and unbounded over repeated attempts.
  const items = await collect(db.collection('items').where('userId', '==', uid));
  const toolData = await collect(db.collection('toolData').where('userId', '==', uid));
  const legacyFlightLogs = await db.doc(`toolData/${uid}_flightLogs`).get();
  const analytics = await collect(db.collection('analytics').where('userId', '==', uid));
  const flightLogs = await collect(db.collection('flightLogs').where('userId', '==', uid));
  const tokens = await collect(db.collection('fcmTokens').where('userId', '==', uid));
  const connections = await collect(db.collection('connections').where('users', 'array-contains', uid));
  const nudgesFrom = await collect(db.collection('nudges').where('from', '==', uid));
  const nudgesTo = await collect(db.collection('nudges').where('to', '==', uid));
  const deletionJobs = await collect(db.collection('deletionJobs').where('userId', '==', uid));
  const uploadIntents = await collect(db.collection('attachmentUploadIntents').where('userId', '==', uid));
  const uploadRegistries = await collect(db.collection('attachmentUploadRegistries').where('userId', '==', uid));
  const recoveryCodes = await collect(db.collection('mfaRecoveryCodes').where('uid', '==', uid));
  const recoveryAudits = await collect(db.collection('mfaRecoveryAudits').where('uid', '==', uid));
  const mcpAuthorizationRequests = await collect(db.collection('mcpOAuthAuthorizationRequests').where('userId', '==', uid));
  const mcpAuthorizationCodes = await collect(db.collection('mcpOAuthAuthorizationCodes').where('userId', '==', uid));
  const mcpAccessTokens = await collect(db.collection('mcpOAuthAccessTokens').where('userId', '==', uid));
  const mcpRefreshTokens = await collect(db.collection('mcpOAuthRefreshTokens').where('userId', '==', uid));
  const mcpTokenFamilies = await collect(db.collection('mcpOAuthTokenFamilies').where('userId', '==', uid));
  const mcpUserGrants = await collect(db.collection('mcpOAuthUserGrants').where('userId', '==', uid));
  const mcpIdempotency = await collect(db.collection('mcpIdempotency').where('userId', '==', uid));
  const mcpDeleteConfirmations = await collect(db.collection('mcpDeleteConfirmations').where('userId', '==', uid));
  const mcpRateLimits = await collect(db.collection('mcpRateLimits').where('userId', '==', uid));
  const mcpAuditLogs = await collect(db.collection('mcpAuditLogs').where('userId', '==', uid));
  const allToolData: FirebaseFirestore.DocumentSnapshot[] = [...toolData];
  if (legacyFlightLogs.exists && !allToolData.some((entry) => entry.id === legacyFlightLogs.id)) {
    if (remaining <= 0) {
      throw new HttpsError(
        'resource-exhausted',
        'This account is too large for the single-file export endpoint. Contact support for a paged export.'
      );
    }
    const incoming = accountExportSerializedByteLength(plainData(legacyFlightLogs));
    if (!accountExportSerializedBytesAllowed(serializedBytes, incoming)) {
      throw new HttpsError(
        'resource-exhausted',
        'This account exceeds the single-response export size limit. Contact support for a paged export.'
      );
    }
    serializedBytes += incoming;
    remaining -= 1;
    allToolData.push(legacyFlightLogs);
  }
  const nudges = [...new Map([...nudgesFrom, ...nudgesTo].map((entry) => [entry.ref.path, entry])).values()];
  return {
    items,
    toolData: allToolData,
    analytics,
    flightLogs,
    tokens,
    connections,
    nudges,
    deletionJobs,
    uploadIntents,
    uploadRegistries,
    recoveryCodes,
    recoveryAudits,
    mcpAuthorizationRequests,
    mcpAuthorizationCodes,
    mcpAccessTokens,
    mcpRefreshTokens,
    mcpTokenFamilies,
    mcpUserGrants,
    mcpIdempotency,
    mcpDeleteConfirmations,
    mcpRateLimits,
    mcpAuditLogs,
    serializedBytes,
  };
}

function ownedDocumentDeletionQueries(uid: string): FirebaseFirestore.Query[] {
  return [
    db.collection('items').where('userId', '==', uid),
    db.collection('toolData').where('userId', '==', uid),
    db.collection('analytics').where('userId', '==', uid),
    db.collection('flightLogs').where('userId', '==', uid),
    db.collection('fcmTokens').where('userId', '==', uid),
    db.collection('connections').where('users', 'array-contains', uid),
    db.collection('nudges').where('from', '==', uid),
    db.collection('nudges').where('to', '==', uid),
    db.collection('deletionJobs').where('userId', '==', uid),
    db.collection('attachmentUploadIntents').where('userId', '==', uid),
    db.collection('attachmentUploadRegistries').where('userId', '==', uid),
    db.collection('mfaRecoveryCodes').where('uid', '==', uid),
    db.collection('mfaRecoveryAudits').where('uid', '==', uid),
    db.collection('mcpOAuthAuthorizationRequests').where('userId', '==', uid),
    db.collection('mcpOAuthAuthorizationCodes').where('userId', '==', uid),
    db.collection('mcpOAuthAccessTokens').where('userId', '==', uid),
    db.collection('mcpOAuthRefreshTokens').where('userId', '==', uid),
    db.collection('mcpOAuthTokenFamilies').where('userId', '==', uid),
    db.collection('mcpOAuthUserGrants').where('userId', '==', uid),
    db.collection('mcpIdempotency').where('userId', '==', uid),
    db.collection('mcpDeleteConfirmations').where('userId', '==', uid),
    db.collection('mcpRateLimits').where('userId', '==', uid),
    db.collection('mcpAuditLogs').where('userId', '==', uid),
    db.collection('googleWorkspaceOAuthStates').where('userId', '==', uid),
  ];
}

async function deleteOwnedDocumentsIncrementally(
  uid: string,
  jobRef: FirebaseFirestore.DocumentReference,
): Promise<{ deleted: number; hasMore: boolean }> {
  let deleted = 0;
  for (const query of ownedDocumentDeletionQueries(uid)) {
    while (deleted < ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT) {
      const pageSize = accountDeletionPageSize(deleted);
      const snapshot = await query.limit(pageSize).get();
      if (snapshot.empty) break;

      const writer = db.bulkWriter();
      let pageDeleted = 0;
      for (const document of snapshot.docs) {
        // Keep the durable deletion barrier out of every generic inventory,
        // even if a future schema change causes a query to include it.
        if (document.ref.path === jobRef.path) continue;
        writer.delete(document.ref);
        pageDeleted += 1;
      }
      await writer.close();
      deleted += pageDeleted;

      const decision = accountDeletionSweepDecision({
        deleted,
        requestedPageSize: pageSize,
        returnedDocuments: snapshot.size,
        deletedDocuments: pageDeleted,
      });
      if (decision === 'stalled') {
        throw new Error('Account deletion inventory made no progress.');
      }
      if (decision === 'query-drained') break;
      if (decision === 'attempt-budget-exhausted') {
        return { deleted, hasMore: true };
      }
    }
    if (deleted >= ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT) {
      // Conservatively continue on another invocation even if the final page
      // happened to drain its query exactly at the budget boundary.
      return { deleted, hasMore: true };
    }
  }
  return { deleted, hasMore: false };
}

function plainData(snapshot: FirebaseFirestore.DocumentSnapshot) {
  return { id: snapshot.id, ...JSON.parse(JSON.stringify(snapshot.data() || {})) };
}

interface DeletionJobData {
  userId: string;
  itemId: string;
  storagePaths: string[];
  createdAt: number;
  attempts?: number;
  nextAttemptAt?: number;
  kind?: 'deletion' | 'upload-intent';
  expiresAt?: number;
  cleanupUntil?: number;
  cleanupClaimedAt?: number;
  uploadIntentId?: string;
  uploadRegistryId?: string;
  registryReleasedAt?: number;
  file?: {
    id: string;
    name: string;
    size: number;
    type: string;
    storagePath: string;
    uploadedAt: number;
    uploadedBy: string;
  };
}

async function cleanupDeletionJob(
  ref: FirebaseFirestore.DocumentReference,
  data: DeletionJobData,
  forceUploadIntent = false,
): Promise<boolean> {
  if (data.kind === 'upload-intent') {
    const disposition = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (!current.exists) return 'missing' as const;
      const currentData = current.data() as DeletionJobData;
      if (currentData.kind !== 'upload-intent' || currentData.userId !== data.userId) {
        return 'wait' as const;
      }
      const [item, registry] = await Promise.all([
        transaction.get(db.doc(`items/${currentData.itemId}`)),
        currentData.uploadRegistryId
          ? transaction.get(db.doc(`attachmentUploadRegistries/${currentData.uploadRegistryId}`))
          : Promise.resolve(null),
      ]);
      const attached = item.exists
        && item.data()?.userId === currentData.userId
        && Array.isArray(item.data()?.files)
        && item.data()!.files.some((candidate: Record<string, unknown>) =>
          currentData.storagePaths.includes(String(candidate?.storagePath || ''))
        );
      if (attached) {
        transaction.delete(ref);
        if (currentData.uploadIntentId) {
          transaction.delete(db.doc(`attachmentUploadIntents/${currentData.uploadIntentId}`));
        }
        if (shouldReleaseUploadRegistry(currentData.registryReleasedAt) && registry?.exists) {
          transaction.update(registry.ref, {
            activeCount: Math.max(0, Number(registry.data()?.activeCount || 0) - 1),
            reservedBytes: Math.max(0, Number(registry.data()?.reservedBytes || 0) - Number(currentData.file?.size || 0)),
            updatedAt: Date.now(),
          });
        }
        return 'preserved' as const;
      }
      const now = Date.now();
      const decision = decideUploadCleanup({
        now,
        createdAt: currentData.createdAt,
        intentExpiresAt: Number(currentData.expiresAt || 0),
        cleanupUntil: currentData.cleanupUntil,
        forceIntentExpiry: forceUploadIntent,
      });
      if (decision.phase === 'wait-for-intent') return 'wait' as const;

      const releaseRegistry = shouldReleaseUploadRegistry(currentData.registryReleasedAt);
      transaction.set(ref, {
        cleanupClaimedAt: Number(currentData.cleanupClaimedAt || now),
        cleanupUntil: decision.cleanupUntil,
        nextAttemptAt: decision.nextAttemptAt,
        ...(releaseRegistry ? { registryReleasedAt: now } : {}),
      }, { merge: true });
      if (currentData.uploadIntentId) {
        transaction.delete(db.doc(`attachmentUploadIntents/${currentData.uploadIntentId}`));
      }
      if (releaseRegistry && registry?.exists) {
        transaction.update(registry.ref, {
          activeCount: Math.max(0, Number(registry.data()?.activeCount || 0) - 1),
          reservedBytes: Math.max(0, Number(registry.data()?.reservedBytes || 0) - Number(currentData.file?.size || 0)),
          updatedAt: now,
        });
      }
      data = {
        ...currentData,
        cleanupClaimedAt: Number(currentData.cleanupClaimedAt || now),
        cleanupUntil: decision.cleanupUntil,
        nextAttemptAt: decision.nextAttemptAt,
        ...(releaseRegistry ? { registryReleasedAt: now } : {}),
      };
      return 'sweep' as const;
    });
    if (disposition === 'missing' || disposition === 'preserved') return true;
    if (disposition === 'wait') return false;
  }
  const bucket = storage.bucket();
  const results = await Promise.allSettled(
    data.storagePaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true }))
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length === 0) {
    if (data.kind === 'upload-intent') {
      const decision = decideUploadCleanup({
        now: Date.now(),
        createdAt: data.createdAt,
        intentExpiresAt: Number(data.expiresAt || 0),
        cleanupUntil: data.cleanupUntil,
        forceIntentExpiry: true,
      });
      if (decision.phase === 'sweep-and-retain') {
        const finalization = await mergeAccountOwnedDocumentIfActive(db, data.userId, ref, {
          cleanupUntil: decision.cleanupUntil,
          nextAttemptAt: decision.nextAttemptAt,
          lastAttemptAt: Date.now(),
          lastError: FieldValue.delete(),
        });
        // A tombstone means the account-prefix cleanup barrier supersedes this
        // exact-path job. A missing job must never be recreated after I/O.
        return finalization === 'blocked' || finalization === 'missing';
      }
    }
    const batch = db.batch();
    batch.delete(ref);
    if (data.uploadIntentId) batch.delete(db.doc(`attachmentUploadIntents/${data.uploadIntentId}`));
    await batch.commit();
    return true;
  }
  const finalization = await mergeAccountOwnedDocumentIfActive(db, data.userId, ref, {
    attempts: FieldValue.increment(1),
    lastAttemptAt: Date.now(),
    nextAttemptAt: data.kind === 'upload-intent'
      ? decideUploadCleanup({
          now: Date.now(),
          createdAt: data.createdAt,
          intentExpiresAt: Number(data.expiresAt || 0),
          cleanupUntil: data.cleanupUntil,
          forceIntentExpiry: true,
        }).nextAttemptAt
      : Date.now() + Math.min(
          24 * 60 * 60_000,
          (2 ** Math.min(Number(data.attempts || 0) + 1, 8)) * 5 * 60_000
        ),
    lastError: `${failures.length} attachment cleanup operation(s) failed.`,
  });
  return finalization === 'blocked' || finalization === 'missing';
}

function uploadJobRef(uid: string, itemId: string, storagePath: string) {
  const pathHash = createHash('sha256').update(storagePath).digest('hex').slice(0, 32);
  return db.doc(`deletionJobs/upload_${uid}_${itemId}_${pathHash}`);
}

function uploadRegistryId(uid: string, itemId: string): string {
  return createHash('sha256').update(`${uid}\0${itemId}`).digest('hex');
}

async function deleteItemForMcp(input: {
  userId: string;
  itemId: string;
  expectedRevision: number;
}): Promise<{ deleted: boolean; cleanupPending: boolean }> {
  const { userId: uid, itemId, expectedRevision } = input;
  const itemRef = db.doc(`items/${itemId}`);
  const jobRef = db.doc(`deletionJobs/item_${uid}_${itemId}`);
  let job: DeletionJobData | null = null;
  await db.runTransaction(async (transaction) => {
    const [itemSnapshot, existingJob, deletionSnapshot] = await Promise.all([
      transaction.get(itemRef),
      transaction.get(jobRef),
      transaction.get(accountDeletionRef(uid)),
    ]);
    assertAccountActiveSnapshot(deletionSnapshot);
    if (!itemSnapshot.exists) {
      if (existingJob.exists && existingJob.data()?.userId === uid) {
        job = existingJob.data() as DeletionJobData;
      }
      return;
    }
    const item = itemSnapshot.data() || {};
    if (item.userId !== uid) throw new HttpsError('not-found', 'Item not found.');
    if (Number(item.revision || 0) !== expectedRevision) {
      throw new HttpsError('aborted', 'The item changed before deletion completed.');
    }
    const [linkedSnapshot, childSnapshot] = await Promise.all([
      transaction.get(db.collection('items').where('linkedIds', 'array-contains', itemId)),
      transaction.get(db.collection('items').where('parentId', '==', itemId)),
    ]);
    const references = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const snapshot of [...linkedSnapshot.docs, ...childSnapshot.docs]) {
      if (snapshot.id !== itemId && snapshot.data().userId === uid) {
        references.set(snapshot.id, snapshot);
      }
    }
    if (references.size > 498) {
      throw new HttpsError('failed-precondition', 'This item has too many relationships to delete safely.');
    }
    const now = Date.now();
    job = {
      userId: uid,
      itemId,
      storagePaths: safeAttachmentPaths(uid, itemId, item.files),
      createdAt: existingJob.exists ? Number(existingJob.data()?.createdAt || now) : now,
      attempts: Number(existingJob.data()?.attempts || 0),
      nextAttemptAt: 0,
    };
    transaction.set(jobRef, job, { merge: true });
    transaction.delete(itemRef);
    for (const snapshot of references.values()) {
      const related = snapshot.data();
      const updates: Record<string, unknown> = {
        updatedAt: now,
        revision: Number(related.revision || 0) + 1,
      };
      if (Array.isArray(related.linkedIds) && related.linkedIds.includes(itemId)) {
        updates.linkedIds = FieldValue.arrayRemove(itemId);
      }
      if (related.parentId === itemId) updates.parentId = FieldValue.delete();
      transaction.update(snapshot.ref, updates);
    }
  });
  if (!job) return { deleted: true, cleanupPending: false };
  const cleaned = await cleanupDeletionJob(jobRef, job);
  return { deleted: true, cleanupPending: !cleaned };
}

export const deleteThreadmapItem = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 120,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, [
      'userId',
      'itemId',
      'expectedRevision',
      'expectedUpdatedAt',
      'calendarDeleted',
      'expectedGoogleCalendarId',
    ])) {
      throw new HttpsError('invalid-argument', 'The item deletion request contains unsupported fields.');
    }
    const uid = requireExpectedUid(request, data);
    const itemId = typeof data.itemId === 'string' ? data.itemId : '';
    if (!itemId || itemId.length > 200 || itemId.includes('/')) {
      throw new HttpsError('invalid-argument', 'A valid item ID is required.');
    }
    const expectedRevision = Number(data.expectedRevision);
    const expectedUpdatedAt = Number(data.expectedUpdatedAt);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
        || !Number.isSafeInteger(expectedUpdatedAt) || expectedUpdatedAt < 0
        || typeof data.calendarDeleted !== 'boolean'
        || !(data.expectedGoogleCalendarId === null || typeof data.expectedGoogleCalendarId === 'string')) {
      throw new HttpsError('invalid-argument', 'The item deletion precondition is invalid.');
    }

    const itemRef = db.doc(`items/${itemId}`);
    const jobRef = db.doc(`deletionJobs/item_${uid}_${itemId}`);
    let job: DeletionJobData | null = null;
    let itemDeleted = false;
    let revisionConflict = false;
    let calendarDetached = false;
    await db.runTransaction(async (transaction) => {
      const [itemSnapshot, existingJob, deletionSnapshot] = await Promise.all([
        transaction.get(itemRef),
        transaction.get(jobRef),
        transaction.get(accountDeletionRef(uid)),
      ]);
      assertAccountActiveSnapshot(deletionSnapshot);
      if (!itemSnapshot.exists) {
        if (existingJob.exists && existingJob.data()?.userId === uid) {
          job = existingJob.data() as DeletionJobData;
        }
        return;
      }
      const item = itemSnapshot.data() || {};
      if (item.userId !== uid) throw new HttpsError('permission-denied', 'Item not found.');
      const currentRevision = Number(item.revision || 0);
      if (currentRevision !== expectedRevision
          || (expectedRevision === 0 && Number(item.updatedAt || 0) !== expectedUpdatedAt)) {
        revisionConflict = true;
        if (data.calendarDeleted === true
            && typeof data.expectedGoogleCalendarId === 'string'
            && item.googleCalendarId === data.expectedGoogleCalendarId) {
          transaction.update(itemRef, {
            googleCalendarId: FieldValue.delete(),
            googleCalendarOrigin: true,
            calendarSynced: false,
            updatedAt: Date.now(),
            revision: currentRevision + 1,
          });
          calendarDetached = true;
        }
        return;
      }

      const [linkedSnapshot, childSnapshot] = await Promise.all([
        transaction.get(db.collection('items').where('linkedIds', 'array-contains', itemId)),
        transaction.get(db.collection('items').where('parentId', '==', itemId)),
      ]);
      const references = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const snapshot of [...linkedSnapshot.docs, ...childSnapshot.docs]) {
        if (snapshot.id !== itemId && snapshot.data().userId === uid) references.set(snapshot.id, snapshot);
      }
      if (references.size > 498) {
        throw new HttpsError('failed-precondition', 'This item has too many relationships to delete safely.');
      }

      const now = Date.now();
      job = {
        userId: uid,
        itemId,
        storagePaths: safeAttachmentPaths(uid, itemId, item.files),
        createdAt: existingJob.exists ? Number(existingJob.data()?.createdAt || now) : now,
        attempts: Number(existingJob.data()?.attempts || 0),
        nextAttemptAt: 0,
      };
      transaction.set(jobRef, job, { merge: true });
      transaction.delete(itemRef);
      for (const snapshot of references.values()) {
        const data = snapshot.data();
        const updates: Record<string, unknown> = {
          updatedAt: now,
          revision: Number(data.revision || 0) + 1,
        };
        if (Array.isArray(data.linkedIds) && data.linkedIds.includes(itemId)) {
          updates.linkedIds = FieldValue.arrayRemove(itemId);
        }
        if (data.parentId === itemId) updates.parentId = FieldValue.delete();
        transaction.update(snapshot.ref, updates);
      }
      itemDeleted = true;
    });

    if (revisionConflict) {
      return {
        success: false,
        conflict: true,
        calendarDetached,
        cleanupPending: false,
        itemDeleted: false,
      };
    }

    if (!job) return { success: true, cleanupPending: false };

    const cleaned = await cleanupDeletionJob(jobRef, job);
    return { success: true, cleanupPending: !cleaned, itemDeleted };
  }
);

export const deleteThreadmapAttachment = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 120,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const uid = requireUid(request);
    const itemId = typeof request.data?.itemId === 'string' ? request.data.itemId : '';
    const fileId = typeof request.data?.fileId === 'string' ? request.data.fileId : '';
    if (!itemId || !fileId || itemId.length > 200 || fileId.length > 200 || itemId.includes('/') || fileId.includes('/')) {
      throw new HttpsError('invalid-argument', 'Valid item and file IDs are required.');
    }
    const itemRef = db.doc(`items/${itemId}`);
    const jobRef = db.doc(`deletionJobs/file_${uid}_${itemId}_${fileId}`);
    let job: DeletionJobData | null = null;
    let alreadyRemoved = false;
    let committedUpdatedAt: number | null = null;
    let committedRevision: number | null = null;
    await db.runTransaction(async (transaction) => {
      // Keep the metadata read, filtered update, and cleanup-job creation in one
      // retrying transaction so concurrent uploads/deletions cannot be lost.
      const [itemSnapshot, existingJob, deletionSnapshot] = await Promise.all([
        transaction.get(itemRef),
        transaction.get(jobRef),
        transaction.get(accountDeletionRef(uid)),
      ]);
      assertAccountActiveSnapshot(deletionSnapshot);
      if (!itemSnapshot.exists) {
        if (existingJob.exists && existingJob.data()?.userId === uid) {
          job = existingJob.data() as DeletionJobData;
          return;
        }
        throw new HttpsError('not-found', 'Project file was not found.');
      }

      const item = itemSnapshot.data() || {};
      if (item.userId !== uid) throw new HttpsError('permission-denied', 'Project file was not found.');
      const files = Array.isArray(item.files) ? item.files : [];
      const file = files.find((candidate: Record<string, unknown>) => candidate?.id === fileId);
      if (!file) {
        if (existingJob.exists && existingJob.data()?.userId === uid) {
          job = existingJob.data() as DeletionJobData;
        } else {
          alreadyRemoved = true;
        }
        return;
      }

      const now = Date.now();
      committedUpdatedAt = now;
      committedRevision = Number(item.revision || 0) + 1;
      job = {
        userId: uid,
        itemId,
        storagePaths: safeAttachmentPaths(uid, itemId, [file]),
        createdAt: Number(existingJob.data()?.createdAt || now),
        attempts: Number(existingJob.data()?.attempts || 0),
        nextAttemptAt: 0,
      };
      transaction.update(itemRef, {
        files: files.filter((candidate: Record<string, unknown>) => candidate?.id !== fileId),
        updatedAt: now,
        revision: committedRevision,
      });
      transaction.set(jobRef, job, { merge: true });
    });

    if (alreadyRemoved || !job) {
      return { success: true, cleanupPending: false, updatedAt: committedUpdatedAt, revision: committedRevision };
    }
    const cleaned = await cleanupDeletionJob(jobRef, job);
    return {
      success: true,
      cleanupPending: !cleaned,
      updatedAt: committedUpdatedAt,
      revision: committedRevision,
    };
  }
);

/** Reserve an immutable object path and durable orphan-cleanup intent before upload. */
export const beginThreadmapUpload = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 30,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const uid = requireUid(request);
    await assertAccountActive(uid);
    const uploadOrigin = request.rawRequest.get('origin') || '';
    let configuredAppOrigin: string;
    try {
      configuredAppOrigin = resolveThreadmapAppOrigin();
    } catch {
      throw new HttpsError('unavailable', 'Attachment uploads are not configured for this environment.');
    }
    if (!attachmentUploadOriginAllowed(
      uploadOrigin,
      configuredAppOrigin,
      process.env.FUNCTIONS_EMULATOR === 'true',
    )) {
      throw new HttpsError('permission-denied', 'Uploads must start from an approved Threadmap origin.');
    }
    const itemId = typeof request.data?.itemId === 'string' ? request.data.itemId : '';
    const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
    const size = Number(request.data?.size);
    const type = typeof request.data?.type === 'string' ? request.data.type : '';
    if (!itemId || itemId.length > 200 || itemId.includes('/') || !name || name.length > 255) {
      throw new HttpsError('invalid-argument', 'Valid item and file names are required.');
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
      throw new HttpsError('invalid-argument', 'The file size is invalid or exceeds 10 MB.');
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(type)) {
      throw new HttpsError('invalid-argument', 'This file type is not allowed.');
    }
    const itemRef = db.doc(`items/${itemId}`);
    const item = await itemRef.get();
    if (!item.exists || item.data()?.userId !== uid) {
      throw new HttpsError('permission-denied', 'Item not found.');
    }
    const existingFiles = Array.isArray(item.data()?.files) ? item.data()!.files : [];
    if (existingFiles.length >= 50) {
      throw new HttpsError('failed-precondition', 'This project already has 50 files.');
    }

    const uploadedAt = Date.now();
    const fileId = randomUUID();
    const safeName = name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(-160) || 'attachment';
    const storagePath = `users/${uid}/projects/${itemId}/${fileId}/${safeName}`;
    const file = {
      id: fileId,
      name,
      size,
      type,
      storagePath,
      uploadedAt,
      uploadedBy: uid,
    };
    const expiresAt = uploadedAt + UPLOAD_INTENT_TTL_MS;
    const uploadJob = uploadJobRef(uid, itemId, storagePath);
    const intentRef = db.doc(`attachmentUploadIntents/${fileId}`);
    const registryId = uploadRegistryId(uid, itemId);
    const registryRef = db.doc(`attachmentUploadRegistries/${registryId}`);
    const uploadJobData = {
      kind: 'upload-intent',
      userId: uid,
      itemId,
      storagePaths: [storagePath],
      uploadIntentId: fileId,
      uploadRegistryId: registryId,
      file,
      createdAt: uploadedAt,
      expiresAt,
      cleanupUntil: uploadedAt + RESUMABLE_UPLOAD_SESSION_RISK_MS,
      attempts: 0,
      nextAttemptAt: expiresAt,
    } satisfies DeletionJobData;
    await db.runTransaction(async (transaction) => {
      const [
        freshItem,
        existingJob,
        existingIntent,
        registrySnapshot,
        deletionSnapshot,
      ] = await Promise.all([
        transaction.get(itemRef),
        transaction.get(uploadJob),
        transaction.get(intentRef),
        transaction.get(registryRef),
        transaction.get(accountDeletionRef(uid)),
      ]);
      assertAccountActiveSnapshot(deletionSnapshot);
      if (!freshItem.exists || freshItem.data()?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Item not found.');
      }
      const freshFiles = Array.isArray(freshItem.data()?.files) ? freshItem.data()!.files : [];
      if (freshFiles.length >= 50) {
        throw new HttpsError('failed-precondition', 'This project already has 50 files.');
      }
      if (existingJob.exists || existingIntent.exists) {
        throw new HttpsError('already-exists', 'Could not reserve a unique upload path.');
      }
      const registry = registrySnapshot.data() || {};
      const sameWindow = Number(registry.windowStartedAt || 0) > uploadedAt - UPLOAD_INTENT_WINDOW_MS;
      const windowRequests = sameWindow ? Number(registry.windowRequests || 0) : 0;
      const activeCount = Number(registry.activeCount || 0);
      const reservedBytes = Number(registry.reservedBytes || 0);
      if (windowRequests >= MAX_UPLOAD_INTENTS_PER_WINDOW) {
        throw new HttpsError('resource-exhausted', 'Too many uploads were started recently. Try again later.');
      }
      if (activeCount >= MAX_ACTIVE_UPLOAD_INTENTS
          || reservedBytes + size > MAX_RESERVED_UPLOAD_BYTES) {
        throw new HttpsError('resource-exhausted', 'Too many uploads are still unfinished.');
      }
      transaction.create(intentRef, {
        userId: uid,
        itemId,
        storagePath,
        size,
        type,
        expiresAt: Timestamp.fromMillis(expiresAt),
        createdAt: uploadedAt,
      });
      transaction.create(uploadJob, uploadJobData);
      transaction.set(registryRef, {
        userId: uid,
        itemId,
        activeCount: activeCount + 1,
        reservedBytes: reservedBytes + size,
        windowStartedAt: sameWindow ? Number(registry.windowStartedAt) : uploadedAt,
        windowRequests: windowRequests + 1,
        createdAt: Number(registry.createdAt || uploadedAt),
        updatedAt: uploadedAt,
      });
    });
    try {
      const [uploadUrl] = await storage.bucket().file(storagePath).createResumableUpload({
        origin: uploadOrigin,
        metadata: resumableUploadMetadata(size, type, fileId),
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      return { file, expiresAt, uploadUrl };
    } catch {
      await cleanupDeletionJob(uploadJob, uploadJobData, true).catch(() => false);
      throw new HttpsError('unavailable', 'Cloud upload preparation failed. Please retry.');
    }
  },
);

/** Attach a completed upload and retire its orphan intent in one transaction. */
export const attachThreadmapUpload = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const uid = requireUid(request);
    const itemId = typeof request.data?.itemId === 'string' ? request.data.itemId : '';
    const storagePath = typeof request.data?.storagePath === 'string' ? request.data.storagePath : '';
    const expectedPrefix = `users/${uid}/projects/${itemId}/`;
    if (!itemId || itemId.length > 200 || itemId.includes('/')
        || !storagePath.startsWith(expectedPrefix) || storagePath.length === expectedPrefix.length) {
      throw new HttpsError('invalid-argument', 'A valid upload intent is required.');
    }
    const jobRef = uploadJobRef(uid, itemId, storagePath);
    const pathParts = storagePath.split('/');
    const uploadIntentId = pathParts.length === 6 ? pathParts[4] : '';
    if (!uploadIntentId || uploadIntentId.length > 200) {
      throw new HttpsError('invalid-argument', 'The upload path is not intent-scoped.');
    }
    const intentRef = db.doc(`attachmentUploadIntents/${uploadIntentId}`);
    const jobSnapshot = await jobRef.get();
    const job = jobSnapshot.data() as DeletionJobData | undefined;
    if (!jobSnapshot.exists || job?.kind !== 'upload-intent' || job.userId !== uid || !job.file) {
      throw new HttpsError('failed-precondition', 'The upload intent expired or is unavailable.');
    }
    const [objectMetadata] = await storage.bucket().file(storagePath).getMetadata();
    if (Number(objectMetadata.size) !== job.file.size || objectMetadata.contentType !== job.file.type) {
      throw new HttpsError('failed-precondition', 'The uploaded object does not match its intent.');
    }

    let updatedAt = Date.now();
    let revision = 0;
    await db.runTransaction(async (transaction) => {
      const registryRef = job?.uploadRegistryId
        ? db.doc(`attachmentUploadRegistries/${job.uploadRegistryId}`)
        : null;
      const [freshJob, freshIntent, item, registry, deletionSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(intentRef),
        transaction.get(db.doc(`items/${itemId}`)),
        registryRef ? transaction.get(registryRef) : Promise.resolve(null),
        transaction.get(accountDeletionRef(uid)),
      ]);
      assertAccountActiveSnapshot(deletionSnapshot);
      const fresh = freshJob.data() as DeletionJobData | undefined;
      const intent = freshIntent.data();
      if (!freshJob.exists || fresh?.kind !== 'upload-intent' || fresh.userId !== uid
          || fresh.uploadIntentId !== uploadIntentId || fresh.cleanupClaimedAt
          || fresh.file?.storagePath !== storagePath || !freshIntent.exists
          || intent?.userId !== uid || intent?.itemId !== itemId || intent?.storagePath !== storagePath) {
        throw new HttpsError('failed-precondition', 'The upload is already being cleaned up.');
      }
      if (!item.exists || item.data()?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Item not found.');
      }
      const files = Array.isArray(item.data()?.files) ? item.data()!.files : [];
      if (files.length >= 50 && !files.some((candidate: Record<string, unknown>) => candidate?.id === fresh.file?.id)) {
        throw new HttpsError('failed-precondition', 'This project already has 50 files.');
      }
      updatedAt = Date.now();
      revision = Number(item.data()?.revision || 0);
      if (!files.some((candidate: Record<string, unknown>) => candidate?.id === fresh.file?.id)) {
        revision += 1;
        transaction.update(item.ref, {
          files: [...files, fresh.file],
          updatedAt,
          revision,
        });
      } else {
        updatedAt = Number(item.data()?.updatedAt || updatedAt);
      }
      transaction.delete(jobRef);
      transaction.delete(intentRef);
      if (registry?.exists) {
        transaction.update(registry.ref, {
          activeCount: Math.max(0, Number(registry.data()?.activeCount || 0) - 1),
          reservedBytes: Math.max(0, Number(registry.data()?.reservedBytes || 0) - Number(fresh.file?.size || 0)),
          updatedAt,
        });
      }
    });
    return { success: true, file: job.file, updatedAt, revision };
  },
);

/** Compensate a completed upload that could not be attached to item metadata. */
export const cleanupThreadmapUpload = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 120,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const uid = requireUid(request);
    await assertAccountActive(uid);
    const itemId = typeof request.data?.itemId === 'string' ? request.data.itemId : '';
    const storagePath = typeof request.data?.storagePath === 'string' ? request.data.storagePath : '';
    if (!itemId || itemId.length > 200 || itemId.includes('/') || storagePath.length > 1200) {
      throw new HttpsError('invalid-argument', 'A valid item ID and upload path are required.');
    }
    const expectedPrefix = `users/${uid}/projects/${itemId}/`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath.length === expectedPrefix.length) {
      throw new HttpsError('permission-denied', 'Upload path does not belong to this account and item.');
    }

    const itemSnapshot = await db.doc(`items/${itemId}`).get();
    if (itemSnapshot.exists) {
      const item = itemSnapshot.data() || {};
      if (item.userId !== uid) throw new HttpsError('permission-denied', 'Item not found.');
      const files = Array.isArray(item.files) ? item.files : [];
      const isAttached = files.some((candidate: Record<string, unknown>) =>
        candidate?.storagePath === storagePath
      );
      if (isAttached) {
        throw new HttpsError('failed-precondition', 'An attached upload must use the attachment deletion workflow.');
      }
    }

    const jobRef = uploadJobRef(uid, itemId, storagePath);
    const now = Date.now();
    const job: DeletionJobData = {
      kind: 'upload-intent',
      userId: uid,
      itemId,
      storagePaths: [storagePath],
      createdAt: now,
      attempts: 0,
      nextAttemptAt: 0,
      expiresAt: now,
      uploadIntentId: storagePath.split('/').length === 6 ? storagePath.split('/')[4] : undefined,
    };
    await db.runTransaction(async (transaction) => {
      assertAccountActiveSnapshot(await transaction.get(accountDeletionRef(uid)));
      transaction.set(jobRef, job, { merge: true });
    });
    const cleaned = await cleanupDeletionJob(jobRef, job, true);
    return { success: true, cleanupPending: !cleaned };
  }
);

async function cleanupDeletedItemFiles(): Promise<void> {
  let processed = 0;
  while (processed < MAX_DELETION_JOBS_PER_RUN) {
    const pageSize = Math.min(50, MAX_DELETION_JOBS_PER_RUN - processed);
    const jobs = await db.collection('deletionJobs')
      .where('nextAttemptAt', '<=', Date.now())
      .orderBy('nextAttemptAt', 'asc')
      .limit(pageSize)
      .get();
    if (jobs.empty) break;
    for (let index = 0; index < jobs.docs.length; index += 10) {
      await Promise.all(jobs.docs.slice(index, index + 10).map(async (snapshot) => {
        await cleanupDeletionJob(snapshot.ref, snapshot.data() as DeletionJobData);
      }));
    }
    processed += jobs.size;
    if (jobs.size < pageSize) break;
  }
}

export const cleanupDeletedItemFilesEu = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    retryCount: 3,
    memory: '256MiB',
    region: FUNCTION_REGION,
  },
  cleanupDeletedItemFiles,
);

export const exportThreadmapAccount = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 120,
    memory: '512MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, ['userId'])) {
      throw new HttpsError('invalid-argument', 'The export request contains unsupported fields.');
    }
    const uid = requireExpectedUid(request, data);
    await assertAccountActive(uid);
    const [documents, authUser, profile, settings, recoverySet, googleWorkspaceConnection] = await Promise.all([
      ownedDocuments(uid),
      auth.getUser(uid),
      db.doc(`users/${uid}`).get(),
      db.doc(`userSettings/${uid}`).get(),
      db.doc(`mfaRecoverySets/${uid}`).get(),
      db.doc(`googleWorkspaceConnections/${uid}`).get(),
    ]);

    const fileMetadata: Array<Record<string, unknown> & { itemId: string }> = [];
    let attachmentBytes = 0;
    for (const item of documents.items) {
      const files = item.data().files;
      if (!Array.isArray(files)) continue;
      if (!accountExportAttachmentCountAllowed(fileMetadata.length, files.length)) {
        throw new HttpsError(
          'resource-exhausted',
          'This account has too many attachments for the single-file export endpoint. Contact support for a paged export.'
        );
      }
      for (const file of files) {
        if (file && typeof file === 'object' && !Array.isArray(file)) {
          const fileSize = Number((file as Record<string, unknown>).size);
          if (!accountExportAttachmentBytesAllowed(attachmentBytes, fileSize)) {
            throw new HttpsError(
              'resource-exhausted',
              `This account's attachments exceed the ${Math.floor(ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MiB single-file export limit or contain invalid size metadata. Contact support for a paged export.`
            );
          }
          attachmentBytes += fileSize;
          fileMetadata.push({ ...(file as Record<string, unknown>), itemId: item.id });
        }
      }
    }
    const bucket = storage.bucket();
    const files = await mapWithConcurrency(
      fileMetadata,
      ACCOUNT_EXPORT_STORAGE_CONCURRENCY,
      async (file) => {
      const storagePath = typeof file.storagePath === 'string' ? file.storagePath : null;
      if (!storagePath) return file;
      const itemId = typeof file.itemId === 'string' ? file.itemId : '';
      if (!itemId || !isSafeAttachmentPath(uid, itemId, storagePath)) {
        return { ...file, downloadUnavailable: 'unsafe-storage-path' };
      }
      try {
        const [exists] = await bucket.file(storagePath).exists();
        return exists ? file : { ...file, missingFromStorage: true };
      } catch {
        return { ...file, missingFromStorage: true };
      }
      },
    );

    // Export authorization metadata, never bearer-token/code/secret hashes or
    // internal document IDs. Legacy grants are reconstructed from token
    // families so the privacy export remains complete across schema versions.
    const mcpByClient = new Map<string, {
      status: 'active' | 'revoked';
      authorizedAt: number;
      lastAuthorizedAt: number;
      expiresAt?: number;
      scopes: Set<string>;
    }>();
    const mergeMcpMetadata = (value: Record<string, unknown>) => {
      const clientId = typeof value.clientId === 'string' ? value.clientId : '';
      if (!clientId) return;
      const existing = mcpByClient.get(clientId);
      const timestamp = Number(
        value.authorizedAt || value.createdAt || value.issuedAt || value.decidedAt || 0
      );
      const lastTimestamp = Number(
        value.lastAuthorizedAt || value.lastRotatedAt || value.issuedAt || timestamp
      );
      const scopes = new Set(existing?.scopes || []);
      if (Array.isArray(value.scopes)) {
        for (const scope of value.scopes) {
          if (typeof scope === 'string' && scope.length <= 100) scopes.add(scope);
        }
      }
      mcpByClient.set(clientId, {
        status: value.status === 'revoked' ? 'revoked' : (existing?.status ?? 'active'),
        authorizedAt: existing?.authorizedAt
          ? Math.min(existing.authorizedAt, timestamp || existing.authorizedAt)
          : timestamp,
        lastAuthorizedAt: Math.max(existing?.lastAuthorizedAt || 0, lastTimestamp),
        expiresAt: Math.max(existing?.expiresAt || 0, Number(value.expiresAt || 0)) || undefined,
        scopes,
      });
    };
    for (const snapshot of [
      ...documents.mcpTokenFamilies,
      ...documents.mcpAuthorizationCodes,
      ...documents.mcpAccessTokens,
      ...documents.mcpRefreshTokens,
    ]) mergeMcpMetadata(snapshot.data());
    for (const snapshot of documents.mcpUserGrants) {
      const value = snapshot.data();
      mergeMcpMetadata(value);
      const clientId = typeof value.clientId === 'string' ? value.clientId : '';
      const current = mcpByClient.get(clientId);
      if (current && (value.status === 'active' || value.status === 'revoked')) {
        current.status = value.status;
      }
    }
    const mcpEntries = [...mcpByClient.entries()];
    const mcpClients = await Promise.all(mcpEntries.map(([clientId]) =>
      db.doc(`mcpOAuthClients/${clientId}`).get()
    ));
    const mcpAuthorizations = mcpEntries.map(([clientId, authorization], index) => ({
      clientId,
      clientName: typeof mcpClients[index].data()?.clientName === 'string'
        ? mcpClients[index].data()!.clientName
        : 'MCP client',
      status: authorization.status,
      authorizedAt: authorization.authorizedAt || null,
      lastAuthorizedAt: authorization.lastAuthorizedAt || null,
      expiresAt: authorization.expiresAt || null,
      scopes: [...authorization.scopes].sort(),
    })).sort((left, right) => Number(right.lastAuthorizedAt) - Number(left.lastAuthorizedAt));

    // Export connection metadata only. The encrypted refresh credential is a
    // bearer secret even though it is ciphertext, so it never enters an export.
    const googleWorkspaceData = googleWorkspaceConnection.data() || {};
    const googleWorkspace = googleWorkspaceConnection.exists ? {
      connected: googleWorkspaceData.status === 'active',
      needsReauthorization: googleWorkspaceData.status === 'reauthorization_required',
      email: typeof googleWorkspaceData.email === 'string'
        ? googleWorkspaceData.email.slice(0, 320)
        : null,
      scopes: Array.isArray(googleWorkspaceData.scopes)
        ? googleWorkspaceData.scopes.filter((scope): scope is string => typeof scope === 'string').slice(0, 20)
        : [],
      connectedAt: Number(googleWorkspaceData.connectedAt || 0) || null,
      updatedAt: Number(googleWorkspaceData.updatedAt || 0) || null,
    } : null;

    const auditEvents = [
      ...documents.recoveryAudits.map((snapshot) =>
        sanitizeAccountExportAuditEvent('mfa', snapshot.data())
      ),
      ...documents.mcpAuditLogs.map((snapshot) =>
        sanitizeAccountExportAuditEvent('mcp', snapshot.data())
      ),
    ].sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      user: {
        uid,
        email: authUser.email || null,
        displayName: authUser.displayName || null,
        photoURL: authUser.photoURL || null,
        createdAt: authUser.metadata.creationTime || null,
        lastSignInAt: authUser.metadata.lastSignInTime || null,
        profile: profile.exists ? plainData(profile) : null,
      },
      items: documents.items.map(plainData),
      toolData: documents.toolData.map(plainData),
      settings: settings.exists ? plainData(settings) : null,
      analytics: documents.analytics.map(plainData),
      flightLogs: documents.flightLogs.map(plainData),
      files,
      connections: documents.connections.map(plainData),
      integrations: { mcpAuthorizations, googleWorkspace },
      nudges: documents.nudges.map(plainData),
      pushDevices: documents.tokens.map((token) => {
        const data = token.data();
        return {
          id: token.id,
          type: data.type || null,
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          userAgent: data.userAgent || null,
        };
      }),
      security: {
        mfaEnrolled: Boolean(authUser.multiFactor?.enrolledFactors.length),
        recoveryCodes: recoverySet.exists ? {
          generatedAt: Number(recoverySet.data()?.generatedAt || 0) || null,
          expiresAt: Number(recoverySet.data()?.expiresAt || 0) || null,
          remaining: Math.max(0, Number(recoverySet.data()?.remaining || 0)),
        } : null,
        auditEvents,
      },
    };
    // The page-by-page guard above prevents large collections from being
    // materialized unchecked. This final exact JSON check also covers fixed
    // Auth/profile/settings fields and derived/duplicated attachment metadata.
    const responseBytes = accountExportSerializedByteLength(exportPayload);
    if (!accountExportSerializedBytesAllowed(0, responseBytes)) {
      throw new HttpsError(
        'resource-exhausted',
        `This export exceeds the ${Math.floor(ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES / (1024 * 1024))} MiB single-response limit. Contact support for a paged export.`
      );
    }
    // Export is a bounded point-in-time read rather than a global transaction.
    // Recheck the monotonic deletion barrier immediately before returning so a
    // deletion that began during inventory cannot yield a partial archive.
    const finalDeletionBarrier = await accountDeletionRef(uid).get();
    if (!accountExportMayReturn(finalDeletionBarrier.exists)) {
      assertAccountActiveSnapshot(finalDeletionBarrier);
    }
    return exportPayload;
  }
);

interface AccountDeletionJobData {
  userId: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status?: 'deleting' | 'cleanup' | 'completed';
  leaseUntil?: number;
  completedAt?: number;
  cleanupUntil?: number;
  expireAt?: FirebaseFirestore.Timestamp;
}

async function claimAccountDeletion(
  ref: FirebaseFirestore.DocumentReference
): Promise<AccountDeletionJobData | null> {
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() as AccountDeletionJobData;
    if (data.status === 'completed') return null;
    if (Number(data.leaseUntil || 0) > now) return null;
    transaction.update(ref, { leaseUntil: now + 10 * 60_000, lastAttemptAt: now });
    return data;
  });
}

async function recordAccountDeletionFailure(
  ref: FirebaseFirestore.DocumentReference,
  data: AccountDeletionJobData,
  error: unknown
): Promise<void> {
  const attempts = Math.min(20, Number(data.attempts || 0) + 1);
  await ref.set({
    attempts,
    leaseUntil: 0,
    nextAttemptAt: Date.now() + Math.min(24 * 60 * 60_000, (2 ** Math.min(attempts, 8)) * 5 * 60_000),
    lastError: String((error as { code?: unknown })?.code || 'account-delete-failed').slice(0, 120),
  }, { merge: true });
}

async function markAccountDeletionCompleted(
  ref: FirebaseFirestore.DocumentReference,
): Promise<number> {
  const completedAt = Date.now();
  await ref.set({
    status: 'completed',
    completedAt,
    userId: FieldValue.delete(),
    createdAt: FieldValue.delete(),
    destructivePhaseCompletedAt: FieldValue.delete(),
    cleanupUntil: FieldValue.delete(),
    attempts: FieldValue.delete(),
    leaseUntil: FieldValue.delete(),
    nextAttemptAt: FieldValue.delete(),
    lastAttemptAt: FieldValue.delete(),
    lastError: FieldValue.delete(),
    expireAt: Timestamp.fromMillis(completedAt + ACCOUNT_DELETION_TOMBSTONE_RETENTION_MS),
  }, { merge: true });
  return completedAt;
}

async function finalizeAccountDeletionCleanup(
  data: AccountDeletionJobData,
  jobRef: FirebaseFirestore.DocumentReference,
): Promise<{ pending: boolean; completedAt?: number }> {
  // Resumable upload sessions issued before the tombstone may finish after the
  // first sweep. Sweep hourly for the entire provider session lifetime, then
  // sweep once more before declaring the workflow complete.
  await storage.bucket().deleteFiles({ prefix: `users/${data.userId}/` });
  const now = Date.now();
  const cleanupUntil = Number(data.cleanupUntil || 0);
  if (cleanupUntil > now) {
    await jobRef.set({
      status: 'cleanup',
      leaseUntil: 0,
      nextAttemptAt: Math.min(cleanupUntil, now + UPLOAD_CLEANUP_INTERVAL_MS),
      lastError: FieldValue.delete(),
      // Never let Firestore TTL remove an in-progress write barrier.
      expireAt: Timestamp.fromMillis(
        cleanupUntil + ACCOUNT_DELETION_TOMBSTONE_RETENTION_MS
      ),
    }, { merge: true });
    return { pending: true };
  }
  return {
    pending: false,
    completedAt: await markAccountDeletionCompleted(jobRef),
  };
}

async function processAccountDeletion(
  uid: string,
  jobRef: FirebaseFirestore.DocumentReference,
  job: AccountDeletionJobData,
): Promise<{ pending: boolean; completedAt?: number }> {
  try {
    await auth.revokeRefreshTokens(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }

  const bucket = storage.bucket();
  await bucket.deleteFiles({ prefix: `users/${uid}/` });

  // Delete a bounded page at a time and re-query from the beginning after each
  // successful page. The durable job remains outside this inventory, so very
  // large accounts make monotonic progress across retries without ever
  // materializing every document in a 512 MiB instance.
  const sweep = await deleteOwnedDocumentsIncrementally(uid, jobRef);
  if (sweep.hasMore) {
    await jobRef.set({
      status: 'deleting',
      leaseUntil: 0,
      nextAttemptAt: Date.now() + 60_000,
      lastError: FieldValue.delete(),
    }, { merge: true });
    return { pending: true };
  }

  // Fixed-path documents are a bounded final set and do not need a query
  // inventory. They are removed only after every collection query drained.
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const path of accountDeletionFixedDocumentPaths(uid)) {
    refs.set(path, db.doc(path));
  }
  const scrapeQuotaRef = db.doc(
    `scrapeRateLimits/uid_${createHash('sha256').update(uid).digest('hex')}`
  );
  refs.set(scrapeQuotaRef.path, scrapeQuotaRef);
  // Keep this invariant explicit so a future inventory consolidation can
  // never remove the write barrier before the minimal tombstone replaces it.
  refs.delete(jobRef.path);
  const writer = db.bulkWriter();
  for (const ref of refs.values()) writer.delete(ref);
  await writer.close();

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }

  // Close the common race where an already-issued resumable upload completed
  // while document/Auth deletion was running.
  await bucket.deleteFiles({ prefix: `users/${uid}/` });
  const destructivePhaseCompletedAt = Date.now();
  const deletionStartedAt = Number(job.createdAt || destructivePhaseCompletedAt);
  const cleanupUntil = deletionStartedAt + RESUMABLE_UPLOAD_SESSION_RISK_MS;
  if (cleanupUntil <= destructivePhaseCompletedAt) {
    const completedAt = await markAccountDeletionCompleted(jobRef);
    return { pending: false, completedAt };
  }
  await jobRef.set({
    userId: uid,
    status: 'cleanup',
    destructivePhaseCompletedAt,
    cleanupUntil,
    leaseUntil: 0,
    nextAttemptAt: Math.min(
      cleanupUntil,
      destructivePhaseCompletedAt + UPLOAD_CLEANUP_INTERVAL_MS
    ),
    lastError: FieldValue.delete(),
    // The TTL deadline is deliberately beyond both the cleanup window and the
    // completed-tombstone retention horizon. Completion rewrites it from the
    // actual final sweep time.
    expireAt: Timestamp.fromMillis(
      cleanupUntil + ACCOUNT_DELETION_TOMBSTONE_RETENTION_MS
    ),
  }, { merge: true });
  return { pending: true, completedAt: destructivePhaseCompletedAt };
}

export const deleteThreadmapAccount = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 300,
    memory: '512MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, ['userId'])) {
      throw new HttpsError('invalid-argument', 'The deletion request contains unsupported fields.');
    }
    const uid = requireRecentUid(request);
    if (data.userId !== uid) {
      throw new HttpsError('permission-denied', 'The requested account does not match the signed-in account.');
    }
    const jobRef = accountDeletionRef(uid);
    const job = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(jobRef);
      if (existing.exists) return existing.data() as AccountDeletionJobData;
      const created: AccountDeletionJobData = {
        userId: uid,
        status: 'deleting',
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: 0,
        leaseUntil: 0,
      };
      // The durable tombstone is committed before any destructive step. Rules
      // and every Admin mutation transaction read this same document.
      transaction.create(jobRef, created);
      return created;
    });
    if (job.status === 'completed') {
      return {
        success: true,
        pending: false,
        status: 'completed' as const,
        completedAt: Number(job.completedAt || 0) || undefined,
      };
    }
    if (job.status === 'cleanup') {
      return {
        success: true,
        pending: true,
        status: 'pending' as const,
        completedAt: Number(job.completedAt || 0) || undefined,
      };
    }
    const claimed = await claimAccountDeletion(jobRef);
    if (!claimed) return { success: true, pending: true, status: 'pending' as const };
    try {
      const outcome = await processAccountDeletion(uid, jobRef, claimed);
      return {
        success: true,
        pending: outcome.pending,
        status: outcome.pending ? 'pending' as const : 'completed' as const,
        completedAt: outcome.completedAt,
      };
    } catch (error) {
      console.error('[THREADMAP] Account deletion queued for retry:', error);
      await recordAccountDeletionFailure(jobRef, claimed, error);
      return { success: true, pending: true, status: 'pending' as const };
    }
  }
);

// ═══════════════════════════════════════════════════════════
// MCP endpoint (Streamable HTTP) and its OAuth authorization server
// ═══════════════════════════════════════════════════════════

/**
 * Built once per instance and reused across invocations. Configuration errors
 * are captured rather than thrown at module scope, so invalid MCP environment
 * settings degrade this one endpoint to `503` instead of breaking every
 * function in the deployment at cold start.
 */
type McpRouterResult = {
  router: McpRouter;
  origin: string;
  oauth: ThreadmapOAuthService;
} | { error: Error };
const mcpRouterResults = new Map<string, McpRouterResult>();
const MAX_MCP_ORIGIN_CACHE_SIZE = 16;

function cacheMcpRouter(key: string, result: McpRouterResult): McpRouterResult {
  if (mcpRouterResults.size >= MAX_MCP_ORIGIN_CACHE_SIZE) {
    const oldest = mcpRouterResults.keys().next().value;
    if (oldest) mcpRouterResults.delete(oldest);
  }
  mcpRouterResults.set(key, result);
  return result;
}

function getMcpRouter(
  rawOrigin?: string,
  googleWorkspaceConfiguration?: Omit<GoogleWorkspaceConfiguration, 'origin'>,
): McpRouterResult {
  const cacheKey = `${rawOrigin ?? 'configured-origin'}:${googleWorkspaceConfiguration ? 'workspace' : 'core'}`;
  const cached = mcpRouterResults.get(cacheKey);
  if (cached) return cached;
  try {
    // Even a trusted staging preview override must not mask a missing baseline
    // operator configuration. Non-production projects fail closed instead of
    // silently publishing production OAuth metadata.
    if (rawOrigin) resolveMcpEndpoints();
    const endpoints = resolveMcpEndpoints(rawOrigin);
    const oauth = createThreadmapOAuthService(db, resolveMcpOAuthConfiguration(endpoints));
    const googleWorkspace = googleWorkspaceConfiguration
      ? new GoogleWorkspaceService(db, {
        ...googleWorkspaceConfiguration,
        origin: endpoints.origin,
      })
      : undefined;
    return cacheMcpRouter(cacheKey, {
      origin: endpoints.origin,
      oauth,
      router: createMcpRouter({
        oauth,
        endpoints,
        googleWorkspace,
        createDataAccess: (principal) => new ThreadmapDal(db, principal, {
          deleteItem: ({ userId, itemId, expectedRevision }) => deleteItemForMcp({
            userId,
            itemId,
            expectedRevision,
          }),
        }),
        verifyUserIdToken: async (idToken) => {
          const decodedToken = await auth.verifyIdToken(idToken);
          if (!privateOwnerAuthorized(decodedToken)) {
            throw new Error('This Threadmap deployment is private.');
          }
          return decodedToken.uid;
        },
        log: (entry) => {
          // Cloud Logging picks structured JSON off stdout. Only identifiers and
          // outcomes are logged: never tokens, arguments, or item content.
          console.log(JSON.stringify({ component: 'mcp', ...entry }));
        },
      }),
    });
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error('MCP configuration failed.');
    if (wrapped instanceof McpConfigurationError) {
      console.error(`[THREADMAP MCP] ${wrapped.message}`);
    } else {
      console.error('[THREADMAP MCP] The MCP endpoint could not be configured:', wrapped);
    }
    return cacheMcpRouter(cacheKey, { error: wrapped });
  }
}

function requireMcpOAuthService(): ThreadmapOAuthService {
  const resolved = getMcpRouter();
  if ('error' in resolved) {
    throw new HttpsError('unavailable', 'MCP authorization management is unavailable.');
  }
  return resolved.oauth;
}

export const listMcpAuthorizations = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 30,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, [])) {
      throw new HttpsError('invalid-argument', 'The authorization list request contains unsupported fields.');
    }
    const uid = requireUid(request);
    await assertAccountActive(uid);
    try {
      return { authorizations: await requireMcpOAuthService().listAuthorizations(uid) };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('[THREADMAP MCP] Authorization listing failed:', error);
      throw new HttpsError('unavailable', 'MCP authorizations could not be loaded.');
    }
  }
);

export const revokeMcpAuthorization = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const data = recordValue(request.data, 'request');
    if (!hasOnlyKeys(data, ['clientId'])) {
      throw new HttpsError('invalid-argument', 'The authorization revocation request contains unsupported fields.');
    }
    const uid = requireUid(request);
    await assertAccountActive(uid);
    try {
      const revoked = await requireMcpOAuthService().revokeClient(
        data.clientId,
        uid,
        'owner_disconnect'
      );
      return { success: true, revoked };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('[THREADMAP MCP] Authorization revocation failed:', error);
      throw new HttpsError('unavailable', 'MCP authorization could not be revoked.');
    }
  }
);

export const threadmapMcp = onRequest(
  {
    region: FUNCTION_REGION,
    // Claude.ai allows up to 300s per tool call; staying under it means a slow
    // call surfaces as a Threadmap timeout rather than a host-side disconnect.
    timeoutSeconds: 120,
    memory: '512MiB',
    // Every MCP request is authorized by an opaque bearer token this server
    // issued, so no additional invoker restriction applies.
    invoker: 'public',
    cors: false,
    secrets: [googleWorkspaceClientSecret, googleWorkspaceTokenEncryptionKey],
  },
  async (request, response) => {
    const requestOrigin = resolveMcpRequestOrigin({
      projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
      forwardedHost: request.get('x-forwarded-host'),
      forwardedProto: request.get('x-forwarded-proto'),
    });
    const resolved = getMcpRouter(requestOrigin, {
      clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID,
      clientSecret: googleWorkspaceClientSecret.value(),
      tokenEncryptionKey: googleWorkspaceTokenEncryptionKey.value(),
    });
    if ('error' in resolved) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(503).json({
        error: 'temporarily_unavailable',
        error_description: 'The Threadmap MCP endpoint is not configured.',
      });
      return;
    }
    await runMcpRouterOnNode(resolved.router, request, response, resolved.origin);
  }
);

async function retryThreadmapAccountDeletions(): Promise<void> {
  const jobs = await db.collection('accountDeletionJobs')
    .where('nextAttemptAt', '<=', Date.now())
    .orderBy('nextAttemptAt', 'asc')
    .limit(50)
    .get();
  for (const snapshot of jobs.docs) {
    const claimed = await claimAccountDeletion(snapshot.ref);
    if (!claimed) continue;
    try {
      if (claimed.status === 'cleanup') {
        await finalizeAccountDeletionCleanup(claimed, snapshot.ref);
      } else {
        await processAccountDeletion(claimed.userId, snapshot.ref, claimed);
      }
    } catch (error) {
      await recordAccountDeletionFailure(snapshot.ref, claimed, error);
    }
  }
}

export const retryThreadmapAccountDeletionsEu = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    retryCount: 3,
    timeoutSeconds: 540,
    memory: '512MiB',
    region: FUNCTION_REGION,
  },
  retryThreadmapAccountDeletions,
);
