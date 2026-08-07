'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  disableOverscroll,
  getInternalNavigationPath,
  registerServiceWorker,
  setInstallPromptEvent,
  setupViewportHeight,
} from '@/lib/pwa';

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
    const unregisterLoadListener = registerServiceWorker();

    // Set up dynamic viewport height
    const cleanupViewport = setupViewportHeight();

    // Disable overscroll bounce in standalone mode
    const cleanupOverscroll = disableOverscroll();

    // Listen for NAVIGATE messages from the Service Worker (notification clicks)
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'NAVIGATE') return;
      const path = getInternalNavigationPath(event.data.url, window.location.origin);
      if (path) router.push(path);
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    // Capture the install prompt for later use
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      window.dispatchEvent(new CustomEvent('threadmap:install-available'));
    };
    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      window.dispatchEvent(new CustomEvent('threadmap:app-installed'));
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone: boolean }).standalone === true;
    
    if (isStandalone) {
      document.documentElement.classList.add('standalone');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      unregisterLoadListener();
      cleanupViewport();
      cleanupOverscroll();
      document.documentElement.classList.remove('standalone');
    };
  }, [router]);

  return <>{children}</>;
}
