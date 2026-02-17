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
    // Note: We intentionally do NOT call e.preventDefault() here.
    // Calling preventDefault() in Edge triggers a console warning
    // ("BeforeInstallPromptEvent.preventDefault() called but not
    // followed by prompt()") when the user doesn't trigger install
    // within the same session. Omitting it still allows us to call
    // .prompt() later via triggerInstall().
    const handleBeforeInstallPrompt = (e: Event) => {
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

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  return <>{children}</>;
}
