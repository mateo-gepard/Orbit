import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FIREBASE_FUNCTIONS_REGION } from "./src/lib/deployment-config";

const root = dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === "development";
const appVersion = process.env.npm_package_version || "0.1.0";
const releaseId = process.env.THREADMAP_BUILD_SHA
  || process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || `local-${appVersion}`;
const PRODUCTION_FIREBASE_PROJECT = "orbit-9e0b6";
const STAGING_FIREBASE_PROJECT = "threadmap-staging-9e0b6";

export function resolveDeploymentFirebaseProject(
  vercelEnvironment = process.env.VERCEL_ENV,
  configuredProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
): string {
  const configured = configuredProject?.trim();
  if (configured && configured !== PRODUCTION_FIREBASE_PROJECT && configured !== STAGING_FIREBASE_PROJECT) {
    throw new Error(`Unsupported Firebase project for this repository: ${configured}`);
  }
  const providerProject = vercelEnvironment === "production"
    ? PRODUCTION_FIREBASE_PROJECT
    : vercelEnvironment === "preview"
      ? STAGING_FIREBASE_PROJECT
      : undefined;
  if (providerProject && configured && configured !== providerProject) {
    throw new Error(
      `VERCEL_ENV=${vercelEnvironment} requires Firebase project ${providerProject}; received ${configured}`,
    );
  }
  return providerProject || configured || STAGING_FIREBASE_PROJECT;
}

const deploymentFirebaseProjectId = resolveDeploymentFirebaseProject();
const mcpFunctionOrigin = `https://${FIREBASE_FUNCTIONS_REGION}-${deploymentFirebaseProjectId}.cloudfunctions.net/threadmapMcp`;

export function createContentSecurityPolicy({
  development = isDevelopment,
  upgradeInsecureRequests = !development,
}: {
  development?: boolean;
  upgradeInsecureRequests?: boolean;
} = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com`,
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
    "frame-ancestors 'none'",
    ...(upgradeInsecureRequests ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const contentSecurityPolicy = createContentSecurityPolicy();
const loopbackContentSecurityPolicy = createContentSecurityPolicy({
  upgradeInsecureRequests: false,
});

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()" },
  ...(!isDevelopment
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const privateRoutePrefixes = [
  "archive",
  "areas",
  "briefing",
  "calendar",
  "files",
  "goals",
  "habits",
  "integrations",
  "notes",
  "projects",
  "settings",
  "tasks",
  "today",
  "toolbox",
  "tools",
] as const;

const privateRouteIndexingHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

export function createFirebaseAuthRewrite(projectId: string) {
  return {
    source: "/__/auth/:path*",
    destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`,
  } as const;
}

export const firebaseAuthRewrite = createFirebaseAuthRewrite(deploymentFirebaseProjectId);

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_THREADMAP_RELEASE: releaseId,
    NEXT_PUBLIC_THREADMAP_VERSION: appVersion,
    THREADMAP_VERCEL_FUNCTION_REGION: "fra1",
  },
  turbopack: {
    root,
  },
  outputFileTracingIncludes: {
    "/sw.js": ["./src/service-worker/worker.js.template"],
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
      ...(!isDevelopment
        ? [{
            // A production build is also what Playwright and operators run on
            // loopback. WebKit upgrades loopback HTTP navigations when this
            // directive is present, even though no local TLS server exists.
            // The later host-qualified rule overrides only CSP; every deployed
            // hostname keeps the production upgrade directive.
            source: "/:path*",
            has: [{ type: "host" as const, value: "(?:localhost|127\\.0\\.0\\.1)" }],
            headers: [
              { key: "Content-Security-Policy", value: loopbackContentSecurityPolicy },
            ],
          }]
        : []),
      ...privateRoutePrefixes.map((prefix) => ({
        // `:path*` also matches the prefix root (for example `/tasks`).
        source: `/${prefix}/:path*`,
        headers: privateRouteIndexingHeaders,
      })),
      {
        source: "/integrations/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        // The URL stays stable while the route embeds the release SHA in its
        // bytes. Bypass browser/edge caches so native update comparison sees it.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
