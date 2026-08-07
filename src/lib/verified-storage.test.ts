import { describe, expect, it, vi } from 'vitest';
import { removeStorageVerified, writeStorageVerified } from './verified-storage';

describe('writeStorageVerified', () => {
  it('returns only after the exact value can be read back', () => {
    let stored: string | null = null;
    const storage = {
      setItem: (_key: string, value: string) => { stored = value; },
      getItem: () => stored,
    };
    expect(() => writeStorageVerified(storage, 'key', 'value')).not.toThrow();
  });

  it('throws when the browser silently drops a write', () => {
    const storage = {
      setItem: vi.fn(),
      getItem: () => null,
    };
    expect(() => writeStorageVerified(storage, 'key', 'value')).toThrow(
      'Browser storage write verification failed.'
    );
  });

  it('propagates quota failures', () => {
    const quotaError = new Error('quota');
    const storage = {
      setItem: () => { throw quotaError; },
      getItem: () => null,
    };
    expect(() => writeStorageVerified(storage, 'key', 'value')).toThrow(quotaError);
  });
});

describe('removeStorageVerified', () => {
  it('throws when a storage backend silently ignores a removal', () => {
    const storage = {
      removeItem: vi.fn(),
      getItem: vi.fn(() => 'still-present'),
    };

    expect(() => removeStorageVerified(storage, 'flight-session')).toThrow(
      'Browser storage removal verification failed.'
    );
  });

  it('returns only after the value is observably absent', () => {
    const storage = {
      removeItem: vi.fn(),
      getItem: vi.fn(() => null),
    };

    expect(() => removeStorageVerified(storage, 'flight-session')).not.toThrow();
    expect(storage.removeItem).toHaveBeenCalledWith('flight-session');
  });
});
