'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryCopy {
  title: string;
  description: string;
  tryAgain: string;
  reload: string;
}

interface ErrorBoundaryInnerProps extends ErrorBoundaryProps {
  copy: ErrorBoundaryCopy;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryInnerProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[THREADMAP] Uncaught error:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="surface-card w-full max-w-sm space-y-4 rounded-2xl p-6 text-center">
          <div
            aria-hidden="true"
            className="mx-auto h-12 w-12 rounded-xl bg-cover bg-center"
            style={{ backgroundImage: "url('/favicon.svg')" }}
          />
          <div>
            <h1 className="text-lg font-semibold">{this.props.copy.title}</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {this.props.copy.description}
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/[0.04]"
            >
              {this.props.copy.tryAgain}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              {this.props.copy.reload}
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const copy: ErrorBoundaryCopy = {
    title: t('error.unexpectedTitle'),
    description: t('error.unexpectedDescription'),
    tryAgain: t('error.tryAgain'),
    reload: t('error.reloadApp'),
  };

  return <ErrorBoundaryInner copy={copy}>{children}</ErrorBoundaryInner>;
}
