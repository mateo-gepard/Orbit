import { normalizeScopes } from './security';
import { THREADMAP_MCP_SCOPES } from './tools';
import type { ThreadmapOAuthConfiguration } from './oauth';

/**
 * Public URL layout for the Threadmap MCP integration.
 *
 * Every OAuth endpoint must share the issuer's origin and the protected-resource
 * metadata URL must share the resource's origin — `validateOAuthEndpointConfiguration`
 * enforces both — so all of these are derived from one origin. The paths below
 * are the public ones; `vercel.json` rewrites them onto the Cloud Function, and
 * `functions/src/mcp/http.ts` routes them internally.
 */
export const MCP_DEFAULT_ORIGIN = 'https://threadmap.app';
const MCP_PRODUCTION_PROJECT_ID = 'orbit-9e0b6';
const MCP_STAGING_PROJECT_ID = 'threadmap-staging-9e0b6';
const MCP_VERCEL_PREVIEW_HOST = /^orbit-[a-z0-9-]+-mateos-projects-c394726f\.vercel\.app$/;

export interface McpRequestOriginInput {
  projectId?: string;
  forwardedHost?: string;
  forwardedProto?: string;
}

/**
 * Preview OAuth metadata must stay on the preview host so every follow-up
 * request returns through the staging rewrite. Only the staging project may
 * honor this header, and only hosts belonging to this Vercel project pass.
 */
export function resolveMcpRequestOrigin(input: McpRequestOriginInput): string | undefined {
  if (input.projectId !== MCP_STAGING_PROJECT_ID) return undefined;
  const protocol = input.forwardedProto?.split(',')[0]?.trim().toLowerCase();
  const host = input.forwardedHost?.split(',')[0]?.trim().toLowerCase();
  if (protocol !== 'https' || !host || !MCP_VERCEL_PREVIEW_HOST.test(host)) return undefined;
  return `https://${host}`;
}

export const MCP_PUBLIC_PATHS = Object.freeze({
  /** The MCP endpoint, which is also the RFC 8707 resource identifier. */
  mcp: '/mcp',
  authorize: '/api/mcp/oauth/authorize',
  token: '/api/mcp/oauth/token',
  register: '/api/mcp/oauth/register',
  revoke: '/api/mcp/oauth/revoke',
  authorizationServerMetadata: '/.well-known/oauth-authorization-server',
  /**
   * RFC 9728 recommends the path-aware form for a resource served at a subpath.
   * Both this and the root form are served, because host support differs.
   */
  protectedResourceMetadata: '/.well-known/oauth-protected-resource/mcp',
  protectedResourceMetadataRoot: '/.well-known/oauth-protected-resource',
});

export const MCP_SUPPORTED_SCOPES = Object.freeze([
  THREADMAP_MCP_SCOPES.read,
  THREADMAP_MCP_SCOPES.write,
  THREADMAP_MCP_SCOPES.delete,
  'offline_access',
]);

/**
 * Live server-wide scope ceiling for MCP clients and tokens. It narrows new
 * dynamic registrations and is re-applied to legacy authorization requests,
 * access tokens, and refresh rotation on every use.
 *
 * Dynamic registration fails closed to read-only access plus refresh tokens.
 * Write and delete are consequential capabilities and require an explicit
 * operator decision through `MCP_DYNAMIC_CLIENT_SCOPES` (space-separated).
 */
export const MCP_DEFAULT_DYNAMIC_CLIENT_SCOPES = Object.freeze([
  THREADMAP_MCP_SCOPES.read,
  'offline_access',
]);

export class McpConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpConfigurationError';
  }
}

function trimmedEnv(
  name: string,
  environment: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = environment[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveConfiguredMcpOrigin(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = trimmedEnv('MCP_ORIGIN', environment);
  if (configured) return originOf(configured);
  const projectId = environment.GCLOUD_PROJECT
    || environment.GOOGLE_CLOUD_PROJECT
    || environment.GCP_PROJECT;
  if (projectId !== MCP_PRODUCTION_PROJECT_ID) {
    throw new McpConfigurationError('MCP_ORIGIN must be configured for non-production projects.');
  }
  return MCP_DEFAULT_ORIGIN;
}

function originOf(rawOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new McpConfigurationError(`MCP_ORIGIN is not a valid URL: ${rawOrigin}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new McpConfigurationError('MCP_ORIGIN must use https.');
  }
  return parsed.origin;
}

export interface ResolvedMcpEndpoints {
  origin: string;
  /** Absolute URL of the MCP endpoint, which doubles as the resource identifier. */
  resource: string;
  authorize: string;
  token: string;
  register: string;
  revoke: string;
  authorizationServerMetadata: string;
  protectedResourceMetadata: string;
  protectedResourceMetadataRoot: string;
  /** Origins allowed to call the browser-facing consent endpoints. */
  consentOrigins: readonly string[];
}

export function resolveMcpEndpoints(
  rawOrigin: string = resolveConfiguredMcpOrigin(),
): ResolvedMcpEndpoints {
  const origin = originOf(rawOrigin);
  const absolute = (path: string): string => `${origin}${path}`;
  return {
    origin,
    resource: absolute(MCP_PUBLIC_PATHS.mcp),
    authorize: absolute(MCP_PUBLIC_PATHS.authorize),
    token: absolute(MCP_PUBLIC_PATHS.token),
    register: absolute(MCP_PUBLIC_PATHS.register),
    revoke: absolute(MCP_PUBLIC_PATHS.revoke),
    authorizationServerMetadata: absolute(MCP_PUBLIC_PATHS.authorizationServerMetadata),
    protectedResourceMetadata: absolute(MCP_PUBLIC_PATHS.protectedResourceMetadata),
    protectedResourceMetadataRoot: absolute(MCP_PUBLIC_PATHS.protectedResourceMetadataRoot),
    consentOrigins: [origin],
  };
}

/** Builds the OAuth configuration from the environment. */
export function resolveMcpOAuthConfiguration(
  endpoints: ResolvedMcpEndpoints = resolveMcpEndpoints(),
): ThreadmapOAuthConfiguration {
  const rawDynamicScopes = trimmedEnv('MCP_DYNAMIC_CLIENT_SCOPES');
  let dynamicClientScopes: string[];
  try {
    dynamicClientScopes = rawDynamicScopes
      ? normalizeScopes(rawDynamicScopes)
      : [...MCP_DEFAULT_DYNAMIC_CLIENT_SCOPES];
  } catch {
    throw new McpConfigurationError('MCP_DYNAMIC_CLIENT_SCOPES contains an invalid scope value.');
  }

  const configuredRedirectUris = (trimmedEnv('MCP_EXTRA_REDIRECT_URIS') ?? '')
    .split(/\s+/)
    .filter((value) => value.length > 0);

  return {
    issuer: endpoints.origin,
    resource: endpoints.resource,
    authorizationEndpoint: endpoints.authorize,
    tokenEndpoint: endpoints.token,
    registrationEndpoint: endpoints.register,
    revocationEndpoint: endpoints.revoke,
    protectedResourceMetadataUrl: endpoints.protectedResourceMetadata,
    authorizationConsentUrl: `${endpoints.origin}/integrations/authorize`,
    scopesSupported: [...MCP_SUPPORTED_SCOPES],
    resourceName: 'Threadmap',
    dynamicClientScopes,
    ...(configuredRedirectUris.length > 0 ? { configuredRedirectUris } : {}),
    // Loopback redirects are how Claude Code authenticates (RFC 8252). They are
    // only accepted when explicitly enabled, because a permanently open loopback
    // allowance widens the redirect surface for no benefit in production.
    allowLoopbackDevelopmentRedirects: trimmedEnv('MCP_ALLOW_LOOPBACK_REDIRECTS') === 'true',
    clientAuthenticationMethods: ['none', 'client_secret_basic', 'client_secret_post'],
  };
}
