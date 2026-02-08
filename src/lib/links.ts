/**
 * Unified Linking System for ORBIT
 * 
 * This module provides bulletproof utilities for managing bidirectional links
 * between items, parent-child relationships, and graph traversal.
 */

import type { OrbitItem, ItemType } from './types';

/**
 * Get all items that are directly linked to the given item
 */
export function getLinkedItems(item: OrbitItem, allItems: OrbitItem[]): OrbitItem[] {
  return (item.linkedIds || [])
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is OrbitItem => i !== undefined && i.status !== 'archived');
}

/**
 * Get all items that link TO the given item (reverse links)
 */
export function getReverseLinkedItems(item: OrbitItem, allItems: OrbitItem[]): OrbitItem[] {
  return allItems.filter(i => 
    i.linkedIds?.includes(item.id) && 
    i.status !== 'archived' &&
    i.id !== item.id
  );
}

/**
 * Get the parent item of the given item
 */
export function getParentItem(item: OrbitItem, allItems: OrbitItem[]): OrbitItem | undefined {
  if (!item.parentId) return undefined;
  return allItems.find(i => i.id === item.parentId && i.status !== 'archived');
}

/**
 * Get all child items of the given item
 */
export function getChildItems(item: OrbitItem, allItems: OrbitItem[]): OrbitItem[] {
  return allItems.filter(i => 
    i.parentId === item.id && 
    i.status !== 'archived'
  );
}

/**
 * Get all descendants (children, grandchildren, etc.) recursively
 */
export function getAllDescendants(item: OrbitItem, allItems: OrbitItem[], visited = new Set<string>()): OrbitItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  const children = getChildItems(item, allItems);
  const descendants: OrbitItem[] = [...children];
  
  for (const child of children) {
    descendants.push(...getAllDescendants(child, allItems, visited));
  }
  
  return descendants;
}

/**
 * Get all ancestors (parent, grandparent, etc.) recursively
 */
export function getAllAncestors(item: OrbitItem, allItems: OrbitItem[], visited = new Set<string>()): OrbitItem[] {
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
export function getAllRelatedItems(item: OrbitItem, allItems: OrbitItem[], visited = new Set<string>()): OrbitItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  const related: OrbitItem[] = [];
  
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
 * Check if two items are connected (directly or indirectly)
 */
export function areItemsConnected(item1: OrbitItem, item2: OrbitItem, allItems: OrbitItem[]): boolean {
  const allRelated = getAllRelatedItems(item1, allItems);
  return allRelated.some(i => i.id === item2.id);
}

/**
 * Get all items that can be linked to the given item
 * (excludes self, already linked, parent, children, archived)
 */
export function getLinkableItems(item: OrbitItem, allItems: OrbitItem[], typeFilter?: ItemType): OrbitItem[] {
  const excludedIds = new Set([
    item.id,
    ...(item.linkedIds || []),
    ...(item.parentId ? [item.parentId] : []),
    ...getChildItems(item, allItems).map(i => i.id)
  ]);
  
  return allItems.filter(i => 
    !excludedIds.has(i.id) &&
    i.status !== 'archived' &&
    (typeFilter ? i.type === typeFilter : true)
  );
}

/**
 * Add a link between two items (bidirectional is optional)
 */
export function addLink(item: OrbitItem, targetId: string): Partial<OrbitItem> {
  const linkedIds = item.linkedIds || [];
  if (linkedIds.includes(targetId)) {
    return {}; // Already linked
  }
  return { linkedIds: [...linkedIds, targetId] };
}

/**
 * Remove a link between two items
 */
export function removeLink(item: OrbitItem, targetId: string): Partial<OrbitItem> {
  const linkedIds = item.linkedIds || [];
  if (!linkedIds.includes(targetId)) {
    return {}; // Not linked
  }
  return { linkedIds: linkedIds.filter(id => id !== targetId) };
}

/**
 * Set parent for an item
 */
export function setParent(item: OrbitItem, parentId: string | undefined, allItems: OrbitItem[]): Partial<OrbitItem> {
  // Prevent circular parent relationships
  if (parentId) {
    const potentialParent = allItems.find(i => i.id === parentId);
    if (!potentialParent) return {};
    
    // Check if setting this parent would create a cycle
    const ancestors = getAllAncestors(potentialParent, allItems);
    if (ancestors.some(a => a.id === item.id)) {
      return {}; // Prevented circular parent relationship
    }
  }
  
  return { parentId };
}

/**
 * Get a categorized view of all relationships for an item
 */
export interface ItemRelationships {
  parent?: OrbitItem;
  ancestors: OrbitItem[];
  children: OrbitItem[];
  descendants: OrbitItem[];
  linked: OrbitItem[];
  reverseLinked: OrbitItem[];
  allRelated: OrbitItem[];
}

export function getItemRelationships(item: OrbitItem, allItems: OrbitItem[]): ItemRelationships {
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
