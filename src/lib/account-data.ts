'use client';

import { httpsCallable } from 'firebase/functions';
import { clearFirestorePersistence, cloudFunctions } from './firebase';
import { clearScopedBrowserData } from './account-storage';
import { boundFlightHistory } from './flight-retention';
import type { ProjectFile } from './types';
import type { MfaRecoveryCodeStatus } from './mfa';

export interface AccountExportAttachment extends Partial<ProjectFile> {
  id: string;
  itemId: string;
  name: string;
  size: number;
  type: string;
  storagePath: string;
  downloadUrl?: string;
  downloadUrlExpiresAt?: number;
  downloadUnavailable?: string;
  missingFromStorage?: boolean;
}

export interface AccountExport {
  exportedAt: string;
  user: Record<string, unknown> | null;
  items: unknown[];
  toolData: unknown[];
  settings: Record<string, unknown> | null;
  analytics: unknown[];
  flightLogs: unknown[];
  files: AccountExportAttachment[];
  connections: unknown[];
  integrations?: {
    mcpAuthorizations: Array<{
      clientId: string;
      clientName: string;
      status: 'active' | 'revoked';
      authorizedAt: number | null;
      lastAuthorizedAt: number | null;
      expiresAt: number | null;
      scopes: string[];
    }>;
  };
  nudges: unknown[];
  pushDevices?: unknown[];
  security?: {
    mfaEnrolled: boolean;
    recoveryCodes: MfaRecoveryCodeStatus | null;
    auditEvents?: Array<{
      source: 'mfa' | 'mcp';
      event: string;
      createdAt: number | null;
      expiresAt: number | null;
      clientId?: string | null;
      tool?: string | null;
      kind?: string | null;
      success?: boolean;
      resultCode?: string | null;
      durationMs?: number | null;
      requestId?: string | null;
      targetIds?: string[];
      changedFields?: string[];
    }>;
  };
  localData?: Record<string, unknown>;
}

export interface AccountDeletionResult {
  /** False means the server response was ambiguous, never that deletion failed. */
  success: boolean;
  pending: boolean;
  status: 'pending' | 'completed' | 'unknown';
  completedAt?: number;
  /** False means some account-scoped browser data, handoff state, or Firestore cache could not be removed immediately. */
  localCleanupComplete: boolean;
}

/**
 * Remove the current account's browser-scoped recovery data and Firestore's
 * cross-session cache. A false result means the durable persistence block is
 * still active, so later loads remain memory-only even if IndexedDB could not
 * be removed immediately (for example because another tab still owns it).
 */
export async function forgetAccountDataOnDevice(userId: string | null): Promise<boolean> {
  let scopedCleanupComplete = true;
  if (userId) {
    try {
      clearScopedBrowserData(userId);
    } catch (error) {
      scopedCleanupComplete = false;
      console.warn('[THREADMAP] Account-scoped browser cleanup was blocked:', error);
    }
  }
  let firestoreCleanupComplete = false;
  try {
    firestoreCleanupComplete = await clearFirestorePersistence();
  } catch (error) {
    // Secure account/auth teardown must continue even if a browser throws from
    // storage APIs before Firestore can report its normal false result.
    console.warn('[THREADMAP] Firestore device-cache cleanup was blocked:', error);
  }
  return scopedCleanupComplete && firestoreCleanupComplete;
}

function readScopedBrowserData(userId: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (typeof window === 'undefined') return result;
  const suffix = `:${encodeURIComponent(userId)}`;
  const exportablePrefixes = [
    'orbit-items:',
    'orbit-user-settings:',
    'orbit-tool-',
    'orbit-tags:',
    'orbit-settings:',
    'orbit-toolbox:',
    'orbit-wishlist:',
    'orbit-flight-logs:',
    'orbit-flight-pending:',
    'orbit-flight-session:',
    'orbit-abitur:',
    'orbit-analytics:',
    'orbit-item-mutation:',
    'orbit-item-detail-draft:',
    'orbit-note-draft:',
    'orbit-tool-conflict:',
    'threadmap-briefing-journal:',
    'threadmap-dispatch-plan:',
  ];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.endsWith(suffix)) continue;
    // Export durable user content only. Push subscriptions, FCM tokens,
    // OAuth credentials, and transient handoffs are intentionally excluded.
    if (!exportablePrefixes.some((prefix) => key.startsWith(prefix))) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw);
      result[key] = key.startsWith('orbit-flight-logs:')
        ? boundFlightHistory(parsed)
        : parsed;
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

export async function exportAccountData(userId: string, localOnly: boolean): Promise<AccountExport> {
  if (localOnly) {
    return {
      exportedAt: new Date().toISOString(),
      user: null,
      items: [],
      toolData: [],
      settings: null,
      analytics: [],
      flightLogs: [],
      files: [],
      connections: [],
      nudges: [],
      localData: readScopedBrowserData(userId),
    };
  }
  if (!cloudFunctions) throw new Error('Cloud account export is unavailable.');
  const callable = httpsCallable<{ userId: string }, AccountExport>(
    cloudFunctions,
    'exportThreadmapAccount'
  );
  const result = await callable({ userId });
  if (result.data.user?.uid !== userId) {
    throw new Error('The signed-in account changed while the export was being prepared.');
  }
  return {
    ...result.data,
    // Cloud is authoritative, but an account export is also a recovery
    // snapshot. Include this device's verified account-scoped caches so
    // deferred/offline writes are never silently omitted from the download.
    localData: readScopedBrowserData(userId),
  };
}

export async function deleteAccountData(
  userId: string,
  localOnly: boolean,
  options: { deferLocalCleanup?: boolean } = {},
): Promise<AccountDeletionResult> {
  if (localOnly) {
    let localCleanupComplete = true;
    if (!options.deferLocalCleanup) {
      try {
        clearScopedBrowserData(userId);
      } catch (error) {
        localCleanupComplete = false;
        console.warn('[THREADMAP] Local account cleanup was blocked:', error);
      }
    }
    return {
      success: true,
      pending: false,
      status: 'completed',
      completedAt: Date.now(),
      localCleanupComplete,
    };
  }
  if (!cloudFunctions) throw new Error('Cloud account deletion is unavailable.');
  const callable = httpsCallable<
    { userId: string },
    { success: boolean; pending: boolean; status?: 'pending' | 'completed'; completedAt?: number }
  >(
    cloudFunctions,
    'deleteThreadmapAccount'
  );
  const result = await callable({ userId });
  if (!result.data.success) throw new Error('Account deletion was not accepted.');
  // The irreversible server workflow was accepted. Blocked browser storage
  // must not prevent auth/token teardown or make the request look unaccepted.
  const localCleanupComplete = options.deferLocalCleanup
    ? true
    : await forgetAccountDataOnDevice(userId);
  const pending = result.data.pending === true;
  return {
    success: true,
    pending,
    status: pending ? 'pending' : 'completed',
    ...(typeof result.data.completedAt === 'number'
      ? { completedAt: result.data.completedAt }
      : {}),
    localCleanupComplete,
  };
}
