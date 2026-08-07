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
import {
  DEVICE_SCOPE,
  SYNC_RECOVERED_EVENT,
  SYNC_WARNING_EVENT,
  syncScopeMatches,
  type SyncRecoveredDetail,
  type SyncWarningDetail,
  type SyncWarningKey,
} from '@/lib/sync-warning';
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
  // Which condition raised the visible banner, so a recovery for one condition
  // cannot dismiss another condition that is still failing.
  const activeErrorKeyRef = useRef<SyncWarningKey | null>(null);
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

  const showError = useCallback((message: string, key: SyncWarningKey | null) => {
    activeErrorKeyRef.current = key;
    setError(message);
  }, []);

  /** Pass `null` to dismiss whatever is showing; a key clears only its own banner. */
  const clearError = useCallback((key: SyncWarningKey | null) => {
    if (key !== null && activeErrorKeyRef.current !== key) return;
    activeErrorKeyRef.current = null;
    setError(null);
  }, []);

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
      clearError(null);
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
          // Only the load banner is resolved by a snapshot. A tool whose cloud
          // save is still retrying keeps its own warning up.
          if (source === 'cloud' || source === 'local') clearError('items:load');
          finishLoading();
        },
        () => {
          if (isCurrent()) showError(dataMessage(
            'Cloud sync is unavailable. Showing this account’s local cache.',
            'Die Cloud-Synchronisierung ist nicht verfügbar. Der lokale Cache dieses Kontos wird angezeigt.',
          ), 'items:load');
        }
      ));
    };

    void setup().catch((cause) => {
      if (!isCurrent()) return;
      console.error('[THREADMAP] Account data setup failed:', cause);
      showError(dataMessage(
        'Your account data could not be loaded. No cross-account fallback was used.',
        'Deine Kontodaten konnten nicht geladen werden. Es wurden keine Daten eines anderen Kontos verwendet.',
      ), 'items:load');
      finishLoading();
    });

    safetyTimer = setTimeout(() => {
      if (!isCurrent()) return;
      // A warning already on screen is more specific than "still loading".
      // The ref tracks the live banner, so this stays correct across renders.
      if (activeErrorKeyRef.current === null) {
        showError(dataMessage(
          'Loading is taking longer than expected.',
          'Das Laden dauert länger als erwartet.',
        ), 'items:load');
      }
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
  }, [accountScopeKey, clearError, configureAccountServices, localOnly, reconnectNonce, showError, userId]);

  useEffect(() => {
    const reconnect = () => {
      // Anything still broken re-announces itself on the next retry.
      clearError(null);
      if (userId && !localOnly) {
        void retryQueuedItemMutations(userId, { includeRejected: true });
      }
    };
    const offline = () => showError(language === 'de'
      ? 'Offline. Elementänderungen bleiben in diesem Browser vorgemerkt; Löschen, Google-Sync und Werkzeug-Cloud-Sync benötigen eine Verbindung.'
      : 'Offline. Item edits remain queued in this browser; deletion, Google sync, and tool cloud sync need a connection.',
      'network:offline');
    const applies = (detail: { userId?: string; generation?: number } | undefined) => {
      if (!detail || typeof detail.userId !== 'string') return false;
      if (!syncScopeMatches(detail.userId, userId)) return false;
      // A generation-stamped notice from a superseded data context describes an
      // account this browser has already left.
      return typeof detail.generation !== 'number'
        || detail.userId === DEVICE_SCOPE
        || isFirestoreDataContextCurrent(detail.userId, detail.generation);
    };
    const syncWarning = (event: Event) => {
      const detail = (event as CustomEvent<SyncWarningDetail>).detail;
      if (!applies(detail) || typeof detail.message !== 'string') return;
      showError(detail.message, detail.key);
    };
    const syncRecovered = (event: Event) => {
      const detail = (event as CustomEvent<SyncRecoveredDetail>).detail;
      if (!applies(detail)) return;
      clearError(detail.key);
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    window.addEventListener(SYNC_WARNING_EVENT, syncWarning);
    window.addEventListener(SYNC_RECOVERED_EVENT, syncRecovered);
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', offline);
      window.removeEventListener(SYNC_WARNING_EVENT, syncWarning);
      window.removeEventListener(SYNC_RECOVERED_EVENT, syncRecovered);
    };
  }, [clearError, language, localOnly, showError, userId]);

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
      // Keyed by tool so the tool's next successful save clears the conflict.
      showError(detail.message || dataMessage(
        'A cloud edit conflict needs your attention.',
        'Ein Cloud-Bearbeitungskonflikt benötigt deine Aufmerksamkeit.',
      ), detail.toolId ? `tool:${detail.toolId}` : 'items:load');
    };
    window.addEventListener('threadmap:sync-conflict', handleConflict);
    return () => window.removeEventListener('threadmap:sync-conflict', handleConflict);
  }, [showError, userId]);

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
                      clearError(null);
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
              clearError(null);
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
            onClick={() => clearError(null)}
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
