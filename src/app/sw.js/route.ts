import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeServiceWorkerRevision,
  renderServiceWorkerSource,
} from '@/lib/service-worker-source';

export const dynamic = 'force-dynamic';

const EMBEDDED_RELEASE = process.env.NEXT_PUBLIC_THREADMAP_RELEASE?.trim()
  || process.env.THREADMAP_BUILD_SHA?.trim()
  || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  || process.env.GITHUB_SHA?.trim()
  || 'local-0.1.0';
const TEMPLATE_PATH = join(process.cwd(), 'src/service-worker/worker.js.template');

export function buildServiceWorkerResponse(
  revision = EMBEDDED_RELEASE,
  template = readFileSync(TEMPLATE_PATH, 'utf8'),
): Response {
  const normalizedRevision = normalizeServiceWorkerRevision(revision);
  return new Response(renderServiceWorkerSource(template, normalizedRevision), {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Content-Type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff',
      'X-Threadmap-Release': normalizedRevision.slice(0, 12),
    },
  });
}

export function GET() {
  return buildServiceWorkerResponse();
}
