'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { useAuth } from './auth-provider';
import { subscribeToItems, subscribeToUserSettings, subscribeToToolData } from '@/lib/firestore';
import { useOrbitStore } from '@/lib/store';
import { useAbiturStore } from '@/lib/abitur-store';
import { useToolboxStore } from '@/lib/toolbox-store';
import { useWishlistStore } from '@/lib/wishlist-store';
import { subscribeToFlightLogs } from '@/lib/flight';
import { LoadingScreen } from '@/components/ui/loading-screen';
import type { AbiturProfile } from '@/lib/abitur';
import type { ToolId } from '@/lib/toolbox-store';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const MIN_LOADING_TIME = 800;
const MAX_LOADING_TIME = 6000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const setItems = useOrbitStore((s) => s.setItems);
  const setTagsFromCloud = useOrbitStore((s) => s.setTagsFromCloud);
  const setSyncUserId = useOrbitStore((s) => s._setSyncUserId);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const reconnectAttempt = useRef(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const unsubSettingsRef = useRef<(() => void) | null>(null);
  const unsubToolDataRefs = useRef<(() => void)[]>([]);
  const loadingStartTime = useRef(Date.now());

  const connect = useCallback(() => {
    if (!user) {
      setItems([]);
      setSyncUserId(null);
      useAbiturStore.getState()._setSyncUserId(null);
      useToolboxStore.getState()._setSyncUserId(null);
      useWishlistStore.getState()._setSyncUserId(null);
      // No user → nothing to load, dismiss loading screen immediately
      setDataLoaded(true);
      setIsLoading(false);
      return;
    }

    try {
      // Set sync user ID for tag cloud sync
      setSyncUserId(user.uid);

      // Set sync user IDs for tool stores
      useAbiturStore.getState()._setSyncUserId(user.uid);
      useToolboxStore.getState()._setSyncUserId(user.uid);
      useWishlistStore.getState()._setSyncUserId(user.uid);

      // Cleanup previous subscriptions
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (unsubSettingsRef.current) {
        unsubSettingsRef.current();
        unsubSettingsRef.current = null;
      }
      for (const unsub of unsubToolDataRefs.current) {
        unsub();
      }
      unsubToolDataRefs.current = [];

      // Subscribe to user settings (tags/areas)
      const unsubSettings = subscribeToUserSettings(user.uid, (settings) => {
        setTagsFromCloud(settings.customTags, settings.removedDefaultTags);
      });
      unsubSettingsRef.current = unsubSettings;

      // Subscribe to Abitur tool data
      const unsubAbitur = subscribeToToolData<{ profile: AbiturProfile }>(
        user.uid,
        'abitur',
        (data) => {
          if (data?.profile) {
            useAbiturStore.getState()._setProfileFromCloud(data.profile);
          }
        },
        () => {
          const profile = useAbiturStore.getState().profile;
          return profile.onboardingComplete ? { profile } : null;
        }
      );
      unsubToolDataRefs.current.push(unsubAbitur);

      // Subscribe to Toolbox tool data
      const unsubToolbox = subscribeToToolData<{ enabledTools: ToolId[] }>(
        user.uid,
        'toolbox',
        (data) => {
          if (data?.enabledTools) {
            useToolboxStore.getState()._setFromCloud(data.enabledTools);
          }
        },
        () => {
          const enabled = useToolboxStore.getState().enabledTools;
          return enabled.length > 0 ? { enabledTools: enabled } : null;
        }
      );
      unsubToolDataRefs.current.push(unsubToolbox);

      // Subscribe to Wishlist tool data
      const unsubWishlist = subscribeToToolData<{
        items: import('@/lib/wishlist-store').WishlistItem[];
        duelHistory: { winnerId: string; loserId: string; timestamp: number }[];
        categories: string[];
      }>(
        user.uid,
        'wishlist',
        (data) => {
          if (data) {
            useWishlistStore.getState()._setFromCloud(data);
          }
        },
        () => {
          const { items: wItems, duelHistory, categories } = useWishlistStore.getState();
          return wItems.length > 0 ? { items: wItems, duelHistory, categories } : null;
        }
      );
      unsubToolDataRefs.current.push(unsubWishlist);

      // Subscribe to Flight Logs — ensures cloud sync even when flight page isn't open
      const unsubFlightLogs = subscribeToFlightLogs(user.uid, () => {
        // Data is persisted to localStorage by subscribeToFlightLogs itself;
        // the flight page reads from there. No extra state needed here.
      });
      unsubToolDataRefs.current.push(unsubFlightLogs);

      const unsubscribe = subscribeToItems(user.uid, (items) => {
        setItems(items);
        setError(null);
        reconnectAttempt.current = 0; // Reset on successful data
        
        // Mark data as loaded
        if (!dataLoaded) {
          const elapsed = Date.now() - loadingStartTime.current;
          const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
          
          setTimeout(() => {
            setDataLoaded(true);
            setIsLoading(false);
          }, remaining);
        }
      });

      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error('[ORBIT] DataProvider subscription error:', err);

      if (reconnectAttempt.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempt.current++;
        const delay = RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempt.current);
        console.warn(`[ORBIT] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempt.current})`);
        setTimeout(connect, delay);
      } else {
        setError('Unable to connect. Your data is saved locally.');
      }
    }
  }, [user, setItems, setTagsFromCloud, setSyncUserId]);

  useEffect(() => {
    connect();

    // Safety timeout — never stay on loading screen forever
    const safetyTimer = setTimeout(() => {
      if (isLoading) {
        console.warn('[ORBIT] Loading safety timeout reached — dismissing loading screen');
        setDataLoaded(true);
        setIsLoading(false);
      }
    }, MAX_LOADING_TIME);

    return () => {
      clearTimeout(safetyTimer);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (unsubSettingsRef.current) {
        unsubSettingsRef.current();
        unsubSettingsRef.current = null;
      }
      for (const unsub of unsubToolDataRefs.current) {
        unsub();
      }
      unsubToolDataRefs.current = [];
    };
  }, [connect]);

  // Listen for online/offline events for reconnection
  useEffect(() => {
    const handleOnline = () => {
      console.info('[ORBIT] Network back online — reconnecting');
      reconnectAttempt.current = 0;
      connect();
    };

    const handleOffline = () => {
      console.warn('[ORBIT] Network offline — using local data');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connect]);

  return (
    <>
      {isLoading && <LoadingScreen />}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-border/60 bg-card px-4 py-2.5 shadow-lg">
          <p className="text-[12px] text-muted-foreground">{error}</p>
        </div>
      )}
      {children}
    </>
  );
}
