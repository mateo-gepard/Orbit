'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  disableOverscroll,
  getInternalNavigationPath,
  registerServiceWorker,
  type ServiceWorkerUpdateReadyDetail,
  setInstallPromptEvent,
  setupViewportHeight,
} from '@/lib/pwa';
import { useTranslation } from '@/lib/i18n';

const UPDATE_TOAST_ID = 'threadmap-service-worker-update';

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
  const { lang } = useTranslation();
  const langRef = useRef(lang);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

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

    const handleUpdateReady = (event: Event) => {
      const detail = (event as CustomEvent<ServiceWorkerUpdateReadyDetail>).detail;
      if (!detail || typeof detail.apply !== 'function') return;
      const currentLanguage = langRef.current;
      const copy = currentLanguage === 'de'
        ? {
            title: 'Update bereit',
            description: 'Threadmap wurde aktualisiert. Lade neu, sobald du deine offenen Änderungen gespeichert hast.',
            apply: 'Jetzt neu laden',
            later: 'Später',
          }
        : {
            title: 'Update ready',
            description: 'Threadmap has been updated. Reload after saving any work you have open.',
            apply: 'Reload now',
            later: 'Later',
          };
      let accepted = false;
      const defer = () => {
        if (!accepted) detail.defer();
      };

      toast(copy.title, {
        id: UPDATE_TOAST_ID,
        description: copy.description,
        duration: Infinity,
        action: {
          label: copy.apply,
          onClick: () => {
            accepted = detail.apply();
            if (!accepted) {
              toast.error(currentLanguage === 'de'
                ? 'Das Update ist nicht mehr verfügbar. Versuche es später erneut.'
                : 'The update is no longer available. Try again later.');
            }
          },
        },
        cancel: {
          label: copy.later,
          onClick: () => {
            defer();
            toast.dismiss(UPDATE_TOAST_ID);
          },
        },
        onDismiss: defer,
      });
    };
    window.addEventListener('threadmap:update-ready', handleUpdateReady);

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
      window.removeEventListener('threadmap:update-ready', handleUpdateReady);
      toast.dismiss(UPDATE_TOAST_ID);
      unregisterLoadListener();
      cleanupViewport();
      cleanupOverscroll();
      document.documentElement.classList.remove('standalone');
    };
  }, [router]);

  return <>{children}</>;
}
