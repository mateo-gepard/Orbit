import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { firebaseFunctionsOrigin } from '@/lib/deployment-config';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  name: string;
  max: number;
  windowMs: number;
  identity?: string;
}

const buckets =
  ((globalThis as typeof globalThis & { __orbitRateLimit?: Map<string, Bucket> }).__orbitRateLimit ??=
    new Map<string, Bucket>());
const MAX_BUCKETS = 10_000;
const MAX_APP_CHECK_TOKEN_LENGTH = 4_096;
let lastBucketSweep = 0;

// This in-memory limiter is a soft per-instance abuse layer. Production-wide
// quotas still belong at the platform edge or in a shared rate-limit store.
function maintainBucketBound(now: number): void {
  if (now - lastBucketSweep > 60_000 || buckets.size >= MAX_BUCKETS) {
    trimRateLimitBuckets(now);
    lastBucketSweep = now;
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

function getClientIp(request: NextRequest): string {
  // Vercel supplies this header from its trusted edge. Prefer it over the
  // generic forwarding headers, which can contain client-provided hops.
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for')
    ?.split(',')[0]?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    vercelForwardedFor ||
    forwardedFor ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

function distributedLimitUnavailable(): NextResponse {
  return NextResponse.json(
    { error: 'Product lookup protection is temporarily unavailable. Please retry shortly.' },
    {
      status: 503,
      headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' },
    },
  );
}

/**
 * Enforce a shared quota before starting any external scrape. The Cloud
 * Function is the production-wide boundary; the local buckets below absorb
 * bursts without adding a network round-trip for requests already over limit.
 */
export async function checkDistributedScrapeRateLimit(
  request: NextRequest,
  userId: string,
): Promise<NextResponse | null> {
  const secret = process.env.SCRAPE_RATE_LIMIT_SHARED_SECRET;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authorization = request.headers.get('authorization');
  const appCheckToken = request.headers.get('x-firebase-appcheck');

  // Local development and unit tests retain the bounded instance limiter. A
  // deployed build fails closed if its shared quota configuration is missing.
  if (!secret || !projectId) {
    return process.env.NODE_ENV === 'production' ? distributedLimitUnavailable() : null;
  }
  if (!authorization?.startsWith('Bearer ')) return distributedLimitUnavailable();
  if (process.env.NODE_ENV === 'production'
      && (!appCheckToken || appCheckToken.length > MAX_APP_CHECK_TOKEN_LENGTH)) {
    return distributedLimitUnavailable();
  }

  const ipHash = createHmac('sha256', secret)
    .update(getClientIp(request))
    .digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(
      `${firebaseFunctionsOrigin(projectId)}/consumeThreadmapScrapeQuota`,
      {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          'X-Threadmap-Scrape-Secret': secret,
          ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
        },
        body: JSON.stringify({ userId, ipHash }),
        cache: 'no-store',
        signal: controller.signal,
      },
    );
    if (response.status === 204) return null;
    if (response.status === 429) {
      const retryAfter = Math.max(
        1,
        Math.min(600, Number(response.headers.get('retry-after') || 60) || 60),
      );
      return NextResponse.json(
        { error: 'Too many product lookups. Please try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' },
        },
      );
    }
    console.error(`[THREADMAP] Shared scrape quota returned ${response.status}.`);
    return distributedLimitUnavailable();
  } catch (error) {
    console.error('[THREADMAP] Shared scrape quota is unavailable:', error);
    return distributedLimitUnavailable();
  } finally {
    clearTimeout(timeout);
  }
}

export function checkRateLimit(request: NextRequest, options: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  maintainBucketBound(now);
  const key = `${options.name}:${options.identity || getClientIp(request)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.max) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
      },
    }
  );
}

const activeOperations =
  ((globalThis as typeof globalThis & { __orbitActiveOperations?: Map<string, number> })
    .__orbitActiveOperations ??= new Map<string, number>());

export function acquireConcurrency(
  name: string,
  identity: string,
  maxConcurrent = 2
): (() => void) | null {
  const key = `${name}:${identity}`;
  const active = activeOperations.get(key) || 0;
  if (active >= maxConcurrent) return null;
  activeOperations.set(key, active + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeOperations.get(key) || 1) - 1;
    if (remaining <= 0) activeOperations.delete(key);
    else activeOperations.set(key, remaining);
  };
}

export function trimRateLimitBuckets(now = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
