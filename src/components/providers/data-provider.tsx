'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useAuth } from './auth-provider';
import {
  isFirestoreDataContextCurrent,
  retryQueuedItemMutations,
  setFirestoreDataContext,
  subscribeToItems,
  subscribeToToolData,
  subscribeToUserSettings,
} from '@/lib/firestore';
import { scopeOrbitStore, useOrbitStore } from '@/lib/store';
import { scopeAbiturStore, useAbiturStore } from '@/lib/abitur-store';
import { scopeToolboxStore, useToolboxStore } from '@/lib/toolbox-store';
import { scopeWishlistStore, useWishlistStore } from '@/lib/wishlist-store';
import { scopeSettingsStore, useSettingsStore } from '@/lib/settings-store';
import { setFlightStorageOwner, subscribeToFlightLogs } from '@/lib/flight';
import { startBriefingScheduler, stopBriefingScheduler } from '@/lib/briefing-notifications';
import {
  cleanupForegroundMessageHandler,
  hasFCMToken,
  refreshPushSubscription,
  setupForegroundMessageHandler,
  unregisterFCMToken,
} from '@/lib/fcm';
import {
  clearGoogleAccessToken,
  hasCalendarPermission,
  setGoogleCalendarOwner,
} from '@/lib/google-calendar';
import { startGoogleCalendarSync, stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import { LoadingScreen } from '@/components/ui/loading-screen';
import type { AbiturProfile } from '@/lib/abitur';
import type { ToolId } from '@/lib/toolbox-store';
import type { UserSettings } from '@/lib/settings-store';

const MIN_LOADING_TIME = 500;
const MAX_LOADING_TIME = 6000;

function dataMessage(english: string, german: string): string {
  return useSettingsStore.getState().settings.language === 'de' ? german : english;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, isDemo } = useAuth();
  const userId = user?.uid || null;
  const localOnly = Boolean(userId && (isDemo || userId === 'demo-user'));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const accountScopeKey = userId
    ? `${localOnly ? 'local' : 'cloud'}:${userId}`
    : 'signed-out';
  const [readyScopeKey, setReadyScopeKey] = useState<string | null>(null);
  const generationRef = useRef(0);
  const loadingFocusRef = useRef<HTMLDivElement>(null);
  const accountScopeLoading = isLoading || readyScopeKey !== accountScopeKey;
  const language = useSettingsStore((state) => state.settings.language);

  const configureAccountServices = useCallback((
    userId: string,
    localOnly: boolean,
    itemsReady: boolean,
  ) => {
    const settings = useSettingsStore.getState().settings;

    stopBriefingScheduler();
    if (localOnly && settings.notifications.enabled) {
      startBriefingScheduler(userId, () => useOrbitStore.getState().items);
    }

    if (localOnly) {
      stopGoogleCalendarSync();
      cleanupForegroundMessageHandler();
      return;
    }

    if (itemsReady && settings.calendar.googleCalendarSync && hasCalendarPermission()) {
      startGoogleCalendarSync(userId);
    } else {
      stopGoogleCalendarSync();
      if (!settings.calendar.googleCalendarSync) clearGoogleAccessToken();
    }

    if (settings.notifications.enabled && hasFCMToken(userId)) {
      setupForegroundMessageHandler();
      void refreshPushSubscription(userId).catch((cause) => {
        console.warn('[THREADMAP] Existing push subscription could not be refreshed:', cause);
      });
    } else {
      cleanupForegroundMessageHandler();
      if (!settings.notifications.enabled && hasFCMToken(userId)) {
        void unregisterFCMToken(userId).catch((cause) => {
          console.warn('[THREADMAP] Disabled push subscription could not be removed:', cause);
        });
      }
    }
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const accountId = userId;
    const subscriptions: Array<() => void> = [];
    const loadingStartedAt = Date.now();
    let cancelled = false;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let itemsReady = false;

    const isCurrent = () => !cancelled && generationRef.current === generation;
    const finishLoading = () => {
      const remaining = Math.max(0, MIN_LOADING_TIME - (Date.now() - loadingStartedAt));
      loadingTimer = setTimeout(() => {
        if (isCurrent()) {
          if (safetyTimer) clearTimeout(safetyTimer);
          setIsLoading(false);
        }
      }, remaining);
    };

    const setup = async () => {
      setIsLoading(true);
      setError(null);
      stopGoogleCalendarSync();
      stopBriefingScheduler();
      cleanupForegroundMessageHandler();

      setFirestoreDataContext(accountId, accountId ? (localOnly ? 'local' : 'cloud') : 'signed-out');
      setFlightStorageOwner(accountId);
      setGoogleCalendarOwner(accountId && !localOnly ? accountId : null);

      await Promise.all([
        scopeOrbitStore(accountId),
        scopeAbiturStore(accountId),
        scopeToolboxStore(accountId),
        scopeWishlistStore(accountId),
        scopeSettingsStore(accountId),
      ]);
      if (!isCurrent()) return;
      setReadyScopeKey(accountScopeKey);

      if (!accountId) {
        useOrbitStore.getState()._setSyncUserId(null);
        useAbiturStore.getState()._setSyncUserId(null);
        useToolboxStore.getState()._setSyncUserId(null);
        useWishlistStore.getState()._setSyncUserId(null);
        useSettingsStore.getState()._setSyncUserId(null);
        finishLoading();
        return;
      }

      const cloudUserId = localOnly ? null : accountId;
      useOrbitStore.getState()._setSyncUserId(cloudUserId);
      useAbiturStore.getState()._setSyncUserId(cloudUserId);
      useToolboxStore.getState()._setSyncUserId(cloudUserId);
      useWishlistStore.getState()._setSyncUserId(cloudUserId);
      useSettingsStore.getState()._setSyncUserId(cloudUserId);

      subscriptions.push(useSettingsStore.subscribe(() => {
        if (isCurrent()) configureAccountServices(accountId, localOnly, itemsReady);
      }));
      configureAccountServices(accountId, localOnly, itemsReady);

      subscriptions.push(subscribeToUserSettings(accountId, (settings, authoritative) => {
        if (!isCurrent()) return;
        useOrbitStore.getState().setTagsFromCloud(
          settings.customTags,
          settings.removedDefaultTags,
          settings.revision,
          settings.updatedAt,
          authoritative,
        );
      }, {
        getInitialData: () => ({
          customTags: useOrbitStore.getState().customTags,
          removedDefaultTags: useOrbitStore.getState().removedDefaultTags,
        }),
      }));

      subscriptions.push(subscribeToToolData<{ profile: AbiturProfile }>(
        accountId,
        'abitur',
        (data) => {
          if (!isCurrent()) return;
          if (data?.profile) useAbiturStore.getState()._setProfileFromCloud(data.profile);
        },
        {
          getInitialData: () => ({ profile: useAbiturStore.getState().profile }),
          hasPendingLocalChanges: () => useAbiturStore.getState().cloudDirty,
        }
      ));

      subscriptions.push(subscribeToToolData<{ enabledTools: ToolId[] }>(
        accountId,
        'toolbox',
        (data) => {
          if (isCurrent() && data?.enabledTools) useToolboxStore.getState()._setFromCloud(data.enabledTools);
        },
        {
          getInitialData: () => ({ enabledTools: useToolboxStore.getState().enabledTools }),
          hasPendingLocalChanges: () => useToolboxStore.getState().cloudDirty,
        }
      ));

      subscriptions.push(subscribeToToolData<{ items: unknown[]; duels: unknown[] }>(
        accountId,
        'wishlist',
        (data) => {
          if (!isCurrent()) return;
          if (data) useWishlistStore.getState()._setFromCloud(data as { items: never[]; duels: never[] });
        },
        {
          getInitialData: () => ({
            items: useWishlistStore.getState().items,
            duels: useWishlistStore.getState().duels,
          }),
          hasPendingLocalChanges: () => useWishlistStore.getState().cloudDirty,
        }
      ));

      subscriptions.push(subscribeToToolData<{ settings: UserSettings }>(
        accountId,
        'settings',
        (data) => {
          if (isCurrent() && data?.settings) useSettingsStore.getState()._setFromCloud(data.settings);
        },
        {
          getInitialData: () => ({ settings: useSettingsStore.getState().settings }),
          hasPendingLocalChanges: () => useSettingsStore.getState().cloudDirty,
        }
      ));

      if (!localOnly) {
        subscriptions.push(subscribeToFlightLogs(accountId, () => {}));
      }

      subscriptions.push(subscribeToItems(
        accountId,
        (items, source) => {
          if (!isCurrent()) return;
          useOrbitStore.getState().setItems(items);
          itemsReady = true;
          configureAccountServices(accountId, localOnly, itemsReady);
          if (source === 'cloud' || source === 'local') setError(null);
          finishLoading();
        },
        () => {
          if (isCurrent()) setError(dataMessage(
            'Cloud sync is unavailable. Showing this account’s local cache.',
            'Die Cloud-Synchronisierung ist nicht verfügbar. Der lokale Cache dieses Kontos wird angezeigt.',
          ));
        }
      ));
    };

    void setup().catch((cause) => {
      if (!isCurrent()) return;
      console.error('[THREADMAP] Account data setup failed:', cause);
      setError(dataMessage(
        'Your account data could not be loaded. No cross-account fallback was used.',
        'Deine Kontodaten konnten nicht geladen werden. Es wurden keine Daten eines anderen Kontos verwendet.',
      ));
      finishLoading();
    });

    safetyTimer = setTimeout(() => {
      if (!isCurrent()) return;
      setError((current) => current || dataMessage(
        'Loading is taking longer than expected.',
        'Das Laden dauert länger als erwartet.',
      ));
      setIsLoading(false);
    }, MAX_LOADING_TIME);

    return () => {
      cancelled = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      if (loadingTimer) clearTimeout(loadingTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      useOrbitStore.getState()._setSyncUserId(null);
      useAbiturStore.getState()._setSyncUserId(null);
      useToolboxStore.getState()._setSyncUserId(null);
      useWishlistStore.getState()._setSyncUserId(null);
      useSettingsStore.getState()._setSyncUserId(null);
      stopGoogleCalendarSync();
      stopBriefingScheduler();
      cleanupForegroundMessageHandler();
    };
  }, [accountScopeKey, configureAccountServices, localOnly, reconnectNonce, userId]);

  useEffect(() => {
    const reconnect = () => {
      setError(null);
      if (userId && !localOnly) {
        void retryQueuedItemMutations(userId, { includeRejected: true });
      }
    };
    const offline = () => setError(language === 'de'
      ? 'Offline. Elementänderungen bleiben in diesem Browser vorgemerkt; Löschen, Google-Sync und Werkzeug-Cloud-Sync benötigen eine Verbindung.'
      : 'Offline. Item edits remain queued in this browser; deletion, Google sync, and tool cloud sync need a connection.');
    const syncWarning = (event: Event) => {
      const detail = (event as CustomEvent<{
        message?: unknown;
        userId?: string;
        generation?: number;
      }>).detail;
      if (detail?.userId && detail.userId !== userId) return;
      if (detail?.userId
          && typeof detail.generation === 'number'
          && !isFirestoreDataContextCurrent(detail.userId, detail.generation)) return;
      const message = detail?.message;
      if (typeof message === 'string') setError(message);
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    window.addEventListener('threadmap:sync-warning', syncWarning);
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', offline);
      window.removeEventListener('threadmap:sync-warning', syncWarning);
    };
  }, [language, localOnly, userId]);

  useEffect(() => {
    const handleConflict = (event: Event) => {
      const detail = (event as CustomEvent<{
        userId?: string;
        generation?: number;
        toolId?: string;
        message?: string;
        acceptedData?: Record<string, unknown> | null;
      }>).detail;
      if (!detail?.userId
          || typeof detail.generation !== 'number'
          || detail.userId !== userId
          || !isFirestoreDataContextCurrent(detail.userId, detail.generation)) return;
      setError(detail?.message || dataMessage(
        'A cloud edit conflict needs your attention.',
        'Ein Cloud-Bearbeitungskonflikt benötigt deine Aufmerksamkeit.',
      ));
    };
    window.addEventListener('threadmap:sync-conflict', handleConflict);
    return () => window.removeEventListener('threadmap:sync-conflict', handleConflict);
  }, [userId]);

  return (
    <>
      <DialogPrimitive.Root open={accountScopeLoading} modal>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            asChild
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              loadingFocusRef.current?.focus({ preventScroll: true });
            }}
          >
            <div ref={loadingFocusRef} tabIndex={-1} className="outline-none">
              <DialogPrimitive.Title className="sr-only">
                {language === 'de' ? 'Arbeitsbereich wird geladen' : 'Loading workspace'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {language === 'de'
                  ? 'Die Daten dieses Kontos werden sicher geladen.'
                  : 'This account’s data is loading securely.'}
              </DialogPrimitive.Description>
              <LoadingScreen />
              {error && (
                <div
                  role="alert"
                  className="fixed bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-1/2 z-[10000] flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-xl sm:flex-row sm:items-center"
                >
                  <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted-foreground/80">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      if (userId && !localOnly) {
                        void retryQueuedItemMutations(userId, { includeRejected: true });
                      }
                      setReconnectNonce((value) => value + 1);
                    }}
                    className="min-h-11 shrink-0 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {language === 'de' ? 'Erneut versuchen' : 'Retry'}
                  </button>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {error && !accountScopeLoading && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)] left-1/2 z-[35] flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-lg lg:bottom-4"
        >
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted-foreground/80">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (userId && !localOnly) {
                void retryQueuedItemMutations(userId, { includeRejected: true });
              }
              setReconnectNonce((value) => value + 1);
            }}
            className="min-h-11 rounded-lg px-2.5 text-[11px] font-medium text-foreground hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-9"
          >
            {language === 'de' ? 'Erneut versuchen' : 'Retry'}
          </button>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={language === 'de' ? 'Meldung schließen' : 'Dismiss message'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 lg:h-9 lg:w-9"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      <div
        key={accountScopeKey}
        className="min-h-screen"
        inert={accountScopeLoading ? true : undefined}
        aria-hidden={accountScopeLoading ? true : undefined}
        aria-busy={accountScopeLoading}
      >
        {children}
      </div>
    </>
  );
}
