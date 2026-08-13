import { beforeEach, describe, expect, it } from 'vitest';

// `firestore.ts` reads and writes browser storage as it goes.
const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
};

const { vi } = await import('vitest');
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: globalThis.localStorage }));

const {
  sanitizeItem,
  setFirestoreDataContext,
  isFirestoreDataContextCurrent,
} = await import('./firestore');

import type { ThreadmapItem } from './types';

function raw(overrides: Record<string, unknown> = {}): ThreadmapItem {
  return {
    id: 'i1',
    title: 'Task',
    type: 'task',
    status: 'active',
    createdAt: 10,
    updatedAt: 20,
    userId: 'u1',
    ...overrides,
  } as ThreadmapItem;
}

/**
 * The account-generation guard.
 *
 * This is what stops an async Firestore or Google operation that settles after
 * an account switch from writing under the wrong identity. `firestore.ts` had
 * no unit tests at all, and this is its sharpest edge.
 */
describe('firestore data context', () => {
  beforeEach(() => setFirestoreDataContext(null, 'signed-out'));

  it('recognises the account it was just bound to', () => {
    setFirestoreDataContext('u1', 'cloud');
    // The generation is opaque, so probe it the way callers do.
    const generations = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const current = generations.filter((g) => isFirestoreDataContextCurrent('u1', g));
    expect(current).toHaveLength(1);
  });

  it('invalidates a captured generation when the account switches', () => {
    setFirestoreDataContext('u1', 'cloud');
    const generation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .find((g) => isFirestoreDataContextCurrent('u1', g))!;

    setFirestoreDataContext('u2', 'cloud');
    expect(isFirestoreDataContextCurrent('u1', generation)).toBe(false);
  });

  it('invalidates when only the mode changes', () => {
    setFirestoreDataContext('u1', 'cloud');
    const generation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .find((g) => isFirestoreDataContextCurrent('u1', g))!;

    setFirestoreDataContext('u1', 'local');
    expect(isFirestoreDataContextCurrent('u1', generation)).toBe(false);
  });

  it('does not bump the generation when nothing changed', () => {
    setFirestoreDataContext('u1', 'cloud');
    const generation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .find((g) => isFirestoreDataContextCurrent('u1', g))!;

    setFirestoreDataContext('u1', 'cloud');
    expect(isFirestoreDataContextCurrent('u1', generation)).toBe(true);
  });

  it('never reports a different account as current', () => {
    setFirestoreDataContext('u1', 'cloud');
    const generation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .find((g) => isFirestoreDataContextCurrent('u1', g))!;
    expect(isFirestoreDataContextCurrent('u2', generation)).toBe(false);
  });
});

describe('sanitizeItem', () => {
  it('preserves fields it does not know about', () => {
    const result = sanitizeItem(raw({ somethingNew: 'keep me', recurrence: { freq: 'daily', interval: 1 } }));
    expect(result).toMatchObject({ somethingNew: 'keep me' });
    expect(result.recurrence).toEqual({ freq: 'daily', interval: 1 });
  });

  it('drops undefined values rather than writing them', () => {
    expect(Object.keys(sanitizeItem(raw({ dueDate: undefined })))).not.toContain('dueDate');
  });

  it('defaults an empty title', () => {
    expect(sanitizeItem(raw({ title: '   ' })).title).toBe('Untitled');
  });

  it('trims a title', () => {
    expect(sanitizeItem(raw({ title: '  Groceries  ' })).title).toBe('Groceries');
  });

  it('falls back to a valid type and status', () => {
    const result = sanitizeItem(raw({ type: 'nonsense', status: 'nonsense' }));
    expect(result.type).toBe('task');
    expect(result.status).toBe('active');
  });

  it('migrates the legacy inbox status', () => {
    expect(sanitizeItem(raw({ status: 'inbox' })).status).toBe('active');
  });

  it('keeps every real status', () => {
    for (const status of ['active', 'waiting', 'done', 'archived'] as const) {
      expect(sanitizeItem(raw({ status })).status).toBe(status);
    }
  });

  it('repairs non-numeric timestamps', () => {
    const result = sanitizeItem(raw({ createdAt: 'yesterday', updatedAt: null }));
    expect(typeof result.createdAt).toBe('number');
    expect(typeof result.updatedAt).toBe('number');
  });

  it('normalises a malformed revision to zero', () => {
    expect(sanitizeItem(raw({ revision: -4 })).revision).toBe(0);
    expect(sanitizeItem(raw({ revision: 1.5 })).revision).toBe(0);
    expect(sanitizeItem(raw({ revision: 7 })).revision).toBe(7);
  });

  it('coerces tags and links to arrays', () => {
    const result = sanitizeItem(raw({ tags: 'uni', linkedIds: null }));
    expect(result.tags).toEqual([]);
    expect(result.linkedIds).toEqual([]);
  });

  it('gives an item without an id a new one', () => {
    expect(sanitizeItem(raw({ id: '' })).id).toBeTruthy();
  });
});
