import {
  removeLocalStorageVerified,
  removeStorageVerified,
  writeLocalStorageVerified,
  writeStorageVerified,
} from './verified-storage';

export const DEMO_USER_ID = 'demo-user';
export const SIGNED_OUT_STORAGE_SCOPE = 'signed-out';

type ScopedStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

const LEGACY_DEMO_STORAGE_KEYS = [
  'orbit-items',
  'orbit-user-settings',
  'orbit-settings',
  'orbit-tags',
  'orbit-flight-logs',
] as const;

function browserLocalStorage(): ScopedStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserSessionStorage(): ScopedStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function scopedStorageKey(baseKey: string, userId: string | null): string {
  return `${baseKey}:${encodeURIComponent(userId || SIGNED_OUT_STORAGE_SCOPE)}`;
}

/**
 * Legacy, unscoped browser data can only belong to the explicitly selected
 * local/demo profile. It must never be copied into a signed-in account.
 */
export function migrateLegacyStorageToDemo(
  baseKey: string,
  userId: string | null,
  storage: ScopedStorage | null = browserLocalStorage(),
): void {
  if (!storage || userId !== DEMO_USER_ID) return;

  const scopedKey = scopedStorageKey(baseKey, userId);
  const legacy = storage.getItem(baseKey);
  if (legacy === null) return;

  const scoped = storage.getItem(scopedKey);
  if (scoped === null) {
    // The source is removed only after the same-base scoped copy has been read
    // back successfully. If quota/browser policy rejects the copy, the legacy
    // value remains available for a later recovery attempt.
    writeStorageVerified(storage, scopedKey, legacy);
  } else if (scoped !== legacy) {
    // Never overwrite a newer scoped workspace or discard a conflicting
    // legacy value. The user can still export/recover it explicitly.
    return;
  }
  removeStorageVerified(storage, baseKey);
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
    window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
      detail: {
        message: 'A damaged local cache was preserved for recovery and safely reset. Cloud data was not changed.',
      },
    }));
    return { key, hasPersistedState: false };
  }
}

export interface AdoptableScopedEntry {
  /** The unscoped base key, e.g. `orbit-abitur`. */
  baseKey: string;
  /** Bytes held under the signed-out scope. */
  size: number;
}

/**
 * Work done before signing in, that the account cannot currently see.
 *
 * Storage is scoped per account and the pre-auth scope is literally
 * `signed-out`, so filling in the Abitur tracker before creating an account
 * left the data sitting in the browser untouched and unreachable — there was a
 * legacy → demo migration but nothing that carried `signed-out` into a real
 * account, and nothing that surfaced it.
 *
 * Only entries the account has no value for are listed: adopting must never
 * overwrite real account data, least of all on a shared computer.
 */
export function listAdoptableSignedOutData(
  userId: string,
  storage: ScopedStorage | null = browserLocalStorage(),
): AdoptableScopedEntry[] {
  if (!storage || !userId || userId === SIGNED_OUT_STORAGE_SCOPE) return [];

  const sourceSuffix = `:${encodeURIComponent(SIGNED_OUT_STORAGE_SCOPE)}`;
  const entries: AdoptableScopedEntry[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.endsWith(sourceSuffix)) continue;

    const baseKey = key.slice(0, -sourceSuffix.length);
    if (!baseKey) continue;

    const value = storage.getItem(key);
    if (value === null || value === '') continue;

    // Already has account data for this key — leave both alone.
    if (storage.getItem(scopedStorageKey(baseKey, userId)) !== null) continue;

    entries.push({ baseKey, size: value.length });
  }

  return entries.sort((a, b) => b.size - a.size);
}

/**
 * Move pre-sign-in data into an account. Returns the base keys adopted.
 *
 * Deliberately not automatic: it runs only when the user says yes.
 */
export function adoptSignedOutData(
  userId: string,
  storage: ScopedStorage | null = browserLocalStorage(),
): string[] {
  if (!storage) return [];
  const adopted: string[] = [];

  for (const { baseKey } of listAdoptableSignedOutData(userId, storage)) {
    const sourceKey = scopedStorageKey(baseKey, SIGNED_OUT_STORAGE_SCOPE);
    const value = storage.getItem(sourceKey);
    if (value === null) continue;
    try {
      storage.setItem(scopedStorageKey(baseKey, userId), value);
      // Only drop the source once the copy is verifiably in place.
      if (storage.getItem(scopedStorageKey(baseKey, userId)) === value) {
        storage.removeItem(sourceKey);
        adopted.push(baseKey);
      }
    } catch {
      // Out of quota: the source stays put, so nothing is lost.
    }
  }

  return adopted;
}

/** Forget pre-sign-in data without adopting it. */
export function discardSignedOutData(
  storage: ScopedStorage | null = browserLocalStorage(),
): number {
  if (!storage) return 0;
  const sourceSuffix = `:${encodeURIComponent(SIGNED_OUT_STORAGE_SCOPE)}`;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.endsWith(sourceSuffix)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
  return keys.length;
}

export function clearScopedBrowserData(
  userId: string,
  localStorage: ScopedStorage | null = browserLocalStorage(),
  sessionStorage: ScopedStorage | null = browserSessionStorage(),
): void {
  const suffix = `:${encodeURIComponent(userId)}`;
  for (let index = (localStorage?.length ?? 0) - 1; index >= 0; index -= 1) {
    const key = localStorage?.key(index);
    if (key?.endsWith(suffix)) {
      localStorage?.removeItem(key);
    }
  }
  for (let index = (sessionStorage?.length ?? 0) - 1; index >= 0; index -= 1) {
    const key = sessionStorage?.key(index);
    if (key?.endsWith(suffix)) {
      sessionStorage?.removeItem(key);
    }
  }

  // Old local-mode builds stored personal data without an owner suffix. Only
  // the demo profile may claim those values, so forgetting that profile also
  // removes any source keys that could not yet be migrated.
  if (userId === DEMO_USER_ID && localStorage) {
    for (const key of LEGACY_DEMO_STORAGE_KEYS) localStorage.removeItem(key);
  }
}
