import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrbitItem, ItemType, ItemStatus } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';

interface OrbitStore {
  // Items
  items: OrbitItem[];
  setItems: (items: OrbitItem[]) => void;

  // Custom Tags
  customTags: string[];
  addCustomTag: (tag: string) => void;
  removeCustomTag: (tag: string) => void;
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
      addCustomTag: (tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (!trimmed || get().customTags.includes(trimmed)) return;
        set({ customTags: [...get().customTags, trimmed] });
      },
      removeCustomTag: (tag) => {
        set({ customTags: get().customTags.filter((t) => t !== tag) });
        // Note: Tag removal from items is handled by Firestore cleanup
        // Items will automatically filter out deleted tags when displayed
      },
      getAllTags: () => {
        return [...LIFE_AREA_TAGS, ...get().customTags];
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

  activeTag: null,
  setActiveTag: (tag) => set({ activeTag: tag }),

  // All selectors are safe — they handle missing/corrupt data gracefully
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
      partialize: (state) => ({ customTags: state.customTags }),
    }
  )
);
