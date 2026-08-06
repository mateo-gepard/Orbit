import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightLog } from './flight';

const firestore = vi.hoisted(() => ({
  deleteDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_database: unknown, name: string) => ({ path: name }),
  deleteDoc: firestore.deleteDoc,
  doc: (_database: unknown, ...parts: string[]) => ({
    id: parts.at(-1),
    path: parts.join('/'),
  }),
  getDocFromServer: firestore.getDocFromServer,
  getDocs: firestore.getDocs,
  limit: (count: number) => ({ type: 'limit', count }),
  onSnapshot: firestore.onSnapshot,
  orderBy: (field: string, direction: string) => ({ type: 'orderBy', field, direction }),
  query: (...parts: unknown[]) => ({ parts }),
  setDoc: firestore.setDoc,
  where: (field: string, operator: string, value: unknown) => ({ type: 'where', field, operator, value }),
  writeBatch: firestore.writeBatch,
}));

vi.mock('./firebase', () => ({ db: { project: 'test' } }));

import {
  boundFlightLogHistory,
  migrateLegacyFlightLogs,
  saveFlightLog,
  setFlightStorageOwner,
} from './flight';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function makeLog(id: string, startedAt: number, userId = 'owner-user'): FlightLog {
  return {
    id,
    flightNumber: `OF-${id}`,
    route: {
      from: { code: 'MAD', name: 'Barajas', city: 'Madrid', region: 'europe' },
      to: { code: 'LHR', name: 'Heathrow', city: 'London', region: 'europe' },
      distanceKm: 1_200,
      realFlightMin: 120,
    },
    duration: 25,
    actualDuration: 1_500_000,
    startedAt,
    endedAt: startedAt + 1_500_000,
    tasks: [],
    turbulence: [],
    completedNormally: true,
    debrief: {},
    userId,
  };
}

function cloudDocument(log: FlightLog) {
  return {
    id: `${log.userId}_${log.id}`,
    ref: { path: `flightLogs/${log.userId}_${log.id}` },
    data: () => log,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
  firestore.onSnapshot.mockReturnValue(vi.fn());
  setFlightStorageOwner('owner-user');
});

describe('flight history retention', () => {
  it('keeps the deterministic latest 100 unique local records', () => {
    const history = Array.from({ length: 105 }, (_, index) => makeLog(`flight-${index}`, index));
    history.push(makeLog('flight-104', 1_000));

    const bounded = boundFlightLogHistory(history.reverse());

    expect(bounded).toHaveLength(100);
    expect(bounded[0]).toMatchObject({ id: 'flight-104', startedAt: 1_000 });
    expect(new Set(bounded.map((log) => log.id)).size).toBe(100);
    expect(bounded.some((log) => log.id === 'flight-0')).toBe(false);
  });

  it('prunes only owner-prefixed excess records after the new write commits', async () => {
    const order: string[] = [];
    const deletedPaths: string[] = [];
    const newest = makeLog('newest', 10_000);
    const existing = Array.from({ length: 101 }, (_, index) => makeLog(`old-${index}`, index));
    firestore.setDoc.mockImplementation(async () => { order.push('write'); });
    firestore.getDocs.mockImplementation(async () => {
      order.push('scan');
      return {
        docs: [
          cloudDocument(newest),
          ...existing.map(cloudDocument),
          cloudDocument(makeLog('cross-account', -1, 'other-user')),
        ],
      };
    });
    firestore.writeBatch.mockImplementation(() => ({
      delete: (reference: { path: string }) => deletedPaths.push(reference.path),
      commit: async () => { order.push('prune'); },
    }));

    await expect(saveFlightLog(newest, 'owner-user')).resolves.toEqual({
      savedLocally: true,
      synced: true,
    });

    expect(order).toEqual(['write', 'scan', 'prune']);
    expect(deletedPaths).toHaveLength(2);
    expect(deletedPaths.every((path) => path.startsWith('flightLogs/owner-user_'))).toBe(true);
    expect(deletedPaths).not.toContain('flightLogs/other-user_cross-account');
  });

  it('never starts pruning when the durable cloud write fails', async () => {
    firestore.setDoc.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(saveFlightLog(makeLog('unsynced', 1), 'owner-user')).rejects.toThrow('denied');

    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.writeBatch).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('serializes a newer retry for the same log ID instead of dropping it', async () => {
    const writes: FlightLog[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    firestore.setDoc.mockImplementation(async (_reference: unknown, log: FlightLog) => {
      writes.push(log);
      if (writes.length === 1) {
        markFirstStarted();
        await firstGate;
      }
    });
    firestore.getDocs.mockResolvedValue({ docs: [] });

    const original = makeLog('stable-id', 1);
    const first = saveFlightLog(original, 'owner-user');
    await firstStarted;
    const second = saveFlightLog({
      ...original,
      debrief: { summary: 'newer debrief' },
    }, 'owner-user');
    releaseFirst();
    await Promise.all([first, second]);

    expect(writes).toHaveLength(2);
    expect(writes[1].debrief.summary).toBe('newer debrief');
  });
});

describe('legacy flight migration', () => {
  it('reads back every migrated record before pruning and deleting the source', async () => {
    const order: string[] = [];
    const legacyLogs = [makeLog('legacy-a', 2), makeLog('legacy-b', 1)];
    const written = new Map<string, FlightLog>();
    firestore.setDoc.mockImplementation(async (reference: { path: string }, log: FlightLog) => {
      order.push(`write:${log.id}`);
      written.set(reference.path, log);
    });
    firestore.getDocFromServer.mockImplementation(async (reference: { path: string }) => {
      if (reference.path === 'toolData/owner-user_flightLogs') {
        return { exists: () => true, data: () => ({ logs: legacyLogs }) };
      }
      const log = written.get(reference.path);
      order.push(`verify:${log?.id || 'missing'}`);
      return { exists: () => Boolean(log), data: () => log };
    });
    firestore.getDocs.mockImplementation(async () => ({
      docs: [...written.values()].map(cloudDocument),
    }));
    firestore.writeBatch.mockImplementation(() => ({ delete: vi.fn(), commit: vi.fn() }));
    firestore.deleteDoc.mockImplementation(async () => { order.push('delete:legacy'); });

    await migrateLegacyFlightLogs('owner-user');

    expect(order).toEqual([
      'write:legacy-a',
      'write:legacy-b',
      'verify:legacy-a',
      'verify:legacy-b',
      'delete:legacy',
    ]);
    expect(firestore.deleteDoc).toHaveBeenCalledWith(expect.objectContaining({
      path: 'toolData/owner-user_flightLogs',
    }));
  });

  it('preserves the legacy source when even one destination read-back fails', async () => {
    const legacyLogs = [makeLog('legacy-a', 2), makeLog('legacy-b', 1)];
    firestore.setDoc.mockResolvedValue(undefined);
    firestore.getDocFromServer.mockImplementation(async (reference: { path: string }) => {
      if (reference.path === 'toolData/owner-user_flightLogs') {
        return { exists: () => true, data: () => ({ logs: legacyLogs }) };
      }
      const id = reference.path.endsWith('_legacy-a') ? 'legacy-a' : null;
      const log = id ? legacyLogs[0] : undefined;
      return { exists: () => Boolean(log), data: () => log };
    });

    await expect(migrateLegacyFlightLogs('owner-user')).rejects.toThrow('verification failed');

    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });
});
