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

type MemoryDocument = Record<string, unknown>;

class MemorySnapshot {
  constructor(private readonly value: MemoryDocument | undefined) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): MemoryDocument | undefined {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }
}

class MemoryDocumentReference {
  constructor(
    private readonly store: MemoryFirestore,
    readonly collectionName: string,
    readonly id: string
  ) {}

  async create(value: MemoryDocument): Promise<void> {
    this.store.create(this.collectionName, this.id, value);
  }

  async get(): Promise<MemorySnapshot> {
    return this.store.get(this.collectionName, this.id);
  }
}

class MemoryCollectionReference {
  constructor(
    private readonly store: MemoryFirestore,
    private readonly collectionName: string
  ) {}

  doc(id: string): MemoryDocumentReference {
    return new MemoryDocumentReference(this.store, this.collectionName, id);
  }
}

class MemoryTransaction {
  constructor(private readonly store: MemoryFirestore) {}

  async get(reference: MemoryDocumentReference): Promise<MemorySnapshot> {
    return this.store.get(reference.collectionName, reference.id);
  }

  create(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.store.create(reference.collectionName, reference.id, value);
    return this;
  }

  update(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.store.update(reference.collectionName, reference.id, value);
    return this;
  }
}

class MemoryFirestore {
  private readonly data = new Map<string, Map<string, MemoryDocument>>();

  collection(name: string): MemoryCollectionReference {
    return new MemoryCollectionReference(this, name);
  }

  async runTransaction<T>(callback: (transaction: MemoryTransaction) => Promise<T>): Promise<T> {
    return callback(new MemoryTransaction(this));
  }

  get(collection: string, id: string): MemorySnapshot {
    return new MemorySnapshot(this.data.get(collection)?.get(id));
  }

  create(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection) || new Map<string, MemoryDocument>();
    if (documents.has(id)) throw new Error('Document already exists.');
    documents.set(id, structuredClone(value));
    this.data.set(collection, documents);
  }

  update(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection);
    const current = documents?.get(id);
    if (!documents || !current) throw new Error('Document does not exist.');
    documents.set(id, { ...current, ...structuredClone(value) });
  }

  dump(): Record<string, Record<string, MemoryDocument>> {
    return Object.fromEntries(
      [...this.data.entries()].map(([collection, documents]) => [
        collection,
        Object.fromEntries(documents.entries()),
      ])
    );
  }
}

const configuration: ThreadmapOAuthConfiguration = {
  ownerUid: 'threadmap-owner',
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

test('configuration tolerates blank ownerUid by using the built-in MCP owner identifier', () => {
  const normalized = resolveThreadmapOAuthConfiguration({
    ...configuration,
    ownerUid: '   ',
  });
  assert.equal(normalized.ownerUid, 'threadmap-system');
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

  const requestView = await service.getAuthorizationRequest(requestToken, configuration.ownerUid);
  assert.equal(requestView.clientName, 'Claude');
  assert.deepEqual(requestView.scopes, ['threadmap.read', 'offline_access']);

  const decision = await service.approveAuthorizationRequest(
    requestToken,
    configuration.ownerUid
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
  assert.equal(principal.userId, configuration.ownerUid);
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

test('per-user authorization and revocation scopes token families independently', async () => {
  const firestore = new MemoryFirestore();
  const now = Date.UTC(2026, 7, 6, 12, 0, 0);
  const service = new ThreadmapOAuthService(
    firestore as unknown as Firestore,
    configuration,
    { now: () => now }
  );
  const firstUser = 'threadmap-user-a';
  const secondUser = 'threadmap-user-b';

  const registration = await service.registerClient({
    redirect_uris: [CLAUDE_REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: 'Shared Claude Client',
    scope: 'threadmap.read offline_access',
    resource: configuration.resource,
  });

  const startFlow = async (requestUser: string, state: string) => {
    const authorization = await service.startAuthorization({
      response_type: 'code',
      client_id: registration.client_id,
      redirect_uri: CLAUDE_REDIRECT_URI,
      resource: configuration.resource,
      scope: 'threadmap.read offline_access',
      state,
      code_challenge: createPkceS256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      code_challenge_method: 'S256',
    });
    const requestToken = new URL(authorization.location).searchParams.get('request');
    if (!requestToken?.startsWith('tmar_')) throw new Error('Missing authorization request handle.');
    await service.getAuthorizationRequest(requestToken, requestUser);
    const decision = await service.approveAuthorizationRequest(requestToken, requestUser);
    const callback = new URL(decision.location);
    const code = callback.searchParams.get('code');
    if (!code?.startsWith('tmac_')) throw new Error('Missing authorization code.');
    return code;
  };

  const codeForFirstUser = await startFlow(firstUser, 'first-user-state');
  const firstUserTokenSet = await service.exchangeToken({
    grant_type: 'authorization_code',
    client_id: registration.client_id,
    code: codeForFirstUser,
    redirect_uri: CLAUDE_REDIRECT_URI,
    code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    resource: configuration.resource,
  });
  const codeForSecondUser = await startFlow(secondUser, 'second-user-state');
  const secondUserTokenSet = await service.exchangeToken({
    grant_type: 'authorization_code',
    client_id: registration.client_id,
    code: codeForSecondUser,
    redirect_uri: CLAUDE_REDIRECT_URI,
    code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    resource: configuration.resource,
  });

  const principalA = await service.authenticateAccessToken(firstUserTokenSet.access_token, ['threadmap.read']);
  const principalB = await service.authenticateAccessToken(secondUserTokenSet.access_token, ['threadmap.read']);
  assert.equal(principalA.userId, firstUser);
  assert.equal(principalB.userId, secondUser);
  assert.equal(principalA.clientId, registration.client_id);
  assert.equal(principalB.clientId, registration.client_id);

  const firstUserClients = await service.listClients(firstUser);
  const secondUserClients = await service.listClients(secondUser);
  assert.deepEqual(firstUserClients.length, 1);
  assert.deepEqual(secondUserClients.length, 1);
  assert.equal(firstUserClients[0]?.clientId, registration.client_id);
  assert.equal(secondUserClients[0]?.clientId, registration.client_id);
  assert.equal(firstUserClients[0]?.clientName, 'Shared Claude Client');

  const firstUserFamilies = await service.listTokenFamilies(firstUser);
  const secondUserFamilies = await service.listTokenFamilies(secondUser);
  assert.equal(firstUserFamilies.length, 1);
  assert.equal(secondUserFamilies.length, 1);
  assert.notEqual(firstUserFamilies[0]?.tokenFamilyId, secondUserFamilies[0]?.tokenFamilyId);
  assert.equal(firstUserFamilies[0]?.userId, firstUser);
  assert.equal(secondUserFamilies[0]?.userId, secondUser);

  const revokedForFirstUser = await service.revokeClient(registration.client_id, firstUser, 'administrative');
  assert.equal(revokedForFirstUser, true);

  const firstUserFamiliesAfterRevoke = await service.listTokenFamilies(firstUser, true);
  const secondUserFamiliesAfterRevoke = await service.listTokenFamilies(secondUser, false);
  assert.equal(firstUserFamiliesAfterRevoke[0]?.status, 'revoked');
  assert.equal(secondUserFamiliesAfterRevoke.length, 1);
  assert.equal(secondUserFamiliesAfterRevoke[0]?.status, 'active');
});
