import type { StateStorage } from 'zustand/middleware';

const STORAGE_WARNING = 'Browser storage is full or unavailable. Your latest change was not saved; export data or free space before retrying.';

function reportStorageFailure(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
    detail: { message: STORAGE_WARNING },
  }));
}

export function writeStorageVerified(
  storage: Pick<Storage, 'setItem' | 'getItem'>,
  key: string,
  value: string
): void {
  try {
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) {
      throw new Error('Browser storage write verification failed.');
    }
  } catch (error) {
    reportStorageFailure();
    throw error;
  }
}

export function writeLocalStorageVerified(key: string, value: string): void {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!storage) {
    throw new Error('Browser storage is unavailable.');
  }
  writeStorageVerified(storage, key, value);
}

export function removeStorageVerified(
  storage: Pick<Storage, 'removeItem' | 'getItem'>,
  key: string,
): void {
  try {
    storage.removeItem(key);
    if (storage.getItem(key) !== null) {
      throw new Error('Browser storage removal verification failed.');
    }
  } catch (error) {
    reportStorageFailure();
    throw error;
  }
}

export function removeLocalStorageVerified(key: string): void {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!storage) {
    throw new Error('Browser storage is unavailable.');
  }
  removeStorageVerified(storage, key);
}

/** Zustand storage adapter that never reports success for a dropped write. */
export const verifiedLocalStateStorage: StateStorage = {
  getItem: (name) => typeof window === 'undefined' ? null : window.localStorage.getItem(name),
  setItem: (name, value) => writeLocalStorageVerified(name, value),
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    removeStorageVerified(window.localStorage, name);
  },
};
