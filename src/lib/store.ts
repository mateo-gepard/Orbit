import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrbitItem, ItemType, ItemStatus } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';

interface OrbitStore {
  // Items
  items: OrbitItem[];
  setItems: (items: OrbitItem[]) => void;

  // Custom Tags (cloud-synced per user)
  customTags: string[];
  removedDefaultTags: string[]; // default tags the user has removed
  _syncUserId: string | null; // set by data-provider when user logs in
  _setSyncUserId: (userId: string | null) => void;
  setTagsFromCloud: (customTags: string[], removedDefaultTags: string[]) => void;
  addCustomTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  renameTag: (oldTag: string, newTag: string) => void;
  // Legacy aliases
  removeCustomTag: (tag: string) => void;
  renameCustomTag: (oldTag: string, newTag: string) => void;
  getAllTags: () => string[];

  // UI State
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;

  detailPanelOpen: boolean;
  setDetailPanelOpen: (open: boolean) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  commandBarOpen: boolean;
  setCommandBarOpen: (open: boolean) => void;

  // Completion Animation State
  completionAnimation: { type: 'task' | 'habit'; streak?: number } | null;
  setCompletionAnimation: (animation: { type: 'task' | 'habit'; streak?: number } | null) => void;

  // Filters
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;

  // Computed selectors (safe — never throw)
  getItemById: (id: string) => OrbitItem | undefined;
  getItemsByType: (type: ItemType) => OrbitItem[];
  getItemsByStatus: (status: ItemStatus) => OrbitItem[];
  getChildItems: (parentId: string) => OrbitItem[];
  getLinkedItems: (itemId: string) => OrbitItem[];
}

/**
 * Debounced cloud sync for tag changes (lazy import to avoid circular dep).
 * Uses a "just wrote" flag to prevent the onSnapshot listener from
 * overwriting local state with what we just sent.
 */
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let _ignoreCloudUntil = 0; // timestamp — ignore incoming cloud updates until this time

function debouncedSyncTags(get: () => OrbitStore) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    const userId = get()._syncUserId;
    if (!userId) return;
    try {
      // Mark that we're writing — ignore the echo from onSnapshot for 2s
      _ignoreCloudUntil = Date.now() + 2000;
      const { saveUserSettings } = await import('@/lib/firestore');
      await saveUserSettings(userId, {
        customTags: get().customTags,
        removedDefaultTags: get().removedDefaultTags,
      });
    } catch (err) {
      console.error('[ORBIT] Failed to sync tags:', err);
      _ignoreCloudUntil = 0; // allow cloud updates on error
    }
  }, 300);
}

/** Check if we should ignore an incoming cloud update (echo suppression) */
export function shouldIgnoreCloudTags(): boolean {
  return Date.now() < _ignoreCloudUntil;
}

export const useOrbitStore = create<OrbitStore>()(
  persist(
    (set, get) => ({
      items: [],
      setItems: (items) => {
        // Guard: only accept valid arrays
        if (!Array.isArray(items)) {
          console.error('[ORBIT Store] setItems received non-array:', typeof items);
          return;
        }
        set({ items });
      },

      customTags: [],
      removedDefaultTags: [],
      _syncUserId: null,
      _setSyncUserId: (userId) => set({ _syncUserId: userId }),
      setTagsFromCloud: (customTags, removedDefaultTags) => {
        // Don't overwrite local state if we just wrote to cloud (echo suppression)
        if (shouldIgnoreCloudTags()) return;
        set({ customTags, removedDefaultTags });
      },
      addCustomTag: (tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (!trimmed) return;
        const allCurrent = get().getAllTags();
        if (allCurrent.includes(trimmed)) return;
        // If it was a removed default tag, restore it
        const defaultTags = LIFE_AREA_TAGS as readonly string[];
        if (defaultTags.includes(trimmed)) {
          set({ removedDefaultTags: get().removedDefaultTags.filter((t) => t !== trimmed) });
          debouncedSyncTags(get);
          return;
        }
        set({ customTags: [...get().customTags, trimmed] });
        debouncedSyncTags(get);
      },
      removeTag: (tag) => {
        const defaultTags = LIFE_AREA_TAGS as readonly string[];
        const isDefault = defaultTags.includes(tag);
        if (isDefault) {
          set({ removedDefaultTags: [...get().removedDefaultTags, tag] });
        } else {
          set({ customTags: get().customTags.filter((t) => t !== tag) });
        }
        // Remove tag from all items
        const items = get().items;
        const updated = items.map((item) => {
          if (item.tags?.includes(tag)) {
            return { ...item, tags: item.tags.filter((t) => t !== tag) };
          }
          return item;
        });
        set({ items: updated });
        debouncedSyncTags(get);
      },
      renameTag: (oldTag, newTag) => {
        const trimmed = newTag.trim().toLowerCase();
        if (!trimmed || trimmed === oldTag) return;
        const allCurrent = get().getAllTags();
        if (allCurrent.includes(trimmed)) return; // Already exists

        const defaultTags = LIFE_AREA_TAGS as readonly string[];
        const isDefault = defaultTags.includes(oldTag);

        if (isDefault) {
          // Remove old default, add as custom with new name
          set({
            removedDefaultTags: [...get().removedDefaultTags, oldTag],
            customTags: [...get().customTags, trimmed],
          });
        } else {
          set({ customTags: get().customTags.map((t) => (t === oldTag ? trimmed : t)) });
        }
        // Rename in all items
        const items = get().items;
        const updated = items.map((item) => {
          if (item.tags?.includes(oldTag)) {
            return { ...item, tags: item.tags.map((t) => (t === oldTag ? trimmed : t)) };
          }
          return item;
        });
        set({ items: updated });
        debouncedSyncTags(get);
      },
      // Legacy aliases
      removeCustomTag: (tag) => get().removeTag(tag),
      renameCustomTag: (oldTag, newTag) => get().renameTag(oldTag, newTag),
      getAllTags: () => {
        const removed = new Set(get().removedDefaultTags);
        const defaults = (LIFE_AREA_TAGS as readonly string[]).filter((t) => !removed.has(t));
        return [...defaults, ...get().customTags];
      },

      selectedItemId: null,
      setSelectedItemId: (id) => {
    // If the item doesn't exist, don't open the panel
    if (id !== null) {
      const exists = get().items.some((i) => i.id === id);
      if (!exists) {
        console.warn(`[ORBIT Store] Item ${id} not found, ignoring selection`);
        return;
      }
    }
    set({ selectedItemId: id, detailPanelOpen: id !== null });
  },

  detailPanelOpen: false,
  setDetailPanelOpen: (open) =>
    set({ detailPanelOpen: open, selectedItemId: open ? get().selectedItemId : null }),

      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      commandBarOpen: false,
      setCommandBarOpen: (open) => set({ commandBarOpen: open }),

      completionAnimation: null,
      setCompletionAnimation: (animation) => set({ completionAnimation: animation }),

      activeTag: null,
      setActiveTag: (tag) => set({ activeTag: tag }),  // All selectors are safe — they handle missing/corrupt data gracefully
  getItemById: (id) => {
    try {
      return get().items.find((item) => item.id === id);
    } catch {
      return undefined;
    }
  },

  getItemsByType: (type) => {
    try {
      return get().items.filter((item) => item.type === type && item.status !== 'archived');
    } catch {
      return [];
    }
  },

  getItemsByStatus: (status) => {
    try {
      return get().items.filter((item) => item.status === status);
    } catch {
      return [];
    }
  },

  getChildItems: (parentId) => {
    try {
      return get().items.filter((item) => item.parentId === parentId);
    } catch {
      return [];
    }
  },

  getLinkedItems: (itemId) => {
    try {
      const item = get().items.find((i) => i.id === itemId);
      if (!item?.linkedIds?.length) return [];
      return get().items.filter((i) => item.linkedIds!.includes(i.id));
    } catch {
      return [];
    }
  },
}),
    {
      name: 'orbit-settings',
      partialize: (state) => ({
        customTags: state.customTags,
        removedDefaultTags: state.removedDefaultTags,
      }),
    }
  )
);
