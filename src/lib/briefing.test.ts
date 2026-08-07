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
  createBriefingJournal,
  loadBriefingJournal,
  persistBriefingJournalDraft,
  saveBriefingJournal,
} from './briefing';

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

function journal() {
  const value = createBriefingJournal('2026-08-06', '2026-08-03');
  value.daily.morningIntention = 'Ship the durable path';
  return value;
}

describe('saveBriefingJournal durability', () => {
  it('commits an account-scoped draft synchronously before navigation', () => {
    persistBriefingJournalDraft('owner', journal());

    expect(loadBriefingJournal('owner', '2026-08-06', '2026-08-03').daily.morningIntention)
      .toBe('Ship the durable path');
    expect(loadBriefingJournal('someone-else', '2026-08-06', '2026-08-03').daily.morningIntention)
      .toBe('');
    expect(firestore.saveToolData).not.toHaveBeenCalled();
  });

  it('keeps a failed immediate draft owner-safe and visible', () => {
    storage.failWrites = true;

    expect(() => persistBriefingJournalDraft('draft-owner', journal())).toThrow(
      'Briefing browser draft write verification failed.',
    );

    const warning = dispatchEvent.mock.calls
      .map(([event]) => event as CustomEvent)
      .find((event) => event.type === 'threadmap:sync-warning');
    expect(warning?.detail.userId).toBe('draft-owner');
  });

  it('resolves when the verified local archive commits even if cloud sync fails', async () => {
    firestore.saveToolData.mockRejectedValue(new Error('cloud unavailable'));

    await expect(saveBriefingJournal('owner', journal())).resolves.toBeUndefined();

    expect(storage.length).toBe(1);
    expect(storage.key(0)).toContain('briefing-journal');
  });

  it('resolves when cloud commits even if the local archive cannot be written', async () => {
    storage.failWrites = true;

    await expect(saveBriefingJournal('owner', journal())).resolves.toBeUndefined();

    expect(firestore.saveToolData).toHaveBeenCalledOnce();
  });

  it('rejects and reports durability failure when neither copy commits', async () => {
    storage.failWrites = true;
    firestore.saveToolData.mockRejectedValue(new Error('cloud unavailable'));

    await expect(saveBriefingJournal('owner', journal())).rejects.toThrow('cloud unavailable');

    const events = dispatchEvent.mock.calls.map(([event]) => event as CustomEvent);
    expect(events.map((event) => event.type)).toContain('threadmap:sync-warning');
    expect(events.some((event) => event.type === 'threadmap:sync-conflict')).toBe(false);
    expect(events.find((event) => event.type === 'threadmap:sync-warning')?.detail.userId).toBe('owner');
  });
});
