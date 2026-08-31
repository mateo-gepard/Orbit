import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import {
  OAuthProtocolError,
  ThreadmapOAuthService,
  createAuthorizationErrorRedirect,
  resolveThreadmapOAuthConfiguration,
  serializeOAuthError,
  type ThreadmapOAuthConfiguration,
} from './oauth';
import {
  createAuthorizationServerMetadata,
  createBearerChallenge,
  createProtectedResourceMetadata,
} from './metadata';
import {
  CHATGPT_LEGACY_REDIRECT_URI,
  CLAUDE_REDIRECT_URI,
  appendOAuthParameters,
  assertExactResource,
  classifyRedirectUri,
  createPkceS256Challenge,
  hashOpaqueToken,
  normalizeScopes,
  validateRegisteredRedirectUris,
  verifyPkceS256,
} from './security';
import { MemoryFirestore } from './memory-firestore';

const configuration: ThreadmapOAuthConfiguration = {
  issuer: 'https://mcp.threadmap.app',
  resource: 'https://mcp.threadmap.app/mcp',
  authorizationEndpoint: 'https://mcp.threadmap.app/authorize',
  tokenEndpoint: 'https://mcp.threadmap.app/token',
  registrationEndpoint: 'https://mcp.threadmap.app/register',
  revocationEndpoint: 'https://mcp.threadmap.app/revoke',
  protectedResourceMetadataUrl:
    'https://mcp.threadmap.app/.well-known/oauth-protected-resource',
  scopesSupported: ['threadmap.read', 'threadmap.write', 'offline_access'],
  dynamicClientScopes: ['threadmap.read', 'offline_access'],
  resourceName: 'Threadmap',
};
const TEST_USER_UID = 'threadmap-user';

test('PKCE S256 matches the RFC 7636 example and rejects an incorrect verifier', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  assert.equal(createPkceS256Challenge(verifier), challenge);
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(
    verifyPkceS256('not-long-enough', challenge),
    false
  );
});

test('redirect validation accepts only current platform callbacks or explicit configuration', () => {
  const chatGpt = 'https://chatgpt.com/connector/oauth/callback_12345678';
  assert.equal(classifyRedirectUri(chatGpt), 'chatgpt');
  assert.equal(classifyRedirectUri(CHATGPT_LEGACY_REDIRECT_URI), 'chatgpt');
  assert.equal(classifyRedirectUri(CLAUDE_REDIRECT_URI), 'claude');
  assert.throws(() => classifyRedirectUri(`${CLAUDE_REDIRECT_URI}?next=https://evil.example`));
  assert.throws(() => classifyRedirectUri('https://claude.ai.evil.example/api/mcp/auth_callback'));
  assert.throws(() => validateRegisteredRedirectUris([chatGpt, CLAUDE_REDIRECT_URI]));

  const configured = 'https://client.example/oauth/callback';
  assert.equal(
    classifyRedirectUri(configured, { configuredRedirectUris: [configured] }),
    'configured'
  );
});

test('resource identifiers and scopes are exact and bounded', () => {
  assert.doesNotThrow(() => assertExactResource(
    'https://mcp.threadmap.app/mcp',
    'https://mcp.threadmap.app/mcp'
  ));
  assert.throws(() => assertExactResource(
    'https://mcp.threadmap.app/mcp/',
    'https://mcp.threadmap.app/mcp'
  ));
  assert.deepEqual(normalizeScopes('threadmap.read  offline_access threadmap.read'), [
    'threadmap.read',
    'offline_access',
  ]);
  assert.throws(() => normalizeScopes('threadmap.read "bad"'));
});

test('metadata advertises DCR, PKCE S256, resource binding, and header bearer tokens', () => {
  const authorizationMetadata = createAuthorizationServerMetadata(configuration);
  assert.equal(authorizationMetadata.registration_endpoint, configuration.registrationEndpoint);
  assert.deepEqual(authorizationMetadata.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(authorizationMetadata.grant_types_supported, [
    'authorization_code',
    'refresh_token',
  ]);
  assert.equal(authorizationMetadata.client_id_metadata_document_supported, false);

  const resourceMetadata = createProtectedResourceMetadata(configuration);
  assert.equal(resourceMetadata.resource, configuration.resource);
  assert.deepEqual(resourceMetadata.authorization_servers, [configuration.issuer]);
  assert.deepEqual(resourceMetadata.bearer_methods_supported, ['header']);

  assert.equal(
    createBearerChallenge(configuration.protectedResourceMetadataUrl, {
      scope: ['threadmap.read'],
      error: 'invalid_token',
      errorDescription: 'Token expired.',
    }),
    'Bearer resource_metadata="https://mcp.threadmap.app/.well-known/oauth-protected-resource", '
      + 'scope="threadmap.read", error="invalid_token", error_description="Token expired."'
  );
});

test('configuration enforces a one-hour maximum access-token lifetime', () => {
  assert.equal(resolveThreadmapOAuthConfiguration(configuration).accessTokenTtlSeconds, 900);
  assert.throws(() => resolveThreadmapOAuthConfiguration({
    ...configuration,
    accessTokenTtlSeconds: 3_601,
  }));
});

test('stable OAuth errors serialize without exposing unexpected exception details', () => {
  const protocolError = new OAuthProtocolError('invalid_scope', 'The requested scope is invalid.');
  assert.deepEqual(serializeOAuthError(protocolError), {
    status: 400,
    body: {
      error: 'invalid_scope',
      error_description: 'The requested scope is invalid.',
    },
  });
  const unexpected = serializeOAuthError(new Error('database-password-was-here'));
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.body.error, 'server_error');
  assert.doesNotMatch(unexpected.body.error_description, /password/);

  const redirectError = new OAuthProtocolError('access_denied', 'Access denied.', {
    redirectUri: CLAUDE_REDIRECT_URI,
    state: 'opaque-state',
  });
  assert.equal(
    createAuthorizationErrorRedirect(redirectError),
    appendOAuthParameters(CLAUDE_REDIRECT_URI, {
      error: 'access_denied',
      error_description: 'Access denied.',
      state: 'opaque-state',
    })
  );
  assert.equal(createAuthorizationErrorRedirect(new Error('no redirect')), null);
});

test('full DCR, consent, code, access, refresh rotation, and replay revocation flow', async () => {
  const firestore = new MemoryFirestore();
  let now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
    { now: () => now }
  );

  const registration = await service.registerClient({
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: 'Claude',
    scope: 'threadmap.read offline_access',
    resource: configuration.resource,
  });
  assert.match(registration.client_id, /^tmc_/);
  assert.equal(registration.client_secret, undefined);

  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const authorization = await service.startAuthorization({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: CLAUDE_REDIRECT_URI,
    resource: configuration.resource,
    scope: 'threadmap.read offline_access',
    state: 'client-state',
    code_challenge: createPkceS256Challenge(verifier),
    code_challenge_method: 'S256',
  });
  const requestToken = new URL(authorization.location).searchParams.get('request');
  if (!requestToken?.startsWith('tmar_')) throw new Error('Missing authorization request handle.');
  assert.equal(
    JSON.stringify(firestore.dump()).includes(requestToken),
    false,
    'raw authorization-request handles must never be persisted'
  );

  const requestView = await service.getAuthorizationRequest(requestToken, TEST_USER_UID);
  assert.equal(requestView.clientName, 'Claude');
  assert.deepEqual(requestView.scopes, ['threadmap.read', 'offline_access']);

  const decision = await service.approveAuthorizationRequest(
    requestToken,
    TEST_USER_UID
  );
  const callback = new URL(decision.location);
  const code = callback.searchParams.get('code');
  if (!code?.startsWith('tmac_')) throw new Error('Missing authorization code.');
  assert.equal(callback.searchParams.get('state'), 'client-state');
  assert.equal(JSON.stringify(firestore.dump()).includes(code), false);

  const tokens = await service.exchangeToken({
    grant_type: 'authorization_code',
    client_id: registration.client_id,
    code,
    redirect_uri: CLAUDE_REDIRECT_URI,
    code_verifier: verifier,
    resource: configuration.resource,
  });
  assert.match(tokens.access_token, /^tmat_/);
  assert.match(tokens.refresh_token || '', /^tmrt_/);
  const persistedAfterExchange = JSON.stringify(firestore.dump());
  assert.equal(persistedAfterExchange.includes(tokens.access_token), false);
  assert.equal(persistedAfterExchange.includes(tokens.refresh_token || ''), false);
  assert.equal(persistedAfterExchange.includes(hashOpaqueToken(tokens.access_token)), true);

  const principal = await service.authenticateAccessToken(tokens.access_token, ['threadmap.read']);
  assert.equal(principal.userId, TEST_USER_UID);
  assert.equal(principal.clientId, registration.client_id);

  await assert.rejects(
    service.exchangeToken({
      grant_type: 'authorization_code',
      client_id: registration.client_id,
      code,
      redirect_uri: CLAUDE_REDIRECT_URI,
      code_verifier: verifier,
      resource: configuration.resource,
    }),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_grant'
  );

  now += 1_000;
  const rotated = await service.exchangeToken({
    grant_type: 'refresh_token',
    client_id: registration.client_id,
    refresh_token: tokens.refresh_token,
    resource: configuration.resource,
  });
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  await service.authenticateAccessToken(rotated.access_token, ['threadmap.read']);

  await assert.rejects(
    service.exchangeToken({
      grant_type: 'refresh_token',
      client_id: registration.client_id,
      refresh_token: tokens.refresh_token,
      resource: configuration.resource,
    }),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_grant'
  );
  await assert.rejects(
    service.authenticateAccessToken(rotated.access_token, ['threadmap.read']),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_token'
  );
});

test('live scope policy strips legacy write/delete tokens and refreshes them read-only', async () => {
  const firestore = new MemoryFirestore();
  let now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const broadConfiguration: ThreadmapOAuthConfiguration = {
    ...configuration,
    scopesSupported: [
      'threadmap.read',
      'threadmap.write',
      'threadmap.delete',
      'offline_access',
    ],
    dynamicClientScopes: [
      'threadmap.read',
      'threadmap.write',
      'threadmap.delete',
      'offline_access',
    ],
  };
  const legacyService = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    broadConfiguration,
    { now: () => now },
  );
  const registration = await legacyService.registerClient({
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'threadmap.read threadmap.write threadmap.delete offline_access',
    resource: configuration.resource,
  });
  const verifier = 'l'.repeat(43);
  const authorization = await legacyService.startAuthorization({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: CLAUDE_REDIRECT_URI,
    resource: configuration.resource,
    scope: 'threadmap.read threadmap.write threadmap.delete offline_access',
    code_challenge: createPkceS256Challenge(verifier),
    code_challenge_method: 'S256',
  });
  const requestToken = new URL(authorization.location).searchParams.get('request');
  if (!requestToken) throw new Error('Missing authorization request handle.');
  const decision = await legacyService.approveAuthorizationRequest(requestToken, TEST_USER_UID);
  const code = new URL(decision.location).searchParams.get('code');
  if (!code) throw new Error('Missing authorization code.');
  const legacyTokens = await legacyService.exchangeToken({
    grant_type: 'authorization_code',
    client_id: registration.client_id,
    code,
    redirect_uri: CLAUDE_REDIRECT_URI,
    code_verifier: verifier,
    resource: configuration.resource,
  });
  assert.match(legacyTokens.scope, /threadmap\.write/);
  assert.match(legacyTokens.scope, /threadmap\.delete/);

  const narrowedService = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    {
      ...broadConfiguration,
      dynamicClientScopes: ['threadmap.read', 'offline_access'],
    },
    { now: () => now },
  );
  const principal = await narrowedService.authenticateAccessToken(legacyTokens.access_token);
  assert.deepEqual(principal.scopes, ['threadmap.read', 'offline_access']);
  await assert.rejects(
    narrowedService.authenticateAccessToken(legacyTokens.access_token, ['threadmap.write']),
    (error) => error instanceof OAuthProtocolError && error.code === 'insufficient_scope',
  );
  await assert.rejects(
    narrowedService.authenticateAccessToken(legacyTokens.access_token, ['threadmap.delete']),
    (error) => error instanceof OAuthProtocolError && error.code === 'insufficient_scope',
  );

  now += 1_000;
  const rotated = await narrowedService.exchangeToken({
    grant_type: 'refresh_token',
    client_id: registration.client_id,
    refresh_token: legacyTokens.refresh_token,
    resource: configuration.resource,
  });
  assert.deepEqual(rotated.scope.split(' '), ['threadmap.read', 'offline_access']);
  assert.deepEqual(
    (await narrowedService.authenticateAccessToken(rotated.access_token)).scopes,
    ['threadmap.read', 'offline_access'],
  );
});

test('authorization tokens stay bound to each consenting Threadmap user', async () => {
  const firestore = new MemoryFirestore();
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
  );
  const registration = await service.registerClient({
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'threadmap.read',
  });

  const authorizeUser = async (userId: string, verifier: string) => {
    const authorization = await service.startAuthorization({
      response_type: 'code',
      client_id: registration.client_id,
      redirect_uri: CLAUDE_REDIRECT_URI,
      resource: configuration.resource,
      scope: 'threadmap.read',
      code_challenge: createPkceS256Challenge(verifier),
      code_challenge_method: 'S256',
    });
    const requestToken = new URL(authorization.location).searchParams.get('request');
    if (!requestToken) throw new Error('Missing authorization request handle.');
    await service.getAuthorizationRequest(requestToken, userId);
    const decision = await service.approveAuthorizationRequest(requestToken, userId);
    const code = new URL(decision.location).searchParams.get('code');
    if (!code) throw new Error('Missing authorization code.');
    return service.exchangeToken({
      grant_type: 'authorization_code',
      client_id: registration.client_id,
      code,
      redirect_uri: CLAUDE_REDIRECT_URI,
      code_verifier: verifier,
      resource: configuration.resource,
    });
  };

  const firstTokens = await authorizeUser('user-one', 'a'.repeat(43));
  const secondTokens = await authorizeUser('user-two', 'b'.repeat(43));
  const firstPrincipal = await service.authenticateAccessToken(firstTokens.access_token);
  const secondPrincipal = await service.authenticateAccessToken(secondTokens.access_token);

  assert.equal(firstPrincipal.userId, 'user-one');
  assert.equal(secondPrincipal.userId, 'user-two');
  assert.notEqual(firstTokens.access_token, secondTokens.access_token);

  await firestore.collection('accountDeletionJobs').doc('user-one').set({
    userId: 'user-one',
    status: 'completed',
    completedAt: Date.now(),
  });
  await assert.rejects(
    service.authenticateAccessToken(firstTokens.access_token),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_token',
  );
  assert.equal(
    (await service.authenticateAccessToken(secondTokens.access_token)).userId,
    'user-two',
  );
});

test('a deletion tombstone blocks consent denial from stamping a new user-bound request', async () => {
  const firestore = new MemoryFirestore();
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
  );
  const registration = await service.registerClient({
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'threadmap.read',
  });
  const authorization = await service.startAuthorization({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: CLAUDE_REDIRECT_URI,
    resource: configuration.resource,
    scope: 'threadmap.read',
    code_challenge: createPkceS256Challenge('z'.repeat(43)),
    code_challenge_method: 'S256',
  });
  const handle = new URL(authorization.location).searchParams.get('request');
  if (!handle) throw new Error('Missing authorization request handle.');
  await firestore.collection('accountDeletionJobs').doc(TEST_USER_UID).set({
    status: 'deleting',
  });

  await assert.rejects(
    service.denyAuthorizationRequest(handle, TEST_USER_UID),
    (error) => error instanceof OAuthProtocolError
      && error.code === 'access_denied'
      && error.status === 403,
  );
  const requests = Object.values(firestore.dump().mcpOAuthAuthorizationRequests || {});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].userId, undefined);
});

test('dynamic registrations are source-limited and expire', async () => {
  const firestore = new MemoryFirestore();
  let now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
    {
      now: () => now,
      dynamicClientTtlMs: 60_000,
      registrationSourceLimit: 2,
      registrationGlobalLimit: 3,
    },
  );
  const request = {
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'] as const,
    response_types: ['code'] as const,
    scope: 'threadmap.read',
  };

  let firstClientId = '';
  for (let index = 0; index < 2; index += 1) {
    const registration = await service.registerClient(request, '203.0.113.10');
    if (index === 0) firstClientId = registration.client_id;
  }
  await assert.rejects(
    service.registerClient(request, '203.0.113.10'),
    (error) => error instanceof OAuthProtocolError
      && error.code === 'temporarily_unavailable'
      && error.status === 429,
  );
  await assert.doesNotReject(service.registerClient(request, '203.0.113.11'));
  await assert.rejects(
    service.registerClient(request, '203.0.113.12'),
    (error) => error instanceof OAuthProtocolError
      && error.code === 'temporarily_unavailable'
      && error.status === 429,
    'the distributed global quota must apply across distinct sources',
  );

  now += 61_000;
  await assert.rejects(
    service.startAuthorization({
      response_type: 'code',
      client_id: firstClientId,
      redirect_uri: CLAUDE_REDIRECT_URI,
      resource: configuration.resource,
      scope: 'threadmap.read',
      code_challenge: createPkceS256Challenge('c'.repeat(43)),
      code_challenge_method: 'S256',
    }),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_client',
  );
});

test('expired dynamic clients fail authorize, token, and access authentication', async () => {
  const firestore = new MemoryFirestore();
  let now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
    { now: () => now, dynamicClientTtlMs: 60_000 },
  );
  const registration = await service.registerClient({
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'threadmap.read offline_access',
  }, '203.0.113.20');
  const verifier = 'e'.repeat(43);
  const authorization = await service.startAuthorization({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: CLAUDE_REDIRECT_URI,
    resource: configuration.resource,
    scope: 'threadmap.read offline_access',
    code_challenge: createPkceS256Challenge(verifier),
    code_challenge_method: 'S256',
  });
  const handle = new URL(authorization.location).searchParams.get('request');
  if (!handle) throw new Error('Missing authorization request handle.');
  const decision = await service.approveAuthorizationRequest(handle, TEST_USER_UID);
  const code = new URL(decision.location).searchParams.get('code');
  if (!code) throw new Error('Missing authorization code.');
  const tokens = await service.exchangeToken({
    grant_type: 'authorization_code',
    client_id: registration.client_id,
    code,
    redirect_uri: CLAUDE_REDIRECT_URI,
    code_verifier: verifier,
    resource: configuration.resource,
  });

  now += 61_000;
  await assert.rejects(
    service.startAuthorization({
      response_type: 'code',
      client_id: registration.client_id,
      redirect_uri: CLAUDE_REDIRECT_URI,
      resource: configuration.resource,
      scope: 'threadmap.read',
      code_challenge: createPkceS256Challenge('f'.repeat(43)),
      code_challenge_method: 'S256',
    }),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_client',
  );
  await assert.rejects(
    service.exchangeToken({
      grant_type: 'refresh_token',
      client_id: registration.client_id,
      refresh_token: tokens.refresh_token,
      resource: configuration.resource,
    }),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_client',
  );
  await assert.rejects(
    service.authenticateAccessToken(tokens.access_token),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_token',
  );
});

test('users can list and idempotently revoke only their own client authorization', async () => {
  const firestore = new MemoryFirestore();
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
  );
  const registration = await service.registerClient({
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'threadmap.read offline_access',
  });
  const verifier = 'g'.repeat(43);
  const authorization = await service.startAuthorization({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: CLAUDE_REDIRECT_URI,
    resource: configuration.resource,
    scope: 'threadmap.read offline_access',
    code_challenge: createPkceS256Challenge(verifier),
    code_challenge_method: 'S256',
  });
  const handle = new URL(authorization.location).searchParams.get('request');
  if (!handle) throw new Error('Missing authorization request handle.');
  const decision = await service.approveAuthorizationRequest(handle, TEST_USER_UID);
  const code = new URL(decision.location).searchParams.get('code');
  if (!code) throw new Error('Missing authorization code.');
  const tokens = await service.exchangeToken({
    grant_type: 'authorization_code',
    client_id: registration.client_id,
    code,
    redirect_uri: CLAUDE_REDIRECT_URI,
    code_verifier: verifier,
    resource: configuration.resource,
  });

  const listed = await service.listAuthorizations(TEST_USER_UID);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].clientId, registration.client_id);
  assert.equal(listed[0].clientName, 'Claude');
  const activeGrant = Object.values(firestore.dump().mcpOAuthUserGrants || {})[0];
  assert.equal(activeGrant.status, 'active');
  assert.equal(typeof activeGrant.expiresAt, 'number');
  assert.ok(activeGrant.expireAt instanceof Date);
  assert.equal(await service.revokeClient(registration.client_id, TEST_USER_UID), true);
  assert.equal(await service.revokeClient(registration.client_id, TEST_USER_UID), true);
  const revokedGrant = Object.values(firestore.dump().mcpOAuthUserGrants || {})[0];
  assert.equal(revokedGrant.status, 'revoked');
  assert.ok(Number(revokedGrant.expiresAt) >= Number(activeGrant.expiresAt));
  assert.ok(revokedGrant.expireAt instanceof Date);
  assert.deepEqual(await service.listAuthorizations(TEST_USER_UID), []);
  await assert.rejects(
    service.authenticateAccessToken(tokens.access_token),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_token',
  );
  await assert.rejects(
    service.exchangeToken({
      grant_type: 'refresh_token',
      client_id: registration.client_id,
      refresh_token: tokens.refresh_token,
      resource: configuration.resource,
    }),
    (error) => error instanceof OAuthProtocolError && error.code === 'invalid_grant',
  );
});

test('registration narrows an over-broad scope request instead of refusing it', () => {
  const store = new MemoryFirestore();
  const service = new ThreadmapOAuthService(store as unknown as Firestore, configuration);

  return (async () => {
    // A host that requests everything `scopes_supported` advertises must still
    // register; `threadmap.delete` is simply not granted to dynamic clients.
    const registered = await service.registerClient({
      client_name: 'Claude',
      redirect_uris: [CLAUDE_REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'threadmap.read threadmap.write threadmap.delete offline_access',
    });
    assert.deepEqual(registered.scope.split(' ').sort(), ['offline_access', 'threadmap.read']);

    // A software statement is ignored, not refused: every field it could assert is
    // validated from the plain request anyway.
    const withStatement = await service.registerClient({
      redirect_uris: [CLAUDE_REDIRECT_URI],
      software_statement: 'eyJhbGciOiJSUzI1NiJ9.e30.sig',
    });
    assert.match(withStatement.client_id, /^tmc_/);

    // offline_access is dropped rather than erroring when the grant is absent.
    const noRefresh = await service.registerClient({
      redirect_uris: [CLAUDE_REDIRECT_URI],
      grant_types: ['authorization_code'],
      scope: 'threadmap.read offline_access',
    });
    assert.deepEqual(noRefresh.scope.split(' '), ['threadmap.read']);
    assert.deepEqual(noRefresh.grant_types, ['authorization_code']);

    // The same narrowing must hold at the authorize step, where a host re-requests
    // the full advertised set after being granted less at registration. Rejecting
    // here sent `error=invalid_scope` back to the callback and dead-ended the
    // connector even though registration had succeeded.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const authorization = await service.startAuthorization({
      response_type: 'code',
      client_id: registered.client_id,
      redirect_uri: CLAUDE_REDIRECT_URI,
      resource: configuration.resource,
      scope: 'threadmap.read threadmap.write threadmap.delete offline_access',
      state: 'client-state',
      code_challenge: createPkceS256Challenge(verifier),
      code_challenge_method: 'S256',
    });
    const handle = new URL(authorization.location).searchParams.get('request');
    if (!handle) throw new Error('Missing authorization request handle.');
    const view = await service.getAuthorizationRequest(handle, TEST_USER_UID);
    // The user is asked to approve only what is actually grantable.
    assert.deepEqual(view.scopes.sort(), ['offline_access', 'threadmap.read']);

    // Nothing grantable at all is still a refusal.
    await assert.rejects(
      () => service.registerClient({
        redirect_uris: [CLAUDE_REDIRECT_URI],
        scope: 'threadmap.delete',
      }),
      (error: unknown) => error instanceof OAuthProtocolError
        && error.code === 'invalid_client_metadata',
    );
  })();
});
