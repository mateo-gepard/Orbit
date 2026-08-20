import { createMcpHandler } from '@modelcontextprotocol/server';
import type { AuthInfo, McpHttpHandler } from '@modelcontextprotocol/server';
import type { ThreadmapDataAccess } from './dal';
import type { OAuthPrincipal, ThreadmapOAuthService } from './oauth';
import { OAuthProtocolError, createAuthorizationErrorRedirect, serializeOAuthError } from './oauth';
import { MCP_PUBLIC_PATHS, type ResolvedMcpEndpoints } from './config';
import { buildThreadmapMcpServer } from './sdk-server';
import { parseBearerToken } from './security';

/**
 * Web-standard HTTP surface for the Threadmap MCP integration.
 *
 * The router takes a `Request` and resolves a `Response` so it can be exercised
 * with fetch primitives in tests; `runMcpRouterOnNode` is the only part that
 * knows about Cloud Functions.
 *
 * Route map (public paths, rewritten onto the function by `vercel.json`):
 *
 *   POST   /mcp                                          JSON-RPC, MCP bearer token
 *   GET    /.well-known/oauth-authorization-server        AS metadata
 *   GET    /.well-known/oauth-protected-resource[/mcp]    PR metadata (both forms)
 *   GET    /api/mcp/oauth/authorize                       start authorization → consent
 *   POST   /api/mcp/oauth/token                           code + refresh grants
 *   POST   /api/mcp/oauth/register                        dynamic client registration
 *   POST   /api/mcp/oauth/revoke                          token revocation
 *   GET    /api/mcp/oauth/consent                         consent view, Firebase ID token
 *   POST   /api/mcp/oauth/consent/approve                 approve, Firebase ID token
 *   POST   /api/mcp/oauth/consent/deny                    deny, Firebase ID token
 */

const CONSENT_PATHS = Object.freeze({
  view: '/api/mcp/oauth/consent',
  approve: '/api/mcp/oauth/consent/approve',
  deny: '/api/mcp/oauth/consent/deny',
});

/** Mirrors the function name so the raw Cloud Functions URL also routes, for curl testing. */
const FUNCTION_PATH_PREFIX = '/threadmapMcp';
const REGISTRATION_SOURCE_HEADER = 'x-threadmap-registration-source';

const NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Content-Type': 'application/json; charset=utf-8',
});

/**
 * Cap on OAuth request bodies, which are small form or JSON documents. The `/mcp`
 * route is not covered here: the SDK handler reads and bounds that body itself.
 */
export const MCP_MAX_HTTP_BODY_BYTES = 256_000;

export interface McpHttpDependencies {
  oauth: ThreadmapOAuthService;
  endpoints: ResolvedMcpEndpoints;
  createDataAccess: (principal: OAuthPrincipal) => ThreadmapDataAccess;
  /** Verifies a Threadmap Firebase ID token and resolves its uid. */
  verifyUserIdToken: (idToken: string) => Promise<string>;
  /** Structured, redacted request logging. */
  log?: (entry: Record<string, unknown>) => void;
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  });
}

function methodNotAllowed(allow: string): Response {
  return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: allow });
}

/**
 * Strips the Cloud Functions name when the function is reached directly rather
 * than through the rewrite, and removes a trailing slash so `/mcp/` and `/mcp`
 * are the same route.
 */
export function normalizeMcpPath(pathname: string): string {
  let path = pathname;
  if (path === FUNCTION_PATH_PREFIX) return '/';
  if (path.startsWith(`${FUNCTION_PATH_PREFIX}/`)) {
    path = path.slice(FUNCTION_PATH_PREFIX.length);
  }
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');
  return path.length > 0 ? path : '/';
}

/** Parses an OAuth request body: JSON or form-encoded, both of which hosts send. */
async function readRequestParameters(request: Request): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  // Refuse on the declared length before buffering, then re-check the actual bytes
  // in case Content-Length was absent or understated.
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MCP_MAX_HTTP_BODY_BYTES) {
    throw new OAuthProtocolError('invalid_request', 'The request body is too large.');
  }
  const raw = await request.text();
  if (raw.length === 0) return {};
  if (Buffer.byteLength(raw, 'utf8') > MCP_MAX_HTTP_BODY_BYTES) {
    throw new OAuthProtocolError('invalid_request', 'The request body is too large.');
  }
  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('shape');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new OAuthProtocolError('invalid_request', 'The request body is not a JSON object.');
    }
  }
  // Default to form encoding: RFC 6749 token/revocation requests are
  // application/x-www-form-urlencoded, and that is what both hosts send.
  const params = new URLSearchParams(raw);
  const result: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) result[key] = value;
  return result;
}

/**
 * `Headers.get` yields `null` for an absent header, but the OAuth service
 * distinguishes "no client authentication was presented" (`undefined`) from "a
 * header was presented" — a `null` would be treated as a malformed Basic header
 * and refuse every public PKCE client.
 */
function optionalHeader(request: Request, name: string): string | undefined {
  return request.headers.get(name) ?? undefined;
}

function oauthErrorResponse(error: unknown): Response {
  const serialized = serializeOAuthError(error);
  const headers: Record<string, string> = {};
  if (serialized.status === 401) {
    headers['WWW-Authenticate'] = `Basic realm="Threadmap MCP", charset="UTF-8"`;
  }
  return jsonResponse(serialized.status, serialized.body, headers);
}

/**
 * Consent endpoints are called by the Threadmap web app in a browser, so they
 * are the only routes where an Origin check is meaningful. Same-origin requests
 * send no Origin header at all in some browsers, so a missing Origin is allowed
 * and only a *present and unrecognized* Origin is refused.
 */
function consentOriginAllowed(request: Request, endpoints: ResolvedMcpEndpoints): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return endpoints.consentOrigins.includes(origin);
}

async function requireUser(
  request: Request,
  dependencies: McpHttpDependencies,
): Promise<string> {
  const idToken = parseFirebaseIdToken(request.headers.get('authorization'));
  if (!idToken) {
    throw new OAuthProtocolError('invalid_client', 'A Threadmap sign-in is required.', { status: 401 });
  }
  try {
    return await dependencies.verifyUserIdToken(idToken);
  } catch {
    throw new OAuthProtocolError('invalid_client', 'The Threadmap sign-in could not be verified.', {
      status: 401,
    });
  }
}

/**
 * Firebase ID tokens are JWTs, so they carry dots and a far larger alphabet than
 * the opaque MCP access tokens `parseBearerToken` accepts. Keeping the two
 * parsers separate means a token minted for one surface can never be presented
 * to the other and accidentally satisfy its format check.
 */
function parseFirebaseIdToken(header: string | null): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9._-]{20,8192})$/.exec(header);
  return match?.[1] ?? null;
}

export type McpRouter = (request: Request) => Promise<Response>;

export function createMcpRouter(dependencies: McpHttpDependencies): McpRouter {
  const { oauth, endpoints } = dependencies;
  const log = dependencies.log ?? (() => undefined);

  // One handler for the process. The factory inside runs per request, so each
  // exchange still gets a fresh, isolated server instance — the stateless model
  // the 2026 transport expects, with no sticky routing required.
  const mcpHandler: McpHttpHandler = createMcpHandler(async (context) => {
    const authInfo = context.authInfo;
    const principal = authInfo?.extra?.principal as OAuthPrincipal | undefined;
    if (!principal) {
      // Unreachable through this router: `/mcp` verifies the token before
      // delegating. Failing closed keeps that invariant enforced rather than
      // assumed.
      throw new Error('The MCP handler was reached without a verified principal.');
    }
    return buildThreadmapMcpServer({
      dataAccess: dependencies.createDataAccess(principal),
      grantedScopes: principal.scopes,
    });
  });

  async function handleMcp(request: Request): Promise<Response> {
    const token = parseBearerToken(request.headers.get('authorization'));
    if (!token) {
      return jsonResponse(401, { error: 'invalid_token', error_description: 'A bearer access token is required.' }, {
        'WWW-Authenticate': oauth.bearerChallenge(),
      });
    }

    let principal: OAuthPrincipal;
    try {
      principal = await oauth.authenticateAccessToken(token);
    } catch (error) {
      const serialized = serializeOAuthError(error);
      // Emit the challenge verbatim. It is built server-side from an already
      // validated HTTPS URL, and `createBearerChallenge` sanitizes the parts it
      // interpolates — running it through `safeHeaderValue` here would strip the
      // RFC 9728 quotes around `resource_metadata` and leave a value clients
      // cannot parse.
      return jsonResponse(serialized.status, serialized.body, {
        'WWW-Authenticate': oauth.bearerChallenge(),
      });
    }

    const authInfo: AuthInfo = {
      token,
      clientId: principal.clientId,
      scopes: [...principal.scopes],
      // AuthInfo expects seconds since epoch; the principal carries milliseconds.
      expiresAt: Math.floor(principal.expiresAt / 1_000),
      resource: new URL(principal.resource),
      extra: { principal },
    };

    log({
      route: 'mcp',
      clientId: principal.clientId,
      tokenId: principal.tokenId,
      scopes: principal.scopes,
    });
    return mcpHandler.fetch(request, { authInfo });
  }

  async function handleAuthorize(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parameters: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) parameters[key] = value;
    try {
      const result = await oauth.startAuthorization(parameters);
      return redirectResponse(result.location);
    } catch (error) {
      // A registered redirect_uri gets the error delivered per RFC 6749 §4.1.2.1;
      // anything else is shown directly so an unvalidated URI is never a redirector.
      const redirect = createAuthorizationErrorRedirect(error, {
        configuredRedirectUris: oauth.configuration.configuredRedirectUris,
        allowLoopbackDevelopmentRedirects: oauth.configuration.allowLoopbackDevelopmentRedirects,
      });
      if (redirect) return redirectResponse(redirect);
      return oauthErrorResponse(error);
    }
  }

  async function handleConsentView(request: Request): Promise<Response> {
    const uid = await requireUser(request, dependencies);
    const requestToken = new URL(request.url).searchParams.get('request');
    const view = await oauth.getAuthorizationRequest(requestToken, uid);
    return jsonResponse(200, view);
  }

  async function handleConsentDecision(request: Request, decision: 'approve' | 'deny'): Promise<Response> {
    const uid = await requireUser(request, dependencies);
    const body = await readRequestParameters(request);
    const result = decision === 'approve'
      ? await oauth.approveAuthorizationRequest(body.request, uid, body.scopes)
      : await oauth.denyAuthorizationRequest(body.request, uid);
    log({ route: `consent.${decision}`, uid });
    return jsonResponse(200, { location: result.location });
  }

  return async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizeMcpPath(url.pathname);
    const method = request.method.toUpperCase();

    try {
      switch (path) {
        case MCP_PUBLIC_PATHS.mcp:
          // GET and DELETE are 2025 session operations; the stateless handler
          // answers them itself, so they are delegated rather than pre-refused.
          if (method !== 'POST' && method !== 'GET' && method !== 'DELETE') {
            return methodNotAllowed('POST, GET, DELETE');
          }
          return await handleMcp(request);

        case MCP_PUBLIC_PATHS.authorizationServerMetadata:
          if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed('GET, HEAD');
          return jsonResponse(200, oauth.authorizationServerMetadata());

        case MCP_PUBLIC_PATHS.protectedResourceMetadata:
        case MCP_PUBLIC_PATHS.protectedResourceMetadataRoot:
          if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed('GET, HEAD');
          return jsonResponse(200, oauth.protectedResourceMetadata());

        case MCP_PUBLIC_PATHS.authorize:
          if (method !== 'GET') return methodNotAllowed('GET');
          return await handleAuthorize(request);

        case MCP_PUBLIC_PATHS.token:
          if (method !== 'POST') return methodNotAllowed('POST');
          return jsonResponse(
            200,
            await oauth.exchangeToken(
              await readRequestParameters(request),
              optionalHeader(request, 'authorization'),
            ),
          );

        case MCP_PUBLIC_PATHS.register:
          if (method !== 'POST') return methodNotAllowed('POST');
          return jsonResponse(201, await oauth.registerClient(
            await readRequestParameters(request),
            request.headers.get(REGISTRATION_SOURCE_HEADER) || 'unknown',
          ));

        case MCP_PUBLIC_PATHS.revoke:
          if (method !== 'POST') return methodNotAllowed('POST');
          await oauth.revokeToken(
            await readRequestParameters(request),
            optionalHeader(request, 'authorization'),
          );
          // RFC 7009: a successful revocation returns 200 with an empty body.
          return jsonResponse(200, {});

        case CONSENT_PATHS.view:
          if (method !== 'GET') return methodNotAllowed('GET');
          if (!consentOriginAllowed(request, endpoints)) return jsonResponse(403, { error: 'forbidden_origin' });
          return await handleConsentView(request);

        case CONSENT_PATHS.approve:
          if (method !== 'POST') return methodNotAllowed('POST');
          if (!consentOriginAllowed(request, endpoints)) return jsonResponse(403, { error: 'forbidden_origin' });
          return await handleConsentDecision(request, 'approve');

        case CONSENT_PATHS.deny:
          if (method !== 'POST') return methodNotAllowed('POST');
          if (!consentOriginAllowed(request, endpoints)) return jsonResponse(403, { error: 'forbidden_origin' });
          return await handleConsentDecision(request, 'deny');

        default:
          return jsonResponse(404, { error: 'not_found' });
      }
    } catch (error) {
      if (error instanceof OAuthProtocolError) {
        // Without this, a client-side failure such as a refused registration
        // leaves no server-side trace and has to be reproduced by hand. The code
        // and description are server-authored constants, never request content.
        log({
          route: path,
          level: 'warn',
          oauthError: error.code,
          status: error.status,
          message: error.message,
        });
        return oauthErrorResponse(error);
      }
      // Never surface an unexpected exception's message: it can carry Firestore
      // detail, internal hostnames, or token material.
      log({ route: path, level: 'error', message: error instanceof Error ? error.name : 'unknown' });
      return jsonResponse(500, {
        error: 'server_error',
        error_description: 'The Threadmap MCP endpoint could not complete the request.',
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════
// Cloud Functions bridge
// ═══════════════════════════════════════════════════════════

/** The subset of a Cloud Functions request the bridge reads. */
export interface NodeRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: unknown;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/** The subset of a Cloud Functions response the bridge writes. */
export interface NodeResponseLike {
  status(code: number): NodeResponseLike;
  setHeader(name: string, value: string): void;
  send(body?: string | Buffer): void;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

export function toWebRequest(request: NodeRequestLike, fallbackOrigin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    const flattened = headerValue(value);
    if (flattened !== undefined) headers.set(name, flattened);
  }
  // Never trust a caller-supplied copy of the internal quota subject. Cloud
  // Functions supplies `request.ip`; the socket address is a local fallback.
  headers.delete(REGISTRATION_SOURCE_HEADER);
  headers.set(
    REGISTRATION_SOURCE_HEADER,
    request.ip || request.socket?.remoteAddress || 'unknown',
  );

  const host = headerValue(request.headers.host) ?? new URL(fallbackOrigin).host;
  const forwardedProto = headerValue(request.headers['x-forwarded-proto']);
  const protocol = forwardedProto?.split(',')[0]?.trim() || 'https';
  const path = request.originalUrl ?? request.url ?? '/';
  const url = new URL(path, `${protocol}://${host}`);

  const method = (request.method ?? 'GET').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  // Cloud Functions parses JSON bodies eagerly, so `rawBody` is the only faithful
  // source; fall back to re-serializing the parsed body when it is absent.
  const body = hasBody
    ? request.rawBody ?? (request.body === undefined ? undefined : Buffer.from(
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
      'utf8',
    ))
    : undefined;

  return new Request(url, {
    method,
    headers,
    ...(body && body.length > 0 ? { body: new Uint8Array(body) } : {}),
  });
}

export async function runMcpRouterOnNode(
  router: McpRouter,
  request: NodeRequestLike,
  response: NodeResponseLike,
  fallbackOrigin: string,
): Promise<void> {
  let webResponse: Response;
  try {
    webResponse = await router(toWebRequest(request, fallbackOrigin));
  } catch {
    response.status(500).setHeader('Cache-Control', 'no-store');
    response.status(500).send(JSON.stringify({ error: 'server_error' }));
    return;
  }

  webResponse.headers.forEach((value, name) => {
    response.setHeader(name, value);
  });
  const buffer = Buffer.from(await webResponse.arrayBuffer());
  response.status(webResponse.status).send(buffer.length > 0 ? buffer : undefined);
}
