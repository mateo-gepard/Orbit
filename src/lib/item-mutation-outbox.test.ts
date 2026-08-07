import { describe, expect, it } from 'vitest';
import type { OrbitItem } from './types';
import {
  enqueueItemMutation,
  blockingItemMutationIds,
  itemMutationLineageCovers,
  itemMutationMatches,
  listItemMutations,
  mergeItemMutationRecovery,
  rejectItemMutation,
  removeItemMutation,
} from './item-mutation-outbox';

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

function item(overrides: Partial<OrbitItem> = {}): OrbitItem {
  return {
    id: 'item-1',
    userId: 'user-a',
    type: 'task',
    status: 'active',
    title: 'Recovered edit',
    createdAt: 10,
    updatedAt: 20,
    tags: [],
    linkedIds: [],
    ...overrides,
  };
}

describe('item mutation outbox', () => {
  it('stores each account mutation independently and verifies state changes', () => {
    const storage = memoryStorage();
    const record = enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'Item edit',
      createdAt: 20,
      recoveryItems: [item()],
      patches: [{ itemId: 'item-1', mode: 'update', fields: { title: 'Recovered edit', updatedAt: 20 } }],
    }, storage);
    enqueueItemMutation('user-b', {
      id: 'mutation-2',
      kind: 'create',
      label: 'New item',
      createdAt: 20,
      recoveryItems: [item({ userId: 'user-b' })],
      patches: [{ itemId: 'item-1', mode: 'create', fields: { title: 'Recovered edit', updatedAt: 20 } }],
    }, storage);

    rejectItemMutation(record, new Error('permission denied'), storage);
    expect(listItemMutations('user-a', storage)).toMatchObject([
      { id: 'mutation-1', state: 'rejected', error: 'permission denied' },
    ]);
    expect(listItemMutations('user-b', storage)).toHaveLength(1);
    removeItemMutation(record, storage);
    expect(listItemMutations('user-a', storage)).toEqual([]);
  });

  it('keeps a rejected edit visible when a snapshot is missing or older', () => {
    const storage = memoryStorage();
    const record = enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'Item edit',
      createdAt: 20,
      recoveryItems: [item()],
      patches: [{ itemId: 'item-1', mode: 'update', fields: { title: 'Recovered edit', updatedAt: 20 } }],
    }, storage);

    const merge = mergeItemMutationRecovery([item({ title: 'Old', updatedAt: 10 })], [record], true);
    expect(merge.items[0].title).toBe('Recovered edit');
    expect(merge.recovered).toEqual([record]);
    expect(merge.confirmed).toEqual([]);
  });

  it('recognizes a server-confirmed patch and does not overlay it again', () => {
    const storage = memoryStorage();
    const record = enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'Item edit',
      createdAt: 20,
      recoveryItems: [item()],
      patches: [{ itemId: 'item-1', mode: 'update', fields: { title: 'Recovered edit', updatedAt: 20 }, deleteFields: ['dueDate'] }],
    }, storage);
    const cloud = item({ content: 'A newer unrelated field' });

    expect(itemMutationMatches(record, new Map([[cloud.id, cloud]]))).toBe(true);
    expect(mergeItemMutationRecovery([cloud], [record], true).confirmed).toEqual([record]);
  });

  it('does not replace a newer cloud edit but retains the recovery record', () => {
    const storage = memoryStorage();
    const record = enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'Item edit',
      createdAt: 20,
      recoveryItems: [item()],
      patches: [{ itemId: 'item-1', mode: 'update', fields: { title: 'Recovered edit', updatedAt: 20 } }],
    }, storage);
    const cloud = item({ title: 'Newer remote edit', updatedAt: 30 });
    const merge = mergeItemMutationRecovery([cloud], [record], true);

    expect(merge.items[0].title).toBe('Newer remote edit');
    expect(merge.superseded).toEqual([record]);
    expect(merge.confirmed).toEqual([]);
  });

  it('uses authoritative revisions before untrusted client timestamps', () => {
    const storage = memoryStorage();
    const record = enqueueItemMutation('user-a', {
      id: 'mutation-revision-conflict',
      kind: 'update',
      label: 'Item edit',
      createdAt: 200,
      recoveryItems: [item({ title: 'Stale local', revision: 2, updatedAt: 200 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 1,
        fields: { title: 'Stale local', revision: 2, updatedAt: 200 },
      }],
    }, storage);
    const cloud = item({ title: 'Accepted remote', revision: 5, updatedAt: 100 });
    const merge = mergeItemMutationRecovery([cloud], [record], true);

    expect(merge.items[0].title).toBe('Accepted remote');
    expect(merge.superseded).toEqual([record]);
    expect(merge.recovered).toEqual([]);
  });

  it('confirms link transforms without requiring an exact array snapshot', () => {
    const storage = memoryStorage();
    const record = enqueueItemMutation('user-a', {
      id: 'mutation-link',
      kind: 'link',
      label: 'Item link',
      createdAt: 20,
      recoveryItems: [item({ linkedIds: ['item-2'] })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        fields: { updatedAt: 20 },
        arrayUnionFields: { linkedIds: ['item-2'] },
      }],
    }, storage);
    const concurrentCloud = item({ linkedIds: ['item-2', 'item-3'], updatedAt: 30 });

    expect(itemMutationMatches(record, new Map([[concurrentCloud.id, concurrentCloud]]))).toBe(true);
  });

  it('records same-item causal dependencies without blocking independent items', () => {
    const storage = memoryStorage();
    const first = enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'First edit',
      createdAt: 20,
      recoveryItems: [item({ revision: 2 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 1,
        fields: { title: 'First', updatedAt: 20, revision: 2 },
      }],
    }, storage);
    const second = enqueueItemMutation('user-a', {
      id: 'mutation-2',
      kind: 'update',
      label: 'Second edit',
      createdAt: 21,
      recoveryItems: [item({ title: 'Second', revision: 3, updatedAt: 21 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 2,
        fields: { title: 'Second', updatedAt: 21, revision: 3 },
      }],
    }, storage);
    const independent = enqueueItemMutation('user-a', {
      id: 'mutation-3',
      kind: 'update',
      label: 'Independent edit',
      createdAt: 22,
      recoveryItems: [item({ id: 'item-2', revision: 2 })],
      patches: [{
        itemId: 'item-2',
        mode: 'update',
        baseRevision: 1,
        fields: { title: 'Independent', updatedAt: 22, revision: 2 },
      }],
    }, storage);

    expect(second.dependsOnMutationIds).toEqual([first.id]);
    expect(blockingItemMutationIds(second, new Set([first.id]))).toEqual([first.id]);
    expect(independent.dependsOnMutationIds).toBeUndefined();
  });

  it('recognizes only a contiguous optimistic revision lineage from the confirmed base', () => {
    const storage = memoryStorage();
    enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'First edit',
      createdAt: 20,
      recoveryItems: [item({ revision: 2 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 1,
        fields: { title: 'First', updatedAt: 20, revision: 2 },
      }],
    }, storage);
    enqueueItemMutation('user-a', {
      id: 'mutation-2',
      kind: 'update',
      label: 'Second edit',
      createdAt: 21,
      recoveryItems: [item({ revision: 3 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 2,
        fields: { title: 'Second', updatedAt: 21, revision: 3 },
      }],
    }, storage);
    const mutations = listItemMutations('user-a', storage);

    expect(itemMutationLineageCovers(mutations, 'item-1', 1, 3)).toBe(true);
    expect(itemMutationLineageCovers(mutations, 'item-1', 1, 4)).toBe(false);
    expect(itemMutationLineageCovers(mutations, 'item-2', 1, 3)).toBe(false);
  });

  it('never treats a descendant as confirmed while its ancestor still conflicts', () => {
    const storage = memoryStorage();
    const first = enqueueItemMutation('user-a', {
      id: 'mutation-1',
      kind: 'update',
      label: 'First edit',
      createdAt: 20,
      recoveryItems: [item({ title: 'First', revision: 2 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 1,
        fields: { title: 'First', updatedAt: 20, revision: 2 },
      }],
    }, storage);
    const second = enqueueItemMutation('user-a', {
      id: 'mutation-2',
      kind: 'update',
      label: 'Second edit',
      createdAt: 21,
      recoveryItems: [item({ title: 'Remote coincidentally matches', revision: 3, updatedAt: 21 })],
      patches: [{
        itemId: 'item-1',
        mode: 'update',
        baseRevision: 2,
        fields: { title: 'Remote coincidentally matches', updatedAt: 21, revision: 3 },
      }],
    }, storage);
    const remote = item({ title: 'Remote coincidentally matches', revision: 3, updatedAt: 21 });
    const merge = mergeItemMutationRecovery([remote], [first, second], true);

    expect(merge.confirmed).not.toContain(second);
    expect(merge.recovered).toContain(second);
  });
});
