import { NextRequest, NextResponse } from 'next/server';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  name: string;
  max: number;
  windowMs: number;
}

const buckets =
  ((globalThis as typeof globalThis & { __orbitRateLimit?: Map<string, Bucket> }).__orbitRateLimit ??=
    new Map<string, Bucket>());

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

export function checkRateLimit(request: NextRequest, options: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  const key = `${options.name}:${getClientIp(request)}`;
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

export function trimRateLimitBuckets(now = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
