import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import {
  type OAuthEndpointConfiguration,
  type SupportedClientAuthenticationMethod,
  createAuthorizationServerMetadata,
  createBearerChallenge,
  createProtectedResourceMetadata,
  validateOAuthEndpointConfiguration,
} from './metadata';
import {
  type RedirectUriPlatform,
  type RedirectUriPolicy,
  appendOAuthParameters,
  areScopesAllowed,
  assertExactResource,
  classifyRedirectUri,
  constantTimeStringEqual,
  generateOpaqueToken,
  hashOpaqueToken,
  isValidOpaqueValue,
  normalizeScopes,
  parseBasicClientCredentials,
  validateClientId,
  validateDurationSeconds,
  validateHttpsUrl,
  validatePkceChallenge,
  validateRegisteredRedirectUris,
  validateState,
  verifyPkceS256,
} from './security';

export const OAUTH_COLLECTIONS = Object.freeze({
  clients: 'mcpOAuthClients',
  authorizationRequests: 'mcpOAuthAuthorizationRequests',
  authorizationCodes: 'mcpOAuthAuthorizationCodes',
  accessTokens: 'mcpOAuthAccessTokens',
  refreshTokens: 'mcpOAuthRefreshTokens',
  tokenFamilies: 'mcpOAuthTokenFamilies',
  userGrants: 'mcpOAuthUserGrants',
  registrationLimits: 'mcpRateLimits',
});

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_AUTHORIZATION_REQUEST_TTL_SECONDS = 10 * 60;
const DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const MAX_REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DYNAMIC_CLIENT_TTL_MS = 180 * 24 * 60 * 60_000;
const REGISTRATION_WINDOW_MS = 60 * 60_000;
const REGISTRATION_SOURCE_LIMIT = 30;
const REGISTRATION_GLOBAL_LIMIT = 1_000;
const ACCOUNT_DELETION_COLLECTION = 'accountDeletionJobs';

type OAuthGrantType = 'authorization_code' | 'refresh_token';

export type OAuthProtocolErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'invalid_token'
  | 'insufficient_scope'
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata'
  | 'invalid_software_statement'
  | 'server_error'
  | 'temporarily_unavailable';

export interface OAuthProtocolErrorOptions {
  status?: number;
  redirectUri?: string;
  state?: string;
}

export class OAuthProtocolError extends Error {
  readonly code: OAuthProtocolErrorCode;
  readonly status: number;
  readonly redirectUri?: string;
  readonly state?: string;

  constructor(
    code: OAuthProtocolErrorCode,
    description: string,
    options: OAuthProtocolErrorOptions = {}
  ) {
    super(description);
    this.name = 'OAuthProtocolError';
    this.code = code;
    this.status = options.status ?? (code === 'invalid_client' ? 401 : 400);
    this.redirectUri = options.redirectUri;
    this.state = options.state;
  }
}

export interface SerializedOAuthError {
  status: number;
  body: {
    error: OAuthProtocolErrorCode;
    error_description: string;
  };
}

export function serializeOAuthError(error: unknown): SerializedOAuthError {
  const safeError = error instanceof OAuthProtocolError
    ? error
    : new OAuthProtocolError('server_error', 'The authorization server could not complete the request.', {
      status: 500,
    });
  return {
    status: safeError.status,
    body: {
      error: safeError.code,
      error_description: safeError.message,
    },
  };
}

export function createAuthorizationErrorRedirect(
  error: unknown,
  redirectUriPolicy: RedirectUriPolicy = {}
): string | null {
  if (!(error instanceof OAuthProtocolError) || !error.redirectUri) return null;
  try {
    classifyRedirectUri(error.redirectUri, redirectUriPolicy);
  } catch {
    return null;
  }
  return appendOAuthParameters(error.redirectUri, {
    error: error.code,
    error_description: error.message,
    state: error.state,
  });
}

export interface ThreadmapOAuthConfiguration
  extends OAuthEndpointConfiguration, RedirectUriPolicy {
  /** Browser UI that owns the authenticated consent decision. */
  authorizationConsentUrl?: string;
  dynamicClientScopes?: readonly string[];
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  authorizationRequestTtlSeconds?: number;
  authorizationCodeTtlSeconds?: number;
}

export interface ResolvedThreadmapOAuthConfiguration
  extends OAuthEndpointConfiguration, RedirectUriPolicy {
  authorizationConsentUrl: string;
  dynamicClientScopes: string[];
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authorizationRequestTtlSeconds: number;
  authorizationCodeTtlSeconds: number;
  clientAuthenticationMethods: SupportedClientAuthenticationMethod[];
}

export interface OAuthServiceDependencies {
  now?: () => number;
  generateToken?: (prefix: string, entropyBytes?: number) => string;
  dynamicClientTtlMs?: number;
  registrationSourceLimit?: number;
  registrationGlobalLimit?: number;
}

export interface McpAuthorizationGrant {
  clientId: string;
  clientName: string;
  authorizedAt: number;
  lastAuthorizedAt: number;
  expiresAt?: number;
}

export interface DynamicClientRegistrationRequest {
  redirect_uris?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  client_name?: unknown;
  scope?: unknown;
  resource?: unknown;
  software_statement?: unknown;
  [key: string]: unknown;
}

export interface DynamicClientRegistrationResponse {
  client_id: string;
  client_id_issued_at: number;
  client_secret?: string;
  client_secret_expires_at?: number;
  redirect_uris: string[];
  token_endpoint_auth_method: SupportedClientAuthenticationMethod;
  grant_types: OAuthGrantType[];
  response_types: ['code'];
  client_name: string;
  scope: string;
}

export interface AuthorizationStartRequest {
  response_type?: unknown;
  client_id?: unknown;
  redirect_uri?: unknown;
  resource?: unknown;
  scope?: unknown;
  state?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  [key: string]: unknown;
}

export interface AuthorizationRedirectResult {
  location: string;
  expiresAt: number;
}

export interface AuthorizationRequestView {
  clientId: string;
  clientName: string;
  platform: RedirectUriPlatform;
  scopes: string[];
  resource: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthorizationDecisionResult {
  location: string;
}

export interface OAuthTokenRequest {
  grant_type?: unknown;
  client_id?: unknown;
  client_secret?: unknown;
  code?: unknown;
  redirect_uri?: unknown;
  code_verifier?: unknown;
  refresh_token?: unknown;
  resource?: unknown;
  scope?: unknown;
  [key: string]: unknown;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export interface OAuthRevocationRequest {
  token?: unknown;
  token_type_hint?: unknown;
  client_id?: unknown;
  client_secret?: unknown;
  [key: string]: unknown;
}

export interface OAuthPrincipal {
  userId: string;
  clientId: string;
  scopes: string[];
  resource: string;
  expiresAt: number;
  tokenId: string;
  tokenFamilyId: string;
}

interface OAuthClientDocument {
  clientId: string;
  clientName: string;
  platform: RedirectUriPlatform;
  redirectUris: string[];
  tokenEndpointAuthMethod: SupportedClientAuthenticationMethod;
  clientSecretHash?: string;
  grantTypes: OAuthGrantType[];
  responseTypes: ['code'];
  scopes: string[];
  resource: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  expireAt?: Date;
  revokedAt?: number;
}

interface AuthorizationRequestDocument {
  status: 'pending' | 'approved' | 'denied';
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  createdAt: number;
  expiresAt: number;
  expireAt: Date;
  decidedAt?: number;
  userId?: string;
}

interface AuthorizationCodeDocument {
  status: 'active' | 'consumed';
  clientId: string;
  userId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  issuedAt: number;
  expiresAt: number;
  expireAt: Date;
  consumedAt?: number;
}

interface TokenFamilyDocument {
  status: 'active' | 'revoked';
  clientId: string;
  userId: string;
  resource: string;
  createdAt: number;
  expiresAt: number;
  expireAt: Date;
  latestSequence: number;
  latestRefreshTokenHash?: string;
  lastRotatedAt?: number;
  revokedAt?: number;
  revocationReason?: string;
}

interface AccessTokenDocument {
  status: 'active' | 'revoked';
  clientId: string;
  userId: string;
  resource: string;
  scopes: string[];
  tokenFamilyId: string;
  issuedAt: number;
  expiresAt: number;
  expireAt: Date;
  revokedAt?: number;
}

interface RefreshTokenDocument {
  status: 'active' | 'consumed' | 'revoked';
  clientId: string;
  userId: string;
  resource: string;
  scopes: string[];
  tokenFamilyId: string;
  sequence: number;
  issuedAt: number;
  expiresAt: number;
  expireAt: Date;
  consumedAt?: number;
  replacedByHash?: string;
  revokedAt?: number;
}

interface UserGrantDocument {
  userId: string;
  clientId: string;
  status: 'active' | 'revoked';
  authorizedAt: number;
  lastAuthorizedAt: number;
  updatedAt: number;
  expiresAt: number;
  expireAt: Date;
  revokedAt?: number;
}

interface PresentedClientCredentials {
  clientId: string;
  method: SupportedClientAuthenticationMethod;
  clientSecret?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expectRecord(value: unknown, description = 'The OAuth request is invalid.'):
Record<string, unknown> {
  if (!isRecord(value)) throw new OAuthProtocolError('invalid_request', description);
  return value;
}

function expectString(
  value: unknown,
  code: OAuthProtocolErrorCode,
  description: string,
  maximumLength = 2_048
): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximumLength) {
    throw new OAuthProtocolError(code, description);
  }
  return value;
}

function expectStringArray(
  value: unknown,
  code: OAuthProtocolErrorCode,
  description: string
): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new OAuthProtocolError(code, description);
  }
  return [...value];
}

function isValidUserId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 128
    && !/[\/\u0000-\u001F\u007F]/.test(value);
}

function validateClientName(value: unknown, platform: RedirectUriPlatform): string {
  if (value === undefined) {
    if (platform === 'chatgpt') return 'ChatGPT';
    if (platform === 'claude') return 'Claude';
    return 'MCP client';
  }
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > 100
      || !/^[\x20-\x7E]+$/.test(value)) {
    throw new OAuthProtocolError(
      'invalid_client_metadata',
      'client_name must be a short printable string.'
    );
  }
  return value.trim();
}

function normalizeGrantTypes(value: unknown): OAuthGrantType[] {
  const grants = value === undefined
    ? ['authorization_code', 'refresh_token']
    : expectStringArray(
      value,
      'invalid_client_metadata',
      'grant_types must contain supported OAuth grants.'
    );
  if (grants.length < 1 || new Set(grants).size !== grants.length
      || !grants.includes('authorization_code')
      || grants.some((grant) => grant !== 'authorization_code' && grant !== 'refresh_token')) {
    throw new OAuthProtocolError(
      'invalid_client_metadata',
      'Only authorization_code and refresh_token grants are supported.'
    );
  }
  return grants as OAuthGrantType[];
}

function normalizeResponseTypes(value: unknown): ['code'] {
  const responseTypes = value === undefined
    ? ['code']
    : expectStringArray(
      value,
      'invalid_client_metadata',
      'response_types must contain only code.'
    );
  if (responseTypes.length !== 1 || responseTypes[0] !== 'code') {
    throw new OAuthProtocolError(
      'invalid_client_metadata',
      'Only the code response type is supported.'
    );
  }
  return ['code'];
}

function normalizeClientAuthenticationMethod(
  value: unknown,
  supportedMethods: readonly SupportedClientAuthenticationMethod[]
): SupportedClientAuthenticationMethod {
  const method = value === undefined ? 'none' : value;
  if (method !== 'none' && method !== 'client_secret_basic' && method !== 'client_secret_post') {
    throw new OAuthProtocolError(
      'invalid_client_metadata',
      'token_endpoint_auth_method is unsupported.'
    );
  }
  if (!supportedMethods.includes(method)) {
    throw new OAuthProtocolError(
      'invalid_client_metadata',
      'token_endpoint_auth_method is not enabled by this authorization server.'
    );
  }
  return method;
}

function clientDocument(value: unknown): OAuthClientDocument | null {
  if (!isRecord(value)
      || typeof value.clientId !== 'string'
      || typeof value.clientName !== 'string'
      || !Array.isArray(value.redirectUris)
      || !value.redirectUris.every((uri) => typeof uri === 'string')
      || !Array.isArray(value.grantTypes)
      || !value.grantTypes.every((grant) => grant === 'authorization_code' || grant === 'refresh_token')
      || !Array.isArray(value.scopes)
      || !value.scopes.every((scope) => typeof scope === 'string')
      || typeof value.resource !== 'string'
      || typeof value.createdAt !== 'number'
      || typeof value.updatedAt !== 'number'
      || (value.expiresAt !== undefined && typeof value.expiresAt !== 'number')
      || (value.platform !== 'chatgpt' && value.platform !== 'claude'
        && value.platform !== 'configured' && value.platform !== 'loopback')
      || (value.tokenEndpointAuthMethod !== 'none'
        && value.tokenEndpointAuthMethod !== 'client_secret_basic'
        && value.tokenEndpointAuthMethod !== 'client_secret_post')) {
    return null;
  }
  return value as unknown as OAuthClientDocument;
}

function authorizationRequestDocument(value: unknown): AuthorizationRequestDocument | null {
  if (!isRecord(value)
      || (value.status !== 'pending' && value.status !== 'approved' && value.status !== 'denied')
      || typeof value.clientId !== 'string'
      || typeof value.redirectUri !== 'string'
      || typeof value.resource !== 'string'
      || !Array.isArray(value.scopes)
      || !value.scopes.every((scope) => typeof scope === 'string')
      || typeof value.codeChallenge !== 'string'
      || value.codeChallengeMethod !== 'S256'
      || typeof value.createdAt !== 'number'
      || typeof value.expiresAt !== 'number'
      || (value.userId !== undefined && !isValidUserId(value.userId))) {
    return null;
  }
  return value as unknown as AuthorizationRequestDocument;
}

function authorizationCodeDocument(value: unknown): AuthorizationCodeDocument | null {
  if (!isRecord(value)
      || (value.status !== 'active' && value.status !== 'consumed')
      || typeof value.clientId !== 'string'
      || !isValidUserId(value.userId)
      || typeof value.redirectUri !== 'string'
      || typeof value.resource !== 'string'
      || !Array.isArray(value.scopes)
      || !value.scopes.every((scope) => typeof scope === 'string')
      || typeof value.codeChallenge !== 'string'
      || value.codeChallengeMethod !== 'S256'
      || typeof value.issuedAt !== 'number'
      || typeof value.expiresAt !== 'number') {
    return null;
  }
  return value as unknown as AuthorizationCodeDocument;
}

function tokenFamilyDocument(value: unknown): TokenFamilyDocument | null {
  if (!isRecord(value)
      || (value.status !== 'active' && value.status !== 'revoked')
      || typeof value.clientId !== 'string'
      || !isValidUserId(value.userId)
      || typeof value.resource !== 'string'
      || typeof value.createdAt !== 'number'
      || typeof value.expiresAt !== 'number'
      || typeof value.latestSequence !== 'number') {
    return null;
  }
  return value as unknown as TokenFamilyDocument;
}

function accessTokenDocument(value: unknown): AccessTokenDocument | null {
  if (!isRecord(value)
      || (value.status !== 'active' && value.status !== 'revoked')
      || typeof value.clientId !== 'string'
      || !isValidUserId(value.userId)
      || typeof value.resource !== 'string'
      || !Array.isArray(value.scopes)
      || !value.scopes.every((scope) => typeof scope === 'string')
      || typeof value.tokenFamilyId !== 'string'
      || typeof value.issuedAt !== 'number'
      || typeof value.expiresAt !== 'number') {
    return null;
  }
  return value as unknown as AccessTokenDocument;
}

function refreshTokenDocument(value: unknown): RefreshTokenDocument | null {
  if (!isRecord(value)
      || (value.status !== 'active' && value.status !== 'consumed' && value.status !== 'revoked')
      || typeof value.clientId !== 'string'
      || !isValidUserId(value.userId)
      || typeof value.resource !== 'string'
      || !Array.isArray(value.scopes)
      || !value.scopes.every((scope) => typeof scope === 'string')
      || typeof value.tokenFamilyId !== 'string'
      || typeof value.sequence !== 'number'
      || typeof value.issuedAt !== 'number'
      || typeof value.expiresAt !== 'number') {
    return null;
  }
  return value as unknown as RefreshTokenDocument;
}

function userGrantDocument(value: unknown): UserGrantDocument | null {
  if (!isRecord(value)
      || !isValidUserId(value.userId)
      || typeof value.clientId !== 'string'
      || (value.status !== 'active' && value.status !== 'revoked')
      || typeof value.authorizedAt !== 'number'
      || typeof value.lastAuthorizedAt !== 'number'
      || typeof value.updatedAt !== 'number'
      || typeof value.expiresAt !== 'number') {
    return null;
  }
  return value as unknown as UserGrantDocument;
}

function userGrantId(userId: string, clientId: string): string {
  return hashOpaqueToken(`mcp-user-grant:${userId}\0${clientId}`);
}

function ensureActiveClient(client: OAuthClientDocument | null, now = Date.now()): OAuthClientDocument {
  if (!client || client.revokedAt !== undefined
      || (client.expiresAt !== undefined && client.expiresAt <= now)) {
    throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', { status: 401 });
  }
  return client;
}

export function resolveThreadmapOAuthConfiguration(
  configuration: ThreadmapOAuthConfiguration
): ResolvedThreadmapOAuthConfiguration {
  validateOAuthEndpointConfiguration(configuration);
  const authorizationConsentUrl = configuration.authorizationConsentUrl
    ?? `${new URL(configuration.issuer).origin}/integrations/authorize`;
  validateHttpsUrl(authorizationConsentUrl, 'authorization consent URL', {
    allowPath: true,
    allowQuery: false,
  });

  const supportedScopes = normalizeScopes(configuration.scopesSupported);
  const dynamicClientScopes = normalizeScopes(
    configuration.dynamicClientScopes,
    supportedScopes.filter((scope) => scope === 'threadmap.read' || scope === 'offline_access')
  );
  if (dynamicClientScopes.length < 1 || !areScopesAllowed(dynamicClientScopes, supportedScopes)) {
    throw new Error('dynamicClientScopes must be a non-empty subset of scopesSupported.');
  }

  const configuredRedirectUris = [...new Set(configuration.configuredRedirectUris || [])];
  for (const redirectUri of configuredRedirectUris) {
    classifyRedirectUri(redirectUri, {
      configuredRedirectUris,
      allowLoopbackDevelopmentRedirects: configuration.allowLoopbackDevelopmentRedirects,
    });
  }

  return {
    ...configuration,
    authorizationConsentUrl,
    scopesSupported: supportedScopes,
    dynamicClientScopes,
    configuredRedirectUris,
    allowLoopbackDevelopmentRedirects: Boolean(
      configuration.allowLoopbackDevelopmentRedirects
    ),
    accessTokenTtlSeconds: validateDurationSeconds(
      configuration.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      'accessTokenTtlSeconds',
      60,
      MAX_ACCESS_TOKEN_TTL_SECONDS
    ),
    refreshTokenTtlSeconds: validateDurationSeconds(
      configuration.refreshTokenTtlSeconds ?? DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      'refreshTokenTtlSeconds',
      60 * 60,
      MAX_REFRESH_TOKEN_TTL_SECONDS
    ),
    authorizationRequestTtlSeconds: validateDurationSeconds(
      configuration.authorizationRequestTtlSeconds ?? DEFAULT_AUTHORIZATION_REQUEST_TTL_SECONDS,
      'authorizationRequestTtlSeconds',
      60,
      15 * 60
    ),
    authorizationCodeTtlSeconds: validateDurationSeconds(
      configuration.authorizationCodeTtlSeconds ?? DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS,
      'authorizationCodeTtlSeconds',
      30,
      10 * 60
    ),
    clientAuthenticationMethods: [
      ...(configuration.clientAuthenticationMethods || [
        'none',
        'client_secret_basic',
        'client_secret_post',
      ]),
    ],
  };
}

function authorizationError(
  code: OAuthProtocolErrorCode,
  description: string,
  redirectUri?: string,
  state?: string
): OAuthProtocolError {
  return new OAuthProtocolError(code, description, { redirectUri, state });
}

export class ThreadmapOAuthService {
  readonly configuration: ResolvedThreadmapOAuthConfiguration;
  private readonly now: () => number;
  private readonly generateToken: (prefix: string, entropyBytes?: number) => string;
  private readonly dynamicClientTtlMs: number;
  private readonly registrationSourceLimit: number;
  private readonly registrationGlobalLimit: number;

  constructor(
    private readonly db: Firestore,
    configuration: ThreadmapOAuthConfiguration,
    dependencies: OAuthServiceDependencies = {}
  ) {
    this.configuration = resolveThreadmapOAuthConfiguration(configuration);
    this.now = dependencies.now || Date.now;
    this.generateToken = dependencies.generateToken || generateOpaqueToken;
    this.dynamicClientTtlMs = Math.max(60_000, Math.trunc(
      dependencies.dynamicClientTtlMs ?? DYNAMIC_CLIENT_TTL_MS
    ));
    this.registrationSourceLimit = Math.max(1, Math.trunc(
      dependencies.registrationSourceLimit ?? REGISTRATION_SOURCE_LIMIT
    ));
    this.registrationGlobalLimit = Math.max(this.registrationSourceLimit, Math.trunc(
      dependencies.registrationGlobalLimit ?? REGISTRATION_GLOBAL_LIMIT
    ));
  }

  authorizationServerMetadata() {
    return createAuthorizationServerMetadata(this.configuration);
  }

  protectedResourceMetadata() {
    return createProtectedResourceMetadata(this.configuration);
  }

  /**
   * Apply the live server policy to every persisted legacy scope set. Tool
   * scopes are capped by the operator's current policy; offline_access remains
   * meaningful only as a refresh-token capability and never authorizes a tool.
   */
  private effectivePolicyScopes(scopes: readonly string[]): string[] {
    const allowedToolScopes = new Set(
      this.configuration.dynamicClientScopes.filter((scope) => scope.startsWith('threadmap.'))
    );
    return [...new Set(scopes)].filter((scope) =>
      scope === 'offline_access' || allowedToolScopes.has(scope)
    );
  }

  private hasEffectiveToolScope(scopes: readonly string[]): boolean {
    return scopes.some((scope) => scope.startsWith('threadmap.'));
  }

  bearerChallenge(requiredScopes: readonly string[] = []): string {
    return createBearerChallenge(this.configuration.protectedResourceMetadataUrl, {
      scope: requiredScopes,
    });
  }

  async registerClient(
    input: DynamicClientRegistrationRequest | unknown,
    registrationSubject = 'unknown',
  ):
  Promise<DynamicClientRegistrationResponse> {
    const request = expectRecord(input, 'Dynamic client metadata must be a JSON object.');
    // A software statement is a signed assertion of client metadata. This server
    // has no issuer to trust one against, so it is ignored rather than refused —
    // every field it could assert is independently validated below from the plain
    // request, so ignoring it grants nothing. Refusing the registration outright
    // would lock out any host that sends one alongside valid metadata.
    const redirectValues = expectStringArray(
      request.redirect_uris,
      'invalid_redirect_uri',
      'redirect_uris must be a list of approved callbacks.'
    );
    let redirects: { redirectUris: string[]; platform: RedirectUriPlatform };
    try {
      redirects = validateRegisteredRedirectUris(redirectValues, this.configuration);
    } catch {
      throw new OAuthProtocolError(
        'invalid_redirect_uri',
        'redirect_uris contains an unapproved or malformed callback.'
      );
    }

    const method = normalizeClientAuthenticationMethod(
      request.token_endpoint_auth_method,
      this.configuration.clientAuthenticationMethods
    );
    const grantTypes = normalizeGrantTypes(request.grant_types);
    const responseTypes = normalizeResponseTypes(request.response_types);
    const clientName = validateClientName(request.client_name, redirects.platform);
    let scopes: string[];
    try {
      const defaultScopes = grantTypes.includes('refresh_token')
        ? this.configuration.dynamicClientScopes
        : this.configuration.dynamicClientScopes.filter((scope) => scope !== 'offline_access');
      scopes = normalizeScopes(request.scope, defaultScopes);
    } catch {
      throw new OAuthProtocolError('invalid_client_metadata', 'The requested client scope is invalid.');
    }
    // Narrow to policy instead of refusing. RFC 7591 §2 and RFC 6749 §3.3 both let
    // the authorization server issue a scope narrower than the one requested, and
    // hosts routinely request everything `scopes_supported` advertises — which is
    // broader than what a dynamically registered client may hold, because
    // `threadmap.delete` is reserved for explicitly configured clients. The
    // registration response reports the granted scope, so the client is told what
    // it actually got. The result is always a subset of policy, so this can never
    // grant more than `dynamicClientScopes` allows.
    scopes = scopes.filter((scope) => this.configuration.dynamicClientScopes.includes(scope));
    // offline_access is meaningless without the grant that uses it.
    if (!grantTypes.includes('refresh_token')) {
      scopes = scopes.filter((scope) => scope !== 'offline_access');
    }
    if (!this.hasEffectiveToolScope(scopes)) {
      throw new OAuthProtocolError(
        'invalid_client_metadata',
        'None of the requested scopes are available to dynamically registered clients.'
      );
    }
    if (request.resource !== undefined) {
      try {
        assertExactResource(
          expectString(
            request.resource,
            'invalid_client_metadata',
            'resource is invalid.'
          ),
          this.configuration.resource
        );
      } catch (error) {
        if (error instanceof OAuthProtocolError) throw error;
        throw new OAuthProtocolError(
          'invalid_client_metadata',
          'resource does not identify this protected resource.'
        );
      }
    }

    const now = this.now();
    const expiresAt = now + this.dynamicClientTtlMs;
    const clientId = this.generateToken('tmc_', 24);
    const clientSecret = method === 'none' ? undefined : this.generateToken('tmcs_', 32);
    const document: OAuthClientDocument = {
      clientId,
      clientName,
      platform: redirects.platform,
      redirectUris: redirects.redirectUris,
      tokenEndpointAuthMethod: method,
      ...(clientSecret ? { clientSecretHash: hashOpaqueToken(clientSecret) } : {}),
      grantTypes,
      responseTypes,
      scopes,
      resource: this.configuration.resource,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      expireAt: new Date(expiresAt),
    };
    const normalizedSubject = typeof registrationSubject === 'string'
      ? registrationSubject.slice(0, 512)
      : 'unknown';
    const sourceHash = hashOpaqueToken(`mcp-registration-source:${normalizedSubject}`);
    const windowStart = Math.floor(now / REGISTRATION_WINDOW_MS) * REGISTRATION_WINDOW_MS;
    const globalQuotaRef = this.db.collection(OAUTH_COLLECTIONS.registrationLimits)
      .doc(`registration_global_${windowStart}`);
    const sourceQuotaRef = this.db.collection(OAUTH_COLLECTIONS.registrationLimits)
      .doc(`registration_source_${sourceHash}_${windowStart}`);
    const clientRef = this.db.collection(OAUTH_COLLECTIONS.clients).doc(clientId);
    await this.db.runTransaction(async (transaction) => {
      const [globalQuota, sourceQuota] = await Promise.all([
        transaction.get(globalQuotaRef),
        transaction.get(sourceQuotaRef),
      ]);
      const quotaCount = (snapshot: { data(): Record<string, unknown> | undefined }) => {
        const count = Number(snapshot.data()?.count || 0);
        return Number.isSafeInteger(count) && count >= 0 ? count : 0;
      };
      const globalCount = quotaCount(globalQuota);
      const sourceCount = quotaCount(sourceQuota);
      if (globalCount >= this.registrationGlobalLimit
          || sourceCount >= this.registrationSourceLimit) {
        throw new OAuthProtocolError(
          'temporarily_unavailable',
          'Dynamic client registration is temporarily rate limited.',
          { status: 429 }
        );
      }
      const quotaExpiry = windowStart + (2 * REGISTRATION_WINDOW_MS);
      transaction.set(globalQuotaRef, {
        kind: 'oauth-registration-global',
        windowStart,
        count: globalCount + 1,
        updatedAt: now,
        expireAt: new Date(quotaExpiry),
      });
      transaction.set(sourceQuotaRef, {
        kind: 'oauth-registration-source',
        subjectHash: sourceHash,
        windowStart,
        count: sourceCount + 1,
        updatedAt: now,
        expireAt: new Date(quotaExpiry),
      });
      transaction.create(clientRef, document);
    });

    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(now / 1_000),
      ...(clientSecret
        ? {
            client_secret: clientSecret,
            client_secret_expires_at: Math.floor(expiresAt / 1_000),
          }
        : {}),
      redirect_uris: [...redirects.redirectUris],
      token_endpoint_auth_method: method,
      grant_types: [...grantTypes],
      response_types: ['code'],
      client_name: clientName,
      scope: scopes.join(' '),
    };
  }

  async startAuthorization(input: AuthorizationStartRequest | unknown):
  Promise<AuthorizationRedirectResult> {
    const request = expectRecord(input);
    let clientId: string;
    try {
      clientId = validateClientId(request.client_id);
    } catch {
      throw new OAuthProtocolError('invalid_request', 'client_id is invalid.');
    }
    const now = this.now();
    const clientSnapshot = await this.db.collection(OAUTH_COLLECTIONS.clients).doc(clientId).get();
    const client = ensureActiveClient(clientDocument(clientSnapshot.data()), now);

    const redirectUri = expectString(
      request.redirect_uri,
      'invalid_request',
      'redirect_uri is required.'
    );
    if (!client.redirectUris.includes(redirectUri)) {
      throw new OAuthProtocolError('invalid_request', 'redirect_uri is not registered for this client.');
    }

    let state: string | undefined;
    try {
      state = validateState(request.state);
    } catch {
      throw authorizationError(
        'invalid_request',
        'state is invalid.',
        redirectUri
      );
    }
    const redirectingError = (code: OAuthProtocolErrorCode, description: string) =>
      authorizationError(code, description, redirectUri, state);

    if (request.response_type !== 'code') {
      throw redirectingError('unsupported_response_type', 'Only response_type=code is supported.');
    }
    if (request.code_challenge_method !== 'S256') {
      throw redirectingError('invalid_request', 'PKCE code_challenge_method must be S256.');
    }
    let codeChallenge: string;
    try {
      codeChallenge = validatePkceChallenge(request.code_challenge);
    } catch {
      throw redirectingError('invalid_request', 'A valid PKCE S256 code_challenge is required.');
    }
    let resource: string;
    try {
      resource = expectString(
        request.resource,
        'invalid_request',
        'resource is required.'
      );
      assertExactResource(resource, client.resource);
    } catch {
      throw redirectingError('invalid_request', 'resource does not identify this protected resource.');
    }
    let scopes: string[];
    try {
      scopes = normalizeScopes(request.scope, client.scopes);
    } catch {
      throw redirectingError('invalid_scope', 'scope is invalid.');
    }
    // Narrow to what this client actually holds, for the same reason registration
    // does (RFC 6749 §3.3): hosts re-request the full advertised scope set here,
    // having been granted less at registration. The consent screen then shows the
    // narrowed set — which is what the user is actually being asked to approve —
    // and the token response reports it back. Downstream of this point every scope
    // check stays a strict subset test, because from here on the set has been
    // validated and any mismatch is tampering rather than host variance.
    scopes = scopes.filter((scope) => client.scopes.includes(scope));
    scopes = this.effectivePolicyScopes(scopes);
    if (!client.grantTypes.includes('refresh_token')) {
      scopes = scopes.filter((scope) => scope !== 'offline_access');
    }
    if (!this.hasEffectiveToolScope(scopes)) {
      throw redirectingError('invalid_scope', 'The client holds none of the requested scopes.');
    }

    const requestToken = this.generateToken('tmar_', 32);
    const requestHash = hashOpaqueToken(requestToken);
    const expiresAt = now + this.configuration.authorizationRequestTtlSeconds * 1_000;
    const document: AuthorizationRequestDocument = {
      status: 'pending',
      clientId,
      redirectUri,
      resource,
      scopes,
      ...(state ? { state } : {}),
      codeChallenge,
      codeChallengeMethod: 'S256',
      createdAt: now,
      expiresAt,
      expireAt: new Date(expiresAt),
    };
    await this.db.collection(OAUTH_COLLECTIONS.authorizationRequests)
      .doc(requestHash)
      .create(document);

    return {
      location: appendOAuthParameters(this.configuration.authorizationConsentUrl, {
        request: requestToken,
      }),
      expiresAt,
    };
  }

  async getAuthorizationRequest(
    requestToken: unknown,
    authenticatedUid: string
  ): Promise<AuthorizationRequestView> {
    this.assertAuthenticatedUser(authenticatedUid);
    const normalizedToken = this.expectOpaqueToken(
      requestToken,
      'tmar_',
      'The authorization request is invalid or expired.'
    );
    const requestSnapshot = await this.db.collection(OAUTH_COLLECTIONS.authorizationRequests)
      .doc(hashOpaqueToken(normalizedToken))
      .get();
    const request = authorizationRequestDocument(requestSnapshot.data());
    const now = this.now();
    if (!request || request.status !== 'pending' || request.expiresAt <= now) {
      throw new OAuthProtocolError(
        'invalid_request',
        'The authorization request is invalid or expired.'
      );
    }
    const clientSnapshot = await this.db.collection(OAUTH_COLLECTIONS.clients)
      .doc(request.clientId)
      .get();
    const client = ensureActiveClient(clientDocument(clientSnapshot.data()), now);
    const deletionJobSnapshot = await this.db.collection(ACCOUNT_DELETION_COLLECTION)
      .doc(authenticatedUid)
      .get();
    if (deletionJobSnapshot.exists) {
      throw new OAuthProtocolError(
        'access_denied',
        'The Threadmap account is not available for authorization.',
        { status: 403 }
      );
    }
    const effectiveScopes = this.effectivePolicyScopes(
      request.scopes.filter((scope) => client.scopes.includes(scope))
    );
    if (!this.hasEffectiveToolScope(effectiveScopes)) {
      throw new OAuthProtocolError(
        'invalid_scope',
        'This authorization request no longer contains an enabled Threadmap scope.'
      );
    }
    return {
      clientId: client.clientId,
      clientName: client.clientName,
      platform: client.platform,
      scopes: effectiveScopes,
      resource: request.resource,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    };
  }

  async approveAuthorizationRequest(
    requestToken: unknown,
    authenticatedUid: string,
    approvedScopes?: unknown
  ): Promise<AuthorizationDecisionResult> {
    this.assertAuthenticatedUser(authenticatedUid);
    const normalizedToken = this.expectOpaqueToken(
      requestToken,
      'tmar_',
      'The authorization request is invalid or expired.'
    );
    const requestHash = hashOpaqueToken(normalizedToken);
    const code = this.generateToken('tmac_', 32);
    const codeHash = hashOpaqueToken(code);
    const now = this.now();

    const result = await this.db.runTransaction(async (transaction) => {
      const requestRef = this.db.collection(OAUTH_COLLECTIONS.authorizationRequests).doc(requestHash);
      const requestSnapshot = await transaction.get(requestRef);
      const request = authorizationRequestDocument(requestSnapshot.data());
      if (!request || request.status !== 'pending' || request.expiresAt <= now) {
        throw new OAuthProtocolError(
          'invalid_request',
          'The authorization request is invalid or expired.'
        );
      }
      const clientRef = this.db.collection(OAUTH_COLLECTIONS.clients).doc(request.clientId);
      const clientSnapshot = await transaction.get(clientRef);
      const client = ensureActiveClient(clientDocument(clientSnapshot.data()), now);
      const deletionJobSnapshot = await transaction.get(
        this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(authenticatedUid)
      );
      if (deletionJobSnapshot.exists) {
        throw new OAuthProtocolError(
          'access_denied',
          'The Threadmap account is not available for authorization.',
          { status: 403 }
        );
      }

      let scopes: string[];
      try {
        scopes = normalizeScopes(approvedScopes, request.scopes);
      } catch {
        throw new OAuthProtocolError('invalid_scope', 'The approved scope is invalid.');
      }
      if (scopes.length < 1 || !areScopesAllowed(scopes, request.scopes)
          || !areScopesAllowed(scopes, client.scopes)) {
        throw new OAuthProtocolError(
          'invalid_scope',
          'Approved scopes must be a non-empty subset of the requested scopes.'
        );
      }
      scopes = this.effectivePolicyScopes(scopes);
      if (!this.hasEffectiveToolScope(scopes)) {
        throw new OAuthProtocolError(
          'invalid_scope',
          'Approved scopes no longer include an enabled Threadmap capability.'
        );
      }

      const codeExpiresAt = now + this.configuration.authorizationCodeTtlSeconds * 1_000;
      const grantRef = this.db.collection(OAUTH_COLLECTIONS.userGrants)
        .doc(userGrantId(authenticatedUid, client.clientId));
      const grantSnapshot = await transaction.get(grantRef);
      const existingGrant = userGrantDocument(grantSnapshot.data());
      const grantExpiresAt = Math.min(
        client.expiresAt ?? Number.MAX_SAFE_INTEGER,
        now + (this.configuration.refreshTokenTtlSeconds * 1_000)
          + (this.configuration.authorizationCodeTtlSeconds * 1_000)
      );
      const codeDocument: AuthorizationCodeDocument = {
        status: 'active',
        clientId: request.clientId,
        userId: authenticatedUid,
        redirectUri: request.redirectUri,
        resource: request.resource,
        scopes,
        codeChallenge: request.codeChallenge,
        codeChallengeMethod: 'S256',
        issuedAt: now,
        expiresAt: codeExpiresAt,
        expireAt: new Date(codeExpiresAt),
      };
      transaction.create(
        this.db.collection(OAUTH_COLLECTIONS.authorizationCodes).doc(codeHash),
        codeDocument
      );
      transaction.update(requestRef, {
        status: 'approved',
        decidedAt: now,
        userId: authenticatedUid,
      });
      transaction.set(grantRef, {
        userId: authenticatedUid,
        clientId: client.clientId,
        status: 'active',
        authorizedAt: existingGrant?.authorizedAt ?? now,
        lastAuthorizedAt: now,
        updatedAt: now,
        expiresAt: grantExpiresAt,
        expireAt: new Date(grantExpiresAt),
      });
      return { request, scopes };
    });

    return {
      location: appendOAuthParameters(result.request.redirectUri, {
        code,
        state: result.request.state,
      }),
    };
  }

  async denyAuthorizationRequest(
    requestToken: unknown,
    authenticatedUid: string
  ): Promise<AuthorizationDecisionResult> {
    this.assertAuthenticatedUser(authenticatedUid);
    const normalizedToken = this.expectOpaqueToken(
      requestToken,
      'tmar_',
      'The authorization request is invalid or expired.'
    );
    const requestHash = hashOpaqueToken(normalizedToken);
    const now = this.now();
    const request = await this.db.runTransaction(async (transaction) => {
      const requestRef = this.db.collection(OAUTH_COLLECTIONS.authorizationRequests).doc(requestHash);
      const requestSnapshot = await transaction.get(requestRef);
      const current = authorizationRequestDocument(requestSnapshot.data());
      if (!current || current.status !== 'pending' || current.expiresAt <= now) {
        throw new OAuthProtocolError(
          'invalid_request',
          'The authorization request is invalid or expired.'
        );
      }
      const deletionJobSnapshot = await transaction.get(
        this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(authenticatedUid)
      );
      if (deletionJobSnapshot.exists) {
        throw new OAuthProtocolError(
          'access_denied',
          'The Threadmap account is not available for authorization.',
          { status: 403 }
        );
      }
      transaction.update(requestRef, {
        status: 'denied',
        decidedAt: now,
        userId: authenticatedUid,
      });
      return current;
    });
    return {
      location: appendOAuthParameters(request.redirectUri, {
        error: 'access_denied',
        error_description: 'The resource owner denied the authorization request.',
        state: request.state,
      }),
    };
  }

  async exchangeToken(
    input: OAuthTokenRequest | unknown,
    authorizationHeader?: unknown
  ): Promise<OAuthTokenResponse> {
    const request = expectRecord(input);
    const grantType = request.grant_type;
    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      throw new OAuthProtocolError(
        'unsupported_grant_type',
        'Only authorization_code and refresh_token grants are supported.'
      );
    }
    const resource = expectString(
      request.resource,
      'invalid_request',
      'resource is required.'
    );
    try {
      assertExactResource(resource, this.configuration.resource);
    } catch {
      throw new OAuthProtocolError(
        'invalid_request',
        'resource does not identify this protected resource.'
      );
    }
    const client = await this.authenticateClient(request, authorizationHeader);
    if (!client.grantTypes.includes(grantType)) {
      throw new OAuthProtocolError(
        'unauthorized_client',
        'This client is not authorized for the requested grant.'
      );
    }
    return grantType === 'authorization_code'
      ? this.exchangeAuthorizationCode(request, client, resource)
      : this.exchangeRefreshToken(request, client, resource);
  }

  async authenticateAccessToken(
    accessToken: unknown,
    requiredScopes: readonly string[] = []
  ): Promise<OAuthPrincipal> {
    const token = this.expectOpaqueToken(accessToken, 'tmat_', 'The access token is invalid.', {
      code: 'invalid_token',
      status: 401,
    });
    let normalizedRequiredScopes: string[];
    try {
      normalizedRequiredScopes = normalizeScopes(requiredScopes);
    } catch {
      throw new OAuthProtocolError('server_error', 'The resource scope policy is invalid.', {
        status: 500,
      });
    }
    if (!areScopesAllowed(normalizedRequiredScopes, this.configuration.scopesSupported)) {
      throw new OAuthProtocolError('server_error', 'The resource scope policy is invalid.', {
        status: 500,
      });
    }

    const tokenHash = hashOpaqueToken(token);
    const tokenSnapshot = await this.db.collection(OAUTH_COLLECTIONS.accessTokens)
      .doc(tokenHash)
      .get();
    const tokenDocument = accessTokenDocument(tokenSnapshot.data());
    const now = this.now();
    if (!tokenDocument || tokenDocument.status !== 'active'
        || tokenDocument.expiresAt <= now
        || tokenDocument.resource !== this.configuration.resource) {
      throw new OAuthProtocolError('invalid_token', 'The access token is invalid or expired.', {
        status: 401,
      });
    }

    const [familySnapshot, clientSnapshot, deletionJobSnapshot, grantSnapshot] = await Promise.all([
      this.db.collection(OAUTH_COLLECTIONS.tokenFamilies)
        .doc(tokenDocument.tokenFamilyId)
        .get(),
      this.db.collection(OAUTH_COLLECTIONS.clients).doc(tokenDocument.clientId).get(),
      this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(tokenDocument.userId).get(),
      this.db.collection(OAUTH_COLLECTIONS.userGrants)
        .doc(userGrantId(tokenDocument.userId, tokenDocument.clientId))
        .get(),
    ]);
    const family = tokenFamilyDocument(familySnapshot.data());
    const client = clientDocument(clientSnapshot.data());
    const grant = userGrantDocument(grantSnapshot.data());
    if (!family || family.status !== 'active' || family.expiresAt <= now
        || family.clientId !== tokenDocument.clientId
        || family.userId !== tokenDocument.userId
        || family.resource !== tokenDocument.resource
        || !client || client.revokedAt !== undefined
        || (client.expiresAt !== undefined && client.expiresAt <= now)
        || client.clientId !== tokenDocument.clientId
        || client.resource !== tokenDocument.resource
        || grant?.status === 'revoked'
        || deletionJobSnapshot.exists) {
      throw new OAuthProtocolError('invalid_token', 'The access token is invalid or expired.', {
        status: 401,
      });
    }
    const effectiveTokenScopes = this.effectivePolicyScopes(tokenDocument.scopes);
    if (!this.hasEffectiveToolScope(effectiveTokenScopes)) {
      throw new OAuthProtocolError('invalid_token', 'The access token no longer grants an enabled scope.', {
        status: 401,
      });
    }
    if (!areScopesAllowed(normalizedRequiredScopes, effectiveTokenScopes)) {
      throw new OAuthProtocolError(
        'insufficient_scope',
        'The access token does not grant the required scope.',
        { status: 403 }
      );
    }
    return {
      userId: tokenDocument.userId,
      clientId: tokenDocument.clientId,
      scopes: effectiveTokenScopes,
      resource: tokenDocument.resource,
      expiresAt: tokenDocument.expiresAt,
      tokenId: tokenHash.slice(0, 16),
      tokenFamilyId: tokenDocument.tokenFamilyId,
    };
  }

  async revokeToken(
    input: OAuthRevocationRequest | unknown,
    authorizationHeader?: unknown
  ): Promise<Record<string, never>> {
    const request = expectRecord(input);
    const client = await this.authenticateClient(request, authorizationHeader);
    const token = expectString(request.token, 'invalid_request', 'token is required.', 512);
    if (!isValidOpaqueValue(token)) {
      return {};
    }
    if (request.token_type_hint !== undefined
        && (typeof request.token_type_hint !== 'string'
          || request.token_type_hint.length > 100)) {
      throw new OAuthProtocolError('invalid_request', 'token_type_hint is invalid.');
    }
    const tokenHash = hashOpaqueToken(token);
    const now = this.now();
    await this.db.runTransaction(async (transaction) => {
      const clientRef = this.db.collection(OAUTH_COLLECTIONS.clients).doc(client.clientId);
      const accessRef = this.db.collection(OAUTH_COLLECTIONS.accessTokens).doc(tokenHash);
      const refreshRef = this.db.collection(OAUTH_COLLECTIONS.refreshTokens).doc(tokenHash);
      const clientSnapshot = await transaction.get(clientRef);
      const currentClient = ensureActiveClient(clientDocument(clientSnapshot.data()), now);
      const accessSnapshot = await transaction.get(accessRef);
      const refreshSnapshot = await transaction.get(refreshRef);
      const access = accessTokenDocument(accessSnapshot.data());
      const refresh = refreshTokenDocument(refreshSnapshot.data());
      let familyRef: DocumentReference | undefined;
      let family: TokenFamilyDocument | null = null;
      if (refresh && refresh.clientId === currentClient.clientId) {
        familyRef = this.db.collection(OAUTH_COLLECTIONS.tokenFamilies)
          .doc(refresh.tokenFamilyId);
        const familySnapshot = await transaction.get(familyRef);
        family = tokenFamilyDocument(familySnapshot.data());
      }

      if (access && access.clientId === currentClient.clientId && access.status === 'active') {
        transaction.update(accessRef, { status: 'revoked', revokedAt: now });
      }
      if (refresh && refresh.clientId === currentClient.clientId) {
        if (familyRef && family && family.clientId === currentClient.clientId) {
          transaction.update(familyRef, {
            status: 'revoked',
            revokedAt: now,
            revocationReason: 'refresh_token_revoked',
          });
        }
        if (refresh.status === 'active') {
          transaction.update(refreshRef, { status: 'revoked', revokedAt: now });
        }
      }
    });
    return {};
  }

  async listAuthorizations(authenticatedUid: string): Promise<McpAuthorizationGrant[]> {
    this.assertAuthenticatedUser(authenticatedUid);
    const [deletionSnapshot, grantSnapshots, familySnapshots] = await Promise.all([
      this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(authenticatedUid).get(),
      this.db.collection(OAUTH_COLLECTIONS.userGrants)
        .where('userId', '==', authenticatedUid)
        .get(),
      this.db.collection(OAUTH_COLLECTIONS.tokenFamilies)
        .where('userId', '==', authenticatedUid)
        .get(),
    ]);
    if (deletionSnapshot.exists) {
      throw new OAuthProtocolError(
        'access_denied',
        'The Threadmap account is not available for authorization.',
        { status: 403 }
      );
    }

    const now = this.now();
    const byClient = new Map<string, {
      authorizedAt: number;
      lastAuthorizedAt: number;
      expiresAt?: number;
      revoked: boolean;
    }>();
    for (const snapshot of grantSnapshots.docs) {
      const grant = userGrantDocument(snapshot.data());
      if (!grant || grant.expiresAt <= now) continue;
      byClient.set(grant.clientId, {
        authorizedAt: grant.authorizedAt,
        lastAuthorizedAt: grant.lastAuthorizedAt,
        revoked: grant.status === 'revoked',
      });
    }
    for (const snapshot of familySnapshots.docs) {
      const family = tokenFamilyDocument(snapshot.data());
      if (!family || family.status !== 'active' || family.expiresAt <= now) continue;
      const current = byClient.get(family.clientId);
      if (current?.revoked) continue;
      byClient.set(family.clientId, {
        authorizedAt: Math.min(current?.authorizedAt ?? family.createdAt, family.createdAt),
        lastAuthorizedAt: Math.max(
          current?.lastAuthorizedAt ?? family.createdAt,
          family.lastRotatedAt ?? family.createdAt
        ),
        expiresAt: Math.max(current?.expiresAt ?? 0, family.expiresAt),
        revoked: false,
      });
    }

    const activeEntries = [...byClient.entries()].filter(([, grant]) => !grant.revoked);
    const clients = await Promise.all(activeEntries.map(([clientId]) =>
      this.db.collection(OAUTH_COLLECTIONS.clients).doc(clientId).get()
    ));
    return activeEntries.flatMap(([clientId, grant], index) => {
      const client = clientDocument(clients[index].data());
      if (!client || client.revokedAt !== undefined
          || (client.expiresAt !== undefined && client.expiresAt <= now)) return [];
      const effectiveExpiry = grant.expiresAt === undefined
        ? client.expiresAt
        : Math.min(grant.expiresAt, client.expiresAt ?? grant.expiresAt);
      return [{
        clientId,
        clientName: client.clientName,
        authorizedAt: grant.authorizedAt,
        lastAuthorizedAt: grant.lastAuthorizedAt,
        ...(effectiveExpiry !== undefined ? { expiresAt: effectiveExpiry } : {}),
      }];
    }).sort((left, right) => right.lastAuthorizedAt - left.lastAuthorizedAt);
  }

  async revokeClient(
    clientIdValue: unknown,
    authenticatedUid: string,
    reason: 'owner_disconnect' | 'security_event' | 'administrative' = 'owner_disconnect'
  ): Promise<boolean> {
    this.assertAuthenticatedUser(authenticatedUid);
    let clientId: string;
    try {
      clientId = validateClientId(clientIdValue);
    } catch {
      throw new OAuthProtocolError('invalid_request', 'client_id is invalid.');
    }
    const clientSnapshot = await this.db.collection(OAUTH_COLLECTIONS.clients).doc(clientId).get();
    if (!clientDocument(clientSnapshot.data())) return false;

    const now = this.now();
    const grantRef = this.db.collection(OAUTH_COLLECTIONS.userGrants)
      .doc(userGrantId(authenticatedUid, clientId));
    await this.db.runTransaction(async (transaction) => {
      const [deletionSnapshot, existingGrantSnapshot] = await Promise.all([
        transaction.get(this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(authenticatedUid)),
        transaction.get(grantRef),
      ]);
      if (deletionSnapshot.exists) {
        throw new OAuthProtocolError(
          'access_denied',
          'The Threadmap account is not available for authorization.',
          { status: 403 }
        );
      }
      const existing = userGrantDocument(existingGrantSnapshot.data());
      // A revocation barrier must outlive every token family that could have
      // been issued immediately before this transaction. Firestore TTL is not
      // immediate, but the explicit timestamp check keeps listing deterministic.
      const barrierExpiresAt = Math.max(
        existing?.expiresAt ?? 0,
        now + (MAX_REFRESH_TOKEN_TTL_SECONDS * 1_000)
          + (this.configuration.authorizationCodeTtlSeconds * 1_000)
      );
      transaction.set(grantRef, {
        userId: authenticatedUid,
        clientId,
        status: 'revoked',
        authorizedAt: existing?.authorizedAt ?? now,
        lastAuthorizedAt: existing?.lastAuthorizedAt ?? now,
        updatedAt: now,
        revokedAt: now,
        expiresAt: barrierExpiresAt,
        expireAt: new Date(barrierExpiresAt),
      });
    });

    // The grant document above is the atomic revocation barrier checked by
    // code exchange, refresh, and access authentication. The derivative sweep
    // can therefore be safely retried in bounded batches without a credential
    // becoming valid again between batches.
    const collectionNames = [
      OAUTH_COLLECTIONS.authorizationRequests,
      OAUTH_COLLECTIONS.authorizationCodes,
      OAUTH_COLLECTIONS.accessTokens,
      OAUTH_COLLECTIONS.refreshTokens,
      OAUTH_COLLECTIONS.tokenFamilies,
    ] as const;
    for (const collectionName of collectionNames) {
      const snapshots = await this.db.collection(collectionName)
        .where('userId', '==', authenticatedUid)
        .get();
      const matching = snapshots.docs.filter((snapshot) =>
        snapshot.data()?.clientId === clientId
      );
      for (let offset = 0; offset < matching.length; offset += 400) {
        const chunk = matching.slice(offset, offset + 400);
        const batch = this.db.batch();
        for (const snapshot of chunk) {
          if (collectionName === OAUTH_COLLECTIONS.tokenFamilies) {
            batch.update(snapshot.ref, {
              status: 'revoked',
              revokedAt: now,
              revocationReason: reason,
            });
          } else {
            batch.delete(snapshot.ref);
          }
        }
        await batch.commit();
      }
    }
    return true;
  }

  async revokeTokenFamily(
    tokenFamilyId: unknown,
    authenticatedUid: string,
    reason: 'owner_disconnect' | 'security_event' | 'administrative' = 'owner_disconnect'
  ): Promise<boolean> {
    this.assertAuthenticatedUser(authenticatedUid);
    if (typeof tokenFamilyId !== 'string' || !/^tmf_[A-Za-z0-9_-]{20,100}$/.test(tokenFamilyId)) {
      throw new OAuthProtocolError('invalid_request', 'token family is invalid.');
    }
    const now = this.now();
    return this.db.runTransaction(async (transaction) => {
      const familyRef = this.db.collection(OAUTH_COLLECTIONS.tokenFamilies).doc(tokenFamilyId);
      const snapshot = await transaction.get(familyRef);
      const family = tokenFamilyDocument(snapshot.data());
      if (!family || family.userId !== authenticatedUid) return false;
      if (family.status === 'active') {
        transaction.update(familyRef, {
          status: 'revoked',
          revokedAt: now,
          revocationReason: reason,
        });
      }
      return true;
    });
  }

  private assertAuthenticatedUser(authenticatedUid: string): void {
    if (!isValidUserId(authenticatedUid)) {
      throw new OAuthProtocolError('access_denied', 'A valid Threadmap user is required.', {
        status: 403,
      });
    }
  }

  private expectOpaqueToken(
    value: unknown,
    prefix: string,
    description: string,
    options: { code?: OAuthProtocolErrorCode; status?: number } = {}
  ): string {
    if (!isValidOpaqueValue(value) || !value.startsWith(prefix)) {
      throw new OAuthProtocolError(options.code || 'invalid_request', description, {
        status: options.status,
      });
    }
    return value;
  }

  private extractClientCredentials(
    request: Record<string, unknown>,
    authorizationHeader?: unknown
  ): PresentedClientCredentials {
    if (authorizationHeader !== undefined) {
      const basic = parseBasicClientCredentials(authorizationHeader);
      if (!basic) {
        throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
          status: 401,
        });
      }
      if (request.client_secret !== undefined) {
        throw new OAuthProtocolError(
          'invalid_request',
          'Client credentials must use only one authentication method.'
        );
      }
      if (request.client_id !== undefined && request.client_id !== basic.clientId) {
        throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
          status: 401,
        });
      }
      return {
        clientId: basic.clientId,
        clientSecret: basic.clientSecret,
        method: 'client_secret_basic',
      };
    }

    let clientId: string;
    try {
      clientId = validateClientId(request.client_id);
    } catch {
      throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
        status: 401,
      });
    }
    if (request.client_secret === undefined) {
      return { clientId, method: 'none' };
    }
    if (typeof request.client_secret !== 'string' || request.client_secret.length < 20
        || request.client_secret.length > 512) {
      throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
        status: 401,
      });
    }
    return {
      clientId,
      clientSecret: request.client_secret,
      method: 'client_secret_post',
    };
  }

  private async authenticateClient(
    request: Record<string, unknown>,
    authorizationHeader?: unknown
  ): Promise<OAuthClientDocument> {
    const presented = this.extractClientCredentials(request, authorizationHeader);
    let clientId: string;
    try {
      clientId = validateClientId(presented.clientId);
    } catch {
      throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
        status: 401,
      });
    }
    const snapshot = await this.db.collection(OAUTH_COLLECTIONS.clients).doc(clientId).get();
    const client = ensureActiveClient(clientDocument(snapshot.data()), this.now());
    if (client.tokenEndpointAuthMethod !== presented.method) {
      throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
        status: 401,
      });
    }
    if (presented.method !== 'none') {
      if (!presented.clientSecret || !client.clientSecretHash
          || !constantTimeStringEqual(
            hashOpaqueToken(presented.clientSecret),
            client.clientSecretHash
          )) {
        throw new OAuthProtocolError('invalid_client', 'Client authentication failed.', {
          status: 401,
        });
      }
    }
    return client;
  }

  private async exchangeAuthorizationCode(
    request: Record<string, unknown>,
    client: OAuthClientDocument,
    resource: string
  ): Promise<OAuthTokenResponse> {
    const code = this.expectOpaqueToken(
      request.code,
      'tmac_',
      'The authorization code is invalid, expired, or already used.',
      { code: 'invalid_grant' }
    );
    const redirectUri = expectString(
      request.redirect_uri,
      'invalid_request',
      'redirect_uri is required.'
    );
    const verifier = expectString(
      request.code_verifier,
      'invalid_request',
      'code_verifier is required.',
      128
    );
    const now = this.now();
    const codeHash = hashOpaqueToken(code);
    const accessToken = this.generateToken('tmat_', 32);
    const accessTokenHash = hashOpaqueToken(accessToken);
    const refreshToken = this.generateToken('tmrt_', 32);
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const tokenFamilyId = this.generateToken('tmf_', 24);

    const issued = await this.db.runTransaction(async (transaction) => {
      const codeRef = this.db.collection(OAUTH_COLLECTIONS.authorizationCodes).doc(codeHash);
      const clientRef = this.db.collection(OAUTH_COLLECTIONS.clients).doc(client.clientId);
      const codeSnapshot = await transaction.get(codeRef);
      const currentClientSnapshot = await transaction.get(clientRef);
      const codeDocument = authorizationCodeDocument(codeSnapshot.data());
      const currentClient = ensureActiveClient(clientDocument(currentClientSnapshot.data()), now);
      const deletionJobSnapshot = codeDocument
        ? await transaction.get(
          this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(codeDocument.userId)
        )
        : null;
      const grantSnapshot = codeDocument
        ? await transaction.get(
          this.db.collection(OAUTH_COLLECTIONS.userGrants)
            .doc(userGrantId(codeDocument.userId, currentClient.clientId))
        )
        : null;
      const grant = userGrantDocument(grantSnapshot?.data());
      if (!codeDocument || codeDocument.status !== 'active' || codeDocument.expiresAt <= now
          || codeDocument.clientId !== currentClient.clientId
          || codeDocument.redirectUri !== redirectUri
          || codeDocument.resource !== resource
          || !verifyPkceS256(verifier, codeDocument.codeChallenge)
          || grant?.status === 'revoked'
          || deletionJobSnapshot?.exists) {
        throw new OAuthProtocolError(
          'invalid_grant',
          'The authorization code is invalid, expired, or already used.'
        );
      }

      const issuedScopes = this.effectivePolicyScopes(
        codeDocument.scopes.filter((scope) => currentClient.scopes.includes(scope))
      );
      if (!this.hasEffectiveToolScope(issuedScopes)) {
        throw new OAuthProtocolError(
          'invalid_grant',
          'The authorization grant no longer contains an enabled Threadmap scope.'
        );
      }

      const shouldIssueRefreshToken = issuedScopes.includes('offline_access')
        && currentClient.grantTypes.includes('refresh_token');
      const accessExpiresAt = now + this.configuration.accessTokenTtlSeconds * 1_000;
      const familyExpiresAt = shouldIssueRefreshToken
        ? now + this.configuration.refreshTokenTtlSeconds * 1_000
        : accessExpiresAt;
      const familyDocument: TokenFamilyDocument = {
        status: 'active',
        clientId: currentClient.clientId,
        userId: codeDocument.userId,
        resource,
        createdAt: now,
        expiresAt: familyExpiresAt,
        expireAt: new Date(familyExpiresAt),
        latestSequence: 0,
        ...(shouldIssueRefreshToken
          ? { latestRefreshTokenHash: refreshTokenHash, lastRotatedAt: now }
          : {}),
      };
      const accessDocument: AccessTokenDocument = {
        status: 'active',
        clientId: currentClient.clientId,
        userId: codeDocument.userId,
        resource,
        scopes: [...issuedScopes],
        tokenFamilyId,
        issuedAt: now,
        expiresAt: accessExpiresAt,
        expireAt: new Date(accessExpiresAt),
      };
      transaction.create(
        this.db.collection(OAUTH_COLLECTIONS.tokenFamilies).doc(tokenFamilyId),
        familyDocument
      );
      transaction.create(
        this.db.collection(OAUTH_COLLECTIONS.accessTokens).doc(accessTokenHash),
        accessDocument
      );
      if (shouldIssueRefreshToken) {
        const refreshDocument: RefreshTokenDocument = {
          status: 'active',
          clientId: currentClient.clientId,
          userId: codeDocument.userId,
          resource,
          scopes: [...issuedScopes],
          tokenFamilyId,
          sequence: 0,
          issuedAt: now,
          expiresAt: familyExpiresAt,
          expireAt: new Date(familyExpiresAt),
        };
        transaction.create(
          this.db.collection(OAUTH_COLLECTIONS.refreshTokens).doc(refreshTokenHash),
          refreshDocument
        );
      }
      transaction.update(codeRef, { status: 'consumed', consumedAt: now });
      return {
        scopes: issuedScopes,
        accessExpiresAt,
        shouldIssueRefreshToken,
      };
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.max(1, Math.floor((issued.accessExpiresAt - now) / 1_000)),
      scope: issued.scopes.join(' '),
      ...(issued.shouldIssueRefreshToken ? { refresh_token: refreshToken } : {}),
    };
  }

  private async exchangeRefreshToken(
    request: Record<string, unknown>,
    client: OAuthClientDocument,
    resource: string
  ): Promise<OAuthTokenResponse> {
    const refreshToken = this.expectOpaqueToken(
      request.refresh_token,
      'tmrt_',
      'The refresh token is invalid or expired.',
      { code: 'invalid_grant' }
    );
    const oldRefreshHash = hashOpaqueToken(refreshToken);
    const newAccessToken = this.generateToken('tmat_', 32);
    const newAccessHash = hashOpaqueToken(newAccessToken);
    const newRefreshToken = this.generateToken('tmrt_', 32);
    const newRefreshHash = hashOpaqueToken(newRefreshToken);
    const now = this.now();

    const result = await this.db.runTransaction(async (transaction) => {
      const refreshRef = this.db.collection(OAUTH_COLLECTIONS.refreshTokens).doc(oldRefreshHash);
      const clientRef = this.db.collection(OAUTH_COLLECTIONS.clients).doc(client.clientId);
      const refreshSnapshot = await transaction.get(refreshRef);
      const currentClientSnapshot = await transaction.get(clientRef);
      const currentClient = ensureActiveClient(clientDocument(currentClientSnapshot.data()), now);
      const oldRefresh = refreshTokenDocument(refreshSnapshot.data());
      const deletionJobSnapshot = oldRefresh
        ? await transaction.get(
          this.db.collection(ACCOUNT_DELETION_COLLECTION).doc(oldRefresh.userId)
        )
        : null;
      const grantSnapshot = oldRefresh
        ? await transaction.get(
          this.db.collection(OAUTH_COLLECTIONS.userGrants)
            .doc(userGrantId(oldRefresh.userId, currentClient.clientId))
        )
        : null;
      const grant = userGrantDocument(grantSnapshot?.data());
      if (!oldRefresh || oldRefresh.clientId !== currentClient.clientId
          || oldRefresh.resource !== resource
          || oldRefresh.expiresAt <= now
          || grant?.status === 'revoked'
          || deletionJobSnapshot?.exists) {
        throw new OAuthProtocolError('invalid_grant', 'The refresh token is invalid or expired.');
      }
      const familyRef = this.db.collection(OAUTH_COLLECTIONS.tokenFamilies)
        .doc(oldRefresh.tokenFamilyId);
      const familySnapshot = await transaction.get(familyRef);
      const family = tokenFamilyDocument(familySnapshot.data());
      if (!family || family.clientId !== currentClient.clientId
          || family.userId !== oldRefresh.userId
          || family.resource !== resource
          || family.expiresAt <= now) {
        throw new OAuthProtocolError('invalid_grant', 'The refresh token is invalid or expired.');
      }
      if (oldRefresh.status !== 'active') {
        if (family.status === 'active') {
          transaction.update(familyRef, {
            status: 'revoked',
            revokedAt: now,
            revocationReason: 'refresh_token_reuse',
          });
        }
        return { reused: true as const };
      }
      if (family.status !== 'active') {
        throw new OAuthProtocolError('invalid_grant', 'The refresh token is invalid or expired.');
      }

      let scopes: string[];
      try {
        scopes = normalizeScopes(request.scope, oldRefresh.scopes);
      } catch {
        throw new OAuthProtocolError('invalid_scope', 'scope is invalid.');
      }
      if (scopes.length < 1 || !areScopesAllowed(scopes, oldRefresh.scopes)
          || !areScopesAllowed(scopes, currentClient.scopes)
          || (oldRefresh.scopes.includes('offline_access') && !scopes.includes('offline_access'))) {
        throw new OAuthProtocolError(
          'invalid_scope',
          'Refresh-token scopes may only be narrowed while retaining offline_access.'
        );
      }
      scopes = this.effectivePolicyScopes(scopes);
      if (!this.hasEffectiveToolScope(scopes)) {
        transaction.update(refreshRef, {
          status: 'revoked',
          revokedAt: now,
        });
        transaction.update(familyRef, {
          status: 'revoked',
          revokedAt: now,
          revocationReason: 'scope_policy_downgrade',
        });
        return { policyRevoked: true as const };
      }

      const accessExpiresAt = Math.min(
        now + this.configuration.accessTokenTtlSeconds * 1_000,
        family.expiresAt
      );
      const sequence = oldRefresh.sequence + 1;
      const accessDocument: AccessTokenDocument = {
        status: 'active',
        clientId: currentClient.clientId,
        userId: oldRefresh.userId,
        resource,
        scopes,
        tokenFamilyId: oldRefresh.tokenFamilyId,
        issuedAt: now,
        expiresAt: accessExpiresAt,
        expireAt: new Date(accessExpiresAt),
      };
      const newRefreshDocument: RefreshTokenDocument = {
        status: 'active',
        clientId: currentClient.clientId,
        userId: oldRefresh.userId,
        resource,
        scopes,
        tokenFamilyId: oldRefresh.tokenFamilyId,
        sequence,
        issuedAt: now,
        expiresAt: family.expiresAt,
        expireAt: new Date(family.expiresAt),
      };
      transaction.create(
        this.db.collection(OAUTH_COLLECTIONS.accessTokens).doc(newAccessHash),
        accessDocument
      );
      transaction.create(
        this.db.collection(OAUTH_COLLECTIONS.refreshTokens).doc(newRefreshHash),
        newRefreshDocument
      );
      transaction.update(refreshRef, {
        status: 'consumed',
        consumedAt: now,
        replacedByHash: newRefreshHash,
      });
      transaction.update(familyRef, {
        latestSequence: sequence,
        latestRefreshTokenHash: newRefreshHash,
        lastRotatedAt: now,
      });
      return { reused: false as const, scopes, accessExpiresAt };
    });

    if ('policyRevoked' in result) {
      throw new OAuthProtocolError(
        'invalid_grant',
        'The refresh token no longer grants an enabled Threadmap scope.'
      );
    }
    if (result.reused) {
      throw new OAuthProtocolError(
        'invalid_grant',
        'Refresh token reuse was detected and the token family was revoked.'
      );
    }
    return {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: Math.max(1, Math.floor((result.accessExpiresAt - now) / 1_000)),
      scope: result.scopes.join(' '),
      refresh_token: newRefreshToken,
    };
  }
}

export function createThreadmapOAuthService(
  db: Firestore,
  configuration: ThreadmapOAuthConfiguration,
  dependencies: OAuthServiceDependencies = {}
): ThreadmapOAuthService {
  return new ThreadmapOAuthService(db, configuration, dependencies);
}
