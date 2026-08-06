import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const CHATGPT_REDIRECT_URI_PATTERN =
  /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{8,200}$/;
export const CHATGPT_LEGACY_REDIRECT_URI =
  'https://chatgpt.com/connector_platform_oauth_redirect';
export const CLAUDE_REDIRECT_URI =
  'https://claude.ai/api/mcp/auth_callback';

export type RedirectUriPlatform = 'chatgpt' | 'claude' | 'configured' | 'loopback';

export interface RedirectUriPolicy {
  configuredRedirectUris?: readonly string[];
  allowLoopbackDevelopmentRedirects?: boolean;
}

const OAUTH_SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{20,512}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{12,200}$/;
const MAX_URI_LENGTH = 2_048;
const MAX_SCOPE_STRING_LENGTH = 1_024;
const MAX_SCOPE_COUNT = 32;

function parseUrl(value: string, label: string): URL {
  if (value.length < 1 || value.length > MAX_URI_LENGTH) {
    throw new Error(`${label} is invalid.`);
  }
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
}

function assertCanonicalUrl(value: string, parsed: URL, label: string): void {
  const canonicalOriginWithoutSlash = parsed.pathname === '/'
    && !parsed.search
    && !parsed.hash
    && value === parsed.origin;
  if (parsed.toString() !== value && !canonicalOriginWithoutSlash) {
    throw new Error(`${label} must use its canonical URL form.`);
  }
}

export function validateHttpsUrl(
  value: string,
  label: string,
  options: { allowQuery?: boolean; allowPath?: boolean } = {}
): URL {
  const parsed = parseUrl(value, label);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} must be a canonical HTTPS URL without credentials or a fragment.`);
  }
  if (!options.allowQuery && parsed.search) {
    throw new Error(`${label} must not contain a query string.`);
  }
  if (!options.allowPath && parsed.pathname !== '/') {
    throw new Error(`${label} must be an origin URL.`);
  }
  assertCanonicalUrl(value, parsed, label);
  return parsed;
}

export function validateResourceIdentifier(value: string): string {
  validateHttpsUrl(value, 'resource', { allowPath: true });
  return value;
}

export function assertExactResource(value: string, expectedResource: string): void {
  validateResourceIdentifier(value);
  if (value !== expectedResource) {
    throw new Error('resource does not identify this protected resource.');
  }
}

function isAllowedLoopbackRedirect(parsed: URL, enabled: boolean): boolean {
  if (!enabled || parsed.protocol !== 'http:' || parsed.username || parsed.password
      || parsed.hash || parsed.search) {
    return false;
  }
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  return isLoopback && parsed.port.length > 0;
}

export function classifyRedirectUri(
  value: string,
  policy: RedirectUriPolicy = {}
): RedirectUriPlatform {
  const parsed = parseUrl(value, 'redirect_uri');
  assertCanonicalUrl(value, parsed, 'redirect_uri');
  if (parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error('redirect_uri must not contain credentials, a query string, or a fragment.');
  }

  if (CHATGPT_REDIRECT_URI_PATTERN.test(value) || value === CHATGPT_LEGACY_REDIRECT_URI) {
    return 'chatgpt';
  }
  if (value === CLAUDE_REDIRECT_URI) return 'claude';

  const configured = new Set(policy.configuredRedirectUris || []);
  if (configured.has(value)) {
    if (parsed.protocol !== 'https:'
        && !isAllowedLoopbackRedirect(parsed, Boolean(policy.allowLoopbackDevelopmentRedirects))) {
      throw new Error('Configured redirect_uri values must use HTTPS outside loopback development.');
    }
    return parsed.protocol === 'http:' ? 'loopback' : 'configured';
  }

  if (isAllowedLoopbackRedirect(parsed, Boolean(policy.allowLoopbackDevelopmentRedirects))) {
    return 'loopback';
  }
  throw new Error('redirect_uri is not an approved ChatGPT, Claude, or configured callback.');
}

export function validateRegisteredRedirectUris(
  values: readonly string[],
  policy: RedirectUriPolicy = {}
): { redirectUris: string[]; platform: RedirectUriPlatform } {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8) {
    throw new Error('redirect_uris must contain between one and eight callbacks.');
  }
  const redirectUris = [...new Set(values)];
  if (redirectUris.length !== values.length) {
    throw new Error('redirect_uris must not contain duplicates.');
  }
  const platforms = redirectUris.map((uri) => classifyRedirectUri(uri, policy));
  const firstPlatform = platforms[0];
  if (platforms.some((platform) => platform !== firstPlatform)) {
    throw new Error('A dynamic client may register callbacks for only one platform.');
  }
  return { redirectUris, platform: firstPlatform };
}

export function generateOpaqueToken(prefix: string, entropyBytes = 32): string {
  if (!/^[a-z][a-z0-9_]{1,15}$/.test(prefix)) {
    throw new Error('Opaque token prefix is invalid.');
  }
  if (!Number.isInteger(entropyBytes) || entropyBytes < 24 || entropyBytes > 64) {
    throw new Error('Opaque tokens require between 24 and 64 bytes of entropy.');
  }
  return `${prefix}${randomBytes(entropyBytes).toString('base64url')}`;
}

export function hashOpaqueToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

export function isValidOpaqueValue(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_VALUE.test(value);
}

export function validateClientId(value: unknown): string {
  if (typeof value !== 'string' || !CLIENT_ID.test(value)) {
    throw new Error('client_id is invalid.');
  }
  return value;
}

export function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function createPkceS256Challenge(verifier: string): string {
  if (!PKCE_VERIFIER.test(verifier)) {
    throw new Error('code_verifier is invalid.');
  }
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function validatePkceChallenge(challenge: unknown): string {
  if (typeof challenge !== 'string' || !PKCE_CHALLENGE.test(challenge)) {
    throw new Error('code_challenge must be a base64url-encoded SHA-256 digest.');
  }
  return challenge;
}

export function verifyPkceS256(verifier: unknown, expectedChallenge: string): boolean {
  if (typeof verifier !== 'string' || !PKCE_VERIFIER.test(verifier)) return false;
  return constantTimeStringEqual(createPkceS256Challenge(verifier), expectedChallenge);
}

export function normalizeScopes(value: unknown, fallback: readonly string[] = []): string[] {
  let values: string[];
  if (value === undefined || value === null || value === '') {
    values = [...fallback];
  } else if (typeof value === 'string') {
    if (value.length > MAX_SCOPE_STRING_LENGTH) throw new Error('scope is too long.');
    values = value.trim() ? value.trim().split(/\s+/) : [];
  } else if (Array.isArray(value) && value.every((scope) => typeof scope === 'string')) {
    values = [...value];
  } else {
    throw new Error('scope is invalid.');
  }

  const normalized = [...new Set(values)];
  if (normalized.length > MAX_SCOPE_COUNT
      || normalized.some((scope) => !OAUTH_SCOPE_TOKEN.test(scope))) {
    throw new Error('scope contains an invalid value.');
  }
  return normalized;
}

export function areScopesAllowed(
  requestedScopes: readonly string[],
  allowedScopes: readonly string[]
): boolean {
  const allowed = new Set(allowedScopes);
  return requestedScopes.every((scope) => allowed.has(scope));
}

export function validateState(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > 1_024
      || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('state is invalid.');
  }
  return value;
}

export function appendOAuthParameters(
  redirectUri: string,
  parameters: Readonly<Record<string, string | undefined>>
): string {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) target.searchParams.set(key, value);
  }
  return target.toString();
}

export function parseBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{20,512})$/.exec(header);
  return match?.[1] || null;
}

export interface BasicClientCredentials {
  clientId: string;
  clientSecret: string;
}

export function parseBasicClientCredentials(header: unknown): BasicClientCredentials | null {
  if (typeof header !== 'string') return null;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(header);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator < 1) return null;
  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, ' ')),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, ' ')),
    };
  } catch {
    return null;
  }
}

export function validateDurationSeconds(
  value: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum} seconds.`);
  }
  return value;
}

export function safeHeaderValue(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F"\\]/g, ' ').slice(0, 300);
}
