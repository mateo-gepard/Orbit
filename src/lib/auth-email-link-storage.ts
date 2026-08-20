export const EMAIL_LINK_ADDRESS_KEY = 'orbitEmailForSignIn';
export const EMAIL_LINK_CREATED_AT_KEY = 'orbitEmailForSignInCreatedAt';
export const EMAIL_LINK_STORAGE_TTL_MS = 60 * 60_000;

type EmailLinkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): EmailLinkStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearPendingEmailLinkAddress(
  storage: EmailLinkStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(EMAIL_LINK_ADDRESS_KEY);
    storage.removeItem(EMAIL_LINK_CREATED_AT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function storePendingEmailLinkAddress(
  email: string,
  storage: EmailLinkStorage | null = browserStorage(),
  now = Date.now(),
): void {
  if (!storage) throw new Error('Browser storage is unavailable.');
  // Never retain a raw address without the expiry metadata that bounds it. If
  // the second write is blocked, roll the address back instead of creating an
  // indefinite privacy leak.
  storage.setItem(EMAIL_LINK_ADDRESS_KEY, email);
  try {
    storage.setItem(EMAIL_LINK_CREATED_AT_KEY, String(now));
  } catch (error) {
    storage.removeItem(EMAIL_LINK_ADDRESS_KEY);
    throw error;
  }
}

export function readPendingEmailLinkAddress(
  storage: EmailLinkStorage | null = browserStorage(),
  now = Date.now(),
): string | null {
  if (!storage) return null;
  try {
    const email = storage.getItem(EMAIL_LINK_ADDRESS_KEY);
    if (!email) {
      storage.removeItem(EMAIL_LINK_CREATED_AT_KEY);
      return null;
    }

    let createdAt = Number(storage.getItem(EMAIL_LINK_CREATED_AT_KEY) || 0);
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      // One-time migration for links requested by an older build. Their age is
      // unknowable, so bound retention from the first upgraded load.
      createdAt = now;
      storage.setItem(EMAIL_LINK_CREATED_AT_KEY, String(createdAt));
    }
    if (createdAt > now + 5 * 60_000 || now - createdAt > EMAIL_LINK_STORAGE_TTL_MS) {
      clearPendingEmailLinkAddress(storage);
      return null;
    }
    return email;
  } catch {
    // A blocked read cannot expose the value to this process; best-effort
    // removal avoids retaining it if only one operation was denied.
    clearPendingEmailLinkAddress(storage);
    return null;
  }
}
