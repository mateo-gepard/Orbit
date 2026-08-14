// ═══════════════════════════════════════════════════════════
// Threadmap — PWA Utilities
// ═══════════════════════════════════════════════════════════

import { isStandalone, isIOS } from './mobile';

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

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  const handleControllerChange = () => {
    // A claimed worker does not replace JavaScript already running in an
    // installed PWA. Reload once so geometry and data fixes cannot remain
    // stranded behind an older app shell after deployment.
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.dispatchEvent(new CustomEvent('threadmap:app-updated'));
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      // The application remains usable online if registration is unavailable.
    }
  };

  if (document.readyState === 'complete') {
    void register();
  } else {
    window.addEventListener('load', register, { once: true });
  }

  return () => {
    window.removeEventListener('load', register);
    navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  };
}

/** Set up the viewport height CSS variable (handles iOS address bar) */
export function setupViewportHeight(): () => void {
  if (typeof window === 'undefined') return () => {};

  let orientationTimer: ReturnType<typeof setTimeout> | null = null;
  let animationFrame: number | null = null;
  const root = document.documentElement;
  root.classList.remove('keyboard-open');
  root.style.removeProperty('--safe-top');
  root.style.removeProperty('--safe-right');
  root.style.removeProperty('--safe-bottom');
  root.style.removeProperty('--safe-left');
  root.style.removeProperty('--keyboard-inset');
  root.style.removeProperty('--keyboard-safe-bottom');
  root.style.removeProperty('--visual-viewport-bottom');

  const setVH = () => {
    const viewport = window.visualViewport;
    const visualHeight = viewport?.height || window.innerHeight;
    const visualOffsetTop = Math.max(0, viewport?.offsetTop || 0);

    root.style.setProperty('--vh', `${visualHeight * 0.01}px`);
    root.style.setProperty('--real-vh', `${visualHeight}px`);
    // Match the pre-optimization PWA contract: the application shell follows
    // the actually visible viewport instead of staying behind the keyboard.
    root.style.setProperty('--app-height', `${visualHeight}px`);
    root.style.setProperty('--visual-viewport-height', `${visualHeight}px`);
    root.style.setProperty('--visual-viewport-offset-top', `${visualOffsetTop}px`);
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
