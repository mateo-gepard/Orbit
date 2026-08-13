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
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      void registration.update();
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

  const root = document.documentElement;
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  let orientationTimer: ReturnType<typeof setTimeout> | null = null;
  let animationFrame: number | null = null;

  const setVH = () => {
    animationFrame = null;
    const visualViewport = window.visualViewport;
    const height = Math.round(visualViewport?.height || window.innerHeight);
    const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
    const rawKeyboardInset = Math.max(0, Math.round(window.innerHeight - height - offsetTop));
    const activeElement = document.activeElement;
    const editing = activeElement instanceof HTMLElement && activeElement.matches(
      'input, textarea, select, [contenteditable="true"]',
    );
    const keyboardOpen = editing && rawKeyboardInset > 80;
    const vh = height * 0.01;

    root.style.setProperty('--vh', `${vh}px`);
    root.style.setProperty('--real-vh', `${height}px`);
    root.style.setProperty('--app-height', `${height}px`);
    root.style.setProperty('--visual-viewport-height', `${height}px`);
    root.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`);
    root.style.setProperty('--keyboard-inset', keyboardOpen ? `${rawKeyboardInset}px` : '0px');
    root.dataset.keyboard = keyboardOpen ? 'open' : 'closed';
  };

  const scheduleViewportUpdate = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(setVH);
  };

  const setDisplayMode = () => {
    const standalone = isStandalone();
    root.classList.toggle('standalone', standalone);
    root.dataset.displayMode = standalone ? 'standalone' : 'browser';
  };

  setVH();
  setDisplayMode();

  window.addEventListener('resize', scheduleViewportUpdate);
  window.addEventListener('focusin', scheduleViewportUpdate);
  window.addEventListener('focusout', scheduleViewportUpdate);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleViewportUpdate);
    window.visualViewport.addEventListener('scroll', scheduleViewportUpdate);
  }
  standaloneQuery.addEventListener('change', setDisplayMode);

  const handleOrientationChange = () => {
    if (orientationTimer) clearTimeout(orientationTimer);
    orientationTimer = setTimeout(scheduleViewportUpdate, 150);
  };
  window.addEventListener('orientationchange', handleOrientationChange);

  return () => {
    window.removeEventListener('resize', scheduleViewportUpdate);
    window.removeEventListener('focusin', scheduleViewportUpdate);
    window.removeEventListener('focusout', scheduleViewportUpdate);
    window.visualViewport?.removeEventListener('resize', scheduleViewportUpdate);
    window.visualViewport?.removeEventListener('scroll', scheduleViewportUpdate);
    window.removeEventListener('orientationchange', handleOrientationChange);
    standaloneQuery.removeEventListener('change', setDisplayMode);
    if (orientationTimer) clearTimeout(orientationTimer);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    root.classList.remove('standalone');
    delete root.dataset.displayMode;
    delete root.dataset.keyboard;
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
