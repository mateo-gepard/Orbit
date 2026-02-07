// ═══════════════════════════════════════════════════════════
// ORBIT — PWA Utilities
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

export function setInstallPromptEvent(e: Event) {
  deferredPromptEvent = e;
}

export function getInstallPromptEvent() {
  return deferredPromptEvent;
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

/** Register service worker for offline support */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      // Use a minimal SW for now — mainly for PWA installability
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[ORBIT] SW registered:', registration.scope);
    } catch (err) {
      console.warn('[ORBIT] SW registration failed:', err);
    }
  });
}

/** Set up the viewport height CSS variable (handles iOS address bar) */
export function setupViewportHeight() {
  if (typeof window === 'undefined') return;

  const setVH = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };

  setVH();
  window.addEventListener('resize', setVH);
  window.visualViewport?.addEventListener('resize', setVH);
}

/** Disable rubber-band bouncing in standalone mode */
export function disableOverscroll() {
  if (typeof document === 'undefined') return;
  if (!isStandalone()) return;

  let startY = 0;

  document.addEventListener('touchstart', (e) => {
    startY = e.touches[0].pageY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const el = e.target as HTMLElement;
    // Find the nearest scrollable ancestor
    let scrollable = el;
    while (scrollable && scrollable !== document.body) {
      const style = window.getComputedStyle(scrollable);
      if (
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflow === 'auto' ||
        style.overflow === 'scroll'
      ) {
        const atTop = scrollable.scrollTop <= 0;
        const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight;
        const goingUp = e.touches[0].pageY > startY;
        const goingDown = e.touches[0].pageY < startY;

        // Allow scrolling if not at edges
        if (!(atTop && goingUp) && !(atBottom && goingDown)) {
          return;
        }
        break;
      }
      scrollable = scrollable.parentElement!;
    }
    // At edges or no scrollable parent — prevent bounce
    if (scrollable === document.body || !scrollable) {
      e.preventDefault();
    }
  }, { passive: false });
}
