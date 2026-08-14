/**
 * Unified React hook for managing item links (with memoization)
 */

import { useCallback, useMemo } from 'react';
import type { OrbitItem, ItemType } from '@/lib/types';
import {
  getLinkableItems,
  getParentableItems,
  setParent,
  getItemRelationships,
  type ItemRelationships
} from '@/lib/links';
import { linkItems, unlinkItems } from '@/lib/firestore';

export interface UseLinksProps {
  item: OrbitItem;
  allItems: OrbitItem[];
  onUpdate: (updates: Partial<OrbitItem>) => void | Promise<unknown>;
}

export interface UseLinksReturn {
  relationships: ItemRelationships;
  linkableItems: OrbitItem[];
  parentableItems: OrbitItem[];

  handleAddLink: (targetId: string) => Promise<void>;
  handleRemoveLink: (targetId: string) => Promise<void>;
  handleSetParent: (parentId: string | undefined) => Promise<void>;
  isLinked: (targetId: string) => boolean;
  canLink: (targetId: string) => boolean;
  getLinkableByType: (type: ItemType) => OrbitItem[];
  getParentableByType: (type: ItemType) => OrbitItem[];
}

export function useLinks({ item, allItems, onUpdate }: UseLinksProps): UseLinksReturn {
  const relationships = useMemo(
    () => getItemRelationships(item, allItems),
    [item, allItems]
  );

  const linkableItems = useMemo(
    () => getLinkableItems(item, allItems),
    [item, allItems]
  );

  const parentableItems = useMemo(
    () => getParentableItems(item, allItems),
    [item, allItems]
  );

  const handleAddLink = useCallback(async (targetId: string) => {
    if (!linkableItems.some(i => i.id === targetId)) return;
    try {
      await linkItems(item.id, targetId);
    } catch {
      // Keep link controls quiet; persistence helpers already roll back failed writes.
    }
  }, [item.id, linkableItems]);

  const isLinked = useCallback((targetId: string) => {
    return (
      (item.linkedIds || []).includes(targetId) ||
      relationships.reverseLinked.some(i => i.id === targetId)
    );
  }, [item.linkedIds, relationships.reverseLinked]);

  const handleRemoveLink = useCallback(async (targetId: string) => {
    if (!isLinked(targetId)) return;
    try {
      await unlinkItems(item.id, targetId);
    } catch {
      // Keep link controls quiet; persistence helpers already roll back failed writes.
    }
  }, [item.id, isLinked]);

  const handleSetParent = useCallback(async (parentId: string | undefined) => {
    const updates = setParent(item, parentId, allItems);
    if (Object.keys(updates).length > 0) {
      if (parentId && isLinked(parentId)) {
        try {
          await unlinkItems(item.id, parentId);
        } catch {
          // A failed unlink should not block setting the hierarchy relation.
        }
      }
      await onUpdate(updates);
    }
  }, [item, allItems, onUpdate, isLinked]);

  const canLink = useCallback((targetId: string) => {
    return linkableItems.some(i => i.id === targetId);
  }, [linkableItems]);

  const getLinkableByType = useCallback((type: ItemType) => {
    return getLinkableItems(item, allItems, type);
  }, [item, allItems]);

  const getParentableByType = useCallback((type: ItemType) => {
    return getParentableItems(item, allItems, type);
  }, [item, allItems]);

  return {
    relationships,
    linkableItems,
    parentableItems,
    handleAddLink,
    handleRemoveLink,
    handleSetParent,
    isLinked,
    canLink,
    getLinkableByType,
    getParentableByType
  };
}
