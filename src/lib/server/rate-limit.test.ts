import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { checkDistributedScrapeRateLimit } from './rate-limit';

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://threadmap.app/api/scrape', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com' }),
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer firebase-id-token',
      'x-firebase-appcheck': 'firebase-app-check-token',
      'x-vercel-forwarded-for': '203.0.113.42',
      ...headers,
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('distributed scrape rate limiting', () => {
  it('uses the local limiter only when shared configuration is absent outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SCRAPE_RATE_LIMIT_SHARED_SECRET', '');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', '');

    await expect(checkDistributedScrapeRateLimit(request(), 'owner-1')).resolves.toBeNull();
  });

  it('forwards auth and a secret-keyed IP hash without exposing the source IP', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCRAPE_RATE_LIMIT_SHARED_SECRET', 'shared-secret');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'orbit-test');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkDistributedScrapeRateLimit(request(), 'owner-1')).resolves.toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://europe-west1-orbit-test.cloudfunctions.net/consumeThreadmapScrapeQuota',
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer firebase-id-token',
      'X-Firebase-AppCheck': 'firebase-app-check-token',
      'X-Threadmap-Scrape-Secret': 'shared-secret',
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ userId: 'owner-1' });
    expect(body.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(init.body)).not.toContain('203.0.113.42');
  });

  it('fails closed before the shared request when App Check proof is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCRAPE_RATE_LIMIT_SHARED_SECRET', 'shared-secret');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'orbit-test');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await checkDistributedScrapeRateLimit(
      request({ 'x-firebase-appcheck': '' }),
      'owner-1',
    );

    expect(response?.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a bounded 429 response from the shared limiter', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCRAPE_RATE_LIMIT_SHARED_SECRET', 'shared-secret');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'orbit-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 429,
      headers: { 'Retry-After': '99999' },
    })));

    const response = await checkDistributedScrapeRateLimit(request(), 'owner-1');
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('600');
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });

  it('fails closed in production when the shared limiter is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCRAPE_RATE_LIMIT_SHARED_SECRET', 'shared-secret');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'orbit-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));

    const response = await checkDistributedScrapeRateLimit(request(), 'owner-1');
    expect(response?.status).toBe(503);
    expect(response?.headers.get('retry-after')).toBe('10');
  });
});
