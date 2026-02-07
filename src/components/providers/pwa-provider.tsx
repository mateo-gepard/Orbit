'use client';

import { useEffect } from 'react';
import { setInstallPromptEvent, registerServiceWorker, setupViewportHeight, disableOverscroll } from '@/lib/pwa';

/**
 * PWA Provider — Initializes PWA features:
 * - Service worker registration
 * - Install prompt capture
 * - Viewport height CSS variable
 * - Overscroll prevention in standalone
 */
export function PWAProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Register service worker
    registerServiceWorker();

    // Set up dynamic viewport height
    setupViewportHeight();

    // Disable overscroll bounce in standalone mode
    disableOverscroll();

    // Capture the install prompt for later use
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Log standalone mode
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone: boolean }).standalone === true;
    
    if (isStandalone) {
      console.log('[ORBIT] Running in standalone PWA mode');
      document.documentElement.classList.add('standalone');
    }

    // Force layout recalculation after mount (fixes bottom nav position on load)
    requestAnimationFrame(() => {
      document.body.style.display = 'none';
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      document.body.offsetHeight; // Force reflow
      document.body.style.display = '';
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  return <>{children}</>;
}
