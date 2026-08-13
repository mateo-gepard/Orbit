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
  let animationFrame: number | null = null;

  const measureSafeArea = () => {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed',
      'inset:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top, 0px)',
      'padding-right:env(safe-area-inset-right, 0px)',
      'padding-bottom:env(safe-area-inset-bottom, 0px)',
      'padding-left:env(safe-area-inset-left, 0px)',
    ].join(';');
    document.body.appendChild(probe);
    const styles = window.getComputedStyle(probe);
    const measured = {
      top: Number.parseFloat(styles.paddingTop) || 0,
      right: Number.parseFloat(styles.paddingRight) || 0,
      bottom: Number.parseFloat(styles.paddingBottom) || 0,
      left: Number.parseFloat(styles.paddingLeft) || 0,
    };
    probe.remove();

    if (!isIOS() || !isStandalone()) return measured;

    // Some installed iOS PWAs report every env(safe-area-inset-*) value as 0
    // despite drawing edge-to-edge. Use conservative device-class fallbacks in
    // that case; real non-zero values always win.
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    const shortEdge = Math.min(window.screen.width, window.screen.height);
    const longEdge = Math.max(window.screen.width, window.screen.height);
    const tablet = shortEdge >= 768;
    const phoneNotch = longEdge >= 852 ? 59 : 47;
    const fallback = portrait
      ? { top: tablet ? 24 : phoneNotch, right: 0, bottom: tablet ? 20 : 34, left: 0 }
      : { top: 0, right: tablet ? 20 : phoneNotch, bottom: tablet ? 20 : 21, left: tablet ? 20 : phoneNotch };

    return {
      top: Math.max(measured.top, fallback.top),
      right: Math.max(measured.right, fallback.right),
      bottom: Math.max(measured.bottom, fallback.bottom),
      left: Math.max(measured.left, fallback.left),
    };
  };

  let safeArea = measureSafeArea();

  const setVH = () => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const layoutHeight = window.innerHeight;
    const visualHeight = viewport?.height || layoutHeight;
    const visualOffsetTop = Math.max(0, viewport?.offsetTop || 0);
    const visualBottom = Math.max(0, layoutHeight - visualHeight - visualOffsetTop);
    const keyboardOpen = visualBottom > 80;

    root.style.setProperty('--vh', `${visualHeight * 0.01}px`);
    root.style.setProperty('--real-vh', `${visualHeight}px`);
    root.style.setProperty('--app-height', `${layoutHeight}px`);
    root.style.setProperty('--visual-viewport-height', `${visualHeight}px`);
    root.style.setProperty('--visual-viewport-offset-top', `${visualOffsetTop}px`);
    root.style.setProperty('--visual-viewport-bottom', `${visualBottom}px`);
    root.style.setProperty('--keyboard-inset', `${visualBottom}px`);
    root.style.setProperty('--keyboard-safe-bottom', `${keyboardOpen ? 0 : safeArea.bottom}px`);
    root.style.setProperty('--safe-top', `${safeArea.top}px`);
    root.style.setProperty('--safe-right', `${safeArea.right}px`);
    root.style.setProperty('--safe-bottom', `${safeArea.bottom}px`);
    root.style.setProperty('--safe-left', `${safeArea.left}px`);
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
    orientationTimer = setTimeout(() => {
      safeArea = measureSafeArea();
      scheduleVH();
    }, 100);
  };
  window.addEventListener('orientationchange', handleOrientationChange);

  return () => {
    window.removeEventListener('resize', scheduleVH);
    window.visualViewport?.removeEventListener('resize', scheduleVH);
    window.visualViewport?.removeEventListener('scroll', scheduleVH);
    window.removeEventListener('orientationchange', handleOrientationChange);
    if (orientationTimer) clearTimeout(orientationTimer);
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    document.documentElement.classList.remove('keyboard-open');
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
