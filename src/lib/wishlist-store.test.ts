import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firestore', () => ({
  saveToolData: vi.fn(async () => undefined),
  ToolDataConflictError: class ToolDataConflictError extends Error {},
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
} from './wishlist-store';

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
  };
}

beforeEach(() => {
  useWishlistStore.getState()._setSyncUserId(null);
  useWishlistStore.setState({ items: [], duels: [], cloudDirty: false });
});

describe('Wishlist cross-device reconciliation', () => {
  it('keeps additions made independently on two devices', () => {
    const merged = mergeWishlistCloudData(
      { items: [{ ...item(0), updatedAt: 10 }], duels: [] },
      { items: [{ ...item(1), updatedAt: 20 }], duels: [] },
    );

    expect(merged.items.map((entry) => entry.id)).toEqual(['item-0', 'item-1']);
  });

  it('keeps the newest edit when both devices changed the same wish', () => {
    const merged = mergeWishlistCloudData(
      { items: [{ ...item(0), name: 'Local edit', updatedAt: 30 }], duels: [] },
      { items: [{ ...item(0), name: 'Cloud edit', updatedAt: 20 }], duels: [] },
    );

    expect(merged.items[0].name).toBe('Local edit');
  });

  it('does not resurrect an item deleted on another device', () => {
    const merged = mergeWishlistCloudData(
      { items: [{ ...item(0), updatedAt: 10 }], duels: [] },
      { items: [], duels: [], deletedItems: { 'item-0': 20 } },
    );

    expect(merged.items).toEqual([]);
    expect(merged.deletedItems['item-0']).toBe(20);
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
