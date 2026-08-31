import { describe, expect, it } from 'vitest';
import {
  EMAIL_LINK_ADDRESS_KEY,
  EMAIL_LINK_CREATED_AT_KEY,
  EMAIL_LINK_STORAGE_TTL_MS,
  readPendingEmailLinkAddress,
  storePendingEmailLinkAddress,
} from './auth-email-link-storage';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('email-link address retention', () => {
  it('stores a raw address only with bounded creation metadata', () => {
    const storage = memoryStorage();
    storePendingEmailLinkAddress('person@example.com', storage, 1_000);

    expect(storage.getItem(EMAIL_LINK_ADDRESS_KEY)).toBe('person@example.com');
    expect(storage.getItem(EMAIL_LINK_CREATED_AT_KEY)).toBe('1000');
  });

  it('rolls the raw address back if expiry metadata cannot be stored', () => {
    const storage = memoryStorage();
    const blocked: Storage = {
      ...storage,
      get length() { return storage.length; },
      key: (index) => storage.key(index),
      getItem: (key) => storage.getItem(key),
      removeItem: (key) => storage.removeItem(key),
      setItem: (key, value) => {
        if (key === EMAIL_LINK_CREATED_AT_KEY) throw new Error('blocked');
        storage.setItem(key, value);
      },
    };

    expect(() => storePendingEmailLinkAddress('person@example.com', blocked, 1_000))
      .toThrow('blocked');
    expect(storage.getItem(EMAIL_LINK_ADDRESS_KEY)).toBeNull();
  });

  it('bounds legacy values from their first upgraded read', () => {
    const storage = memoryStorage({ [EMAIL_LINK_ADDRESS_KEY]: 'legacy@example.com' });

    expect(readPendingEmailLinkAddress(storage, 2_000)).toBe('legacy@example.com');
    expect(storage.getItem(EMAIL_LINK_CREATED_AT_KEY)).toBe('2000');
  });

  it('purges stale and implausibly future-dated addresses', () => {
    const stale = memoryStorage({
      [EMAIL_LINK_ADDRESS_KEY]: 'stale@example.com',
      [EMAIL_LINK_CREATED_AT_KEY]: '1000',
    });
    expect(readPendingEmailLinkAddress(stale, 1_000 + EMAIL_LINK_STORAGE_TTL_MS + 1))
      .toBeNull();
    expect(stale.getItem(EMAIL_LINK_ADDRESS_KEY)).toBeNull();

    const future = memoryStorage({
      [EMAIL_LINK_ADDRESS_KEY]: 'future@example.com',
      [EMAIL_LINK_CREATED_AT_KEY]: String(10 * 60_000),
    });
    expect(readPendingEmailLinkAddress(future, 1)).toBeNull();
    expect(future.getItem(EMAIL_LINK_CREATED_AT_KEY)).toBeNull();
  });
});
