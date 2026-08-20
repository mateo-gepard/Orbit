import { describe, expect, it } from 'vitest';
import {
  adoptSignedOutData,
  clearScopedBrowserData,
  discardSignedOutData,
  listAdoptableSignedOutData,
  migrateLegacyStorageToDemo,
  scopedStorageKey,
} from './account-storage';

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

describe('listAdoptableSignedOutData', () => {
  it('finds work done before signing in (F-22)', () => {
    const storage = memoryStorage({
      'orbit-abitur:signed-out': '{"state":{"profile":{}}}',
      'orbit-tags:signed-out': '["uni"]',
    });

    expect(listAdoptableSignedOutData('user-a', storage)).toEqual([
      { baseKey: 'orbit-abitur', size: 24 },
      { baseKey: 'orbit-tags', size: 7 },
    ]);
  });

  it('never offers to overwrite data the account already has', () => {
    const storage = memoryStorage({
      'orbit-abitur:signed-out': '{"state":{}}',
      'orbit-abitur:user-a': '{"state":{"real":true}}',
      'orbit-tags:signed-out': '["uni"]',
    });

    expect(listAdoptableSignedOutData('user-a', storage).map((e) => e.baseKey))
      .toEqual(['orbit-tags']);
  });

  it('ignores other accounts and empty values', () => {
    const storage = memoryStorage({
      'orbit-abitur:user-b': '{"state":{}}',
      'orbit-tags:signed-out': '',
    });
    expect(listAdoptableSignedOutData('user-a', storage)).toEqual([]);
  });

  it('refuses to run for the signed-out scope itself', () => {
    const storage = memoryStorage({ 'orbit-tags:signed-out': '["uni"]' });
    expect(listAdoptableSignedOutData('signed-out', storage)).toEqual([]);
    expect(listAdoptableSignedOutData('', storage)).toEqual([]);
  });
});

describe('adoptSignedOutData', () => {
  it('moves the data into the account and clears the source', () => {
    const storage = memoryStorage({
      'orbit-abitur:signed-out': '{"state":{"profile":1}}',
    });

    expect(adoptSignedOutData('user-a', storage)).toEqual(['orbit-abitur']);
    expect(storage.getItem(scopedStorageKey('orbit-abitur', 'user-a')))
      .toBe('{"state":{"profile":1}}');
    expect(storage.getItem('orbit-abitur:signed-out')).toBeNull();
  });

  it('leaves existing account data untouched', () => {
    const storage = memoryStorage({
      'orbit-abitur:signed-out': '{"state":{"draft":true}}',
      'orbit-abitur:user-a': '{"state":{"real":true}}',
    });

    expect(adoptSignedOutData('user-a', storage)).toEqual([]);
    expect(storage.getItem('orbit-abitur:user-a')).toBe('{"state":{"real":true}}');
    expect(storage.getItem('orbit-abitur:signed-out')).toBe('{"state":{"draft":true}}');
  });

  it('keeps the source when the copy cannot be written', () => {
    const base = memoryStorage({ 'orbit-abitur:signed-out': '{"state":{}}' });
    const readOnly: Storage = {
      ...base,
      get length() { return base.length; },
      key: (index) => base.key(index),
      getItem: (key) => base.getItem(key),
      removeItem: (key) => base.removeItem(key),
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };

    expect(adoptSignedOutData('user-a', readOnly)).toEqual([]);
    expect(base.getItem('orbit-abitur:signed-out')).toBe('{"state":{}}');
  });

  it('does nothing when there is nothing to adopt', () => {
    expect(adoptSignedOutData('user-a', memoryStorage())).toEqual([]);
  });
});

describe('discardSignedOutData', () => {
  it('removes every signed-out key and nothing else', () => {
    const storage = memoryStorage({
      'orbit-abitur:signed-out': 'a',
      'orbit-tags:signed-out': 'b',
      'orbit-tags:user-a': 'keep',
    });

    expect(discardSignedOutData(storage)).toBe(2);
    expect(storage.getItem('orbit-tags:user-a')).toBe('keep');
    expect(storage.length).toBe(1);
  });
});

describe('legacy local-mode privacy', () => {
  it('removes an unscoped source only after its same-base scoped copy verifies', () => {
    const storage = memoryStorage({ 'orbit-items': '{"state":{"items":[1]}}' });

    migrateLegacyStorageToDemo('orbit-items', 'demo-user', storage);

    expect(storage.getItem('orbit-items:demo-user')).toBe('{"state":{"items":[1]}}');
    expect(storage.getItem('orbit-items')).toBeNull();
  });

  it('preserves the source when the scoped write is rejected', () => {
    const base = memoryStorage({ 'orbit-items': '{"state":{"items":[1]}}' });
    const blocked: Storage = {
      ...base,
      get length() { return base.length; },
      key: (index) => base.key(index),
      getItem: (key) => base.getItem(key),
      removeItem: (key) => base.removeItem(key),
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };

    expect(() => migrateLegacyStorageToDemo('orbit-items', 'demo-user', blocked))
      .toThrow('quota');
    expect(base.getItem('orbit-items')).toBe('{"state":{"items":[1]}}');
    expect(base.getItem('orbit-items:demo-user')).toBeNull();
  });

  it('does not discard a conflicting legacy value when scoped data already exists', () => {
    const storage = memoryStorage({
      'orbit-settings': 'legacy',
      'orbit-settings:demo-user': 'newer',
    });

    migrateLegacyStorageToDemo('orbit-settings', 'demo-user', storage);

    expect(storage.getItem('orbit-settings')).toBe('legacy');
    expect(storage.getItem('orbit-settings:demo-user')).toBe('newer');
  });

  it('forgets scoped local/session values and remaining demo-only legacy sources', () => {
    const local = memoryStorage({
      'orbit-items:demo-user': 'private',
      'orbit-habit-reminders-fired:demo-user': '{"date":"2026-08-07","ids":["habit-one"]}',
      'orbit-items:user-b': 'keep',
      'orbit-items': 'legacy-private',
      'unrelated': 'keep',
    });
    const session = memoryStorage({
      'orbit-google-token:demo-user': 'private-token',
      'orbit-google-token:user-b': 'keep',
    });

    clearScopedBrowserData('demo-user', local, session);

    expect(local.getItem('orbit-items:demo-user')).toBeNull();
    expect(local.getItem('orbit-habit-reminders-fired:demo-user')).toBeNull();
    expect(local.getItem('orbit-items')).toBeNull();
    expect(session.getItem('orbit-google-token:demo-user')).toBeNull();
    expect(local.getItem('orbit-items:user-b')).toBe('keep');
    expect(session.getItem('orbit-google-token:user-b')).toBe('keep');
    expect(local.getItem('unrelated')).toBe('keep');
  });
});
