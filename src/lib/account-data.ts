'use client';

import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
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
  nudges: unknown[];
  pushDevices?: unknown[];
  security?: {
    mfaEnrolled: boolean;
    recoveryCodes: MfaRecoveryCodeStatus | null;
  };
  localData?: Record<string, unknown>;
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

export async function deleteAccountData(userId: string, localOnly: boolean): Promise<void> {
  if (localOnly) {
    clearScopedBrowserData(userId);
    return;
  }
  if (!cloudFunctions) throw new Error('Cloud account deletion is unavailable.');
  const callable = httpsCallable<{ userId: string }, { success: boolean }>(
    cloudFunctions,
    'deleteThreadmapAccount'
  );
  const result = await callable({ userId });
  if (!result.data.success) throw new Error('Account deletion did not complete.');
  try {
    clearScopedBrowserData(userId);
  } catch (error) {
    // The irreversible server deletion succeeded. Blocked browser storage must
    // not prevent auth/token teardown or make the operation look unsuccessful.
    console.warn('[THREADMAP] Account deleted, but local cache cleanup was blocked:', error);
  }
}
