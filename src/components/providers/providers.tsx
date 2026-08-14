'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';
import { AuthProvider } from './auth-provider';
import { DataProvider } from './data-provider';
import { PWAProvider } from './pwa-provider';
import { SettingsEffects } from './settings-effects';
import { SignedOutDataAdoption } from './signed-out-data-adoption';
import { KeyboardShortcuts } from '@/components/shell/keyboard-shortcuts';
import { AppShell } from '@/components/shell/app-shell';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from './error-boundary';

// ── Root Providers ──
export function Providers({ children }: { children: ReactNode }) {
  // NOTE: rehydrate() is called inside DataProvider.connect() — BEFORE
  // Firestore subscriptions start — so cloud data always wins over stale
  // localStorage on a fresh device.

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PWAProvider>
          <AuthProvider>
            <DataProvider>
              <SettingsEffects />
              <SignedOutDataAdoption />
              <KeyboardShortcuts />
              <AppShell>{children}</AppShell>
              <Toaster />
            </DataProvider>
          </AuthProvider>
        </PWAProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
