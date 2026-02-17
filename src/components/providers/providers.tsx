'use client';

import { Component, type ReactNode, type ErrorInfo, useEffect } from 'react';
import { ThemeProvider } from './theme-provider';
import { AuthProvider } from './auth-provider';
import { DataProvider } from './data-provider';
import { PWAProvider } from './pwa-provider';
import { AppShell } from '@/components/shell/app-shell';
import { DebugPanel } from '@/components/debug-panel';
import { useToolboxStore } from '@/lib/toolbox-store';
import { useAbiturStore } from '@/lib/abitur-store';

// ── Error Boundary ──
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ORBIT] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-sm text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background font-bold text-lg">
              O
            </div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Root Providers ──
export function Providers({ children }: { children: ReactNode }) {
  // Rehydrate persisted stores on the client to avoid SSR mismatch
  useEffect(() => {
    useToolboxStore.persist.rehydrate();
    useAbiturStore.persist.rehydrate();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PWAProvider>
          <AuthProvider>
            <DataProvider>
              <AppShell>{children}</AppShell>
              <DebugPanel />
            </DataProvider>
          </AuthProvider>
        </PWAProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
