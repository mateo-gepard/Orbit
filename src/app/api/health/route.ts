import { NextResponse } from 'next/server';
import {
  FIREBASE_FUNCTIONS_REGION,
  firebaseFunctionsOrigin,
} from '@/lib/deployment-config';

export const dynamic = 'force-dynamic';

const PRODUCTION_CONFIGURATION = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
  'SCRAPE_RATE_LIMIT_SHARED_SECRET',
  'LEGAL_ENTITY_NAME',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_POSTAL_ADDRESS',
  'SECURITY_CONTACT_EMAIL',
] as const;

// These explicit references are replaced at build time by Next.js. Keep them
// as fallbacks because dynamically indexing process.env does not inline values
// declared through next.config.ts.
const EMBEDDED_RELEASE = process.env.NEXT_PUBLIC_THREADMAP_RELEASE?.trim();
const EMBEDDED_VERSION = process.env.NEXT_PUBLIC_THREADMAP_VERSION?.trim();

function firstValue(environment: NodeJS.ProcessEnv, names: string[]): string | null {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function buildHealthPayload(
  environment: NodeJS.ProcessEnv = process.env,
  checkedAt = new Date(),
) {
  const version = firstValue(environment, ['NEXT_PUBLIC_THREADMAP_VERSION', 'npm_package_version'])
    || EMBEDDED_VERSION
    || '0.1.0';
  const sha = firstValue(environment, [
    'THREADMAP_BUILD_SHA',
    'NEXT_PUBLIC_THREADMAP_RELEASE',
    'VERCEL_GIT_COMMIT_SHA',
    'GITHUB_SHA',
  ]) || EMBEDDED_RELEASE || `local-${version}`;
  const firebaseProjectId = environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || null;
  const isProduction = environment.VERCEL_ENV === 'production';
  const missingConfiguration = isProduction
    ? PRODUCTION_CONFIGURATION.filter((name) => !environment[name]?.trim())
    : [];

  return {
    status: 'ok' as const,
    readiness: missingConfiguration.length ? 'degraded' as const : 'ready' as const,
    service: 'threadmap',
    checkedAt: checkedAt.toISOString(),
    release: {
      version,
      sha,
      shortSha: sha.startsWith('local-') ? sha : sha.slice(0, 12),
      deploymentId: environment.VERCEL_DEPLOYMENT_ID?.trim() || null,
      deploymentUrl: environment.VERCEL_URL?.trim()
        ? `https://${environment.VERCEL_URL.trim().replace(/^https?:\/\//, '')}`
        : null,
      environment: environment.VERCEL_ENV?.trim() || environment.NODE_ENV?.trim() || 'local',
    },
    runtime: {
      provider: environment.VERCEL ? 'vercel' : 'local',
      region: environment.VERCEL_REGION?.trim() || 'local',
      configuredRegion: environment.THREADMAP_VERCEL_FUNCTION_REGION?.trim() || 'fra1',
    },
    dependencies: {
      firebase: {
        configured: Boolean(firebaseProjectId),
        projectId: firebaseProjectId,
      },
      firebaseFunctions: {
        configured: Boolean(firebaseProjectId),
        region: FIREBASE_FUNCTIONS_REGION,
        origin: firebaseProjectId ? firebaseFunctionsOrigin(firebaseProjectId) : null,
      },
      appCheck: {
        configured: Boolean(environment.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim()),
      },
    },
    checks: {
      configuration: {
        status: missingConfiguration.length ? 'degraded' as const : 'ready' as const,
        missing: missingConfiguration,
      },
    },
  };
}

export function GET() {
  const payload = buildHealthPayload();
  return NextResponse.json(
    payload,
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Threadmap-Readiness': payload.readiness,
        'X-Threadmap-Release': payload.release.shortSha,
      },
    }
  );
}
