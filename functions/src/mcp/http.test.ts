import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { MemoryFirestore } from './memory-firestore';
import { createThreadmapOAuthService, type OAuthPrincipal } from './oauth';
import { createPkceS256Challenge } from './security';
import type { AuditEvent, ThreadmapDataAccess } from './dal';
import {
  MCP_PUBLIC_PATHS,
  resolveMcpEndpoints,
  resolveMcpOAuthConfiguration,
} from './config';
import { createMcpRouter, normalizeMcpPath, toWebRequest, type McpRouter } from './http';

const ORIGIN = 'https://threadmap.test';
const OWNER_UID = 'threadmap-owner';
const OWNER_ID_TOKEN = 'owner-id-token-value-that-is-long-enough';
const CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

process.env.MCP_ORIGIN = ORIGIN;
process.env.MCP_OWNER_UID = OWNER_UID;

interface Harness {
  router: McpRouter;
  audits: AuditEvent[];
}

function unimplemented(name: string): () => never {
  return () => {
    throw new Error(`${name} is not stubbed for this test.`);
  };
}

function buildHarness(): Harness {
  const audits: AuditEvent[] = [];
  const firestore = new MemoryFirestore() as unknown as Firestore;
  const endpoints = resolveMcpEndpoints(ORIGIN);
  const oauth = createThreadmapOAuthService(firestore, resolveMcpOAuthConfiguration(endpoints));

  const router = createMcpRouter({
    oauth,
    endpoints,
    createDataAccess: (principal: OAuthPrincipal) => ({
      principal,
      consumeQuota: async () => undefined,
      recordAudit: async (event: AuditEvent) => {
        audits.push(event);
      },
      listTags: async () => ({ tags: ['uni', 'openpulse'], partial: false }),
      completeItem: unimplemented('completeItem'),
      archiveItem: unimplemented('archiveItem'),
      linkItems: unimplemented('linkItems'),
      unlinkItems: unimplemented('unlinkItems'),
    } as unknown as ThreadmapDataAccess),
    verifyOwnerIdToken: async (idToken) => {
      if (idToken !== OWNER_ID_TOKEN) throw new Error('bad id token');
      return OWNER_UID;
    },
  });

  return { router, audits };
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: 'GET', headers });
}

function postForm(path: string, body: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  });
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ── Path normalization ──────────────────────────────────────

test('paths normalize across the rewrite and the raw function URL', () => {
  assert.equal(normalizeMcpPath('/mcp'), '/mcp');
  assert.equal(normalizeMcpPath('/mcp/'), '/mcp');
  assert.equal(normalizeMcpPath('/threadmapMcp/mcp'), '/mcp');
  assert.equal(normalizeMcpPath('/threadmapMcp'), '/');
  assert.equal(
    normalizeMcpPath('/threadmapMcp/.well-known/oauth-protected-resource/mcp'),
    '/.well-known/oauth-protected-resource/mcp',
  );
  // A path that merely starts with the same letters is not a prefix match.
  assert.equal(normalizeMcpPath('/threadmapMcpOther/mcp'), '/threadmapMcpOther/mcp');
});

// ── Discovery ───────────────────────────────────────────────

test('authorization server metadata advertises PKCE S256 and the public endpoints', async () => {
  const { router } = buildHarness();
  const response = await router(get(MCP_PUBLIC_PATHS.authorizationServerMetadata));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const metadata = await response.json() as Record<string, unknown>;
  assert.equal(metadata.issuer, ORIGIN);
  assert.equal(metadata.authorization_endpoint, `${ORIGIN}${MCP_PUBLIC_PATHS.authorize}`);
  assert.equal(metadata.token_endpoint, `${ORIGIN}${MCP_PUBLIC_PATHS.token}`);
  assert.equal(metadata.registration_endpoint, `${ORIGIN}${MCP_PUBLIC_PATHS.register}`);
  assert.equal(metadata.revocation_endpoint, `${ORIGIN}${MCP_PUBLIC_PATHS.revoke}`);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(metadata.grant_types_supported, ['authorization_code', 'refresh_token']);
  assert.ok((metadata.token_endpoint_auth_methods_supported as string[]).includes('none'));
});

test('protected resource metadata is served at both the path-aware and root URLs', async () => {
  const { router } = buildHarness();
  for (const path of [
    MCP_PUBLIC_PATHS.protectedResourceMetadata,
    MCP_PUBLIC_PATHS.protectedResourceMetadataRoot,
  ]) {
    const response = await router(get(path));
    assert.equal(response.status, 200, path);
    const metadata = await response.json() as Record<string, unknown>;
    assert.equal(metadata.resource, `${ORIGIN}${MCP_PUBLIC_PATHS.mcp}`);
    assert.deepEqual(metadata.authorization_servers, [ORIGIN]);
    assert.deepEqual(metadata.bearer_methods_supported, ['header']);
  }
});

// ── Bearer gate on /mcp ─────────────────────────────────────

test('an unauthenticated MCP call is refused with a discovery pointer', async () => {
  const { router } = buildHarness();
  const response = await router(postJson(MCP_PUBLIC_PATHS.mcp, { jsonrpc: '2.0', id: 1, method: 'ping' }));
  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  assert.match(challenge, /^Bearer /);
  assert.match(challenge, /resource_metadata="https:\/\/threadmap\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test('a malformed or unknown bearer token is refused', async () => {
  const { router } = buildHarness();
  const expectedChallenge =
    `Bearer resource_metadata="${ORIGIN}${MCP_PUBLIC_PATHS.protectedResourceMetadata}"`;

  for (const authorization of ['Bearer not-a-token', 'Bearer tmat_aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Basic abc']) {
    const response = await router(
      postJson(MCP_PUBLIC_PATHS.mcp, { jsonrpc: '2.0', id: 1, method: 'ping' }, { authorization }),
    );
    assert.equal(response.status, 401, authorization);
    // The quotes are load-bearing: RFC 9728 clients parse `resource_metadata="…"`,
    // and an unquoted value leaves them unable to discover the metadata URL. This
    // must hold on the rejected-token path exactly as it does on the absent-token
    // path — the two build the header separately.
    assert.equal(response.headers.get('www-authenticate'), expectedChallenge, authorization);
  }
});

// ── Consent endpoints ───────────────────────────────────────

test('consent endpoints require a verified Threadmap sign-in', async () => {
  const { router } = buildHarness();
  const anonymous = await router(get('/api/mcp/oauth/consent?request=tmar_x'));
  assert.equal(anonymous.status, 401);

  const wrongToken = await router(
    get('/api/mcp/oauth/consent?request=tmar_x', { authorization: 'Bearer some-other-id-token-value' }),
  );
  assert.equal(wrongToken.status, 401);
});

test('a consent request from an unrecognized browser origin is refused', async () => {
  const { router } = buildHarness();
  const response = await router(get('/api/mcp/oauth/consent?request=tmar_x', {
    origin: 'https://evil.example',
    authorization: `Bearer ${OWNER_ID_TOKEN}`,
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'forbidden_origin' });
});

// ── Method and route handling ───────────────────────────────

test('unknown routes 404 and wrong methods 405 with an Allow header', async () => {
  const { router } = buildHarness();
  assert.equal((await router(get('/api/mcp/oauth/nope'))).status, 404);

  const wrongMethod = await router(get(MCP_PUBLIC_PATHS.token));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const metadataPost = await router(postJson(MCP_PUBLIC_PATHS.authorizationServerMetadata, {}));
  assert.equal(metadataPost.status, 405);
});

test('an invalid authorize request is reported without becoming an open redirector', async () => {
  const { router } = buildHarness();
  // No registered client, so the redirect_uri is unvalidated and must not be used.
  const response = await router(get(
    `${MCP_PUBLIC_PATHS.authorize}?response_type=code&client_id=tmc_unknownclient00000&redirect_uri=${encodeURIComponent('https://evil.example/steal')}&resource=${encodeURIComponent(`${ORIGIN}/mcp`)}&code_challenge_method=S256`,
  ));
  assert.notEqual(response.status, 302);
  assert.ok(response.status >= 400 && response.status < 500);
  assert.equal(response.headers.get('location'), null);
});

// ── The full flow ───────────────────────────────────────────

interface RegisteredClient {
  clientId: string;
}

async function registerClaudeClient(router: McpRouter): Promise<RegisteredClient> {
  const response = await router(postJson(MCP_PUBLIC_PATHS.register, {
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }));
  assert.equal(response.status, 201, 'dynamic client registration succeeds');
  const body = await response.json() as Record<string, unknown>;
  assert.match(String(body.client_id), /^tmc_/);
  assert.equal(body.token_endpoint_auth_method, 'none', 'public client with PKCE');
  assert.equal(body.client_secret, undefined, 'a public client gets no secret');
  return { clientId: String(body.client_id) };
}

async function completeAuthorization(router: McpRouter, clientId: string): Promise<string> {
  const challenge = createPkceS256Challenge(CODE_VERIFIER);
  const authorizeUrl = `${MCP_PUBLIC_PATHS.authorize}?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE_REDIRECT,
    resource: `${ORIGIN}/mcp`,
    scope: 'threadmap.read threadmap.write offline_access',
    state: 'opaque-state-from-claude',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()}`;

  const started = await router(get(authorizeUrl));
  assert.equal(started.status, 302, 'authorization redirects to the consent screen');
  const consentLocation = new URL(started.headers.get('location') ?? '');
  assert.equal(consentLocation.origin + consentLocation.pathname, 'https://threadmap.app/integrations/authorize');
  const requestToken = consentLocation.searchParams.get('request');
  assert.match(String(requestToken), /^tmar_/);

  // The consent screen reads the pending request as the signed-in owner.
  const view = await router(get(
    `/api/mcp/oauth/consent?request=${encodeURIComponent(String(requestToken))}`,
    { authorization: `Bearer ${OWNER_ID_TOKEN}` },
  ));
  assert.equal(view.status, 200);
  const viewBody = await view.json() as Record<string, unknown>;
  assert.equal(viewBody.clientName, 'Claude');
  assert.equal(viewBody.platform, 'claude');
  assert.deepEqual(viewBody.scopes, ['threadmap.read', 'threadmap.write', 'offline_access']);

  const approved = await router(postJson(
    '/api/mcp/oauth/consent/approve',
    { request: requestToken },
    { authorization: `Bearer ${OWNER_ID_TOKEN}` },
  ));
  assert.equal(approved.status, 200);
  const approvedBody = await approved.json() as { location: string };
  const callback = new URL(approvedBody.location);
  assert.equal(`${callback.origin}${callback.pathname}`, CLAUDE_REDIRECT);
  assert.equal(callback.searchParams.get('state'), 'opaque-state-from-claude');
  const code = callback.searchParams.get('code');
  assert.match(String(code), /^tmac_/);
  return String(code);
}

async function exchangeCode(router: McpRouter, clientId: string, code: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const response = await router(postForm(MCP_PUBLIC_PATHS.token, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: CLAUDE_REDIRECT,
    code_verifier: CODE_VERIFIER,
    client_id: clientId,
    resource: `${ORIGIN}/mcp`,
  }));
  assert.equal(response.status, 200, 'the code exchanges for a token');
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.token_type, 'Bearer');
  assert.match(String(body.access_token), /^tmat_/);
  assert.match(String(body.refresh_token), /^tmrt_/);
  assert.ok(Number(body.expires_in) > 0);
  return {
    accessToken: String(body.access_token),
    refreshToken: String(body.refresh_token),
  };
}

async function rpc(
  router: McpRouter,
  accessToken: string,
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await router(new Request(`${ORIGIN}${MCP_PUBLIC_PATHS.mcp}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      // What a 2025-era Streamable HTTP client sends, which is what both hosts
      // send today; the SDK serves it through its stateless legacy path.
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(message),
  }));
  assert.equal(response.status, 200, `${String(message.method)} returned ${response.status}`);
  const text = await response.text();
  // A stateless reply is either a JSON body or a single SSE `data:` frame.
  const payload = text.startsWith('event:') || text.startsWith('data:')
    ? text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('')
    : text;
  return JSON.parse(payload) as Record<string, unknown>;
}

test('end to end: register, authorize, consent, token, then call a tool over HTTP', async () => {
  const { router, audits } = buildHarness();

  const { clientId } = await registerClaudeClient(router);
  const code = await completeAuthorization(router, clientId);
  const { accessToken, refreshToken } = await exchangeCode(router, clientId, code);

  // initialize
  const initialized = await rpc(router, accessToken, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'claude-test', version: '1.0.0' },
    },
  });
  const initResult = initialized.result as Record<string, unknown>;
  assert.ok(initResult, 'initialize returned a result');
  assert.equal((initResult.serverInfo as Record<string, unknown>).name, 'threadmap');
  assert.match(String(initResult.instructions), /owner-scoped/);

  // tools/list — scope-filtered to the granted read+write scopes
  const listed = await rpc(router, accessToken, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes('list_tags'), 'read tools are offered');
  assert.ok(names.includes('create_item'), 'write tools are offered');
  assert.ok(!names.includes('confirm_delete_item'), 'delete was never granted to a dynamic client');

  // tools/call
  const called = await rpc(router, accessToken, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'list_tags', arguments: {} },
  });
  const callResult = called.result as Record<string, unknown>;
  assert.notEqual(callResult.isError, true);
  assert.deepEqual(callResult.structuredContent, { tags: ['uni', 'openpulse'], partial: false });
  assert.equal(audits.at(-1)?.tool, 'list_tags');

  // The refresh token rotates and the old one is then dead.
  const refreshed = await router(postForm(MCP_PUBLIC_PATHS.token, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    resource: `${ORIGIN}/mcp`,
  }));
  assert.equal(refreshed.status, 200);
  const refreshedBody = await refreshed.json() as Record<string, unknown>;
  assert.match(String(refreshedBody.access_token), /^tmat_/);
  assert.notEqual(refreshedBody.refresh_token, refreshToken, 'the refresh token rotated');

  const replayed = await router(postForm(MCP_PUBLIC_PATHS.token, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    resource: `${ORIGIN}/mcp`,
  }));
  assert.equal(replayed.status, 400, 'replaying a consumed refresh token fails');
  assert.equal((await replayed.json() as Record<string, unknown>).error, 'invalid_grant');
});

test('a revoked access token stops working immediately', async () => {
  const { router } = buildHarness();
  const { clientId } = await registerClaudeClient(router);
  const code = await completeAuthorization(router, clientId);
  const { accessToken } = await exchangeCode(router, clientId, code);

  const before = await rpc(router, accessToken, { jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.ok(before.result, 'the token works before revocation');

  const revoked = await router(postForm(MCP_PUBLIC_PATHS.revoke, {
    token: accessToken,
    client_id: clientId,
  }));
  assert.equal(revoked.status, 200);

  const after = await router(postJson(
    MCP_PUBLIC_PATHS.mcp,
    { jsonrpc: '2.0', id: 2, method: 'ping' },
    { authorization: `Bearer ${accessToken}` },
  ));
  assert.equal(after.status, 401, 'the revoked token is refused');
});

test('a denied consent decision returns access_denied to the client callback', async () => {
  const { router } = buildHarness();
  const { clientId } = await registerClaudeClient(router);
  const challenge = createPkceS256Challenge(CODE_VERIFIER);
  const started = await router(get(`${MCP_PUBLIC_PATHS.authorize}?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE_REDIRECT,
    resource: `${ORIGIN}/mcp`,
    scope: 'threadmap.read',
    state: 'state-value',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()}`));
  const requestToken = new URL(started.headers.get('location') ?? '').searchParams.get('request');

  const denied = await router(postJson(
    '/api/mcp/oauth/consent/deny',
    { request: requestToken },
    { authorization: `Bearer ${OWNER_ID_TOKEN}` },
  ));
  assert.equal(denied.status, 200);
  const location = new URL((await denied.json() as { location: string }).location);
  assert.equal(location.searchParams.get('error'), 'access_denied');
  assert.equal(location.searchParams.get('state'), 'state-value');
});

// ── Cloud Functions bridge ──────────────────────────────────

test('the Node bridge reconstructs method, URL, headers, and body', () => {
  const request = toWebRequest({
    method: 'POST',
    originalUrl: '/mcp?probe=1',
    headers: {
      host: 'threadmap.test',
      'x-forwarded-proto': 'https',
      authorization: 'Bearer tmat_example',
      'content-type': 'application/json',
    },
    rawBody: Buffer.from('{"jsonrpc":"2.0"}', 'utf8'),
  }, ORIGIN);

  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://threadmap.test/mcp?probe=1');
  assert.equal(request.headers.get('authorization'), 'Bearer tmat_example');
});

test('the Node bridge re-serializes a pre-parsed body when rawBody is absent', async () => {
  const request = toWebRequest({
    method: 'POST',
    originalUrl: '/api/mcp/oauth/register',
    headers: { host: 'threadmap.test', 'content-type': 'application/json' },
    body: { client_name: 'Parsed' },
  }, ORIGIN);
  assert.equal(await request.text(), '{"client_name":"Parsed"}');
});

test('the Node bridge sends no body for GET and falls back to the configured origin', () => {
  const request = toWebRequest({
    method: 'GET',
    url: '/.well-known/oauth-protected-resource',
    headers: {},
  }, ORIGIN);
  assert.equal(request.method, 'GET');
  assert.equal(request.url, `${ORIGIN}/.well-known/oauth-protected-resource`);
  assert.equal(request.body, null);
});
