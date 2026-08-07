import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  saveToolData: vi.fn(),
  subscribeToToolData: vi.fn(() => vi.fn()),
}));

vi.mock('./firebase', () => ({ db: { project: 'test' } }));
vi.mock('./firestore', () => ({
  saveToolData: firestore.saveToolData,
  subscribeToToolData: firestore.subscribeToToolData,
  ToolDataConflictError: class ToolDataConflictError extends Error {},
  ToolDataRejectedError: class ToolDataRejectedError extends Error {},
}));

import {
  flushDispatchPlan,
  loadDispatchPlan,
  persistDispatchPlanDraft,
  saveDispatchPlan,
} from './dispatch';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failWrites = false;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('storage unavailable');
    this.values.set(key, value);
  }
}

let storage: MemoryStorage;
let dispatchEvent: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  storage = new MemoryStorage();
  dispatchEvent = vi.fn(() => true);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, dispatchEvent },
  });
  firestore.saveToolData.mockResolvedValue(undefined);
});

function plan() {
  return {
    date: '2026-08-06',
    blocks: [{
      id: 'focus-block',
      label: 'Deep work',
      startHour: 9,
      startMin: 0,
      durationMin: 50,
      taskIds: ['task-1'],
      colorIndex: 0,
    }],
  };
}

describe('Dispatch persistence durability', () => {
  it('commits an account-scoped draft synchronously before navigation', () => {
    persistDispatchPlanDraft('owner', plan());

    expect(loadDispatchPlan('owner', '2026-08-06')?.blocks[0]?.label).toBe('Deep work');
    expect(loadDispatchPlan('someone-else', '2026-08-06')).toBeNull();
    expect(firestore.saveToolData).not.toHaveBeenCalled();
  });

  it('reports an owner-safe warning when the immediate draft cannot commit', () => {
    storage.failWrites = true;

    expect(() => persistDispatchPlanDraft('draft-owner', plan())).toThrow(
      'Dispatch browser draft write verification failed.',
    );

    const warning = dispatchEvent.mock.calls
      .map(([event]) => event as CustomEvent)
      .find((event) => event.type === 'threadmap:sync-warning');
    expect(warning?.detail.userId).toBe('draft-owner');
  });

  it('reports a durable local result when cloud sync fails', async () => {
    firestore.saveToolData.mockRejectedValue(new Error('cloud unavailable'));

    await expect(flushDispatchPlan('owner', plan())).resolves.toEqual({
      localCommitted: true,
      cloudCommitted: false,
    });

    const warning = dispatchEvent.mock.calls
      .map(([event]) => event as CustomEvent)
      .find((event) => event.type === 'threadmap:sync-warning');
    expect(warning?.detail.userId).toBe('owner');
  });

  it('accepts a cloud commit when the browser cache is unavailable', async () => {
    storage.failWrites = true;

    await expect(flushDispatchPlan('owner', plan())).resolves.toEqual({
      localCommitted: false,
      cloudCommitted: true,
    });
  });

  it('rejects, keeps the failure out of the conflict channel, and identifies the owner when both paths fail', async () => {
    storage.failWrites = true;
    firestore.saveToolData.mockRejectedValue(new Error('cloud unavailable'));

    await expect(saveDispatchPlan('owner', plan())).rejects.toThrow('cloud unavailable');

    const events = dispatchEvent.mock.calls.map(([event]) => event as CustomEvent);
    expect(events.map((event) => event.type)).toContain('threadmap:sync-warning');
    expect(events.some((event) => event.type === 'threadmap:sync-conflict')).toBe(false);
    expect(events.find((event) => event.type === 'threadmap:sync-warning')?.detail.userId).toBe('owner');
  });
});
