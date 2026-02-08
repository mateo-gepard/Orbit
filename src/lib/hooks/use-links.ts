/**
 * Unified React hook for managing item links
 */

import { useCallback } from 'react';
import type { OrbitItem, ItemType } from '@/lib/types';
import {
  getLinkedItems,
  getReverseLinkedItems,
  getParentItem,
  getChildItems,
  getAllRelatedItems,
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
  // Getters
  linkedItems: OrbitItem[];
  reverseLinkedItems: OrbitItem[];
  parentItem: OrbitItem | undefined;
  childItems: OrbitItem[];
  allRelatedItems: OrbitItem[];
  linkableItems: OrbitItem[];
  relationships: ItemRelationships;
  
  // Actions
  handleAddLink: (targetId: string) => void;
  handleRemoveLink: (targetId: string) => void;
  handleSetParent: (parentId: string | undefined) => void;
  isLinked: (targetId: string) => boolean;
  canLink: (targetId: string) => boolean;
  getLinkableByType: (type: ItemType) => OrbitItem[];
}

/**
 * Unified hook for managing all types of item relationships
 */
export function useLinks({ item, allItems, onUpdate }: UseLinksProps): UseLinksReturn {
  // Getters
  const linkedItems = getLinkedItems(item, allItems);
  const reverseLinkedItems = getReverseLinkedItems(item, allItems);
  const parentItem = getParentItem(item, allItems);
  const childItems = getChildItems(item, allItems);
  const allRelatedItems = getAllRelatedItems(item, allItems);
  const linkableItems = getLinkableItems(item, allItems);
  const relationships = getItemRelationships(item, allItems);
  
  // Actions
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
    linkedItems,
    reverseLinkedItems,
    parentItem,
    childItems,
    allRelatedItems,
    linkableItems,
    relationships,
    handleAddLink,
    handleRemoveLink,
    handleSetParent,
    isLinked,
    canLink,
    getLinkableByType
  };
}
