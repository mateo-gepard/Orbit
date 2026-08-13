/**
 * Unified Linking System for Threadmap
 * 
 * This module provides bulletproof utilities for managing bidirectional links
 * between items, parent-child relationships, and graph traversal.
 */

import type { ThreadmapItem, ItemType } from './types';

const ALLOWED_PARENT_TYPES: Record<ItemType, ItemType[]> = {
  // Projects nest. Goals were the only intermediate layer, so a large effort
  // like a multi-year roadmap could not be broken into sub-projects at all.
  // `canSetParent` already refuses any parent that is one of the item's own
  // descendants, so the cycle guard this needs is in place.
  project: ['project'],
  goal: ['project'],
  task: ['project', 'goal'],
  event: ['project', 'goal'],
  note: ['project', 'goal'],
  habit: ['project', 'goal'],
};

export function getAllowedParentTypes(type: ItemType): ItemType[] {
  return ALLOWED_PARENT_TYPES[type] || [];
}

/**
 * Get all items that are directly linked to the given item
 */
export function getLinkedItems(item: ThreadmapItem, allItems: ThreadmapItem[]): ThreadmapItem[] {
  return (item.linkedIds || [])
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is ThreadmapItem => i !== undefined && i.status !== 'archived');
}

/**
 * Get all items that link TO the given item (reverse links)
 */
export function getReverseLinkedItems(item: ThreadmapItem, allItems: ThreadmapItem[]): ThreadmapItem[] {
  return allItems.filter(i => 
    i.linkedIds?.includes(item.id) && 
    i.status !== 'archived' &&
    i.id !== item.id
  );
}

/**
 * Get the parent item of the given item
 */
export function getParentItem(item: ThreadmapItem, allItems: ThreadmapItem[]): ThreadmapItem | undefined {
  if (!item.parentId) return undefined;
  return allItems.find(i => i.id === item.parentId && i.status !== 'archived');
}

/**
 * Get all child items of the given item
 */
export function getChildItems(item: ThreadmapItem, allItems: ThreadmapItem[]): ThreadmapItem[] {
  return allItems.filter(i => 
    i.parentId === item.id && 
    i.status !== 'archived'
  );
}

/**
 * Get all descendants (children, grandchildren, etc.) recursively
 */
export function getAllDescendants(item: ThreadmapItem, allItems: ThreadmapItem[], visited = new Set<string>()): ThreadmapItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  const children = getChildItems(item, allItems);
  const descendants: ThreadmapItem[] = [...children];
  
  for (const child of children) {
    descendants.push(...getAllDescendants(child, allItems, visited));
  }
  
  return descendants;
}

/**
 * Get all ancestors (parent, grandparent, etc.) recursively
 */
export function getAllAncestors(item: ThreadmapItem, allItems: ThreadmapItem[], visited = new Set<string>()): ThreadmapItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  const parent = getParentItem(item, allItems);
  if (!parent) return [];
  
  return [parent, ...getAllAncestors(parent, allItems, visited)];
}

/**
 * Get ALL related items following any connection type recursively
 * (links, reverse links, parent, children)
 */
export function getAllRelatedItems(item: ThreadmapItem, allItems: ThreadmapItem[], visited = new Set<string>()): ThreadmapItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  const related: ThreadmapItem[] = [];
  
  // Get all immediate connections
  const linkedItems = getLinkedItems(item, allItems);
  const reverseLinked = getReverseLinkedItems(item, allItems);
  const parent = getParentItem(item, allItems);
  const children = getChildItems(item, allItems);
  
  const immediateConnections = [
    ...linkedItems,
    ...reverseLinked,
    ...(parent ? [parent] : []),
    ...children
  ];
  
  // Add immediate connections and recurse through each
  for (const connectedItem of immediateConnections) {
    if (!visited.has(connectedItem.id)) {
      related.push(connectedItem);
      related.push(...getAllRelatedItems(connectedItem, allItems, visited));
    }
  }
  
  return related;
}

/**
 * Get all items that can be linked to the given item
 * (excludes self, already linked, parent, children, archived)
 */
export function getLinkableItems(item: ThreadmapItem, allItems: ThreadmapItem[], typeFilter?: ItemType): ThreadmapItem[] {
  const reverseLinkedIds = getReverseLinkedItems(item, allItems).map(i => i.id);
  const excludedIds = new Set([
    item.id,
    ...(item.linkedIds || []),
    ...reverseLinkedIds,
    ...(item.parentId ? [item.parentId] : []),
    ...getAllAncestors(item, allItems).map(i => i.id),
    ...getAllDescendants(item, allItems).map(i => i.id),
  ]);
  
  return allItems.filter(i => 
    !excludedIds.has(i.id) &&
    i.status !== 'archived' &&
    (typeFilter ? i.type === typeFilter : true)
  );
}

/**
 * Get items that can be used as a hierarchy parent for the given item.
 */
export function getParentableItems(item: ThreadmapItem, allItems: ThreadmapItem[], typeFilter?: ItemType): ThreadmapItem[] {
  const allowedTypes = getAllowedParentTypes(item.type);
  if (allowedTypes.length === 0) return [];

  return allItems.filter(i =>
    i.id !== item.parentId &&
    canSetParent(item, i, allItems) &&
    (typeFilter ? i.type === typeFilter : true)
  );
}

export function canSetParent(item: ThreadmapItem, potentialParent: ThreadmapItem, allItems: ThreadmapItem[]): boolean {
  if (potentialParent.id === item.id) return false;
  if (potentialParent.status === 'archived') return false;
  if (!getAllowedParentTypes(item.type).includes(potentialParent.type)) return false;

  const descendants = getAllDescendants(item, allItems);
  if (descendants.some(descendant => descendant.id === potentialParent.id)) return false;

  return true;
}

/**
 * Set parent for an item
 */
export function setParent(item: ThreadmapItem, parentId: string | undefined, allItems: ThreadmapItem[]): Partial<ThreadmapItem> {
  if (item.parentId === parentId) return {};

  // Prevent circular parent relationships
  if (parentId) {
    const potentialParent = allItems.find(i => i.id === parentId);
    if (!potentialParent) return {};

    if (!canSetParent(item, potentialParent, allItems)) return {};
  }
  
  return { parentId };
}

/**
 * Get a categorized view of all relationships for an item
 */
export interface ItemRelationships {
  parent?: ThreadmapItem;
  ancestors: ThreadmapItem[];
  children: ThreadmapItem[];
  descendants: ThreadmapItem[];
  linked: ThreadmapItem[];
  reverseLinked: ThreadmapItem[];
  allRelated: ThreadmapItem[];
}

export function getItemRelationships(item: ThreadmapItem, allItems: ThreadmapItem[]): ItemRelationships {
  const parent = getParentItem(item, allItems);
  const ancestors = getAllAncestors(item, allItems);
  const children = getChildItems(item, allItems);
  const descendants = getAllDescendants(item, allItems);
  const linked = getLinkedItems(item, allItems);
  const reverseLinked = getReverseLinkedItems(item, allItems);
  const allRelated = getAllRelatedItems(item, allItems);
  
  return {
    parent,
    ancestors,
    children,
    descendants,
    linked,
    reverseLinked,
    allRelated
  };
}
