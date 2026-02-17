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
      
      // Check for updates every time the app loads (especially important for PWA)
      if (registration.waiting) {
        // New SW is waiting, activate it immediately
        console.log('[ORBIT] Activating waiting service worker...');
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Hard reload to ensure we get fresh content
        setTimeout(() => {
          window.location.href = window.location.href;
        }, 100);
        return;
      }
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW is installed, hard reload to activate
              console.log('[ORBIT] Update installed, reloading...');
              setTimeout(() => {
                window.location.href = window.location.href;
              }, 100);
            }
          });
        }
      });
      
      // Force check for updates on load
      registration.update();
    } catch (err) {
      console.warn('[ORBIT] SW registration failed:', err);
    }
  });
}

/** Set up the viewport height CSS variable (handles iOS address bar) */
export function setupViewportHeight() {
  if (typeof window === 'undefined') return;

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
  window.addEventListener('orientationchange', () => {
    setTimeout(setVH, 100);
  });
}

/** Disable rubber-band bouncing in standalone mode */
export function disableOverscroll() {
  if (typeof document === 'undefined') return;
  if (!isStandalone()) return;

  // CSS handles most of this via overscroll-behavior: none on html,body
  // This catches edge cases in standalone PWA mode
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';
}
