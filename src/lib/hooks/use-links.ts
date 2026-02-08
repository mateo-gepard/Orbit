/**
 * Unified React hook for managing item links (with memoization)
 */

import { useCallback, useMemo } from 'react';
import type { OrbitItem, ItemType } from '@/lib/types';
import {
  getLinkableItems,
  addLink,
  removeLink,
  setParent,
  getItemRelationships,
  type ItemRelationships
} from '@/lib/links';

export interface UseLinksProps {
  item: OrbitItem;
  allItems: OrbitItem[];
  onUpdate: (updates: Partial<OrbitItem>) => void | Promise<void>;
}

export interface UseLinksReturn {
  relationships: ItemRelationships;
  linkableItems: OrbitItem[];

  handleAddLink: (targetId: string) => void;
  handleRemoveLink: (targetId: string) => void;
  handleSetParent: (parentId: string | undefined) => void;
  isLinked: (targetId: string) => boolean;
  canLink: (targetId: string) => boolean;
  getLinkableByType: (type: ItemType) => OrbitItem[];
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

  const handleAddLink = useCallback((targetId: string) => {
    const updates = addLink(item, targetId);
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  }, [item, onUpdate]);

  const handleRemoveLink = useCallback((targetId: string) => {
    const updates = removeLink(item, targetId);
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  }, [item, onUpdate]);

  const handleSetParent = useCallback((parentId: string | undefined) => {
    const updates = setParent(item, parentId, allItems);
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  }, [item, allItems, onUpdate]);

  const isLinked = useCallback((targetId: string) => {
    return (item.linkedIds || []).includes(targetId);
  }, [item.linkedIds]);

  const canLink = useCallback((targetId: string) => {
    return linkableItems.some(i => i.id === targetId);
  }, [linkableItems]);

  const getLinkableByType = useCallback((type: ItemType) => {
    return getLinkableItems(item, allItems, type);
  }, [item, allItems]);

  return {
    relationships,
    linkableItems,
    handleAddLink,
    handleRemoveLink,
    handleSetParent,
    isLinked,
    canLink,
    getLinkableByType
  };
}
