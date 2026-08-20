export const ACCOUNT_DELETION_OUTCOME_KEY = 'threadmapAccountDeletionOutcome';
export const ACCOUNT_SIGN_OUT_OUTCOME_KEY = 'threadmapSignOutOutcome';

type SessionHandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserSessionStorage(): SessionHandoffStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeAuthSessionHandoff(
  key: string,
  value: Record<string, unknown>,
  storage: SessionHandoffStorage | null = browserSessionStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearAuthSessionHandoff(
  key: string,
  storage: Pick<Storage, 'removeItem'> | null = browserSessionStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function takeAuthSessionHandoff(
  key: string,
  storage: SessionHandoffStorage | null = browserSessionStorage(),
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    if (value !== null) {
      try {
        storage.removeItem(key);
      } catch {
        // The value is scoped to this browser session and timestamp-validated
        // by its consumer, so a blocked removal cannot make it authoritative.
      }
    }
    return value;
  } catch {
    return null;
  }
}
