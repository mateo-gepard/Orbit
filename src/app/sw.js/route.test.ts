import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getServiceWorkerUrl } from '@/lib/pwa';
import { buildServiceWorkerResponse } from './route';

const template = readFileSync(
  join(process.cwd(), 'src/service-worker/worker.js.template'),
  'utf8',
);

describe('deployment-bound service-worker response', () => {
  it('serves changing release bytes from one stable browser update URL', async () => {
    const releaseA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const releaseB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const responseA = buildServiceWorkerResponse(releaseA, template);
    const responseB = buildServiceWorkerResponse(releaseB, template);
    const sourceA = await responseA.text();
    const sourceB = await responseB.text();

    expect(getServiceWorkerUrl()).toBe('/sw.js');
    expect(sourceA).not.toBe(sourceB);
    expect(sourceA).toContain(`const RELEASE_REVISION = "${releaseA}";`);
    expect(sourceB).toContain(`const RELEASE_REVISION = "${releaseB}";`);
  });

  it('returns non-cacheable, correctly typed service-worker content', () => {
    const response = buildServiceWorkerResponse('release-a', template);

    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(response.headers.get('x-threadmap-release')).toBe('release-a');
  });
});
