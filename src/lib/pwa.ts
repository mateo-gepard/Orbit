// ═══════════════════════════════════════════════════════════
// Threadmap — PWA Utilities
// ═══════════════════════════════════════════════════════════

import { isStandalone, isIOS } from './mobile';

const SERVICE_WORKER_RELOAD_KEY = 'threadmap-service-worker-reload';
const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60_000;
const acceptedServiceWorkerUpdates = new WeakMap<ServiceWorkerRegistration, string>();

export const SERVICE_WORKER_REVISION =
  process.env.NEXT_PUBLIC_THREADMAP_RELEASE?.trim()
  || process.env.NEXT_PUBLIC_THREADMAP_VERSION?.trim()
  || 'local';

export function getServiceWorkerUrl(): string {
  return '/sw.js';
}

export function activateWaitingServiceWorker(
  registration: ServiceWorkerRegistration,
  revision = SERVICE_WORKER_REVISION,
): boolean {
  if (!registration.waiting) return false;
  acceptedServiceWorkerUpdates.set(registration, revision);
  try {
    window.sessionStorage.setItem(SERVICE_WORKER_RELOAD_KEY, revision);
  } catch {
    // Storage can be disabled in hardened/private contexts. The registration-
    // scoped in-memory marker still preserves explicit-update consent.
  }
  try {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    acceptedServiceWorkerUpdates.delete(registration);
    try {
      if (window.sessionStorage.getItem(SERVICE_WORKER_RELOAD_KEY) === revision) {
        window.sessionStorage.removeItem(SERVICE_WORKER_RELOAD_KEY);
      }
    } catch {
      // No marker was persisted in this restricted-storage context.
    }
    return false;
  }
  return true;
}

export interface ServiceWorkerUpdateReadyDetail {
  revision: string;
  apply: () => boolean;
  /** Defer this exact waiting worker until a later update-check trigger. */
  defer: () => void;
}

/** Check if the app can show an install prompt */
export function canInstall(): boolean {
  if (isStandalone()) return false;
  // iOS Safari — can always add to home screen but no API
  if (isIOS()) return true;
  // Chrome/Edge — beforeinstallprompt event
  return !!getInstallPromptEvent();
}

// Store the deferred install prompt event
let deferredPromptEvent: Event | null = null;

export function setInstallPromptEvent(e: Event | null) {
  deferredPromptEvent = e;
}

export function getInstallPromptEvent() {
  return deferredPromptEvent;
}

/** Convert a navigation target into a same-origin app path. */
export function getInternalNavigationPath(value: unknown, origin: string): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) return null;

  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    if (target.origin !== base.origin || !['http:', 'https:'].includes(target.protocol)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/** Trigger the install prompt (Chrome/Edge) */
export async function triggerInstall(): Promise<boolean> {
  const event = deferredPromptEvent as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  if (!event?.prompt) return false;
  
  try {
    await event.prompt();
    const result = await event.userChoice;
    deferredPromptEvent = null;
    return result.outcome === 'accepted';
  } catch {
    return false;
  }
}

async function removeDevelopmentServiceWorkerState(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(async (registration) => {
    const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
    const ownsRegistration = workers.some((worker) => {
      try {
        const script = new URL(worker!.scriptURL);
        return script.origin === window.location.origin && script.pathname === '/sw.js';
      } catch {
        return false;
      }
    });
    if (ownsRegistration) await registration.unregister();
  }));

  if ('caches' in window) {
    const keys = await window.caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('threadmap-') || /^orbit-v\d+$/.test(key))
        .map((key) => window.caches.delete(key))
    );
  }
}

/** Register the production service worker for offline support. */
export function registerServiceWorker(): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return () => {};

  // A production worker left behind on localhost can cache development bundles
  // and interfere with HMR. Remove only this app's registration and caches.
  if (process.env.NODE_ENV !== 'production') {
    void removeDevelopmentServiceWorkerState().catch(() => {
      // Development remains usable if browser privacy settings block cleanup.
    });
    return () => {};
  }

  const listenerCleanups: Array<() => void> = [];
  const observedInstallingWorkers = new WeakSet<ServiceWorker>();
  const announcedWaitingWorkers = new WeakSet<ServiceWorker>();
  const deferredWaitingWorkers = new WeakMap<ServiceWorker, number>();
  let currentRegistration: ServiceWorkerRegistration | null = null;
  let disposed = false;
  let reloadingForUpdate = false;
  let updateCheckGeneration = 0;
  let registrationAttemptInFlight = false;
  const handleControllerChange = () => {
    if (reloadingForUpdate) return;
    // Reload only after the app explicitly accepted the update. A worker that
    // activates because every old tab was closed must never overwrite a draft
    // in a newly controlled page.
    let explicitlyAccepted = currentRegistration
      ? acceptedServiceWorkerUpdates.get(currentRegistration) === SERVICE_WORKER_REVISION
      : false;
    try {
      explicitlyAccepted ||= window.sessionStorage.getItem(SERVICE_WORKER_RELOAD_KEY)
        === SERVICE_WORKER_REVISION;
    } catch {
      // The in-memory registration marker remains authoritative for this tab.
    }
    if (!explicitlyAccepted) {
      return;
    }
    window.dispatchEvent(new CustomEvent('threadmap:app-updated'));
    reloadingForUpdate = true;
    if (currentRegistration) acceptedServiceWorkerUpdates.delete(currentRegistration);
    try {
      window.sessionStorage.removeItem(SERVICE_WORKER_RELOAD_KEY);
    } catch {
      // Reload is still safe because this tab recorded explicit consent in memory.
    }
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

  const announceWaitingWorker = (
    registration: ServiceWorkerRegistration,
    observedCheckGeneration = updateCheckGeneration,
  ) => {
    const waiting = registration.waiting;
    if (disposed || !waiting || announcedWaitingWorkers.has(waiting)) return;
    const deferredAtGeneration = deferredWaitingWorkers.get(waiting);
    if (deferredAtGeneration !== undefined) {
      // A dismissal must not bounce straight back from the update() promise
      // that was already in flight. Re-arm only after a later visibility,
      // online, or interval-triggered check.
      if (observedCheckGeneration <= deferredAtGeneration) return;
      deferredWaitingWorkers.delete(waiting);
    }
    announcedWaitingWorkers.add(waiting);
    window.dispatchEvent(new CustomEvent<ServiceWorkerUpdateReadyDetail>('threadmap:update-ready', {
      detail: {
        revision: SERVICE_WORKER_REVISION,
        apply: () => activateWaitingServiceWorker(registration),
        defer: () => {
          if (registration.waiting !== waiting) return;
          announcedWaitingWorkers.delete(waiting);
          deferredWaitingWorkers.set(waiting, updateCheckGeneration);
        },
      },
    }));
  };

  const register = async () => {
    if (disposed || currentRegistration || registrationAttemptInFlight) return;
    registrationAttemptInFlight = true;
    try {
      const registration = await navigator.serviceWorker.register(
        getServiceWorkerUrl(),
        {
          scope: '/',
          updateViaCache: 'none',
        },
      );
      if (disposed) return;
      currentRegistration = registration;
      announceWaitingWorker(registration);
      const observeInstallingWorker = (installing: ServiceWorker | null) => {
        if (!installing || observedInstallingWorkers.has(installing)) return;
        observedInstallingWorkers.add(installing);
        const handleStateChange = () => {
          if (!disposed && installing.state === 'installed' && navigator.serviceWorker.controller) {
            announceWaitingWorker(registration);
          }
        };
        installing.addEventListener('statechange', handleStateChange);
        listenerCleanups.push(() => installing.removeEventListener('statechange', handleStateChange));
        handleStateChange();
      };
      const handleUpdateFound = () => {
        observeInstallingWorker(registration.installing);
      };
      registration.addEventListener('updatefound', handleUpdateFound);
      listenerCleanups.push(() => registration.removeEventListener('updatefound', handleUpdateFound));
      observeInstallingWorker(registration.installing);

      // A stable script URL lets the browser compare release A with release B.
      // Check on foreground/network recovery and periodically so a long-lived
      // SPA can discover B without waiting for a navigation or manual reload.
      const checkForUpdate = () => {
        const checkGeneration = ++updateCheckGeneration;
        void registration.update()
          .then(() => {
            if (disposed) return;
            observeInstallingWorker(registration.installing);
            announceWaitingWorker(registration, checkGeneration);
          })
          .catch(() => {
            // Offline and transient update failures are retried at the next trigger.
          });
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      };
      const updateTimer = window.setInterval(checkForUpdate, SERVICE_WORKER_UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', checkForUpdate);
      listenerCleanups.push(() => window.clearInterval(updateTimer));
      listenerCleanups.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange));
      listenerCleanups.push(() => window.removeEventListener('online', checkForUpdate));
      checkForUpdate();
    } catch {
      // The application remains usable if registration is temporarily
      // unavailable. A later online transition retries this single-flight.
    } finally {
      registrationAttemptInFlight = false;
    }
  };

  const retryRegistrationWhenOnline = () => {
    if (!currentRegistration) void register();
  };
  window.addEventListener('online', retryRegistrationWhenOnline);
  listenerCleanups.push(() => window.removeEventListener('online', retryRegistrationWhenOnline));

  if (document.readyState === 'complete') {
    void register();
  } else {
    window.addEventListener('load', register, { once: true });
  }

  return () => {
    disposed = true;
    window.removeEventListener('load', register);
    navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    for (const cleanup of listenerCleanups.splice(0)) cleanup();
  };
}

/** Set up the viewport height CSS variable (handles iOS address bar) */
export function setupViewportHeight(): () => void {
  if (typeof window === 'undefined') return () => {};

  let orientationTimer: ReturnType<typeof setTimeout> | null = null;
  let animationFrame: number | null = null;
  let stableAppHeight = 0;
  const root = document.documentElement;
  root.classList.remove('keyboard-open');
  root.style.removeProperty('--safe-top');
  root.style.removeProperty('--safe-right');
  root.style.removeProperty('--safe-bottom');
  root.style.removeProperty('--safe-left');
  root.style.removeProperty('--keyboard-inset');
  root.style.removeProperty('--keyboard-safe-bottom');
  root.style.removeProperty('--visual-viewport-bottom');

  const hasEditableFocus = () => {
    const active = document.activeElement;
    return active instanceof HTMLElement && (
      active.matches('input, textarea, select, [contenteditable="true"]')
      || Boolean(active.closest('[contenteditable="true"]'))
    );
  };

  const setVH = () => {
    const viewport = window.visualViewport;
    const visualHeight = viewport?.height || window.innerHeight;
    const visualOffsetTop = Math.max(0, viewport?.offsetTop || 0);
    const visualBottom = visualOffsetTop + visualHeight;
    const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);

    if (stableAppHeight <= 0) stableAppHeight = Math.max(layoutHeight, visualBottom);
    const occludedHeight = Math.max(0, stableAppHeight - visualBottom);
    const keyboardOpen = hasEditableFocus() && occludedHeight > 100;

    // Browser chrome may legitimately resize the viewport. Adopt that size
    // only while no keyboard is present; otherwise preserve the shell's stable
    // geometry and expose the smaller visual viewport separately to overlays.
    if (!keyboardOpen) stableAppHeight = Math.max(layoutHeight, visualBottom);

    root.style.setProperty('--vh', `${visualHeight * 0.01}px`);
    root.style.setProperty('--real-vh', `${visualHeight}px`);
    root.style.setProperty('--app-height', `${stableAppHeight}px`);
    root.style.setProperty('--visual-viewport-height', `${visualHeight}px`);
    root.style.setProperty('--visual-viewport-offset-top', `${visualOffsetTop}px`);
    root.style.setProperty('--visual-viewport-bottom', `${Math.max(0, stableAppHeight - visualBottom)}px`);
    root.style.setProperty('--keyboard-inset', `${keyboardOpen ? occludedHeight : 0}px`);
    root.style.setProperty('--keyboard-safe-bottom', keyboardOpen ? '0px' : 'var(--safe-bottom)');
    root.classList.toggle('keyboard-open', keyboardOpen);
  };

  const scheduleVH = () => {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      setVH();
    });
  };

  setVH();
  
  // Listen to both resize events
  window.addEventListener('resize', scheduleVH);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleVH);
    window.visualViewport.addEventListener('scroll', scheduleVH);
  }
  
  // Also run on orientation change
  const handleOrientationChange = () => {
    if (orientationTimer) clearTimeout(orientationTimer);
    orientationTimer = setTimeout(scheduleVH, 100);
  };
  window.addEventListener('orientationchange', handleOrientationChange);

  const handleFocusChange = () => scheduleVH();
  document.addEventListener('focusin', handleFocusChange);
  document.addEventListener('focusout', handleFocusChange);

  const refreshGeometry = () => {
    scheduleVH();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') refreshGeometry();
  };
  window.addEventListener('pageshow', refreshGeometry);
  window.addEventListener('focus', refreshGeometry);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('resize', scheduleVH);
    window.visualViewport?.removeEventListener('resize', scheduleVH);
    window.visualViewport?.removeEventListener('scroll', scheduleVH);
    window.removeEventListener('orientationchange', handleOrientationChange);
    document.removeEventListener('focusin', handleFocusChange);
    document.removeEventListener('focusout', handleFocusChange);
    window.removeEventListener('pageshow', refreshGeometry);
    window.removeEventListener('focus', refreshGeometry);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (orientationTimer) clearTimeout(orientationTimer);
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    root.classList.remove('keyboard-open');
  };
}

/** Disable rubber-band bouncing in standalone mode */
export function disableOverscroll(): () => void {
  if (typeof document === 'undefined' || !isStandalone()) return () => {};

  const bodyValue = document.body.style.overscrollBehavior;
  const rootValue = document.documentElement.style.overscrollBehavior;

  // CSS handles most of this via overscroll-behavior: none on html,body
  // This catches edge cases in standalone PWA mode
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';

  return () => {
    document.body.style.overscrollBehavior = bodyValue;
    document.documentElement.style.overscrollBehavior = rootValue;
  };
}
