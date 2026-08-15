import { createHash, createHmac } from 'node:crypto';
import type { ActionCodeSettings, Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const resendApiKey = defineSecret('RESEND_API_KEY');
const authEmailHmacKey = defineSecret('AUTH_EMAIL_HMAC_KEY');

const AUTH_EMAIL_WINDOW_MS = 60 * 60_000;
const AUTH_EMAIL_MIN_INTERVAL_MS = 60_000;
const AUTH_EMAIL_LIMIT = 5;
const THREADMAP_ORIGIN = 'https://threadmap.app';
const AUTH_EMAIL_FROM = 'Threadmap <sign-in@auth.threadmap.app>';
const AUTH_EMAIL_REPLY_TO = 'support@threadmap.app';

type AuthEmailKind = 'email-sign-in' | 'password-reset' | 'email-verification';

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

function normalizeContinueUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_048) return THREADMAP_ORIGIN;
  try {
    const url = new URL(value);
    const isProduction = url.origin === THREADMAP_ORIGIN || url.origin === 'https://www.threadmap.app';
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (!isProduction && !isEmulator) return THREADMAP_ORIGIN;
    return url.toString();
  } catch {
    return THREADMAP_ORIGIN;
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

function renderEmail(kind: AuthEmailKind, link: string): { html: string; text: string; content: AuthEmailContent } {
  const content = contentFor(kind);
  const safeLink = escapeHtml(link);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f1ec;color:#171512;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:32px 16px">
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
<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8b837a">Button not working? Paste this address into your browser:<br><a href="${safeLink}" style="color:#57514a;word-break:break-all">${safeLink}</a></p>
</td></tr>
<tr><td style="border-top:1px solid #e8e2da;padding:20px 32px;font-size:12px;line-height:1.5;color:#8b837a">Threadmap account security<br><a href="mailto:${AUTH_EMAIL_REPLY_TO}" style="color:#57514a">${AUTH_EMAIL_REPLY_TO}</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `${content.heading}\n\n${content.body}\n\n${content.action}: ${link}\n\n${content.footnote}\n\nSupport: ${AUTH_EMAIL_REPLY_TO}`;
  return { html, text, content };
}

function firebaseActionUrl(link: string, expectedMode: 'signIn' | 'resetPassword' | 'verifyEmail'): URL {
  try {
    let url = new URL(link);
    const firebaseHost = url.hostname === 'orbit-9e0b6.firebaseapp.com'
      || url.hostname === 'orbit-9e0b6.web.app';
    if (!firebaseHost || url.protocol !== 'https:') throw new Error('invalid action host');

    if (url.pathname === '/__/auth/links') {
      const nested = url.searchParams.get('link');
      if (!nested) throw new Error('missing nested link');
      url = new URL(nested);
    }

    const nestedFirebaseHost = url.hostname === 'orbit-9e0b6.firebaseapp.com'
      || url.hostname === 'orbit-9e0b6.web.app';
    if (!nestedFirebaseHost
      || url.protocol !== 'https:'
      || url.pathname !== '/__/auth/action'
      || url.searchParams.get('mode') !== expectedMode) {
      throw new Error('invalid action link');
    }

    url.protocol = 'https:';
    url.host = 'threadmap.app';
    return url;
  } catch {
    throw new Error(`Firebase returned an invalid ${expectedMode} link.`);
  }
}

export function brandedThreadmapSignInUrl(link: string): string {
  return firebaseActionUrl(link, 'signIn').toString();
}

function rewriteToThreadmapDomain(
  link: string,
  expectedMode: 'signIn' | 'resetPassword' | 'verifyEmail',
): string {
  return firebaseActionUrl(link, expectedMode).toString();
}

async function reserveDelivery(
  db: Firestore,
  hmacKey: string,
  kind: AuthEmailKind,
  email: string,
): Promise<{ allowed: boolean; requestKey: string }> {
  const now = Date.now();
  const recipientHash = authEmailRateDigest(kind, email, hmacKey);
  const ref = db.collection('_authEmailRateLimits').doc(recipientHash);
  let allowed = false;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    const previousWindow = typeof data.windowStartedAt === 'number' ? data.windowStartedAt : 0;
    const previousSentAt = typeof data.lastSentAt === 'number' ? data.lastSentAt : 0;
    const sameWindow = now - previousWindow < AUTH_EMAIL_WINDOW_MS;
    const count = sameWindow && typeof data.count === 'number' ? data.count : 0;

    if ((previousSentAt && now - previousSentAt < AUTH_EMAIL_MIN_INTERVAL_MS)
      || (sameWindow && count >= AUTH_EMAIL_LIMIT)) {
      return;
    }

    allowed = true;
    transaction.set(ref, {
      count: sameWindow ? count + 1 : 1,
      windowStartedAt: sameWindow ? previousWindow : now,
      lastSentAt: now,
      expiresAt: now + AUTH_EMAIL_WINDOW_MS,
    });
  });

  const minute = Math.floor(now / AUTH_EMAIL_MIN_INTERVAL_MS);
  return {
    allowed,
    requestKey: createHash('sha256').update(`${recipientHash}\0${minute}`).digest('hex'),
  };
}

async function generateActionLink(
  auth: Auth,
  kind: AuthEmailKind,
  email: string,
  continueUrl: string,
): Promise<string | null> {
  const settings: ActionCodeSettings = {
    url: continueUrl,
    handleCodeInApp: kind === 'email-sign-in',
  };
  try {
    if (kind === 'password-reset') {
      return rewriteToThreadmapDomain(await auth.generatePasswordResetLink(email, settings), 'resetPassword');
    }
    if (kind === 'email-verification') {
      return rewriteToThreadmapDomain(await auth.generateEmailVerificationLink(email, settings), 'verifyEmail');
    }
    return brandedThreadmapSignInUrl(await auth.generateSignInWithEmailLink(email, settings));
  } catch (error) {
    if (kind === 'password-reset' && (error as { code?: string })?.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

export function createThreadmapAuthEmailFunction(auth: Auth, db: Firestore) {
  return onCall(
    {
      region: 'europe-west1',
      timeoutSeconds: 30,
      memory: '256MiB',
      enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true',
      secrets: [resendApiKey, authEmailHmacKey],
    },
    async (request) => {
      const data = (request.data || {}) as AuthEmailRequest;
      if (Object.keys(data).some((key) => !['kind', 'email', 'continueUrl'].includes(key))) {
        throw new HttpsError('invalid-argument', 'Unsupported account email fields.');
      }

      const kind = normalizeKind(data.kind);
      const email = normalizeEmail(data.email);
      const continueUrl = normalizeContinueUrl(data.continueUrl);

      if (kind === 'email-verification') {
        const authenticatedEmail = typeof request.auth?.token.email === 'string'
          ? request.auth.token.email.toLowerCase()
          : '';
        if (!request.auth || authenticatedEmail !== email) {
          throw new HttpsError('permission-denied', 'Verify the email on the signed-in account.');
        }
      }

      const reservation = await reserveDelivery(db, authEmailHmacKey.value(), kind, email);
      // Repeated and over-limit requests deliberately look successful so this
      // endpoint cannot be used to enumerate accounts or amplify email abuse.
      if (!reservation.allowed) return { accepted: true };

      const link = await generateActionLink(auth, kind, email, continueUrl);
      if (!link) return { accepted: true };

      const { html, text, content } = renderEmail(kind, link);
      const response = await fetch('https://api.resend.com/emails', {
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
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        console.error('Threadmap auth email delivery failed', {
          kind,
          recipient: reservation.requestKey.slice(0, 12),
          status: response.status,
          detail,
        });
        throw new HttpsError('unavailable', 'Threadmap could not send this email. Please try again.');
      }

      return { accepted: true };
    },
  );
}
