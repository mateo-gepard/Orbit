import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { OrbitItem, ItemType, ItemStatus } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';
import { prepareScopedStorage } from './account-storage';
import { verifiedLocalStateStorage } from './verified-storage';

interface OrbitStore {
  // Items
  items: OrbitItem[];
  setItems: (items: OrbitItem[]) => void;

  // Custom Tags (cloud-synced per user)
  customTags: string[];
  removedDefaultTags: string[]; // default tags the user has removed
  _tagsCloudDirty: boolean;
  _tagsBaseRevision: number;
  _tagsBaseUpdatedAt: number;
  _pendingTagEdits: Record<string, string[]>;
  _syncUserId: string | null; // set by data-provider when user logs in
  _setSyncUserId: (userId: string | null) => void;
  setTagsFromCloud: (
    customTags: string[],
    removedDefaultTags: string[],
    revision: number,
    updatedAt: number,
    authoritative?: boolean,
  ) => void;
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
let tagSyncGeneration = 0;
let tagMutationVersion = 0;
const runningTagSyncs = new Set<string>();
const rescheduledTagSyncs = new Set<string>();
let cloudEchoSuppression: { userId: string; generation: number; until: number } | null = null;
const TAGS_STORAGE_KEY = 'orbit-tags';
const LEGACY_TAGS_STORAGE_KEY = 'orbit-settings';

function sanitizeTagList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function sanitizePendingTagEdits(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [itemId, tags] of Object.entries(value)) {
    if (/^[A-Za-z0-9_-]{1,200}$/.test(itemId) && Array.isArray(tags)) {
      result[itemId] = sanitizeTagList(tags).slice(0, 100);
    }
  }
  return result;
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function migrateLegacyTagStorage() {
  if (typeof window === 'undefined') return;

  try {
    if (window.localStorage.getItem(TAGS_STORAGE_KEY)) return;

    const legacyRaw = window.localStorage.getItem(LEGACY_TAGS_STORAGE_KEY);
    if (!legacyRaw) return;

    const legacy = JSON.parse(legacyRaw) as {
      state?: {
        customTags?: unknown;
        removedDefaultTags?: unknown;
      };
    };
    const customTags = sanitizeTagList(legacy.state?.customTags);
    const removedDefaultTags = sanitizeTagList(legacy.state?.removedDefaultTags);

    if (customTags.length === 0 && removedDefaultTags.length === 0) return;

    window.localStorage.setItem(
      TAGS_STORAGE_KEY,
      JSON.stringify({
        state: { customTags, removedDefaultTags },
        version: 0,
      })
    );
  } catch {
    // Leave legacy storage untouched if migration fails.
  }
}

migrateLegacyTagStorage();

function debouncedSyncTags(get: () => OrbitStore, affectedItemIds: string[] = []) {
  const scheduledUserId = get()._syncUserId;
  const scheduledGeneration = tagSyncGeneration;
  const syncKey = `${scheduledUserId}:${scheduledGeneration}`;
  if (!scheduledUserId) return;
  tagMutationVersion += 1;
  const scheduledVersion = tagMutationVersion;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    if (get()._syncUserId !== scheduledUserId || tagSyncGeneration !== scheduledGeneration) return;
    if (runningTagSyncs.has(syncKey)) {
      rescheduledTagSyncs.add(syncKey);
      return;
    }
    runningTagSyncs.add(syncKey);
    const attemptedEdits = { ...get()._pendingTagEdits };
    try {
      // Mark that we're writing — ignore the echo from onSnapshot for 2s
      cloudEchoSuppression = {
        userId: scheduledUserId,
        generation: scheduledGeneration,
        until: Date.now() + 2000,
      };
      const { saveTagMutation, saveUserSettings } = await import('@/lib/firestore');
      const settings = {
        customTags: get().customTags,
        removedDefaultTags: get().removedDefaultTags,
      };
      const settingsBase = {
        revision: get()._tagsBaseRevision,
        updatedAt: get()._tagsBaseUpdatedAt,
      };
      const affectedItems = Object.entries(attemptedEdits)
        .map(([id, tags]) => ({ id, tags }));
      const outcome = affectedItems.length > 0
        ? await saveTagMutation(scheduledUserId, settings, affectedItems, settingsBase)
        : await saveUserSettings(scheduledUserId, settings, settingsBase);
      if (outcome.outcome !== 'committed') {
        if (outcome.outcome === 'rejected' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('threadmap:sync-conflict', {
            detail: {
              toolId: 'tags',
              message: 'Tag definitions changed elsewhere. This browser copy was preserved; reload to choose which version to keep.',
            },
          }));
        }
        return;
      }
      if (get()._syncUserId !== scheduledUserId || tagSyncGeneration !== scheduledGeneration) return;
      useOrbitStore.setState({
        _tagsBaseRevision: outcome.saved.revision,
        _tagsBaseUpdatedAt: outcome.saved.updatedAt,
      });
      const remainingEdits = { ...get()._pendingTagEdits };
      for (const [itemId, tags] of Object.entries(attemptedEdits)) {
        if (remainingEdits[itemId] && sameTags(remainingEdits[itemId], tags)) delete remainingEdits[itemId];
      }
      const newestVersion = tagMutationVersion;
      const hasNewerMutation = newestVersion !== scheduledVersion;
      setStoreTagSyncState(remainingEdits, hasNewerMutation);
      if (!hasNewerMutation && Object.keys(remainingEdits).length === 0) {
        cloudEchoSuppression = {
          userId: scheduledUserId,
          generation: scheduledGeneration,
          until: Date.now() + 2000,
        };
      } else {
        rescheduledTagSyncs.add(syncKey);
      }
    } catch (err) {
      console.error('[THREADMAP] Failed to sync tags:', err);
      if (cloudEchoSuppression?.userId === scheduledUserId
          && cloudEchoSuppression.generation === scheduledGeneration) {
        cloudEchoSuppression = null;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadmap:sync-conflict', {
          detail: { toolId: 'tags', message: 'Tag changes could not reach the cloud yet. Retrying safely.' },
        }));
      }
      if (tagMutationVersion !== scheduledVersion) rescheduledTagSyncs.add(syncKey);
    } finally {
      runningTagSyncs.delete(syncKey);
      if (rescheduledTagSyncs.has(syncKey)
          && get()._syncUserId === scheduledUserId
          && tagSyncGeneration === scheduledGeneration) {
        rescheduledTagSyncs.delete(syncKey);
        debouncedSyncTags(get);
      } else {
        rescheduledTagSyncs.delete(syncKey);
      }
    }
  }, affectedItemIds.length > 0 ? 0 : 300);
}

function setStoreTagSyncState(pendingEdits: Record<string, string[]>, hasNewerMutation: boolean): void {
  useOrbitStore.setState({
    _pendingTagEdits: pendingEdits,
    _tagsCloudDirty: hasNewerMutation || Object.keys(pendingEdits).length > 0,
  });
}

/** Check if we should ignore an incoming cloud update (echo suppression) */
export function shouldIgnoreCloudTags(): boolean {
  const activeUserId = useOrbitStore.getState()._syncUserId;
  return Boolean(
    activeUserId
      && cloudEchoSuppression?.userId === activeUserId
      && cloudEchoSuppression.generation === tagSyncGeneration
      && Date.now() < cloudEchoSuppression.until
  );
}

export const useOrbitStore = create<OrbitStore>()(
  persist(
    (set, get) => ({
      items: [],
      setItems: (items) => {
        // Guard: only accept valid arrays
        if (!Array.isArray(items)) {
          console.error('[THREADMAP Store] setItems received non-array:', typeof items);
          return;
        }
        const currentCount = get().items.length;
        if (currentCount > 0 && items.length === 0) {
          console.warn(`[THREADMAP Store] setItems: ${currentCount} items → 0. Potential data wipe detected.`);
        }
        const pendingEdits = get()._pendingTagEdits;
        const merged = items.map((item) => pendingEdits[item.id]
          ? { ...item, tags: pendingEdits[item.id] }
          : item);
        set({ items: merged });
      },

      customTags: [],
      removedDefaultTags: [],
      _tagsCloudDirty: false,
      _tagsBaseRevision: 0,
      _tagsBaseUpdatedAt: 0,
      _pendingTagEdits: {},
      _syncUserId: null,
      _setSyncUserId: (userId) => {
        if (get()._syncUserId !== userId) {
          if (syncTimeout) clearTimeout(syncTimeout);
          syncTimeout = null;
          tagSyncGeneration += 1;
          tagMutationVersion += 1;
          cloudEchoSuppression = null;
        }
        set({ _syncUserId: userId });
      },
      setTagsFromCloud: (customTags, removedDefaultTags, revision, updatedAt, authoritative = false) => {
        // Don't overwrite local state if we just wrote to cloud (echo suppression)
        if (shouldIgnoreCloudTags() && !authoritative) return;
        if (get()._tagsCloudDirty) {
          if (authoritative
              && sameTags(get().customTags, customTags)
              && sameTags(get().removedDefaultTags, removedDefaultTags)) {
            set({
              _pendingTagEdits: {},
              _tagsCloudDirty: false,
              _tagsBaseRevision: revision,
              _tagsBaseUpdatedAt: updatedAt,
            });
            return;
          }
          const sameBase = revision === get()._tagsBaseRevision
            && (revision !== 0 || updatedAt === get()._tagsBaseUpdatedAt);
          if (!authoritative || sameBase) {
            debouncedSyncTags(get);
          } else if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('threadmap:sync-conflict', {
              detail: {
                toolId: 'tags',
                message: 'Tag definitions changed on another device. This browser copy remains preserved for recovery.',
              },
            }));
          }
          return;
        }
        set({
          customTags,
          removedDefaultTags,
          _tagsCloudDirty: false,
          _tagsBaseRevision: revision,
          _tagsBaseUpdatedAt: updatedAt,
        });
      },
      addCustomTag: (tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (!trimmed) return;
        const allCurrent = get().getAllTags();
        if (allCurrent.includes(trimmed)) return;
        // If it was a removed default tag, restore it
        const defaultTags = LIFE_AREA_TAGS as readonly string[];
        if (defaultTags.includes(trimmed)) {
          set({
            removedDefaultTags: get().removedDefaultTags.filter((t) => t !== trimmed),
            _tagsCloudDirty: Boolean(get()._syncUserId),
          });
          debouncedSyncTags(get);
          return;
        }
        set({ customTags: [...get().customTags, trimmed], _tagsCloudDirty: Boolean(get()._syncUserId) });
        debouncedSyncTags(get);
      },
      removeTag: (tag) => {
        const defaultTags = LIFE_AREA_TAGS as readonly string[];
        const isDefault = defaultTags.includes(tag);
        if (isDefault) {
          set({ removedDefaultTags: [...get().removedDefaultTags, tag], _tagsCloudDirty: Boolean(get()._syncUserId) });
        } else {
          set({ customTags: get().customTags.filter((t) => t !== tag), _tagsCloudDirty: Boolean(get()._syncUserId) });
        }
        // Remove tag from all items
        const items = get().items;
        const updated = items.map((item) => {
          if (item.tags?.includes(tag)) {
            return { ...item, tags: item.tags.filter((t) => t !== tag) };
          }
          return item;
        });
        const changed = updated.filter((item, index) => item !== items[index]);
        set({
          items: updated,
          _pendingTagEdits: {
            ...get()._pendingTagEdits,
            ...Object.fromEntries(changed.map((item) => [item.id, item.tags || []])),
          },
        });
        debouncedSyncTags(get, changed.map((item) => item.id));
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
            _tagsCloudDirty: Boolean(get()._syncUserId),
          });
        } else {
          set({
            customTags: get().customTags.map((t) => (t === oldTag ? trimmed : t)),
            _tagsCloudDirty: Boolean(get()._syncUserId),
          });
        }
        // Rename in all items
        const items = get().items;
        const updated = items.map((item) => {
          if (item.tags?.includes(oldTag)) {
            return { ...item, tags: item.tags.map((t) => (t === oldTag ? trimmed : t)) };
          }
          return item;
        });
        const changed = updated.filter((item, index) => item !== items[index]);
        set({
          items: updated,
          _pendingTagEdits: {
            ...get()._pendingTagEdits,
            ...Object.fromEntries(changed.map((item) => [item.id, item.tags || []])),
          },
        });
        debouncedSyncTags(get, changed.map((item) => item.id));
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
        console.warn(`[THREADMAP Store] Item ${id} not found, ignoring selection`);
        return;
      }
    }
    set({ selectedItemId: id, detailPanelOpen: id !== null });
  },

  detailPanelOpen: false,
  setDetailPanelOpen: (open) =>
    set({ detailPanelOpen: open, selectedItemId: open ? get().selectedItemId : null }),

      sidebarOpen: false,
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
      name: TAGS_STORAGE_KEY,
      partialize: (state) => ({
        customTags: state.customTags,
        removedDefaultTags: state.removedDefaultTags,
        _tagsCloudDirty: state._tagsCloudDirty,
        _tagsBaseRevision: state._tagsBaseRevision,
        _tagsBaseUpdatedAt: state._tagsBaseUpdatedAt,
        _pendingTagEdits: state._pendingTagEdits,
      }),
      merge: (persisted, current) => {
        const state = persisted as
          | Partial<Pick<OrbitStore, 'customTags' | 'removedDefaultTags' | '_tagsCloudDirty' | '_tagsBaseRevision' | '_tagsBaseUpdatedAt' | '_pendingTagEdits'>>
          | undefined;
        return {
          ...current,
          customTags: sanitizeTagList(state?.customTags),
          removedDefaultTags: sanitizeTagList(state?.removedDefaultTags),
          _tagsCloudDirty: state?._tagsCloudDirty === true,
          _tagsBaseRevision: Number.isSafeInteger(state?._tagsBaseRevision) && Number(state?._tagsBaseRevision) >= 0
            ? Number(state?._tagsBaseRevision)
            : 0,
          _tagsBaseUpdatedAt: Number.isSafeInteger(state?._tagsBaseUpdatedAt) && Number(state?._tagsBaseUpdatedAt) >= 0
            ? Number(state?._tagsBaseUpdatedAt)
            : 0,
          _pendingTagEdits: sanitizePendingTagEdits(state?._pendingTagEdits),
        };
      },
      skipHydration: true,
      storage: createJSONStorage(() => verifiedLocalStateStorage),
    }
  )
);

export async function scopeOrbitStore(userId: string | null): Promise<void> {
  useOrbitStore.getState()._setSyncUserId(null);
  const target = prepareScopedStorage(TAGS_STORAGE_KEY, userId);
  useOrbitStore.persist.setOptions({ name: target.key });
  if (!target.hasPersistedState) {
    useOrbitStore.setState({
      items: [],
      customTags: [],
      removedDefaultTags: [],
      _tagsCloudDirty: false,
      _tagsBaseRevision: 0,
      _tagsBaseUpdatedAt: 0,
      _pendingTagEdits: {},
      selectedItemId: null,
      detailPanelOpen: false,
      activeTag: null,
    });
  }
  await useOrbitStore.persist.rehydrate();
  if (target.hasPersistedState) {
    useOrbitStore.setState({
      items: [],
      selectedItemId: null,
      detailPanelOpen: false,
      activeTag: null,
    });
  }
}
