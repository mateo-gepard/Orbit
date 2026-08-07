import { describe, expect, it } from 'vitest';
import {
  clearToolConflicts,
  countToolConflicts,
  exportToolConflicts,
  listToolConflicts,
  preserveToolConflict,
  removeToolConflict,
} from './tool-conflict-recovery';

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

describe('tool conflict recovery', () => {
  it('preserves both local and cloud payloads per account', () => {
    const storage = memoryStorage();
    preserveToolConflict({
      userId: 'user-a',
      toolId: 'wishlist',
      baseRevision: 2,
      serverRevision: 3,
      localData: { items: [{ id: 'local' }] },
      cloudData: { items: [{ id: 'cloud' }] },
    }, storage);
    preserveToolConflict({
      userId: 'user-b',
      toolId: 'wishlist',
      baseRevision: 1,
      serverRevision: 2,
      localData: { items: [] },
      cloudData: { items: [] },
    }, storage);

    expect(listToolConflicts('user-a', storage)).toMatchObject([{
      toolId: 'wishlist',
      baseRevision: 2,
      serverRevision: 3,
      localData: { items: [{ id: 'local' }] },
      cloudData: { items: [{ id: 'cloud' }] },
    }]);
    expect(listToolConflicts('user-b', storage)).toHaveLength(1);
  });

  it('deduplicates the same unresolved payload', () => {
    const storage = memoryStorage();
    const input = {
      userId: 'user-a',
      toolId: 'settings',
      baseRevision: 4,
      serverRevision: 5,
      localData: { language: 'de' },
      cloudData: { language: 'en' },
    };
    preserveToolConflict(input, storage);
    preserveToolConflict(input, storage);
    expect(listToolConflicts('user-a', storage)).toHaveLength(1);
  });
});

describe('resolving a preserved conflict (F-20)', () => {
  const input = (overrides: { userId?: string; toolId?: string; serverRevision?: number } = {}) => ({
    userId: 'user-a',
    toolId: 'wishlist',
    baseRevision: 1,
    serverRevision: 2,
    localData: { items: [{ id: 'local' }] },
    cloudData: null,
    ...overrides,
  });

  it('removes a single record by id', () => {
    const storage = memoryStorage();
    const record = preserveToolConflict(input(), storage);
    preserveToolConflict(input({ toolId: 'abitur' }), storage);

    expect(removeToolConflict('user-a', record.id, storage)).toBe(true);
    expect(listToolConflicts('user-a', storage).map((c) => c.toolId)).toEqual(['abitur']);
  });

  it('reports when there is nothing to remove', () => {
    const storage = memoryStorage();
    expect(removeToolConflict('user-a', 'missing', storage)).toBe(false);
  });

  it('will not remove another account\'s record', () => {
    const storage = memoryStorage();
    const record = preserveToolConflict(input({ userId: 'user-b' }), storage);
    expect(removeToolConflict('user-a', record.id, storage)).toBe(false);
    expect(listToolConflicts('user-b', storage)).toHaveLength(1);
  });

  it('clears every record for one account only', () => {
    const storage = memoryStorage();
    preserveToolConflict(input(), storage);
    preserveToolConflict(input({ toolId: 'abitur' }), storage);
    preserveToolConflict(input({ userId: 'user-b' }), storage);

    expect(clearToolConflicts('user-a', storage)).toBe(2);
    expect(countToolConflicts('user-a', storage)).toBe(0);
    expect(countToolConflicts('user-b', storage)).toBe(1);
  });

  it('frees room under the cap once records are cleared', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 30; i += 1) {
      preserveToolConflict(input({ serverRevision: i + 2 }), storage);
    }
    expect(() => preserveToolConflict(input({ serverRevision: 99 }), storage)).toThrow();

    clearToolConflicts('user-a', storage);
    expect(() => preserveToolConflict(input({ serverRevision: 99 }), storage)).not.toThrow();
  });

  it('exports what it preserved', () => {
    const storage = memoryStorage();
    preserveToolConflict(input(), storage);
    const dump = exportToolConflicts('user-a', storage);
    expect(dump).toMatchObject({ version: 1, userId: 'user-a' });
    expect(dump.conflicts).toHaveLength(1);
    expect(dump.conflicts[0].localData).toEqual({ items: [{ id: 'local' }] });
  });
});
