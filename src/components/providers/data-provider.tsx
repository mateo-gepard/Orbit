'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { useAuth } from './auth-provider';
import { subscribeToItems } from '@/lib/firestore';
import { useOrbitStore } from '@/lib/store';
import { LoadingScreen } from '@/components/ui/loading-screen';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const MIN_LOADING_TIME = 800; // Minimum time to show loading screen (feels better than flash)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const setItems = useOrbitStore((s) => s.setItems);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const reconnectAttempt = useRef(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const loadingStartTime = useRef(Date.now());

  const connect = useCallback(() => {
    if (!user) {
      setItems([]);
      return;
    }

    try {
      // Cleanup previous subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

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
  }, [user, setItems]);

  useEffect(() => {
    connect();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
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
