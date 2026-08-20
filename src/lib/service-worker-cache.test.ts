import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { renderServiceWorkerSource } from './service-worker-source';

type ServiceWorkerHelpers = {
  releaseRevision: string;
  navigationCacheKey: (value: string | { url: string }) => string;
  extractAppShellAssets: (html: string) => string[];
  precacheAppShell: () => Promise<void>;
  isCacheableResponse: (response: {
    ok: boolean;
    type: string;
    headers: Headers;
  }) => boolean;
  notificationCopy: (type: string, language?: string) => {
    title: string;
    body: string;
    fallbackBody: string;
  };
};

function loadServiceWorker(language = 'en-US', shellResponse?: {
  ok: boolean;
  type: string;
  headers: Headers;
  clone: () => unknown;
  text: () => Promise<string>;
}, revision = 'release-abc123') {
  const listeners = new Map<string, (event: unknown) => void>();
  const briefingState = new Map<string, unknown>();
  const cachePut = vi.fn().mockResolvedValue(undefined);
  const indexedDb = {
    open: vi.fn(() => {
      const database = {
        objectStoreNames: { contains: () => true },
        createObjectStore: vi.fn(),
        transaction: () => {
          let pendingRequests = 0;
          let completionQueued = false;
          let completed = false;
          let aborted = false;
          const transaction: Record<string, unknown> = {};
          const maybeComplete = () => {
            if (aborted || completed || pendingRequests > 0 || completionQueued) return;
            completionQueued = true;
            queueMicrotask(() => {
              completionQueued = false;
              if (aborted || completed || pendingRequests > 0) return;
              completed = true;
              (transaction.oncomplete as (() => void) | undefined)?.();
            });
          };
          const request = (operation: (request: Record<string, unknown>) => void) => {
            pendingRequests += 1;
            const result: Record<string, unknown> = {};
            queueMicrotask(() => {
              if (aborted) return;
              operation(result);
              (result.onsuccess as (() => void) | undefined)?.();
              pendingRequests -= 1;
              maybeComplete();
            });
            return result;
          };
          const store = {
            get: (key: string) => request((result) => {
              result.result = briefingState.get(key);
            }),
            put: (value: unknown, key: string) => request(() => {
              briefingState.set(key, value);
            }),
            delete: (key: string) => request(() => {
              briefingState.delete(key);
            }),
          };
          transaction.objectStore = () => store;
          transaction.abort = () => {
            if (aborted || completed) return;
            aborted = true;
            queueMicrotask(() => (transaction.onabort as (() => void) | undefined)?.());
          };
          queueMicrotask(maybeComplete);
          return transaction;
        },
      };
      const request: Record<string, unknown> = { result: database };
      queueMicrotask(() => (request.onsuccess as (() => void) | undefined)?.());
      return request;
    }),
  };
  const sandbox: Record<string, unknown> = {
    URL,
    Request,
    Response,
    Headers,
    Promise,
    Set,
    Error,
    indexedDB: indexedDb,
    queueMicrotask,
    caches: {
      open: vi.fn().mockResolvedValue({
        add: vi.fn().mockResolvedValue(undefined),
        addAll: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(true),
        keys: vi.fn().mockResolvedValue([]),
        put: cachePut,
      }),
    },
    fetch: vi.fn().mockResolvedValue(shellResponse),
    self: {
      location: {
        origin: 'https://threadmap.example',
        href: 'https://threadmap.example/sw.js',
      },
      navigator: { language },
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      clients: {},
      registration: {},
    },
  };
  const sourcePath = fileURLToPath(new URL('../service-worker/worker.js.template', import.meta.url));
  const source = renderServiceWorkerSource(readFileSync(sourcePath, 'utf8'), revision);
  vm.runInNewContext(
    `${source}\n;globalThis.__helpers = { releaseRevision: RELEASE_REVISION, navigationCacheKey, extractAppShellAssets, isCacheableResponse, notificationCopy, precacheAppShell };`,
    sandbox,
    { filename: sourcePath },
  );

  return {
    helpers: sandbox.__helpers as ServiceWorkerHelpers,
    listeners,
    cachePut,
    briefingState,
  };
}

async function dispatchMessage(
  listener: ((event: unknown) => void) | undefined,
  data: Record<string, unknown>,
  postMessage = vi.fn(),
) {
  let completion: Promise<unknown> | undefined;
  listener?.({
    data,
    ports: [{ postMessage }],
    waitUntil: (promise: Promise<unknown>) => { completion = promise; },
  });
  await completion;
  return postMessage;
}

describe('service worker app-shell helpers', () => {
  it('derives cache identity from the deployment embedded in the worker bytes', () => {
    const { helpers } = loadServiceWorker();

    expect(helpers.releaseRevision).toBe('release-abc123');
  });

  it('normalizes navigation cache keys without persisting private query values', () => {
    const { helpers } = loadServiceWorker();

    expect(helpers.navigationCacheKey('https://threadmap.example/tasks?token=secret#today'))
      .toBe('https://threadmap.example/tasks');
    expect(helpers.navigationCacheKey({ url: 'https://threadmap.example/' }))
      .toBe('https://threadmap.example/');
  });

  it('extracts only same-origin static shell assets', () => {
    const { helpers } = loadServiceWorker();
    const assets = Array.from(helpers.extractAppShellAssets(`
      <script src="/_next/static/chunks/app.js?build=123"></script>
      <link href="https://threadmap.example/_next/static/css/app.css" rel="stylesheet">
      <img src="/icons/icon-192.png">
      <script src="/api/private"></script>
      <script src="https://attacker.example/_next/static/steal.js"></script>
    `));

    expect(assets).toEqual([
      '/_next/static/chunks/app.js?build=123',
      '/_next/static/css/app.css',
      '/icons/icon-192.png',
    ]);
  });

  it('localizes background fallback copy from the preferred or device language', () => {
    const german = loadServiceWorker('de-DE').helpers.notificationCopy('morning');
    const english = loadServiceWorker('de-DE').helpers.notificationCopy('evening', 'en');

    expect(german).toMatchObject({
      title: 'Guten Morgen.',
      fallbackBody: 'Du hast eine neue Benachrichtigung.',
    });
    expect(english).toMatchObject({
      title: 'Evening check-in.',
      fallbackBody: 'You have a notification.',
    });
  });

  it('does not intercept private API requests', () => {
    const { listeners } = loadServiceWorker();
    const respondWith = vi.fn();
    const fetchListener = listeners.get('fetch');

    expect(fetchListener).toBeTypeOf('function');
    fetchListener?.({
      request: {
        method: 'GET',
        headers: new Headers(),
        url: 'https://threadmap.example/api/private?token=secret',
        mode: 'navigate',
      },
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  it('never writes private, no-store, or cookie-setting responses to Cache Storage', () => {
    const { isCacheableResponse } = loadServiceWorker().helpers;
    const response = (headers: HeadersInit = {}) => ({
      ok: true,
      type: 'basic',
      headers: new Headers(headers),
    });

    expect(isCacheableResponse(response({ 'cache-control': 'private, max-age=60' }))).toBe(false);
    expect(isCacheableResponse(response({ 'cache-control': 'public, no-store' }))).toBe(false);
    expect(isCacheableResponse(response({ 'set-cookie': 'session=private' }))).toBe(false);
    expect(isCacheableResponse(response({ 'cache-control': 'public, max-age=31536000' }))).toBe(true);
  });

  it('does not cache or inspect a private app-shell response during install', async () => {
    const shellResponse = {
      ok: true,
      type: 'basic',
      headers: new Headers({ 'cache-control': 'private, no-store' }),
      clone: vi.fn(),
      text: vi.fn().mockResolvedValue('<script src="/_next/static/private.js"></script>'),
    };
    const { helpers, cachePut } = loadServiceWorker('en-US', shellResponse);

    await helpers.precacheAppShell();

    expect(cachePut).not.toHaveBeenCalled();
    expect(shellResponse.clone).not.toHaveBeenCalled();
    expect(shellResponse.text).not.toHaveBeenCalled();
  });

  it('acknowledges briefing cleanup only after the persisted owner schedule is removed', async () => {
    const { listeners, briefingState } = loadServiceWorker();
    briefingState.set('generation', 100);
    briefingState.set('config', { ownerId: 'user-a', generation: 100, morningEnabled: true });
    briefingState.set('last-fired:user-a', { morning: '2026-08-20' });
    const postMessage = vi.fn();
    postMessage.mockImplementation(() => {
      expect(briefingState.has('config')).toBe(false);
      expect(briefingState.has('last-fired:user-a')).toBe(false);
      expect(briefingState.get('generation')).toBe(101);
    });

    await dispatchMessage(
      listeners.get('message'),
      {
        type: 'CLEAR_BRIEFING_SCHEDULE',
        generation: 101,
        ownerId: 'user-a',
        acknowledge: true,
      },
      postMessage,
    );

    expect(briefingState.has('config')).toBe(false);
    expect(briefingState.has('last-fired:user-a')).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'BRIEFING_SCHEDULE_CLEARED',
      generation: 101,
      ownerId: 'user-a',
      success: true,
    });
  });

  it('does not let a delayed pre-clear update resurrect a signed-out owner schedule', async () => {
    const { listeners, briefingState } = loadServiceWorker();
    const messageListener = listeners.get('message');

    await dispatchMessage(messageListener, {
      type: 'UPDATE_BRIEFING_SCHEDULE',
      generation: 200,
      config: { ownerId: 'user-a', morningEnabled: true },
    });
    briefingState.set('last-fired:user-a', { morning: '2026-08-20' });
    await dispatchMessage(messageListener, {
      type: 'CLEAR_BRIEFING_SCHEDULE',
      generation: 201,
      ownerId: 'user-a',
      acknowledge: true,
    });
    await dispatchMessage(messageListener, {
      type: 'UPDATE_BRIEFING_SCHEDULE',
      generation: 201,
      config: { ownerId: 'user-a', morningEnabled: true },
    });

    expect(briefingState.get('generation')).toBe(201);
    expect(briefingState.has('config')).toBe(false);
    expect(briefingState.has('last-fired:user-a')).toBe(false);
  });

  it('rejects a stale clear while its owner data still exists', async () => {
    const { listeners, briefingState } = loadServiceWorker();
    briefingState.set('generation', 300);
    briefingState.set('config', { ownerId: 'user-a', generation: 300, morningEnabled: true });
    briefingState.set('last-fired:user-a', { morning: '2026-08-20' });

    const postMessage = await dispatchMessage(listeners.get('message'), {
      type: 'CLEAR_BRIEFING_SCHEDULE',
      generation: 299,
      ownerId: 'user-a',
      acknowledge: true,
    });

    expect(briefingState.get('generation')).toBe(300);
    expect(briefingState.get('config')).toMatchObject({ ownerId: 'user-a' });
    expect(briefingState.has('last-fired:user-a')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'BRIEFING_SCHEDULE_CLEARED',
      generation: 299,
      ownerId: 'user-a',
      success: false,
    });
  });

  it('idempotently acknowledges a stale clear when that owner data is already absent', async () => {
    const { listeners, briefingState } = loadServiceWorker();
    briefingState.set('generation', 400);
    briefingState.set('config', { ownerId: 'user-b', generation: 400, morningEnabled: true });

    const postMessage = await dispatchMessage(listeners.get('message'), {
      type: 'CLEAR_BRIEFING_SCHEDULE',
      generation: 399,
      ownerId: 'user-a',
      acknowledge: true,
    });

    expect(briefingState.get('generation')).toBe(400);
    expect(briefingState.get('config')).toMatchObject({ ownerId: 'user-b' });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'BRIEFING_SCHEDULE_CLEARED',
      generation: 399,
      ownerId: 'user-a',
      success: true,
    });
  });
});
