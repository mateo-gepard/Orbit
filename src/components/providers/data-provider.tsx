'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useAuth } from './auth-provider';

/**
 * Sync notices, one per kind. Two warnings of different kinds can be true at
 * the same time; only one message slot meant the later one erased the earlier.
 */
type SyncNoticeKind = 'offline' | 'warning' | 'conflict' | 'loading';

interface SyncNotice {
  kind: SyncNoticeKind;
  message: string;
}

import {
  isFirestoreDataContextCurrent,
  retryQueuedItemMutations,
  setFirestoreDataContext,
  subscribeToItems,
  subscribeToToolData,
  subscribeToUserSettings,
} from '@/lib/firestore';
import { scopeThreadmapStore, useThreadmapStore } from '@/lib/store';
import { scopeAbiturStore, useAbiturStore } from '@/lib/abitur-store';
import { scopeToolboxStore, useToolboxStore } from '@/lib/toolbox-store';
import {
  mergeWishlistCloudData,
  scopeWishlistStore,
  useWishlistStore,
  type WishlistCloudData,
} from '@/lib/wishlist-store';
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
import { ensureAppCheck } from '@/lib/firebase';

const MIN_LOADING_TIME = 500;
const MAX_LOADING_TIME = 6000;

function dataMessage(english: string, german: string): string {
  return useSettingsStore.getState().settings.language === 'de' ? german : english;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, isDemo } = useAuth();
  const userId = user?.uid || null;
  const localOnly = Boolean(userId && (isDemo || userId === 'demo-user'));
  // ── F-54 ──
  // A single `error` string meant concurrent warnings overwrote each other and
  // only the last survived — and being offline (which clears itself) got the
  // same banner and the same two buttons as a cloud conflict (which cannot be
  // resolved from a banner at all). Notices are now kept per kind, and each
  // kind offers the action that actually applies to it.
  const [notices, setNotices] = useState<SyncNotice[]>([]);

  const pushNotice = useCallback((kind: SyncNoticeKind, message: string) => {
    setNotices((current) => {
      const rest = current.filter((notice) => notice.kind !== kind);
      return [...rest, { kind, message }];
    });
  }, []);

  const dismissNotice = useCallback((kind: SyncNoticeKind) => {
    setNotices((current) => current.filter((notice) => notice.kind !== kind));
  }, []);

  const clearNotices = useCallback(() => setNotices([]), []);
  const [isLoading, setIsLoading] = useState(true);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const accountScopeKey = userId
    ? `${localOnly ? 'local' : 'cloud'}:${userId}`
    : 'signed-out';
  const [readyScopeKey, setReadyScopeKey] = useState<string | null>(null);
  const generationRef = useRef(0);
  const loadingFocusRef = useRef<HTMLDivElement>(null);
  const accountScopeLoading = isLoading || readyScopeKey !== accountScopeKey;
  // Signing out still clears account-scoped stores, but that background reset
  // must never make the public landing page, authentication controls, or legal
  // links inert. The modal lock only protects a real account transition.
  const workspaceLoading = Boolean(userId) && accountScopeLoading;
  const language = useSettingsStore((state) => state.settings.language);

  const configureAccountServices = useCallback((
    userId: string,
    localOnly: boolean,
    itemsReady: boolean,
  ) => {
    const settings = useSettingsStore.getState().settings;

    stopBriefingScheduler();
    if (localOnly && settings.notifications.enabled) {
      startBriefingScheduler(userId, () => useThreadmapStore.getState().items);
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
      clearNotices();
      stopGoogleCalendarSync();
      stopBriefingScheduler();
      cleanupForegroundMessageHandler();

      setFirestoreDataContext(accountId, accountId ? (localOnly ? 'local' : 'cloud') : 'signed-out');
      setFlightStorageOwner(accountId);
      setGoogleCalendarOwner(accountId && !localOnly ? accountId : null);

      await Promise.all([
        scopeThreadmapStore(accountId),
        scopeAbiturStore(accountId),
        scopeToolboxStore(accountId),
        scopeWishlistStore(accountId),
        scopeSettingsStore(accountId),
      ]);
      if (!isCurrent()) return;
      setReadyScopeKey(accountScopeKey);

      if (!accountId) {
        useThreadmapStore.getState()._setSyncUserId(null);
        useAbiturStore.getState()._setSyncUserId(null);
        useToolboxStore.getState()._setSyncUserId(null);
        useWishlistStore.getState()._setSyncUserId(null);
        useSettingsStore.getState()._setSyncUserId(null);
        finishLoading();
        return;
      }

      if (!localOnly) {
        await ensureAppCheck();
        if (!isCurrent()) return;
      }

      const cloudUserId = localOnly ? null : accountId;
      useThreadmapStore.getState()._setSyncUserId(cloudUserId);
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
        useThreadmapStore.getState().setTagsFromCloud(
          settings.customTags,
          settings.removedDefaultTags,
          settings.revision,
          settings.updatedAt,
          authoritative,
        );
      }, {
        getInitialData: () => ({
          customTags: useThreadmapStore.getState().customTags,
          removedDefaultTags: useThreadmapStore.getState().removedDefaultTags,
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

      subscriptions.push(subscribeToToolData<WishlistCloudData>(
        accountId,
        'wishlist',
        (data) => {
          if (!isCurrent()) return;
          if (data) useWishlistStore.getState()._setFromCloud(data);
        },
        {
          getInitialData: () => ({
            items: useWishlistStore.getState().items,
            duels: useWishlistStore.getState().duels,
            deletedItems: useWishlistStore.getState().deletedItems,
          }),
          hasPendingLocalChanges: () => useWishlistStore.getState().cloudDirty,
          mergeInitialData: (local, remote) => mergeWishlistCloudData(
            local,
            remote || { items: [], duels: [], deletedItems: {} },
          ),
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
          useThreadmapStore.getState().setItems(items);
          itemsReady = true;
          configureAccountServices(accountId, localOnly, itemsReady);
          if (source === 'cloud' || source === 'local') dismissNotice('warning');
          finishLoading();
        },
        () => {
          if (isCurrent()) pushNotice('warning', dataMessage(
            'Cloud sync is unavailable. Showing this account’s local cache.',
            'Die Cloud-Synchronisierung ist nicht verfügbar. Der lokale Cache dieses Kontos wird angezeigt.',
          ));
        }
      ));
    };

    void setup().catch((cause) => {
      if (!isCurrent()) return;
      console.error('[THREADMAP] Account data setup failed:', cause);
      pushNotice('warning', dataMessage(
        'Your account data could not be loaded. No cross-account fallback was used.',
        'Deine Kontodaten konnten nicht geladen werden. Es wurden keine Daten eines anderen Kontos verwendet.',
      ));
      finishLoading();
    });

    safetyTimer = setTimeout(() => {
      if (!isCurrent()) return;
      pushNotice('loading', dataMessage(
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
      useThreadmapStore.getState()._setSyncUserId(null);
      useAbiturStore.getState()._setSyncUserId(null);
      useToolboxStore.getState()._setSyncUserId(null);
      useWishlistStore.getState()._setSyncUserId(null);
      useSettingsStore.getState()._setSyncUserId(null);
      stopGoogleCalendarSync();
      stopBriefingScheduler();
      cleanupForegroundMessageHandler();
    };
  }, [accountScopeKey, clearNotices, configureAccountServices, dismissNotice, localOnly, pushNotice, reconnectNonce, userId]);

  useEffect(() => {
    const reconnect = () => {
      dismissNotice('offline');
      if (userId && !localOnly) {
        void retryQueuedItemMutations(userId, { includeRejected: true });
      }
    };
    const offline = () => pushNotice('offline', language === 'de'
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
      if (typeof message === 'string') pushNotice('warning', message);
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    window.addEventListener('threadmap:sync-warning', syncWarning);
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', offline);
      window.removeEventListener('threadmap:sync-warning', syncWarning);
    };
  }, [dismissNotice, language, localOnly, pushNotice, userId]);

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
      pushNotice('conflict', detail?.message || dataMessage(
        'A cloud edit conflict needs your attention.',
        'Ein Cloud-Bearbeitungskonflikt benötigt deine Aufmerksamkeit.',
      ));
    };
    window.addEventListener('threadmap:sync-conflict', handleConflict);
    return () => window.removeEventListener('threadmap:sync-conflict', handleConflict);
  }, [pushNotice, userId]);

  return (
    <>
      <DialogPrimitive.Root open={workspaceLoading} modal>
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
              {notices.length > 0 && (
                <div
                  role="alert"
                  className="fixed bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-1/2 z-[10000] flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-xl sm:flex-row sm:items-center"
                >
                  <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted-foreground/80">
                    {notices[0].message}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      clearNotices();
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
      {notices.length > 0 && !workspaceLoading && (
        <div className="fixed bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)] left-1/2 z-[35] flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 lg:bottom-4">
          {notices.map((notice) => (
            <div
              key={notice.kind}
              role="alert"
              aria-live={notice.kind === 'offline' ? 'polite' : 'assertive'}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-lg"
            >
              <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted-foreground/80">{notice.message}</p>

              {/* Offline resolves itself when the connection returns, so it
                  offers no retry. A conflict cannot be resolved from a banner
                  at all — it links to the screen that can. */}
              {notice.kind === 'conflict' && (
                <Link
                  href="/settings?section=data"
                  onClick={() => dismissNotice('conflict')}
                  className="min-h-11 shrink-0 rounded-lg px-2.5 text-[11px] font-medium leading-[44px] text-foreground hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-9 lg:leading-9"
                >
                  {language === 'de' ? 'Ansehen' : 'Review'}
                </Link>
              )}

              {(notice.kind === 'warning' || notice.kind === 'loading') && (
                <button
                  type="button"
                  onClick={() => {
                    dismissNotice(notice.kind);
                    if (userId && !localOnly) {
                      void retryQueuedItemMutations(userId, { includeRejected: true });
                    }
                    setReconnectNonce((value) => value + 1);
                  }}
                  className="min-h-11 shrink-0 rounded-lg px-2.5 text-[11px] font-medium text-foreground hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-9"
                >
                  {language === 'de' ? 'Erneut versuchen' : 'Retry'}
                </button>
              )}

              <button
                type="button"
                onClick={() => dismissNotice(notice.kind)}
                aria-label={language === 'de' ? 'Meldung schließen' : 'Dismiss message'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 lg:h-9 lg:w-9"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        key={accountScopeKey}
        className="min-h-screen"
        inert={workspaceLoading ? true : undefined}
        aria-hidden={workspaceLoading ? true : undefined}
        aria-busy={workspaceLoading}
      >
        {children}
      </div>
    </>
  );
}
