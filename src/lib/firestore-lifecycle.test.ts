import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  snapshotCallbacks: [] as Array<(snapshot: unknown) => void>,
  onSnapshot: vi.fn((...args: unknown[]) => {
    firestoreMocks.snapshotCallbacks.push(args.at(-2) as (snapshot: unknown) => void);
    return vi.fn();
  }),
  runTransaction: vi.fn(),
}));

const functionMocks = vi.hoisted(() => ({
  callable: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  arrayRemove: (...values: unknown[]) => ({ arrayRemove: values }),
  arrayUnion: (...values: unknown[]) => ({ arrayUnion: values }),
  collection: (_database: unknown, name: string) => ({ path: name }),
  deleteField: () => ({ deleteField: true }),
  doc: (_database: unknown, ...parts: string[]) => ({ id: parts.at(-1), path: parts.join('/') }),
  getDoc: vi.fn(),
  limit: (count: number) => ({ count }),
  onSnapshot: firestoreMocks.onSnapshot,
  orderBy: (field: string, direction?: string) => ({ field, direction }),
  query: (...parts: unknown[]) => ({ parts }),
  runTransaction: firestoreMocks.runTransaction,
  setDoc: vi.fn(),
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => functionMocks.callable }));
vi.mock('./firebase', () => ({
  cloudFunctions: { region: 'test' },
  db: { project: 'test' },
}));

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { localStorage: globalThis.localStorage }),
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true },
});

const {
  deleteItem,
  setFirestoreDataContext,
  subscribeToToolData,
  subscribeToUserSettings,
} = await import('./firestore');
const { useOrbitStore } = await import('./store');

beforeEach(() => {
  firestoreMocks.snapshotCallbacks.length = 0;
  firestoreMocks.onSnapshot.mockClear();
  firestoreMocks.runTransaction.mockClear();
  functionMocks.callable.mockReset();
  localStorage.clear();
  setFirestoreDataContext(null, 'signed-out');
  setFirestoreDataContext('owner-user', 'cloud');
});

const missingServerSnapshot = {
  exists: () => false,
  metadata: { fromCache: false, hasPendingWrites: false },
};

describe('Firestore subscription lifecycle cancellation', () => {
  it('does not recreate the item mirror when a delete rollback settles after forget', async () => {
    let rejectDelete!: (error: Error) => void;
    const deleteGate = new Promise<never>((_resolve, reject) => { rejectDelete = reject; });
    functionMocks.callable.mockReturnValueOnce(deleteGate);
    useOrbitStore.getState().setItems([{
      id: 'private-item',
      title: 'Private',
      type: 'task',
      status: 'active',
      createdAt: 1,
      updatedAt: 2,
      revision: 1,
      userId: 'owner-user',
      tags: [],
      linkedIds: [],
    }]);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const pendingDelete = deleteItem('private-item');
    expect(functionMocks.callable).toHaveBeenCalledTimes(1);
    setFirestoreDataContext(null, 'signed-out');
    localStorage.clear();
    rejectDelete(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(pendingDelete).rejects.toThrow('denied');
    expect(localStorage.getItem('orbit-items:owner-user')).toBeNull();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it('does not seed or callback from a user-settings snapshot after secure forget', async () => {
    const callback = vi.fn();
    subscribeToUserSettings('owner-user', callback, {
      getInitialData: () => ({ customTags: ['Private'], removedDefaultTags: [] }),
    });
    const lateSnapshot = firestoreMocks.snapshotCallbacks[0];

    setFirestoreDataContext(null, 'signed-out');
    localStorage.clear();
    lateSnapshot(missingServerSnapshot);
    await Promise.resolve();

    expect(callback).not.toHaveBeenCalled();
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
    expect(localStorage.getItem('orbit-user-settings:owner-user')).toBeNull();
  });

  it('does not recreate tool revision/data keys from a late missing snapshot', async () => {
    const callback = vi.fn();
    subscribeToToolData('owner-user', 'settings', callback, {
      getInitialData: () => ({ settings: { displayName: 'Private' } }),
    });
    const lateSnapshot = firestoreMocks.snapshotCallbacks[0];

    setFirestoreDataContext(null, 'signed-out');
    localStorage.clear();
    lateSnapshot(missingServerSnapshot);
    await Promise.resolve();

    expect(callback).not.toHaveBeenCalled();
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
    expect(localStorage.getItem('orbit-tool-base-revision-settings:owner-user')).toBeNull();
    expect(localStorage.getItem('orbit-tool-settings:owner-user')).toBeNull();
  });
});
