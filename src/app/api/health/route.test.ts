import { describe, expect, it } from 'vitest';
import { buildHealthPayload, GET } from './route';

describe('health route', () => {
  it('identifies the exact release, runtime, and Firebase Functions region', () => {
    const payload = buildHealthPayload({
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
      VERCEL_DEPLOYMENT_ID: 'dpl_example',
      VERCEL_URL: 'threadmap-example.vercel.app',
      VERCEL_REGION: 'fra1',
      THREADMAP_VERCEL_FUNCTION_REGION: 'fra1',
      NEXT_PUBLIC_THREADMAP_VERSION: '0.1.0',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'orbit-test',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'public-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'orbit-test.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'orbit-test.firebasestorage.app',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
      NEXT_PUBLIC_FIREBASE_APP_ID: 'app-id',
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'site-key',
      NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'vapid-key',
      NEXT_PUBLIC_THREADMAP_PRIVATE_MODE: 'true',
      THREADMAP_DEPLOYMENT_MODE: 'private',
      SCRAPE_RATE_LIMIT_SHARED_SECRET: 'secret',
      LEGAL_CONTACT_EMAIL: 'legal@example.test',
      SECURITY_CONTACT_EMAIL: 'security@example.test',
    }, new Date('2026-08-20T12:00:00.000Z'));

    expect(payload).toMatchObject({
      status: 'ok',
      readiness: 'ready',
      checkedAt: '2026-08-20T12:00:00.000Z',
      release: {
        version: '0.1.0',
        sha: '0123456789abcdef0123456789abcdef01234567',
        shortSha: '0123456789ab',
        deploymentId: 'dpl_example',
        deploymentUrl: 'https://threadmap-example.vercel.app',
      },
      runtime: {
        provider: 'vercel',
        region: 'fra1',
        configuredRegion: 'fra1',
      },
      dependencies: {
        firebaseFunctions: {
          region: 'europe-west1',
          origin: 'https://europe-west1-orbit-test.cloudfunctions.net',
        },
      },
    });
  });

  it('reports missing production configuration without exposing values', () => {
    const payload = buildHealthPayload({
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'production',
    });

    expect(payload.readiness).toBe('degraded');
    expect(payload.checks.configuration.missing).toContain('THREADMAP_DEPLOYMENT_MODE');
    expect(payload.checks.configuration.missing).toContain('SCRAPE_RATE_LIMIT_SHARED_SECRET');
  });

  it('requires public controller identity only in public mode', () => {
    const payload = buildHealthPayload({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      THREADMAP_DEPLOYMENT_MODE: 'public',
    });

    expect(payload.checks.configuration.missing).toContain('LEGAL_ENTITY_NAME');
    expect(payload.checks.configuration.missing).toContain('LEGAL_POSTAL_ADDRESS');
  });

  it('treats the explicitly built candidate SHA as authoritative', () => {
    const payload = buildHealthPayload({
      NODE_ENV: 'production',
      THREADMAP_BUILD_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      NEXT_PUBLIC_THREADMAP_RELEASE: 'dddddddddddddddddddddddddddddddddddddddd',
      VERCEL_GIT_COMMIT_SHA: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      GITHUB_SHA: 'cccccccccccccccccccccccccccccccccccccccc',
    });

    expect(payload.release.sha).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('returns no-store release and readiness headers', async () => {
    const response = GET();

    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-threadmap-release')).toBeTruthy();
    expect(['ready', 'degraded']).toContain(response.headers.get('x-threadmap-readiness'));
  });
});
