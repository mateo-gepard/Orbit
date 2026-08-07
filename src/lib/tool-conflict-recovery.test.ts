import { describe, expect, it } from 'vitest';
import { listToolConflicts, preserveToolConflict } from './tool-conflict-recovery';

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
