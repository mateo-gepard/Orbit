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

  const register = async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch {
      // The application remains usable online if registration is unavailable.
    }
  };

  if (document.readyState === 'complete') {
    void register();
  } else {
    window.addEventListener('load', register, { once: true });
  }

  return () => window.removeEventListener('load', register);
}

/** Set up the viewport height CSS variable (handles iOS address bar) */
export function setupViewportHeight(): () => void {
  if (typeof window === 'undefined') return () => {};

  let orientationTimer: ReturnType<typeof setTimeout> | null = null;

  const setVH = () => {
    // Use visualViewport if available (more accurate on mobile)
    const height = window.visualViewport?.height || window.innerHeight;
    const vh = height * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Also set --real-vh for calculations
    document.documentElement.style.setProperty('--real-vh', `${height}px`);
  };

  setVH();
  
  // Listen to both resize events
  window.addEventListener('resize', setVH);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVH);
    window.visualViewport.addEventListener('scroll', setVH);
  }
  
  // Also run on orientation change
  const handleOrientationChange = () => {
    if (orientationTimer) clearTimeout(orientationTimer);
    orientationTimer = setTimeout(setVH, 100);
  };
  window.addEventListener('orientationchange', handleOrientationChange);

  return () => {
    window.removeEventListener('resize', setVH);
    window.visualViewport?.removeEventListener('resize', setVH);
    window.visualViewport?.removeEventListener('scroll', setVH);
    window.removeEventListener('orientationchange', handleOrientationChange);
    if (orientationTimer) clearTimeout(orientationTimer);
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
