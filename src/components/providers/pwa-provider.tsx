'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setInstallPromptEvent, registerServiceWorker, setupViewportHeight, disableOverscroll } from '@/lib/pwa';

/**
 * PWA Provider — Initializes PWA features:
 * - Service worker registration
 * - Install prompt capture
 * - Viewport height CSS variable
 * - Overscroll prevention in standalone
 * - SW NAVIGATE message handler
 */
export function PWAProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Register service worker
    registerServiceWorker();

    // Set up dynamic viewport height
    setupViewportHeight();

    // Disable overscroll bounce in standalone mode
    disableOverscroll();

    // Listen for NAVIGATE messages from the Service Worker (notification clicks)
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        console.log('[ORBIT] SW NAVIGATE:', event.data.url);
        router.push(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    // Capture the install prompt for later use
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
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [router]);

  return <>{children}</>;
}
