import { createHash, createHmac, randomInt } from 'node:crypto';
import type { ActionCodeSettings, Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const resendApiKey = defineSecret('RESEND_API_KEY');
const authEmailHmacKey = defineSecret('AUTH_EMAIL_HMAC_KEY');

const AUTH_EMAIL_WINDOW_MS = 60 * 60_000;
const AUTH_EMAIL_MIN_INTERVAL_MS = 60_000;
const AUTH_EMAIL_LIMIT = 5;
const AUTH_EMAIL_SOURCE_LIMIT = 30;
const AUTH_EMAIL_GLOBAL_LIMIT = 2_000;
const AUTH_EMAIL_RESERVATION_LEASE_MS = 30_000;
const AUTH_EMAIL_MAX_DELIVERY_ROUNDS = 3;
const AUTH_EMAIL_PROVIDER_ATTEMPTS = 3;
const AUTH_EMAIL_PROVIDER_TIMEOUT_MS = 8_000;
const PASSWORD_RESET_RESPONSE_FLOOR_MS = 4_000;
const PASSWORD_RESET_RESPONSE_JITTER_MS = 300;
const PASSWORD_RESET_ACTION_LINK_TIMEOUT_MS = 1_500;
const PASSWORD_RESET_PROVIDER_TIMEOUT_MS = 1_800;
const PRODUCTION_PROJECT_ID = 'orbit-9e0b6';
const PRODUCTION_THREADMAP_ORIGIN = 'https://threadmap.app';
const PRODUCTION_FIREBASE_ACTION_HOSTS = [
  'orbit-9e0b6.firebaseapp.com',
  'orbit-9e0b6.web.app',
] as const;
const AUTH_EMAIL_FROM = 'Threadmap <sign-in@auth.threadmap.app>';
const AUTH_EMAIL_REPLY_TO = 'support@threadmap.app';

type AuthEmailKind = 'email-sign-in' | 'password-reset' | 'email-verification';

export function authEmailResponseFloorDelayMs(
  kind: AuthEmailKind,
  elapsedMs: number,
  jitterMs: number,
): number {
  if (kind !== 'password-reset') return 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, Math.trunc(elapsedMs)) : 0;
  const jitter = Number.isFinite(jitterMs)
    ? Math.max(0, Math.min(PASSWORD_RESET_RESPONSE_JITTER_MS, Math.trunc(jitterMs)))
    : 0;
  return Math.max(0, PASSWORD_RESET_RESPONSE_FLOOR_MS + jitter - elapsed);
}

export async function authEmailOperationWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const boundedTimeout = Math.max(1, Math.min(15_000, Math.trunc(timeoutMs)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Auth email operation timed out.')), boundedTimeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface AuthEmailRequest {
  kind?: unknown;
  email?: unknown;
  continueUrl?: unknown;
}

interface AuthEmailContent {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  action: string;
  footnote: string;
}

export interface AuthEmailBrandingConfig {
  appOrigin: string;
  firebaseActionHosts: ReadonlySet<string>;
}

type AuthEmailEnvironment = Record<string, string | undefined>;

function validatedAppOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:'
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash) {
    throw new Error('THREADMAP_APP_ORIGIN must be an HTTPS origin without a path.');
  }
  return url.origin;
}

export function resolveThreadmapAppOrigin(
  environment: AuthEmailEnvironment = process.env,
): string {
  const configuredOrigin = environment.THREADMAP_APP_ORIGIN?.trim();
  if (configuredOrigin) return validatedAppOrigin(configuredOrigin);
  const projectId = environment.GCLOUD_PROJECT
    || environment.GOOGLE_CLOUD_PROJECT
    || environment.GCP_PROJECT;
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error('Threadmap app origin is not configured for this Firebase project.');
  }
  return PRODUCTION_THREADMAP_ORIGIN;
}

function validatedFirebaseActionHosts(value: string): ReadonlySet<string> {
  const hosts = value.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (hosts.length < 1 || hosts.length > 8) {
    throw new Error('AUTH_EMAIL_FIREBASE_ACTION_HOSTS must contain one to eight hosts.');
  }
  for (const host of hosts) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:firebaseapp\.com|web\.app)$/.test(host)) {
      throw new Error('AUTH_EMAIL_FIREBASE_ACTION_HOSTS contains an invalid Firebase host.');
    }
  }
  return new Set(hosts);
}

/** Resolve action-link branding without ever falling back to production in staging. */
export function resolveAuthEmailBrandingConfig(
  environment: AuthEmailEnvironment = process.env,
): AuthEmailBrandingConfig {
  const configuredOrigin = environment.THREADMAP_APP_ORIGIN?.trim();
  const configuredHosts = environment.AUTH_EMAIL_FIREBASE_ACTION_HOSTS?.trim();
  if (Boolean(configuredOrigin) !== Boolean(configuredHosts)) {
    throw new Error('Auth email origin and Firebase action hosts must be configured together.');
  }
  if (configuredOrigin && configuredHosts) {
    return {
      appOrigin: resolveThreadmapAppOrigin(environment),
      firebaseActionHosts: validatedFirebaseActionHosts(configuredHosts),
    };
  }

  const projectId = environment.GCLOUD_PROJECT
    || environment.GOOGLE_CLOUD_PROJECT
    || environment.GCP_PROJECT;
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error('Auth email branding is not configured for this Firebase project.');
  }
  return {
    appOrigin: resolveThreadmapAppOrigin(environment),
    firebaseActionHosts: new Set(PRODUCTION_FIREBASE_ACTION_HOSTS),
  };
}

function normalizeKind(value: unknown): AuthEmailKind {
  if (value === 'email-sign-in' || value === 'password-reset' || value === 'email-verification') {
    return value;
  }
  throw new HttpsError('invalid-argument', 'Unsupported account email request.');
}

function normalizeEmail(value: unknown): string {
  const email = normalizeSignInEmail(value);
  if (!email) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  return email;
}

export function normalizeSignInEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

export function authEmailRateDigest(scope: string, value: string, secret: string): string {
  if (secret.length < 32) throw new Error('The auth email HMAC key must be at least 32 characters.');
  return createHmac('sha256', secret)
    .update(`threadmap-auth-email:v1:${scope}:${value}`)
    .digest('hex');
}

export function safeEmailProviderRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value)
    ? value
    : null;
}

function normalizeContinueUrl(value: unknown, config: AuthEmailBrandingConfig): string {
  if (typeof value !== 'string' || value.length > 2_048) return config.appOrigin;
  try {
    const url = new URL(value);
    const isConfiguredOrigin = url.origin === config.appOrigin;
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (!isConfiguredOrigin && !isEmulator) return config.appOrigin;
    return url.toString();
  } catch {
    return config.appOrigin;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function contentFor(kind: AuthEmailKind): AuthEmailContent {
  if (kind === 'password-reset') {
    return {
      subject: 'Reset your Threadmap password',
      preheader: 'Use this secure link to choose a new password.',
      heading: 'Reset your password',
      body: 'A password reset was requested for your Threadmap account.',
      action: 'Reset password',
      footnote: 'If you did not request this, you can safely ignore this email. Your password will not change.',
    };
  }
  if (kind === 'email-verification') {
    return {
      subject: 'Verify your email for Threadmap',
      preheader: 'Confirm this address to protect your Threadmap account.',
      heading: 'Verify your email',
      body: 'Confirm that this email address belongs to your Threadmap account.',
      action: 'Verify email',
      footnote: 'If you did not create or update a Threadmap account, you can safely ignore this email.',
    };
  }
  return {
    subject: 'Your secure Threadmap sign-in link',
    preheader: 'Use this one-time link to sign in to Threadmap.',
    heading: 'Sign in to Threadmap',
    body: 'Use the secure button below to finish signing in. The link is tied to this email address and can only be used once.',
    action: 'Sign in securely',
    footnote: 'If you did not request this link, you can safely ignore this email. No account access was granted.',
  };
}

export function renderEmail(kind: AuthEmailKind, link: string): { html: string; text: string; content: AuthEmailContent } {
  const content = contentFor(kind);
  const safeLink = escapeHtml(link);
  const html = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body lang="en" dir="ltr" style="margin:0;background:#f4f1ec;color:#171512;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" lang="en" dir="ltr" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border:1px solid #ded8cf;border-radius:20px;overflow:hidden">
<tr><td style="padding:30px 32px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="font-size:22px;font-weight:800;letter-spacing:-.4px;color:#171512">
<span style="display:inline-block;margin-right:10px;color:#e46f44">T</span>THREADMAP
</td></tr></table>
</td></tr>
<tr><td style="padding:8px 32px 32px">
<h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;letter-spacing:-.6px;color:#171512">${escapeHtml(content.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#57514a">${escapeHtml(content.body)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#171512" style="border-radius:12px">
<a href="${safeLink}" style="display:inline-block;padding:14px 22px;font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none">${escapeHtml(content.action)}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#746d65">${escapeHtml(content.footnote)}</p>
<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8b837a">Button not working? <a href="${safeLink}" style="color:#57514a">Open the secure Threadmap action</a>, or paste this address into your browser:<br><span style="color:#57514a;word-break:break-all">${safeLink}</span></p>
</td></tr>
<tr><td style="border-top:1px solid #e8e2da;padding:20px 32px;font-size:12px;line-height:1.5;color:#8b837a">Threadmap account security<br><a href="mailto:${AUTH_EMAIL_REPLY_TO}" style="color:#57514a">${AUTH_EMAIL_REPLY_TO}</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `${content.heading}\n\n${content.body}\n\n${content.action}: ${link}\n\n${content.footnote}\n\nSupport: ${AUTH_EMAIL_REPLY_TO}`;
  return { html, text, content };
}

function firebaseActionUrl(
  link: string,
  expectedMode: 'signIn' | 'resetPassword' | 'verifyEmail',
  config: AuthEmailBrandingConfig,
): URL {
  try {
    let url = new URL(link);
    const firebaseHost = config.firebaseActionHosts.has(url.hostname.toLowerCase());
    if (!firebaseHost || url.protocol !== 'https:') throw new Error('invalid action host');

    if (url.pathname === '/__/auth/links') {
      const nested = url.searchParams.get('link');
      if (!nested) throw new Error('missing nested link');
      url = new URL(nested);
    }

    const nestedFirebaseHost = config.firebaseActionHosts.has(url.hostname.toLowerCase());
    if (!nestedFirebaseHost
      || url.protocol !== 'https:'
      || url.pathname !== '/__/auth/action'
      || url.searchParams.get('mode') !== expectedMode) {
      throw new Error('invalid action link');
    }

    const appOrigin = new URL(config.appOrigin);
    url.protocol = appOrigin.protocol;
    url.host = appOrigin.host;
    return url;
  } catch {
    throw new Error(`Firebase returned an invalid ${expectedMode} link.`);
  }
}

export function brandedThreadmapSignInUrl(
  link: string,
  config = resolveAuthEmailBrandingConfig(),
): string {
  return firebaseActionUrl(link, 'signIn', config).toString();
}

function rewriteToThreadmapDomain(
  link: string,
  expectedMode: 'signIn' | 'resetPassword' | 'verifyEmail',
  config: AuthEmailBrandingConfig,
): string {
  return firebaseActionUrl(link, expectedMode, config).toString();
}

export interface AuthEmailRatePolicy {
  now?: number;
  recipientLimit?: number;
  sourceLimit?: number;
  globalLimit?: number;
}

export interface AuthEmailReservation {
  allowed: boolean;
  requestKey: string;
  reservationId: string;
}

export type AuthEmailDeliveryDisposition =
  | 'delivered'
  | 'failed-retryable'
  | 'failed-permanent';

export async function reserveAuthEmailDelivery(
  db: Firestore,
  hmacKey: string,
  kind: AuthEmailKind,
  email: string,
  source: string,
  policy: AuthEmailRatePolicy = {},
): Promise<AuthEmailReservation> {
  const now = policy.now ?? Date.now();
  const recipientLimit = Math.max(1, Math.trunc(policy.recipientLimit ?? AUTH_EMAIL_LIMIT));
  const sourceLimit = Math.max(1, Math.trunc(policy.sourceLimit ?? AUTH_EMAIL_SOURCE_LIMIT));
  const globalLimit = Math.max(sourceLimit, Math.trunc(
    policy.globalLimit ?? AUTH_EMAIL_GLOBAL_LIMIT
  ));
  const recipientHash = authEmailRateDigest(`recipient:${kind}`, email, hmacKey);
  const sourceHash = authEmailRateDigest(
    'source',
    typeof source === 'string' && source.length > 0 ? source.slice(0, 256) : 'unknown',
    hmacKey,
  );
  const windowStart = Math.floor(now / AUTH_EMAIL_WINDOW_MS) * AUTH_EMAIL_WINDOW_MS;
  const collection = db.collection('_authEmailRateLimits');
  const recipientRef = collection.doc(`recipient_${recipientHash}`);
  const sourceRef = collection.doc(`source_${sourceHash}_${windowStart}`);
  const globalRef = collection.doc(`global_${windowStart}`);
  let allowed = false;
  let requestKey = createHash('sha256')
    .update(`${recipientHash}\0${Math.floor(now / AUTH_EMAIL_MIN_INTERVAL_MS)}`)
    .digest('hex');

  await db.runTransaction(async (transaction) => {
    const [recipientSnapshot, sourceSnapshot, globalSnapshot] = await Promise.all([
      transaction.get(recipientRef),
      transaction.get(sourceRef),
      transaction.get(globalRef),
    ]);
    const data = recipientSnapshot.data() || {};
    const previousWindow = typeof data.windowStartedAt === 'number' ? data.windowStartedAt : 0;
    const previousSentAt = typeof data.lastSentAt === 'number' ? data.lastSentAt : 0;
    const previousAttemptAt = typeof data.lastAttemptAt === 'number' ? data.lastAttemptAt : 0;
    const sameWindow = now - previousWindow < AUTH_EMAIL_WINDOW_MS;
    const count = sameWindow && typeof data.count === 'number' ? data.count : 0;
    const deliveryStatus = typeof data.deliveryStatus === 'string' ? data.deliveryStatus : '';
    const leaseUntil = typeof data.leaseUntil === 'number' ? data.leaseUntil : 0;
    const deliveryAttempts = Number.isSafeInteger(data.deliveryAttempts)
      ? Number(data.deliveryAttempts)
      : 0;
    const quotaCount = (snapshot: { data(): Record<string, unknown> | undefined }) => {
      const value = Number(snapshot.data()?.count || 0);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    };
    const sourceCount = quotaCount(sourceSnapshot);
    const globalCount = quotaCount(globalSnapshot);

    if ((deliveryStatus === 'pending' && leaseUntil > now)
      || sourceCount >= sourceLimit
      || globalCount >= globalLimit) {
      return;
    }

    const canRetryReservation = sameWindow
      && deliveryAttempts > 0
      && deliveryAttempts < AUTH_EMAIL_MAX_DELIVERY_ROUNDS
      && typeof data.requestKey === 'string'
      && /^[a-f0-9]{64}$/.test(data.requestKey)
      && (deliveryStatus === 'failed-retryable'
        || (deliveryStatus === 'pending' && leaseUntil <= now));
    if (!canRetryReservation
        && ((previousSentAt && now - previousSentAt < AUTH_EMAIL_MIN_INTERVAL_MS)
          || (previousAttemptAt && now - previousAttemptAt < AUTH_EMAIL_MIN_INTERVAL_MS)
          || (sameWindow && count >= recipientLimit))) {
      return;
    }

    allowed = true;
    const expireAt = new Date(windowStart + (2 * AUTH_EMAIL_WINDOW_MS));
    if (canRetryReservation) {
      requestKey = data.requestKey as string;
      transaction.set(recipientRef, {
        deliveryStatus: 'pending',
        deliveryAttempts: deliveryAttempts + 1,
        lastAttemptAt: now,
        leaseUntil: now + AUTH_EMAIL_RESERVATION_LEASE_MS,
        expireAt,
      }, { merge: true });
    } else {
      requestKey = createHash('sha256')
        .update(`${recipientHash}\0${kind}\0${now}\0${count + 1}`)
        .digest('hex');
      transaction.set(recipientRef, {
        kind: 'recipient',
        count: sameWindow ? count + 1 : 1,
        windowStartedAt: sameWindow ? previousWindow : now,
        lastAttemptAt: now,
        deliveryStatus: 'pending',
        deliveryAttempts: 1,
        requestKey,
        leaseUntil: now + AUTH_EMAIL_RESERVATION_LEASE_MS,
        expireAt,
      });
    }
    transaction.set(sourceRef, {
      kind: 'source',
      sourceHash,
      windowStartedAt: windowStart,
      count: sourceCount + 1,
      updatedAt: now,
      expireAt,
    });
    transaction.set(globalRef, {
      kind: 'global',
      windowStartedAt: windowStart,
      count: globalCount + 1,
      updatedAt: now,
      expireAt,
    });
  });

  return {
    allowed,
    requestKey,
    reservationId: recipientRef.id,
  };
}

export async function finalizeAuthEmailDelivery(
  db: Firestore,
  reservation: Pick<AuthEmailReservation, 'reservationId' | 'requestKey'>,
  disposition: AuthEmailDeliveryDisposition,
  now = Date.now(),
): Promise<void> {
  const ref = db.collection('_authEmailRateLimits').doc(reservation.reservationId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.requestKey !== reservation.requestKey) return;
    transaction.set(ref, {
      deliveryStatus: disposition,
      leaseUntil: 0,
      updatedAt: now,
      ...(disposition === 'delivered' ? { lastSentAt: now, deliveredAt: now } : { failedAt: now }),
    }, { merge: true });
  });
}

export function authEmailProviderStatusIsRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchAuthEmailProviderWithRetry(
  fetcher: typeof fetch,
  init: RequestInit,
  policy: {
    attempts?: number;
    timeoutMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<Response> {
  const attempts = Math.max(1, Math.min(5, Math.trunc(
    policy.attempts ?? AUTH_EMAIL_PROVIDER_ATTEMPTS
  )));
  const timeoutMs = Math.max(250, Math.min(15_000, Math.trunc(
    policy.timeoutMs ?? AUTH_EMAIL_PROVIDER_TIMEOUT_MS
  )));
  const sleep = policy.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        ...init,
        signal: controller.signal,
      });
      if (!authEmailProviderStatusIsRetryable(response.status) || attempt === attempts - 1) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(Math.min(1_000, 250 * (2 ** attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error('Email provider request failed.');
}

async function generateActionLink(
  auth: Auth,
  kind: AuthEmailKind,
  email: string,
  continueUrl: string,
  branding: AuthEmailBrandingConfig,
): Promise<string | null> {
  const settings: ActionCodeSettings = {
    url: continueUrl,
    handleCodeInApp: kind === 'email-sign-in',
  };
  try {
    if (kind === 'password-reset') {
      return rewriteToThreadmapDomain(
        await auth.generatePasswordResetLink(email, settings),
        'resetPassword',
        branding,
      );
    }
    if (kind === 'email-verification') {
      return rewriteToThreadmapDomain(
        await auth.generateEmailVerificationLink(email, settings),
        'verifyEmail',
        branding,
      );
    }
    return brandedThreadmapSignInUrl(
      await auth.generateSignInWithEmailLink(email, settings),
      branding,
    );
  } catch (error) {
    if (kind === 'password-reset' && (error as { code?: string })?.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

export function createThreadmapAuthEmailFunction(auth: Auth, db: Firestore, region: string) {
  return onCall(
    {
      region,
      timeoutSeconds: 30,
      memory: '256MiB',
      enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true',
      secrets: [resendApiKey, authEmailHmacKey],
    },
    async (request) => {
      const requestStartedAt = Date.now();
      const data = (request.data || {}) as AuthEmailRequest;
      if (Object.keys(data).some((key) => !['kind', 'email', 'continueUrl'].includes(key))) {
        throw new HttpsError('invalid-argument', 'Unsupported account email fields.');
      }

      const kind = normalizeKind(data.kind);
      const email = normalizeEmail(data.email);
      const responseJitter = kind === 'password-reset'
        ? randomInt(0, PASSWORD_RESET_RESPONSE_JITTER_MS + 1)
        : 0;
      try {
      let branding: AuthEmailBrandingConfig;
      try {
        branding = resolveAuthEmailBrandingConfig();
      } catch (error) {
        console.error('Threadmap auth email branding is not configured', {
          code: String((error as { message?: unknown })?.message || 'invalid-auth-email-branding')
            .slice(0, 120),
        });
        throw new HttpsError('unavailable', 'Threadmap could not send this email. Please try again.');
      }
      const continueUrl = normalizeContinueUrl(data.continueUrl, branding);

      if (kind === 'email-verification') {
        const authenticatedEmail = typeof request.auth?.token.email === 'string'
          ? request.auth.token.email.toLowerCase()
          : '';
        if (!request.auth || authenticatedEmail !== email) {
          throw new HttpsError('permission-denied', 'Verify the email on the signed-in account.');
        }
      }

      const source = request.rawRequest.ip
        || request.rawRequest.socket?.remoteAddress
        || 'unknown';
      const reservation = await reserveAuthEmailDelivery(
        db,
        authEmailHmacKey.value(),
        kind,
        email,
        source,
      );
      // Repeated and over-limit requests deliberately look successful so this
      // endpoint cannot be used to enumerate accounts or amplify email abuse.
      if (!reservation.allowed) return { accepted: true };

      let link: string | null;
      try {
        const linkOperation = generateActionLink(auth, kind, email, continueUrl, branding);
        link = kind === 'password-reset'
          ? await authEmailOperationWithTimeout(linkOperation, PASSWORD_RESET_ACTION_LINK_TIMEOUT_MS)
          : await linkOperation;
      } catch (error) {
        await finalizeAuthEmailDelivery(db, reservation, 'failed-retryable').catch(() => undefined);
        console.error('Threadmap auth action-link generation failed', {
          kind,
          recipient: reservation.requestKey.slice(0, 12),
          code: String((error as { code?: unknown })?.code || 'action-link-failed').slice(0, 80),
        });
        if (kind === 'password-reset') return { accepted: true };
        throw new HttpsError('unavailable', 'Threadmap could not send this email. Please try again.');
      }
      if (!link) {
        await finalizeAuthEmailDelivery(db, reservation, 'delivered').catch(() => undefined);
        return { accepted: true };
      }

      const { html, text, content } = renderEmail(kind, link);
      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey.value()}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': reservation.requestKey,
        },
        body: JSON.stringify({
          from: AUTH_EMAIL_FROM,
          to: [email],
          reply_to: AUTH_EMAIL_REPLY_TO,
          subject: content.subject,
          html,
          text,
          tags: [{ name: 'category', value: kind.replace(/-/g, '_') }],
        }),
      };
      let response: Response;
      try {
        response = await fetchAuthEmailProviderWithRetry(
          fetch,
          requestInit,
          kind === 'password-reset'
            ? { attempts: 1, timeoutMs: PASSWORD_RESET_PROVIDER_TIMEOUT_MS }
            : {},
        );
      } catch {
        await finalizeAuthEmailDelivery(db, reservation, 'failed-retryable').catch(() => undefined);
        console.error('Threadmap auth email delivery failed', {
          kind,
          recipient: reservation.requestKey.slice(0, 12),
          status: 'network-error',
        });
        if (kind === 'password-reset') return { accepted: true };
        throw new HttpsError('unavailable', 'Threadmap could not send this email. Please try again.');
      }

      if (!response.ok) {
        await finalizeAuthEmailDelivery(
          db,
          reservation,
          authEmailProviderStatusIsRetryable(response.status)
            ? 'failed-retryable'
            : 'failed-permanent',
        ).catch(() => undefined);
        console.error('Threadmap auth email delivery failed', {
          kind,
          recipient: reservation.requestKey.slice(0, 12),
          status: response.status,
          providerRequestId: safeEmailProviderRequestId(
            response.headers.get('x-resend-id') || response.headers.get('x-request-id')
          ),
        });
        if (kind === 'password-reset') return { accepted: true };
        throw new HttpsError('unavailable', 'Threadmap could not send this email. Please try again.');
      }

      // The provider has accepted the idempotency key. If this bookkeeping
      // write is briefly unavailable, leave the reservation pending: a later
      // retry reuses the same provider key and cannot duplicate the email.
      await finalizeAuthEmailDelivery(db, reservation, 'delivered').catch((error) => {
        console.warn('Threadmap auth email delivery bookkeeping was deferred', {
          kind,
          recipient: reservation.requestKey.slice(0, 12),
          code: String((error as { code?: unknown })?.code || 'delivery-bookkeeping-failed').slice(0, 80),
        });
      });

      return { accepted: true };
      } finally {
        const delay = authEmailResponseFloorDelayMs(
          kind,
          Date.now() - requestStartedAt,
          responseJitter,
        );
        if (delay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
      }
    },
  );
}
