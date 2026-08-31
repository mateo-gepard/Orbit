import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { MemoryFirestore } from './memory-firestore';
import {
  GOOGLE_WORKSPACE_PROVIDER_SCOPES,
  GoogleWorkspaceOAuthError,
  GoogleWorkspaceService,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
} from './google-workspace';

const ORIGIN = 'https://threadmap.test';
const USER_ID = 'owner-uid';
const CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-client-secret-value';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const ACCESS_TOKEN = `ya29.${'a'.repeat(48)}`;
const REFRESH_TOKEN = `1//${'b'.repeat(48)}`;

function requestUrl(input: string | URL | Request): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function testService(options: {
  firestore?: MemoryFirestore;
  fetcher?: typeof fetch;
  now?: () => number;
  configured?: boolean;
} = {}): { service: GoogleWorkspaceService; firestore: MemoryFirestore } {
  const firestore = options.firestore ?? new MemoryFirestore();
  return {
    firestore,
    service: new GoogleWorkspaceService(firestore as unknown as Firestore, {
      origin: ORIGIN,
      ...(options.configured === false ? {} : {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        tokenEncryptionKey: ENCRYPTION_KEY,
      }),
      fetch: options.fetcher,
      now: options.now,
      random: (size) => Buffer.alloc(size, 9),
    }),
  };
}

async function authorize(service: GoogleWorkspaceService): Promise<void> {
  const started = await service.beginAuthorization(USER_ID);
  const authorizeUrl = new URL(started.location);
  assert.equal(authorizeUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizeUrl.searchParams.get('redirect_uri'), `${ORIGIN}/api/mcp/oauth/google/callback`);
  assert.equal(authorizeUrl.searchParams.get('access_type'), 'offline');
  assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.deepEqual(
    authorizeUrl.searchParams.get('scope')?.split(' '),
    [...GOOGLE_WORKSPACE_PROVIDER_SCOPES],
  );
  const state = authorizeUrl.searchParams.get('state');
  assert.match(String(state), /^tmgs_[A-Za-z0-9_-]{43}$/);
  const completed = await service.completeAuthorization(new URLSearchParams({
    state: String(state),
    code: 'one-time-google-code',
  }));
  assert.equal(completed.location, `${ORIGIN}/integrations/google-workspace?status=connected`);
}

test('Google identity scopes use the canonical email URL', () => {
  assert.ok(GOOGLE_WORKSPACE_PROVIDER_SCOPES.includes('openid'));
  assert.ok(GOOGLE_WORKSPACE_PROVIDER_SCOPES.includes(
    'https://www.googleapis.com/auth/userinfo.email',
  ));
  assert.ok(!GOOGLE_WORKSPACE_PROVIDER_SCOPES.includes('email'));
});

test('refresh credentials use authenticated encryption and reject tampering', () => {
  const encrypted = encryptGoogleRefreshToken(
    REFRESH_TOKEN,
    ENCRYPTION_KEY,
    Buffer.alloc(12, 4),
  );
  assert.equal(decryptGoogleRefreshToken(encrypted, ENCRYPTION_KEY), REFRESH_TOKEN);
  assert.ok(!JSON.stringify(encrypted).includes(REFRESH_TOKEN));

  const tampered = {
    ...encrypted,
    tag: `${encrypted.tag[0] === 'A' ? 'B' : 'A'}${encrypted.tag.slice(1)}`,
  };
  assert.throws(() => decryptGoogleRefreshToken(tampered, ENCRYPTION_KEY));
});

test('an unconfigured deployment reports status without breaking the core MCP', async () => {
  const { service } = testService({ configured: false });
  assert.deepEqual(await service.getStatus(USER_ID), {
    configured: false,
    connected: false,
    connectionUrl: `${ORIGIN}/integrations/google-workspace`,
    reason: 'server_not_configured',
  });
  await assert.rejects(
    () => service.beginAuthorization(USER_ID),
    (error: unknown) => error instanceof GoogleWorkspaceOAuthError
      && error.code === 'server_not_configured'
      && error.status === 503,
  );
});

test('Google OAuth stores only an encrypted refresh credential and is single-use', async () => {
  let now = 1_800_000_000_000;
  const fetcher = (async (input: string | URL | Request) => {
    const url = requestUrl(input);
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return Response.json({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3_600,
        scope: GOOGLE_WORKSPACE_PROVIDER_SCOPES.join(' '),
        token_type: 'Bearer',
      });
    }
    if (url.toString() === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Response.json({ sub: 'google-subject', email: 'owner@example.com' });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const { service, firestore } = testService({ fetcher, now: () => now });

  const started = await service.beginAuthorization(USER_ID);
  const state = new URL(started.location).searchParams.get('state');
  const callback = new URLSearchParams({ state: String(state), code: 'one-time-code' });
  await service.completeAuthorization(callback);

  const status = await service.getStatus(USER_ID);
  assert.equal(status.connected, true);
  assert.equal(status.email, 'owner@example.com');
  assert.deepEqual(status.scopes, [...GOOGLE_WORKSPACE_PROVIDER_SCOPES]);

  const stored = firestore.dump().googleWorkspaceConnections[USER_ID];
  assert.equal(stored.status, 'active');
  assert.ok(stored.encryptedRefreshToken);
  assert.ok(!JSON.stringify(stored).includes(REFRESH_TOKEN));
  assert.equal(firestore.dump().googleWorkspaceOAuthStates
    && Object.keys(firestore.dump().googleWorkspaceOAuthStates).length, 0);

  now += 1;
  await assert.rejects(
    () => service.completeAuthorization(callback),
    (error: unknown) => error instanceof GoogleWorkspaceOAuthError && error.code === 'invalid_state',
  );
});

test('Gmail search returns bounded provenance-bearing data and never credentials', async () => {
  const requests: URL[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return Response.json({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3_600,
        scope: GOOGLE_WORKSPACE_PROVIDER_SCOPES.join(' '),
      });
    }
    if (url.toString() === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Response.json({ sub: 'google-subject', email: 'owner@example.com' });
    }
    if (url.pathname === '/gmail/v1/users/me/threads') {
      return Response.json({
        threads: [{ id: 'thread_1', snippet: 'Search snippet' }],
        resultSizeEstimate: 1,
      });
    }
    if (url.pathname === '/gmail/v1/users/me/threads/thread_1') {
      return Response.json({
        id: 'thread_1',
        snippet: 'Detailed snippet',
        messages: [{
          id: 'message_1',
          payload: {
            headers: [
              { name: 'Subject', value: 'Project update' },
              { name: 'From', value: 'Sender <sender@example.com>' },
              { name: 'Date', value: 'Mon, 31 Aug 2026 12:00:00 +0200' },
            ],
          },
        }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const { service } = testService({ fetcher, now: () => 1_800_000_000_000 });
  await authorize(service);

  const result = await service.accessFor(USER_ID).searchGmail({
    query: 'from:sender@example.com newer_than:7d',
    maxResults: 5,
  });
  assert.equal(result.source, 'google:gmail');
  assert.equal((result.threads as Array<Record<string, unknown>>)[0].subject, 'Project update');
  assert.equal((result.threads as Array<Record<string, unknown>>)[0].messageCount, 1);
  assert.ok(requests.some((url) => url.searchParams.get('q') === 'from:sender@example.com newer_than:7d'));
  assert.ok(!JSON.stringify(result).includes(ACCESS_TOKEN));
  assert.ok(!JSON.stringify(result).includes(REFRESH_TOKEN));
});

test('disconnect removes the credential even when provider revocation is best-effort', async () => {
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return Response.json({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3_600,
        scope: GOOGLE_WORKSPACE_PROVIDER_SCOPES.join(' '),
      });
    }
    if (url.toString() === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Response.json({ sub: 'google-subject', email: 'owner@example.com' });
    }
    if (url.origin + url.pathname === 'https://oauth2.googleapis.com/revoke') {
      assert.equal(url.search, '');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, new URLSearchParams({ token: REFRESH_TOKEN }).toString());
      return new Response(null, { status: 503 });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const { service, firestore } = testService({ fetcher });
  await authorize(service);

  assert.deepEqual(await service.disconnect(USER_ID), {
    disconnected: true,
    providerRevoked: false,
  });
  assert.equal(firestore.dump().googleWorkspaceConnections
    && Object.keys(firestore.dump().googleWorkspaceConnections).length, 0);
  assert.equal((await service.getStatus(USER_ID)).connected, false);
});
