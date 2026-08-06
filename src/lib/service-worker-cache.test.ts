import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type ServiceWorkerHelpers = {
  navigationCacheKey: (value: string | { url: string }) => string;
  extractAppShellAssets: (html: string) => string[];
  notificationCopy: (type: string, language?: string) => {
    title: string;
    body: string;
    fallbackBody: string;
  };
};

function loadServiceWorker(language = 'en-US') {
  const listeners = new Map<string, (event: unknown) => void>();
  const sandbox: Record<string, unknown> = {
    URL,
    Request,
    Response,
    Headers,
    Promise,
    Set,
    Error,
    self: {
      location: { origin: 'https://threadmap.example' },
      navigator: { language },
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      clients: {},
      registration: {},
    },
  };
  const sourcePath = fileURLToPath(new URL('../../public/sw.js', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');
  vm.runInNewContext(
    `${source}\n;globalThis.__helpers = { navigationCacheKey, extractAppShellAssets, notificationCopy };`,
    sandbox,
    { filename: sourcePath },
  );

  return {
    helpers: sandbox.__helpers as ServiceWorkerHelpers,
    listeners,
  };
}

describe('service worker app-shell helpers', () => {
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
});
