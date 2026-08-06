import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === "development";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const mcpGatewayOrigin = (process.env.MCP_GATEWAY_ORIGIN || process.env.NEXT_PUBLIC_MCP_GATEWAY_ORIGIN
  || (projectId ? `https://us-central1-${projectId}.cloudfunctions.net/threadmapMcpGateway` : '')
) || '';

function isMcpGatewayEnabled() {
  // Route MCP discovery and auth calls through the Function gateway whenever it
  // is explicitly known.
  return Boolean(mcpGatewayOrigin);
}

function buildMcpRewrites() {
  if (!isMcpGatewayEnabled()) return [];
  return [
    { source: '/mcp', destination: `${mcpGatewayOrigin}/mcp` },
    {
      source: '/.well-known/oauth-authorization-server',
      destination: `${mcpGatewayOrigin}/.well-known/oauth-authorization-server`,
    },
    {
      source: '/.well-known/oauth-protected-resource',
      destination: `${mcpGatewayOrigin}/.well-known/oauth-protected-resource`,
    },
    { source: '/authorize', destination: `${mcpGatewayOrigin}/authorize` },
    { source: '/register', destination: `${mcpGatewayOrigin}/register` },
    { source: '/token', destination: `${mcpGatewayOrigin}/token` },
    { source: '/revoke', destination: `${mcpGatewayOrigin}/revoke` },
  ];
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
