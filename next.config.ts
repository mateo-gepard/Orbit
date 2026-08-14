import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === "development";
const mcpProjectId = process.env.VERCEL_ENV === "production"
  ? "orbit-9e0b6"
  : "threadmap-staging-9e0b6";
const mcpFunctionOrigin = `https://europe-west1-${mcpProjectId}.cloudfunctions.net/threadmapMcp`;

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firestore.googleapis.com https://storage.googleapis.com https://firebasestorage.googleapis.com https://recaptchaenterprise.googleapis.com https://www.google.com/recaptcha/ https://www.googleapis.com https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.cloudfunctions.net https://*.vercel-insights.com",
  "frame-src 'self' blob: https://accounts.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://*.firebaseapp.com https://firebasestorage.googleapis.com https://*.firebasestorage.app",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()" },
  ...(!isDevelopment
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

export const firebaseAuthRewrite = {
  source: "/__/auth/:path*",
  destination: "https://orbit-9e0b6.firebaseapp.com/__/auth/:path*",
} as const;

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  turbopack: {
    root,
  },
  async rewrites() {
    return [
      firebaseAuthRewrite,
      { source: "/mcp", destination: `${mcpFunctionOrigin}/mcp` },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${mcpFunctionOrigin}/.well-known/oauth-authorization-server`,
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: `${mcpFunctionOrigin}/.well-known/oauth-protected-resource`,
      },
      {
        source: "/.well-known/oauth-protected-resource/mcp",
        destination: `${mcpFunctionOrigin}/.well-known/oauth-protected-resource/mcp`,
      },
      {
        source: "/api/mcp/oauth/:path*",
        destination: `${mcpFunctionOrigin}/api/mcp/oauth/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/integrations/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
