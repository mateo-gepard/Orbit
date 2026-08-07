'use client';

import { useEffect, type ReactNode } from 'react';
import { installGlobalErrorHandlers } from '@/lib/report-error';
import { ThemeProvider } from './theme-provider';
import { AuthProvider } from './auth-provider';
import { DataProvider } from './data-provider';
import { PWAProvider } from './pwa-provider';
import { SettingsEffects } from './settings-effects';
import { AppShell } from '@/components/shell/app-shell';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from './error-boundary';

// ── Root Providers ──
export function Providers({ children }: { children: ReactNode }) {
  // NOTE: rehydrate() is called inside DataProvider.connect() — BEFORE
  // Firestore subscriptions start — so cloud data always wins over stale
  // localStorage on a fresh device.

  // Catches async throws and rejected promises, which never reach the boundary.
  useEffect(() => installGlobalErrorHandlers(), []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PWAProvider>
          <AuthProvider>
            <DataProvider>
              <SettingsEffects />
              <AppShell>{children}</AppShell>
              <Toaster />
            </DataProvider>
          </AuthProvider>
        </PWAProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
