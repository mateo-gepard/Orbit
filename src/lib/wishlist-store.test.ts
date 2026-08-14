import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  mergeToolData: vi.fn(),
}));

vi.mock('./firestore', () => ({
  mergeToolData: firestoreMocks.mergeToolData,
}));
vi.mock('./verified-storage', () => ({
  verifiedLocalStateStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import {
  MAX_WISHLIST_ITEMS,
  mergeWishlistCloudData,
  pickDuelPair,
  useWishlistStore,
  type VaultItem,
  type WishlistCloudData,
} from './wishlist-store';

type MergeRemote = (local: WishlistCloudData, remote: WishlistCloudData | null) => WishlistCloudData;

function item(index: number): VaultItem {
  return {
    id: `item-${index}`,
    name: `Item ${index}`,
    currency: 'EUR',
    category: 'other',
    elo: 1200,
    duelsPlayed: 0,
    duelsWon: 0,
    addedAt: index + 1,
    updatedAt: index + 1,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  firestoreMocks.mergeToolData.mockReset();
  firestoreMocks.mergeToolData.mockImplementation(async (
    _userId: string,
    _toolId: string,
    local: WishlistCloudData,
    mergeRemote: MergeRemote,
  ) => mergeRemote(local, null));
  useWishlistStore.getState()._setSyncUserId(null);
  useWishlistStore.setState({
    items: [],
    duels: [],
    deletedItems: {},
    pendingMutations: [],
    cloudDirty: false,
  });
});

afterEach(() => {
  useWishlistStore.getState()._setSyncUserId(null);
  vi.useRealTimers();
});

describe('Wishlist cross-device reconciliation', () => {
  it('keeps additions made independently on two devices', () => {
    const merged = mergeWishlistCloudData(
      { items: [{ ...item(0), updatedAt: 10 }], duels: [] },
      { items: [{ ...item(1), updatedAt: 20 }], duels: [] },
    );

    expect(merged.items.map((entry) => entry.id)).toEqual(['item-0', 'item-1']);
  });

  it('keeps the newest edit when migrating legacy whole-document state', () => {
    const merged = mergeWishlistCloudData(
      { items: [{ ...item(0), name: 'Local edit', updatedAt: 30 }], duels: [] },
      { items: [{ ...item(0), name: 'Cloud edit', updatedAt: 20 }], duels: [] },
    );

    expect(merged.items[0].name).toBe('Local edit');
  });

  it('never resurrects a hard-deleted item, even with a future client timestamp', () => {
    const merged = mergeWishlistCloudData(
      { items: [{ ...item(0), updatedAt: 10_000 }], duels: [] },
      { items: [], duels: [], deletedItems: { 'item-0': 20 } },
    );

    expect(merged.items).toEqual([]);
    expect(merged.deletedItems['item-0']).toBe(20);
  });

  it('does not echo a normalized cloud snapshot back to Firestore', async () => {
    useWishlistStore.getState()._setSyncUserId('user-1');
    const cloudItem = {
      updatedAt: 20,
      name: 'Cloud item',
      id: 'cloud-item',
      category: 'tech',
      currency: 'EUR',
      elo: 1200,
      duelsWon: 0,
      duelsPlayed: 0,
      addedAt: 10,
    } as VaultItem;

    useWishlistStore.getState()._setFromCloud({ items: [cloudItem], duels: [] });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(firestoreMocks.mergeToolData).not.toHaveBeenCalled();
    expect(useWishlistStore.getState().cloudDirty).toBe(false);
  });

  it('replays only the local field edit over the latest cloud item', async () => {
    const base = { ...item(0), name: 'Original', price: 10, updatedAt: 10 };
    useWishlistStore.setState({ items: [base] });
    useWishlistStore.getState()._setSyncUserId('user-1');
    firestoreMocks.mergeToolData.mockImplementationOnce(async (
      _userId: string,
      _toolId: string,
      local: WishlistCloudData,
      mergeRemote: MergeRemote,
    ) => mergeRemote(local, {
      items: [{ ...base, price: 25, updatedAt: 20 }],
      duels: [],
      deletedItems: {},
    }));

    useWishlistStore.getState().updateItem(base.id, { name: 'Local name' });
    await vi.advanceTimersByTimeAsync(500);

    expect(useWishlistStore.getState().items[0]).toMatchObject({ name: 'Local name', price: 25 });
    expect(useWishlistStore.getState().pendingMutations).toEqual([]);
    expect(useWishlistStore.getState().cloudDirty).toBe(false);
  });

  it('keeps the durable operation queued until a failed cloud write retries', async () => {
    firestoreMocks.mergeToolData
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (
        _userId: string,
        _toolId: string,
        local: WishlistCloudData,
        mergeRemote: MergeRemote,
      ) => mergeRemote(local, null));
    useWishlistStore.getState()._setSyncUserId('user-1');
    useWishlistStore.getState().addItem({ name: 'Offline wish', currency: 'EUR', category: 'other' });

    await vi.advanceTimersByTimeAsync(500);
    expect(useWishlistStore.getState().pendingMutations).toHaveLength(1);
    expect(useWishlistStore.getState().cloudDirty).toBe(true);

    await vi.advanceTimersByTimeAsync(5_500);
    expect(firestoreMocks.mergeToolData).toHaveBeenCalledTimes(2);
    expect(useWishlistStore.getState().pendingMutations).toEqual([]);
    expect(useWishlistStore.getState().cloudDirty).toBe(false);
  });
});

describe('Wishlist capacity and auction safety', () => {
  it('does not produce a duel until two active items exist', () => {
    expect(pickDuelPair([])).toBeNull();
    expect(pickDuelPair([item(0)])).toBeNull();
  });

  it('returns a distinct pair when at least two active items exist', () => {
    const pair = pickDuelPair([item(0), item(1)]);
    expect(pair).not.toBeNull();
    expect(pair?.[0].id).not.toBe(pair?.[1].id);
  });

  it('reports capacity failure without changing or truncating the collection', () => {
    const fullCollection = Array.from({ length: MAX_WISHLIST_ITEMS }, (_, index) => item(index));
    useWishlistStore.setState({ items: fullCollection });

    const added = useWishlistStore.getState().addItem({
      name: 'One too many',
      currency: 'EUR',
      category: 'other',
    });

    expect(added).toBe(false);
    expect(useWishlistStore.getState().items).toEqual(fullCollection);
  });

  it('returns success only after the new item is present', () => {
    const added = useWishlistStore.getState().addItem({
      name: 'New item',
      currency: 'EUR',
      category: 'tech',
    });

    expect(added).toBe(true);
    expect(useWishlistStore.getState().items).toHaveLength(1);
    expect(useWishlistStore.getState().items[0].name).toBe('New item');
  });
});
