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
      // TEMPORARY: Completely disable service worker and clear all caches
      // This forces a clean slate for the PWA
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[ORBIT] Unregistered SW');
      }
      
      // Clear all caches
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log('[ORBIT] Deleted cache:', cacheName);
      }
      
      console.log('[ORBIT] Service worker disabled - app will reload fresh on each visit');
      
      // DO NOT re-register service worker yet - let the app run without SW
      // This ensures no caching interference
      
    } catch (err) {
      console.warn('[ORBIT] SW cleanup failed:', err);
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
