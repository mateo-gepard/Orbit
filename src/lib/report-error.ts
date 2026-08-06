'use client';

/**
 * Vendor-neutral crash reporting.
 *
 * Before this existed every production crash ended at a `console.error` in a
 * browser nobody was watching, so the only bug signal was a user describing a
 * symptom. This module gives crashes somewhere to go without committing the
 * app to a specific provider: point `NEXT_PUBLIC_ERROR_REPORT_URL` at a
 * collector (Sentry tunnel, a Cloud Function, anything that accepts JSON) and
 * reports start flowing. With no URL configured it stays a no-op beyond the
 * existing console output, so local and self-hosted runs are unaffected.
 *
 * What is deliberately NOT sent: item titles, note bodies, tags, file names,
 * form values, or anything else the user typed. A crash report carries the
 * error, where it happened, and how to reproduce the code path — never the
 * content the user was working on.
 */

const REPORT_URL = process.env.NEXT_PUBLIC_ERROR_REPORT_URL || '';

/** Cap a single session's reports so a render loop cannot flood the collector. */
const MAX_REPORTS_PER_SESSION = 25;
const DEDUPE_WINDOW_MS = 60_000;

export type ErrorSource =
  | 'react-error-boundary'
  | 'route-error'
  | 'window-error'
  | 'unhandled-rejection'
  | 'manual';

export interface ErrorReportContext {
  source: ErrorSource;
  /** Next.js server digest, when the crash came from a server component. */
  digest?: string;
  /** Component stack or other non-user-content detail. */
  componentStack?: string;
}

interface ErrorReport {
  name: string;
  message: string;
  stack?: string;
  source: ErrorSource;
  digest?: string;
  componentStack?: string;
  pathname: string;
  userAgent: string;
  releaseVersion: string;
  occurredAt: string;
}

const recentFingerprints = new Map<string, number>();
let reportsSent = 0;
let handlersInstalled = false;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unserializable error value.');
  }
}

/**
 * Identity of a crash for deduplication. The stack's first frame is enough to
 * separate distinct bugs without letting a varying message defeat the check.
 */
function fingerprint(error: Error, source: ErrorSource): string {
  const frame = (error.stack || '').split('\n')[1]?.trim() || '';
  return `${source}:${error.name}:${error.message}:${frame}`;
}

function shouldSend(error: Error, source: ErrorSource, now: number): boolean {
  if (reportsSent >= MAX_REPORTS_PER_SESSION) return false;
  const key = fingerprint(error, source);
  const previous = recentFingerprints.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  recentFingerprints.set(key, now);
  return true;
}

/**
 * Record a crash. Always logs; additionally delivers to the collector when one
 * is configured. Never throws — a failing reporter must not become the crash.
 */
export function reportError(value: unknown, context: ErrorReportContext): void {
  const error = toError(value);
  console.error(`[THREADMAP] ${context.source}:`, error);

  if (!REPORT_URL || typeof window === 'undefined') return;

  try {
    const now = Date.now();
    if (!shouldSend(error, context.source, now)) return;
    reportsSent += 1;

    const report: ErrorReport = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      source: context.source,
      digest: context.digest,
      componentStack: context.componentStack,
      // Path only. Query strings and hashes can carry identifiers.
      pathname: window.location.pathname,
      userAgent: navigator.userAgent,
      releaseVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      occurredAt: new Date(now).toISOString(),
    };

    const body = JSON.stringify(report);
    // sendBeacon survives the page teardown that often follows a hard crash.
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(REPORT_URL, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // A collector outage must stay silent; the console already has the error.
    });
  } catch {
    // Reporting is best-effort by definition.
  }
}

/**
 * Capture crashes that never reach a React boundary — async throws, listener
 * errors, and rejected promises. Safe to call more than once.
 */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined' || handlersInstalled) return () => {};
  handlersInstalled = true;

  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, { source: 'window-error' });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, { source: 'unhandled-rejection' });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    handlersInstalled = false;
  };
}
