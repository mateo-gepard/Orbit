import { removeLocalStorageVerified, writeLocalStorageVerified } from './verified-storage';
import { DEVICE_SCOPE, reportSyncWarning } from './sync-warning';

export const DEMO_USER_ID = 'demo-user';
export const SIGNED_OUT_STORAGE_SCOPE = 'signed-out';

export function scopedStorageKey(baseKey: string, userId: string | null): string {
  return `${baseKey}:${encodeURIComponent(userId || SIGNED_OUT_STORAGE_SCOPE)}`;
}

/**
 * Legacy, unscoped browser data can only belong to the explicitly selected
 * local/demo profile. It must never be copied into a signed-in account.
 */
export function migrateLegacyStorageToDemo(baseKey: string, userId: string | null): void {
  if (typeof window === 'undefined' || userId !== DEMO_USER_ID) return;

  const scopedKey = scopedStorageKey(baseKey, userId);
  if (window.localStorage.getItem(scopedKey) !== null) return;

  const legacy = window.localStorage.getItem(baseKey);
  if (legacy !== null) {
    writeLocalStorageVerified(scopedKey, legacy);
  }
}

export interface ScopedStoragePreparation {
  key: string;
  hasPersistedState: boolean;
}

/**
 * Selects an account-scoped Zustand envelope without ever overwriting it first.
 * A corrupt envelope is retained under an account-scoped recovery key before
 * the unusable primary value is removed.
 */
export function prepareScopedStorage(
  baseKey: string,
  userId: string | null
): ScopedStoragePreparation {
  migrateLegacyStorageToDemo(baseKey, userId);
  const key = scopedStorageKey(baseKey, userId);
  if (typeof window === 'undefined') return { key, hasPersistedState: false };

  const raw = window.localStorage.getItem(key);
  if (raw === null) return { key, hasPersistedState: false };
  try {
    const envelope = JSON.parse(raw) as { state?: unknown } | null;
    if (!envelope || typeof envelope !== 'object' || !('state' in envelope)) {
      throw new Error('Persisted state is not a Zustand envelope.');
    }
    return { key, hasPersistedState: true };
  } catch {
    const accountSuffix = encodeURIComponent(userId || SIGNED_OUT_STORAGE_SCOPE);
    const recoveryKey = `${baseKey}:corrupt-${Date.now()}:${accountSuffix}`;
    writeLocalStorageVerified(recoveryKey, raw);
    removeLocalStorageVerified(key);
    reportSyncWarning({
      key: 'device:cache-reset',
      userId: userId || DEVICE_SCOPE,
      message: 'A damaged local cache was preserved for recovery and safely reset. Cloud data was not changed.',
    });
    return { key, hasPersistedState: false };
  }
}

export function clearScopedBrowserData(userId: string): void {
  if (typeof window === 'undefined') return;
  const suffix = `:${encodeURIComponent(userId)}`;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.endsWith(suffix)) {
      window.localStorage.removeItem(key);
    }
  }
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.endsWith(suffix)) {
      window.sessionStorage.removeItem(key);
    }
  }
}
