#!/usr/bin/env node

const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error('Usage: read-release-sha.mjs https://deployment.example');
  process.exit(1);
}

let origin;
let isTrustedVercelTarget = false;
try {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') throw new Error('target must use HTTPS');
  origin = parsed.origin;
  isTrustedVercelTarget = parsed.hostname === 'threadmap.app'
    || parsed.hostname === 'www.threadmap.app';
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 12_000);
let response;
try {
  response = await fetch(`${origin}/api/health`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: controller.signal,
    headers: {
      'User-Agent': 'threadmap-release-identity-reader',
      ...(isTrustedVercelTarget && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {}),
    },
  });
} catch (error) {
  console.error(`Health identity request failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
if (response.status >= 300 && response.status < 400) {
  console.error('Health identity request redirected instead of identifying the requested target.');
  process.exit(1);
}
if (!response.ok || !/no-store/i.test(response.headers.get('cache-control') || '')) {
  console.error(`Health identity request failed or was cacheable (${response.status}).`);
  process.exit(1);
}

const health = await response.json();
const sha = health?.release?.sha;
if (!/^[0-9a-f]{40}$/.test(sha || '')) {
  console.error('Health response does not expose a full release SHA.');
  process.exit(1);
}
process.stdout.write(sha);
