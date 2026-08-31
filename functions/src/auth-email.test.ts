import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';

import {
  authEmailOperationWithTimeout,
  authEmailProviderStatusIsRetryable,
  authEmailRateDigest,
  authEmailResponseFloorDelayMs,
  brandedThreadmapSignInUrl,
  fetchAuthEmailProviderWithRetry,
  finalizeAuthEmailDelivery,
  normalizeSignInEmail,
  renderEmail,
  resolveAuthEmailBrandingConfig,
  resolveThreadmapAppOrigin,
  reserveAuthEmailDelivery,
  safeEmailProviderRequestId,
} from './auth-email';
import { MemoryFirestore } from './mcp/memory-firestore';

const TEST_SECRET = 'a-secure-auth-email-test-key-over-32-bytes';
const PRODUCTION_BRANDING = resolveAuthEmailBrandingConfig({ GCLOUD_PROJECT: 'orbit-9e0b6' });
const STAGING_BRANDING = resolveAuthEmailBrandingConfig({
  GCLOUD_PROJECT: 'threadmap-staging',
  THREADMAP_APP_ORIGIN: 'https://staging.threadmap.app',
  AUTH_EMAIL_FIREBASE_ACTION_HOSTS:
    'threadmap-staging-9e0b6.firebaseapp.com,threadmap-staging-9e0b6.web.app',
});

test('sign-in email normalization accepts canonical addresses and rejects malformed input', () => {
  assert.equal(normalizeSignInEmail('  Person@Example.com '), 'person@example.com');
  assert.equal(normalizeSignInEmail('not-an-email'), '');
  assert.equal(normalizeSignInEmail('two@@example.com'), '');
  assert.equal(normalizeSignInEmail('person@example'), '');
});

test('email quota identifiers are keyed and cannot be reproduced with an unkeyed hash', () => {
  const value = 'person@example.com';
  const digest = authEmailRateDigest('address', value, TEST_SECRET);
  const publicDigest = createHash('sha256')
    .update(`threadmap-auth-email:v1:address:${value}`)
    .digest('hex');

  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, publicDigest);
  assert.notEqual(digest, authEmailRateDigest('address', value, `${TEST_SECRET}-different`));
});

test('email quota identifiers require a sufficiently strong secret', () => {
  assert.throws(
    () => authEmailRateDigest('address', 'person@example.com', 'too-short'),
    /at least 32 characters/,
  );
});

test('provider log correlation accepts only opaque request IDs', () => {
  assert.equal(safeEmailProviderRequestId('req_01JABC-123.test'), 'req_01JABC-123.test');
  assert.equal(safeEmailProviderRequestId('person@example.com: invalid recipient'), null);
  assert.equal(safeEmailProviderRequestId('x'.repeat(101)), null);
});

test('password-reset timing policy equalizes fast outcomes with bounded deterministic jitter', () => {
  assert.equal(authEmailResponseFloorDelayMs('password-reset', 100, 50), 3_950);
  assert.equal(authEmailResponseFloorDelayMs('password-reset', 4_100, 50), 0);
  assert.equal(authEmailResponseFloorDelayMs('password-reset', 0, 999), 4_300);
  assert.equal(authEmailResponseFloorDelayMs('email-sign-in', 0, 200), 0);
  assert.equal(authEmailResponseFloorDelayMs('email-verification', 0, 200), 0);
});

test('auth email network work is bounded before the indistinguishable response floor', async () => {
  await assert.rejects(
    authEmailOperationWithTimeout(new Promise<never>(() => undefined), 5),
    /timed out/,
  );
  assert.equal(await authEmailOperationWithTimeout(Promise.resolve('ok'), 50), 'ok');
});

test('auth email delivery enforces recipient, source, and global quotas with TTL records', async () => {
  const store = new MemoryFirestore();
  const db = store as unknown as Firestore;
  const now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const policy = {
    now,
    recipientLimit: 2,
    sourceLimit: 2,
    globalLimit: 3,
  };

  assert.equal((await reserveAuthEmailDelivery(
    db, TEST_SECRET, 'email-sign-in', 'one@example.com', '203.0.113.1', policy,
  )).allowed, true);
  assert.equal((await reserveAuthEmailDelivery(
    db, TEST_SECRET, 'password-reset', 'two@example.com', '203.0.113.1', policy,
  )).allowed, true);
  assert.equal((await reserveAuthEmailDelivery(
    db, TEST_SECRET, 'email-sign-in', 'three@example.com', '203.0.113.1', policy,
  )).allowed, false, 'a source cannot fan out across unique recipients');
  assert.equal((await reserveAuthEmailDelivery(
    db, TEST_SECRET, 'email-sign-in', 'three@example.com', '203.0.113.2', policy,
  )).allowed, true);
  assert.equal((await reserveAuthEmailDelivery(
    db, TEST_SECRET, 'email-sign-in', 'four@example.com', '203.0.113.3', policy,
  )).allowed, false, 'the global ceiling applies across sources');

  const persisted = store.dump()._authEmailRateLimits;
  assert.ok(persisted);
  assert.ok(Object.values(persisted).every((record) => record.expireAt instanceof Date));
  assert.equal(JSON.stringify(persisted).includes('203.0.113.1'), false);
  assert.equal(JSON.stringify(persisted).includes('one@example.com'), false);
});

test('confirmed provider failure releases the recipient reservation for an idempotent retry', async () => {
  const store = new MemoryFirestore();
  const db = store as unknown as Firestore;
  const now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const first = await reserveAuthEmailDelivery(
    db,
    TEST_SECRET,
    'email-sign-in',
    'retry@example.com',
    '203.0.113.9',
    { now, recipientLimit: 2, sourceLimit: 5, globalLimit: 5 },
  );
  assert.equal(first.allowed, true);
  await finalizeAuthEmailDelivery(db, first, 'failed-retryable', now + 1);

  const retry = await reserveAuthEmailDelivery(
    db,
    TEST_SECRET,
    'email-sign-in',
    'retry@example.com',
    '203.0.113.9',
    { now: now + 2, recipientLimit: 2, sourceLimit: 5, globalLimit: 5 },
  );
  assert.equal(retry.allowed, true);
  assert.equal(retry.requestKey, first.requestKey, 'Resend sees the same idempotency key');

  const records = Object.values(store.dump()._authEmailRateLimits);
  const recipient = records.find((record) => record.kind === 'recipient');
  const source = records.find((record) => record.kind === 'source');
  assert.equal(recipient?.count, 1, 'the user intent counts once');
  assert.equal(recipient?.deliveryAttempts, 2);
  assert.equal(source?.count, 2, 'source/global ceilings still charge every delivery round');
});

test('provider retry is bounded, uses the same idempotency key, and skips non-retryable 4xx', async () => {
  const calls: RequestInit[] = [];
  const statuses = [500, 429, 200];
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(init || {});
    return new Response('', { status: statuses.shift() });
  }) as typeof fetch;
  const response = await fetchAuthEmailProviderWithRetry(fetcher, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'stable-key' },
  }, { sleep: async () => undefined });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) =>
    new Headers(call.headers).get('Idempotency-Key') === 'stable-key'
  ));

  let badRequestCalls = 0;
  const badRequest = (async () => {
    badRequestCalls += 1;
    return new Response('', { status: 400 });
  }) as typeof fetch;
  assert.equal((await fetchAuthEmailProviderWithRetry(badRequest, {}, {
    sleep: async () => undefined,
  })).status, 400);
  assert.equal(badRequestCalls, 1);
  assert.equal(authEmailProviderStatusIsRetryable(429), true);
  assert.equal(authEmailProviderStatusIsRetryable(503), true);
  assert.equal(authEmailProviderStatusIsRetryable(400), false);
});

test('provider fetch timeout aborts a hung request', async () => {
  const hung = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
  await assert.rejects(fetchAuthEmailProviderWithRetry(hung, {}, {
    attempts: 1,
    timeoutMs: 250,
  }), /aborted/);
});

test('auth email markup declares direction, titles the message, and keeps the fallback URL non-link text', () => {
  const link = 'https://threadmap.app/__/auth/action?mode=signIn&oobCode=secret';
  const { html, text } = renderEmail('email-sign-in', link);
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.match(html, /<body lang="en" dir="ltr"/);
  assert.match(html, /<title>Your secure Threadmap sign-in link<\/title>/);
  assert.match(html, />Open the secure Threadmap action<\/a>/);
  assert.equal(html.includes(`>${link}</a>`), false);
  assert.ok(text.includes(link));
});

test('Firebase sign-in actions are rewritten onto the Threadmap origin', () => {
  const generated = new URL('https://orbit-9e0b6.firebaseapp.com/__/auth/action');
  generated.searchParams.set('apiKey', 'test-api-key');
  generated.searchParams.set('mode', 'signIn');
  generated.searchParams.set('oobCode', 'one-time-code');
  generated.searchParams.set('continueUrl', 'https://threadmap.app/');

  const branded = new URL(brandedThreadmapSignInUrl(generated.toString(), PRODUCTION_BRANDING));
  assert.equal(branded.origin, 'https://threadmap.app');
  assert.equal(branded.searchParams.get('mode'), 'signIn');
  assert.equal(branded.searchParams.get('oobCode'), 'one-time-code');
  assert.equal(branded.searchParams.get('apiKey'), 'test-api-key');
});

test('nested Firebase links are unwrapped and non-sign-in actions are rejected', () => {
  const action = 'https://orbit-9e0b6.firebaseapp.com/__/auth/action?apiKey=key&mode=signIn&oobCode=code';
  const wrapped = `https://orbit-9e0b6.firebaseapp.com/__/auth/links?link=${encodeURIComponent(action)}`;

  assert.equal(new URL(brandedThreadmapSignInUrl(wrapped, PRODUCTION_BRANDING)).searchParams.get('oobCode'), 'code');
  assert.throws(
    () => brandedThreadmapSignInUrl(
      'https://orbit-9e0b6.firebaseapp.com/__/auth/action?mode=resetPassword',
      PRODUCTION_BRANDING,
    ),
    /invalid signIn link/,
  );
});

test('staging auth emails accept and brand only the configured staging action hosts', () => {
  const stagingAction =
    'https://threadmap-staging-9e0b6.firebaseapp.com/__/auth/action?mode=signIn&oobCode=staging-code';
  assert.equal(
    new URL(brandedThreadmapSignInUrl(stagingAction, STAGING_BRANDING)).origin,
    'https://staging.threadmap.app',
  );
  assert.throws(
    () => brandedThreadmapSignInUrl(
      'https://orbit-9e0b6.firebaseapp.com/__/auth/action?mode=signIn&oobCode=production-code',
      STAGING_BRANDING,
    ),
    /invalid signIn link/,
  );
});

test('non-production projects fail closed without an explicit auth-email origin and host allowlist', () => {
  assert.throws(
    () => resolveAuthEmailBrandingConfig({ GCLOUD_PROJECT: 'threadmap-staging' }),
    /not configured/,
  );
  assert.throws(
    () => resolveAuthEmailBrandingConfig({
      GCLOUD_PROJECT: 'threadmap-staging',
      THREADMAP_APP_ORIGIN: 'https://staging.threadmap.app',
    }),
    /configured together/,
  );
  assert.throws(
    () => resolveAuthEmailBrandingConfig({
      GCLOUD_PROJECT: 'threadmap-staging',
      THREADMAP_APP_ORIGIN: 'https://staging.threadmap.app/path',
      AUTH_EMAIL_FIREBASE_ACTION_HOSTS: 'threadmap-staging.firebaseapp.com',
    }),
    /HTTPS origin/,
  );
  assert.throws(
    () => resolveAuthEmailBrandingConfig({
      GCLOUD_PROJECT: 'threadmap-staging',
      THREADMAP_APP_ORIGIN: 'https://staging.threadmap.app',
      AUTH_EMAIL_FIREBASE_ACTION_HOSTS: 'attacker.example',
    }),
    /invalid Firebase host/,
  );
});

test('the shared app origin permits an exact production default only in production', () => {
  assert.equal(resolveThreadmapAppOrigin({ GCLOUD_PROJECT: 'orbit-9e0b6' }), 'https://threadmap.app');
  assert.equal(resolveThreadmapAppOrigin({
    GCLOUD_PROJECT: 'threadmap-staging',
    THREADMAP_APP_ORIGIN: 'https://staging.threadmap.app',
  }), 'https://staging.threadmap.app');
  assert.throws(() => resolveThreadmapAppOrigin({ GCLOUD_PROJECT: 'threadmap-staging' }));
});
