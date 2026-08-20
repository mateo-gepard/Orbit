import { describe, expect, it } from 'vitest';
import {
  BoundedJsonError,
  hasOnlyObjectKeys,
  readBoundedJsonObject,
} from './bounded-json';

describe('bounded JSON requests', () => {
  it('reads a small object', async () => {
    const request = new Request('https://threadmap.app/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    await expect(readBoundedJsonObject(request)).resolves.toEqual({
      url: 'https://example.com',
    });
  });

  it('rejects an oversized streamed body even without Content-Length', async () => {
    const request = new Request('https://threadmap.app/api/scrape', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"url":"123456789"}'));
          controller.close();
        },
      }),
      // Required by Node's Request implementation for a streamed body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    await expect(readBoundedJsonObject(request, 8)).rejects.toMatchObject({
      name: 'BoundedJsonError',
      status: 413,
    } satisfies Partial<BoundedJsonError>);
  });

  it('rejects invalid JSON and arrays', async () => {
    await expect(readBoundedJsonObject(new Request('https://threadmap.app', {
      method: 'POST', body: '{',
    }))).rejects.toMatchObject({ status: 400 });
    await expect(readBoundedJsonObject(new Request('https://threadmap.app', {
      method: 'POST', body: '[]',
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('enforces an exact input schema', () => {
    expect(hasOnlyObjectKeys({ query: 'camera' }, ['query'])).toBe(true);
    expect(hasOnlyObjectKeys({ query: 'camera', admin: true }, ['query'])).toBe(false);
  });
});
