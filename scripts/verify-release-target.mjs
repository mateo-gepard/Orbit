#!/usr/bin/env node

import {
  resolveAllowedReleaseOrigin,
  resolveExpectedMcpOrigin,
  resolveReleaseTargetProfile,
} from './release-target-policy.mjs';

const FIREBASE_REGION = 'europe-west1';
const VERCEL_REGION = 'fra1';
const PRODUCTION_PROJECT = 'orbit-9e0b6';
const MCP_PUBLIC_ORIGIN = 'https://threadmap.app';
let origin;
let bypassOrigin = null;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function abort() {
  // Keep verifier output free of provider responses and credential-bearing URLs.
  // Detailed failures belong in the protected CI trace, not a copied console line.
  console.error('Release target verification failed.');
  process.exit(1);
}

async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const requestOrigin = new URL(url).origin;
    const isVercelReleaseTarget = requestOrigin === origin && requestOrigin === bypassOrigin;
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'threadmap-release-verifier',
        ...(isVercelReleaseTarget && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? {
              'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            }
          : {}),
        ...init.headers,
      },
    });
    if (response.status >= 300 && response.status < 400) {
      abort(`${url} redirected instead of verifying the requested artifact directly`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

const rawUrl = argument('--url') || process.env.THREADMAP_RELEASE_URL;
const expectedSha = argument('--sha') || process.env.THREADMAP_RELEASE_SHA || process.env.GITHUB_SHA;
let profile;
try {
  profile = resolveReleaseTargetProfile(
    argument('--environment') || process.env.THREADMAP_RELEASE_ENVIRONMENT || 'production',
  );
} catch (error) {
  abort(error instanceof Error ? error.message : String(error));
}
const configuredProject = argument('--firebase-project') || process.env.THREADMAP_FIREBASE_PROJECT;
const expectedProject = configuredProject
  || (profile.name === 'production' ? PRODUCTION_PROJECT : profile.firebaseProject);
const scrapeQuotaSecret = process.env.SCRAPE_RATE_LIMIT_SHARED_SECRET?.trim();
if (!rawUrl) abort('provide --url or THREADMAP_RELEASE_URL');
if (!expectedSha) abort('provide --sha, THREADMAP_RELEASE_SHA, or GITHUB_SHA');
if (!/^[0-9a-f]{40}$/.test(expectedSha)) abort('the expected SHA must be 40 lowercase hex characters');
if (!scrapeQuotaSecret) abort('SCRAPE_RATE_LIMIT_SHARED_SECRET is required for the cross-plane quota probe');
if (expectedProject !== profile.firebaseProject) {
  abort(`--firebase-project must match the ${profile.name} release profile`);
}

try {
  origin = resolveAllowedReleaseOrigin(rawUrl, profile);
} catch (error) {
  abort(error instanceof Error ? error.message : String(error));
}
const expectedMcpOrigin = profile.name === 'production'
  ? MCP_PUBLIC_ORIGIN
  : resolveExpectedMcpOrigin(profile, origin);

if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  const rawBypassOrigin = process.env.THREADMAP_VERCEL_BYPASS_ORIGIN?.trim();
  if (!rawBypassOrigin) abort('THREADMAP_VERCEL_BYPASS_ORIGIN must bind the bypass secret to one target');
  try {
    const parsedBypassOrigin = new URL(rawBypassOrigin);
    if (parsedBypassOrigin.protocol !== 'https:'
        || parsedBypassOrigin.origin !== rawBypassOrigin
        || parsedBypassOrigin.origin !== origin) {
      abort('THREADMAP_VERCEL_BYPASS_ORIGIN must exactly match the verified HTTPS origin');
    }
    bypassOrigin = parsedBypassOrigin.origin;
  } catch (error) {
    abort(error instanceof Error ? error.message : String(error));
  }
}

const healthResponse = await request(`${origin}/api/health`);
if (!healthResponse.ok) abort(`/api/health returned ${healthResponse.status}`);
if (!/no-store/i.test(healthResponse.headers.get('cache-control') || '')) {
  abort('/api/health is cacheable');
}
if (healthResponse.headers.get('x-threadmap-release') !== expectedSha.slice(0, 12)) {
  abort('/api/health release header does not match the expected SHA');
}
if (healthResponse.headers.get('x-threadmap-readiness') !== 'ready') {
  abort('/api/health readiness header is not ready');
}

let health;
try {
  health = await healthResponse.json();
} catch {
  abort('/api/health did not return JSON');
}

const checks = [
  [health.status === 'ok', `health status is ${health.status}`],
  [health.readiness === 'ready', `readiness is ${health.readiness}`],
  [health.release?.sha === expectedSha, `deployed SHA ${health.release?.sha} does not match ${expectedSha}`],
  [profile.name === 'production'
    ? health.release?.environment === 'production'
    : health.release?.environment === profile.vercelEnvironment,
  `deployment environment is ${health.release?.environment}; expected ${profile.vercelEnvironment}`],
  [typeof health.release?.deploymentUrl === 'string'
      && /^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(health.release.deploymentUrl),
    `deployment URL is ${health.release?.deploymentUrl}`],
  [health.runtime?.provider === 'vercel', `runtime provider is ${health.runtime?.provider}`],
  [health.dependencies?.firebase?.projectId === expectedProject,
    `Firebase project ${health.dependencies?.firebase?.projectId} does not match ${expectedProject}`],
  [health.dependencies?.firebaseFunctions?.region === FIREBASE_REGION,
    `Firebase Functions region is ${health.dependencies?.firebaseFunctions?.region}`],
  [health.dependencies?.firebaseFunctions?.origin
      === `https://${FIREBASE_REGION}-${expectedProject}.cloudfunctions.net`,
    `Firebase Functions origin is ${health.dependencies?.firebaseFunctions?.origin}`],
  [health.dependencies?.appCheck?.configured === true, 'Firebase App Check is not configured'],
  [health.runtime?.configuredRegion === VERCEL_REGION,
    `configured Vercel region is ${health.runtime?.configuredRegion}`],
  [health.runtime?.region === VERCEL_REGION,
    `executing Vercel region is ${health.runtime?.region}`],
];
for (const [passed, message] of checks) if (!passed) abort(message);

const functionsOrigin = health.dependencies.firebaseFunctions.origin;
const quotaResponse = await request(`${functionsOrigin}/consumeThreadmapScrapeQuota`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${'invalid-release-probe'.padEnd(32, '-')}`,
    'Content-Type': 'application/json',
    'X-Firebase-AppCheck': 'invalid-release-probe'.padEnd(32, '-'),
    'X-Threadmap-Scrape-Secret': scrapeQuotaSecret,
  },
  body: JSON.stringify({
    userId: 'release-verifier',
    ipHash: '0'.repeat(64),
  }),
});
let quotaError;
try {
  quotaError = (await quotaResponse.json()).error;
} catch {
  abort(`scrape quota credential probe returned non-JSON status ${quotaResponse.status}`);
}
if (quotaResponse.status !== 401 || quotaError !== 'invalid_app_check') {
  abort(`scrape quota credential probe returned ${quotaResponse.status}/${quotaError || 'unknown'}; expected 401/invalid_app_check`);
}

const oauthResponse = await request(`${origin}/.well-known/oauth-authorization-server`);
if (!oauthResponse.ok) abort(`MCP OAuth discovery returned ${oauthResponse.status}`);
const oauth = await oauthResponse.json();
if (oauth.issuer !== expectedMcpOrigin
    || oauth.authorization_endpoint !== `${expectedMcpOrigin}/api/mcp/oauth/authorize`
    || oauth.token_endpoint !== `${expectedMcpOrigin}/api/mcp/oauth/token`
    || oauth.registration_endpoint !== `${expectedMcpOrigin}/api/mcp/oauth/register`
    || !Array.isArray(oauth.code_challenge_methods_supported)
    || !oauth.code_challenge_methods_supported.includes('S256')
    || !Array.isArray(oauth.scopes_supported)
    || !oauth.scopes_supported.includes('threadmap.read')) {
  abort(`MCP OAuth discovery does not match the canonical ${profile.name} origin`);
}

const resourceResponse = await request(`${origin}/.well-known/oauth-protected-resource/mcp`);
if (!resourceResponse.ok) {
  abort(`MCP protected-resource discovery returned ${resourceResponse.status}`);
}
const resource = await resourceResponse.json();
const authorizationServers = new Set(
  Array.isArray(resource.authorization_servers)
    ? resource.authorization_servers.filter((value) => typeof value === 'string')
    : [],
);
if (resource.resource !== `${expectedMcpOrigin}/mcp`
    || !authorizationServers.has(expectedMcpOrigin)) {
  abort(`MCP protected-resource discovery does not match the canonical ${profile.name} origin`);
}

console.log(`${profile.name === 'production' ? 'Production' : 'Staging'} release target verified.`);
console.log(`  URL: ${origin}`);
console.log(`  SHA: ${expectedSha}`);
console.log(`  Environment: ${profile.name}`);
console.log(`  Vercel region: ${health.runtime.region}`);
console.log(`  Firebase project: ${expectedProject}`);
console.log(`  Firebase Functions region: ${FIREBASE_REGION}`);
