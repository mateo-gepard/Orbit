import { describe, expect, it } from 'vitest';
import type { ThreadmapItem } from '@/lib/types';
import {
  clearItemDetailDraft,
  itemDetailDraftFromItem,
  readItemDetailDraft,
  writeItemDetailDraft,
} from './item-detail-draft';

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

const item: ThreadmapItem = {
  id: 'event-1',
  userId: 'user-a',
  type: 'event',
  status: 'active',
  title: 'Cloud event',
  content: 'Cloud body',
  startDate: '2026-08-06',
  endDate: '2026-08-06',
  startTime: '09:00',
  endTime: '10:00',
  revision: 4,
  createdAt: 1,
  updatedAt: 10,
};

describe('durable item detail draft', () => {
  it('round-trips every journaled field in an account-scoped record', () => {
    const storage = memoryStorage();
    const draft = {
      ...itemDetailDraftFromItem(item),
      title: 'Browser event',
      content: 'Never lose this',
      metric: 'Reach 100%',
      startTime: '11:00',
      endTime: '12:00',
    };

    writeItemDetailDraft(item, draft, { revision: 4, updatedAt: 10 }, storage);

    expect(readItemDetailDraft(item, storage)).toEqual({
      draft,
      baseRevision: 4,
      baseUpdatedAt: 10,
      safeToRestore: true,
      matchesCurrent: false,
    });
    expect(readItemDetailDraft({ ...item, userId: 'user-b' }, storage)).toBeNull();
  });

  it('retains but does not silently restore a draft after cloud state advances', () => {
    const storage = memoryStorage();
    const draft = { ...itemDetailDraftFromItem(item), content: 'Local edit' };
    writeItemDetailDraft(item, draft, { revision: 4, updatedAt: 10 }, storage);

    expect(readItemDetailDraft({ ...item, revision: 5, updatedAt: 11 }, storage)).toMatchObject({
      draft,
      safeToRestore: false,
      matchesCurrent: false,
    });
  });

  it('treats an acknowledged matching draft as safe even after its base advances', () => {
    const storage = memoryStorage();
    const draft = { ...itemDetailDraftFromItem(item), content: 'Saved content' };
    writeItemDetailDraft(item, draft, { revision: 4, updatedAt: 10 }, storage);

    expect(readItemDetailDraft({
      ...item,
      ...draft,
      revision: 5,
      updatedAt: 11,
    }, storage)).toMatchObject({ safeToRestore: true, matchesCurrent: true });
  });

  it('does not restore a draft captured for an earlier item type', () => {
    const storage = memoryStorage();
    const draft = itemDetailDraftFromItem(item);
    writeItemDetailDraft(item, draft, { revision: 4, updatedAt: 10 }, storage);

    expect(readItemDetailDraft({ ...item, type: 'task' }, storage)).toMatchObject({
      safeToRestore: false,
      matchesCurrent: false,
    });
  });

  it('clears only the matching account and item record', () => {
    const storage = memoryStorage();
    const draft = itemDetailDraftFromItem(item);
    writeItemDetailDraft(item, draft, { revision: 4, updatedAt: 10 }, storage);
    writeItemDetailDraft({ ...item, id: 'event-2' }, draft, { revision: 4, updatedAt: 10 }, storage);

    clearItemDetailDraft(item, storage);

    expect(readItemDetailDraft(item, storage)).toBeNull();
    expect(readItemDetailDraft({ ...item, id: 'event-2' }, storage)).not.toBeNull();
  });
});
