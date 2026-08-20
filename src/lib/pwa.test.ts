import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateWaitingServiceWorker,
  getInternalNavigationPath,
  getServiceWorkerUrl,
  registerServiceWorker,
} from './pwa';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getInternalNavigationPath', () => {
  const origin = 'https://threadmap.example';

  it('normalizes relative and same-origin targets to internal paths', () => {
    expect(getInternalNavigationPath('/briefing?type=morning#today', origin))
      .toBe('/briefing?type=morning#today');
    expect(getInternalNavigationPath('https://threadmap.example/tools/flight', origin))
      .toBe('/tools/flight');
  });

  it('rejects external, non-HTTP, malformed, and non-string targets', () => {
    expect(getInternalNavigationPath('https://attacker.example/phish', origin)).toBeNull();
    expect(getInternalNavigationPath('//attacker.example/phish', origin)).toBeNull();
    expect(getInternalNavigationPath('javascript:alert(1)', origin)).toBeNull();
    expect(getInternalNavigationPath('https://[', origin)).toBeNull();
    expect(getInternalNavigationPath({ url: '/briefing' }, origin)).toBeNull();
  });
});

describe('getServiceWorkerUrl', () => {
  it('uses one stable URL so native update checks can compare release bytes', () => {
    expect(getServiceWorkerUrl()).toBe('/sw.js');
  });
});

describe('activateWaitingServiceWorker', () => {
  it('marks the accepted revision before asking the waiting worker to activate', () => {
    const setItem = vi.fn();
    const postMessage = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { setItem } });
    const registration = {
      waiting: { postMessage },
    } as unknown as ServiceWorkerRegistration;

    expect(activateWaitingServiceWorker(registration, 'release-sha')).toBe(true);
    expect(setItem).toHaveBeenCalledWith('threadmap-service-worker-reload', 'release-sha');
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(setItem.mock.invocationCallOrder[0]).toBeLessThan(postMessage.mock.invocationCallOrder[0]);
  });

  it('does nothing when the update is no longer waiting', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { setItem } });
    const registration = { waiting: null } as unknown as ServiceWorkerRegistration;

    expect(activateWaitingServiceWorker(registration)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('registerServiceWorker', () => {
  it('announces an installed update once and removes registration listeners on cleanup', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const worker = Object.assign(new EventTarget(), {
      state: 'installing',
      postMessage: vi.fn(),
    });
    const registration = Object.assign(new EventTarget(), {
      active: null,
      installing: worker,
      waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(17),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
    const onUpdateReady = vi.fn();
    browserWindow.addEventListener('threadmap:update-ready', onUpdateReady);
    vi.stubGlobal('window', browserWindow);
    const documentTarget = Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    });
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    browserWindow.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(3));

    registration.dispatchEvent(new Event('updatefound'));
    const waiting = { postMessage: vi.fn() };
    registration.waiting = waiting;
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(onUpdateReady).toHaveBeenCalledOnce();
    expect(onUpdateReady.mock.calls[0][0]).toMatchObject({
      detail: {
        revision: expect.any(String),
        apply: expect.any(Function),
        defer: expect.any(Function),
      },
    });
    const updateEvent = onUpdateReady.mock.calls[0][0] as CustomEvent<{
      apply: () => boolean;
    }>;
    expect(updateEvent.detail.apply()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    cleanup();
    expect(browserWindow.clearInterval).toHaveBeenCalledWith(17);
    worker.dispatchEvent(new Event('statechange'));
    registration.dispatchEvent(new Event('updatefound'));
    expect(onUpdateReady).toHaveBeenCalledOnce();
  });

  it('activates and reloads after explicit consent when session storage is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const waiting = { postMessage: vi.fn() };
    const registration = Object.assign(new EventTarget(), {
      active: {},
      installing: null,
      waiting,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    const storageError = new DOMException('Storage unavailable', 'SecurityError');
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(23),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn(() => { throw storageError; }),
        removeItem: vi.fn(() => { throw storageError; }),
        setItem: vi.fn(() => { throw storageError; }),
      },
    });
    const onUpdateReady = vi.fn();
    browserWindow.addEventListener('threadmap:update-ready', onUpdateReady);
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    }));
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(onUpdateReady).toHaveBeenCalledOnce());
    const updateEvent = onUpdateReady.mock.calls[0][0] as CustomEvent<{
      apply: () => boolean;
    }>;

    expect(updateEvent.detail.apply()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(browserWindow.location.reload).toHaveBeenCalledOnce();

    cleanup();
  });

  it('reloads an explicitly accepted later update in a tab that began without a controller', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const worker = Object.assign(new EventTarget(), {
      state: 'installing',
      postMessage: vi.fn(),
    });
    const registration = Object.assign(new EventTarget(), {
      active: null,
      installing: worker,
      waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: null as object | null,
      register: vi.fn().mockResolvedValue(registration),
    });
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(29),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
    const onUpdateReady = vi.fn();
    browserWindow.addEventListener('threadmap:update-ready', onUpdateReady);
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    }));
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());

    // The first worker's claim is not an update acceptance and must not reload.
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(browserWindow.location.reload).not.toHaveBeenCalled();

    serviceWorker.controller = {};
    registration.dispatchEvent(new Event('updatefound'));
    const waiting = { postMessage: vi.fn() };
    registration.waiting = waiting;
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    await vi.waitFor(() => expect(onUpdateReady).toHaveBeenCalledOnce());

    const updateEvent = onUpdateReady.mock.calls[0][0] as CustomEvent<{ apply: () => boolean }>;
    expect(updateEvent.detail.apply()).toBe(true);
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(browserWindow.location.reload).toHaveBeenCalledOnce();

    cleanup();
  });

  it('keeps update retry triggers when the initial offline check rejects', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const registration = Object.assign(new EventTarget(), {
      active: {},
      installing: null,
      waiting: null,
      update: vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(31),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    }));
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    browserWindow.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));

    cleanup();
  });

  it('retries a failed initial registration on a later online transition', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const registration = Object.assign(new EventTarget(), {
      active: {},
      installing: null,
      waiting: null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(registration),
    });
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(43),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    }));
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledOnce());
    await Promise.resolve();
    await Promise.resolve();
    browserWindow.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());

    cleanup();
    browserWindow.dispatchEvent(new Event('online'));
    expect(serviceWorker.register).toHaveBeenCalledTimes(2);
  });

  it('observes a worker that was already installing before listeners attached', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const installing = Object.assign(new EventTarget(), {
      state: 'installing',
      postMessage: vi.fn(),
    });
    const registration = Object.assign(new EventTarget(), {
      active: {},
      installing,
      waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(37),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
    const onUpdateReady = vi.fn();
    browserWindow.addEventListener('threadmap:update-ready', onUpdateReady);
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    }));
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    registration.waiting = installing;
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
    await vi.waitFor(() => expect(onUpdateReady).toHaveBeenCalledOnce());

    cleanup();
  });

  it('re-prompts a deferred waiting update only after a later update trigger', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const waiting = { postMessage: vi.fn() };
    const registration = Object.assign(new EventTarget(), {
      active: {},
      installing: null,
      waiting,
      update: vi.fn().mockResolvedValue(undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    const browserWindow = Object.assign(new EventTarget(), {
      location: { origin: 'https://threadmap.example', reload: vi.fn() },
      setInterval: vi.fn().mockReturnValue(41),
      clearInterval: vi.fn(),
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
    const onUpdateReady = vi.fn();
    browserWindow.addEventListener('threadmap:update-ready', onUpdateReady);
    vi.stubGlobal('window', browserWindow);
    const documentTarget = Object.assign(new EventTarget(), {
      readyState: 'complete',
      visibilityState: 'visible',
    });
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('navigator', { serviceWorker });

    const cleanup = registerServiceWorker();
    await vi.waitFor(() => expect(onUpdateReady).toHaveBeenCalledOnce());
    const firstPrompt = onUpdateReady.mock.calls[0][0] as CustomEvent<{
      defer: () => void;
    }>;
    firstPrompt.detail.defer();

    // The initial update() was already scheduled when the prompt appeared;
    // resolving it must not immediately undo the user's Later choice.
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(onUpdateReady).toHaveBeenCalledOnce();

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onUpdateReady).toHaveBeenCalledTimes(2));

    cleanup();
  });
});
