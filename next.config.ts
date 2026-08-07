import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === "development";

/**
 * MCP transport routing.
 *
 * The MCP server runs as the `threadmapMcpGateway` Cloud Function, but clients
 * discover it at the app's own origin — the OAuth metadata advertises
 * `https://threadmap.app/register`, `/authorize`, `/token`, and so on. These
 * rewrites are what make those paths reach the gateway.
 *
 * Without them every one of these routes falls through to the Next.js 404 page
 * and answers with HTML, so a client's registration POST gets markup where it
 * expects JSON and the connect flow fails at the first step. Deleting this
 * block silently breaks every MCP integration; the endpoints are a published
 * contract, not internal wiring.
 */
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const mcpGatewayOrigin = process.env.MCP_GATEWAY_ORIGIN
  || process.env.NEXT_PUBLIC_MCP_GATEWAY_ORIGIN
  || (projectId ? `https://us-central1-${projectId}.cloudfunctions.net/threadmapMcpGateway` : "");

/** Paths the OAuth metadata advertises, each proxied to the gateway. */
const MCP_GATEWAY_PATHS = [
  "/mcp",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  // The 401 challenge on /mcp names this exact URL in its `resource_metadata`
  // parameter, so a client following RFC 9728 requests it before it can begin
  // OAuth. The gateway serves it; leaving it unrouted returned the app's HTML
  // 404 and stalled the connect flow before registration.
  "/mcp/.well-known/oauth-protected-resource",
  "/authorize",
  "/register",
  "/token",
  "/revoke",
];

function buildMcpRewrites() {
  // No gateway origin means no Firebase project is configured — a local or
  // self-hosted run without MCP. Routing to an empty origin would be worse
  // than not routing at all.
  if (!mcpGatewayOrigin) return [];
  return MCP_GATEWAY_PATHS.map((path) => ({
    source: path,
    destination: `${mcpGatewayOrigin}${path}`,
  }));
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firestore.googleapis.com https://storage.googleapis.com https://firebasestorage.googleapis.com https://www.googleapis.com https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.cloudfunctions.net https://*.vercel-insights.com",
  "frame-src 'self' blob: https://accounts.google.com https://*.firebaseapp.com https://firebasestorage.googleapis.com https://*.firebasestorage.app",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root,
  },
  async rewrites() {
    return buildMcpRewrites();
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
