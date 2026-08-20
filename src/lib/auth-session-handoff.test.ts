import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_DELETION_OUTCOME_KEY,
  clearAuthSessionHandoff,
  takeAuthSessionHandoff,
  writeAuthSessionHandoff,
} from './auth-session-handoff';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('auth teardown outcome handoff', () => {
  it('is one-shot when session storage is available', () => {
    const storage = memoryStorage();
    expect(writeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY, {
      status: 'pending',
      recordedAt: 123,
    }, storage)).toBe(true);
    expect(takeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY, storage))
      .toContain('pending');
    expect(takeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY, storage)).toBeNull();
  });

  it('turns a throwing sessionStorage write into a false result, not a teardown error', () => {
    const blocked = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(writeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY, {
      status: 'pending',
    }, blocked)).toBe(false);
  });

  it('guards redirect-marker removal when sessionStorage is blocked', () => {
    const blocked = {
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    expect(clearAuthSessionHandoff('redirect-marker', blocked)).toBe(false);
  });
});
