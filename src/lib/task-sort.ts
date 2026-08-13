import type { ThreadmapItem } from './types';

export type SortKey = 'dueDate' | 'priority' | 'createdAt' | 'title';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Sort tasks.
 *
 * Every comparator here is written ascending-natural and the direction is
 * applied inside it, rather than reversing the finished array. Reversing had
 * two consequences: tasks deliberately pushed to the end for having no due
 * date flipped to the *front* in descending order — so "furthest-out work" led
 * with everything unscheduled — and the `createdAt` comparator had to be
 * written backwards, which made the direction arrow disagree with the list.
 */
export function sortTasks(tasks: ThreadmapItem[], sortKey: SortKey, ascending: boolean): ThreadmapItem[] {
  const direction = ascending ? 1 : -1;
  return [...tasks].sort((a, b) => {
    switch (sortKey) {
      case 'dueDate': {
        // Undated tasks stay last in both directions: their position is not a
        // point on the scale being sorted.
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate) * direction;
      }
      case 'priority': {
        const pa = PRIORITY_ORDER[a.priority || ''] ?? 3;
        const pb = PRIORITY_ORDER[b.priority || ''] ?? 3;
        return (pa - pb) * direction;
      }
      case 'createdAt':
        return ((a.createdAt || 0) - (b.createdAt || 0)) * direction;
      case 'title':
        return a.title.localeCompare(b.title) * direction;
      default:
        return 0;
    }
  });
}

/**
 * The direction a sort key opens in. "Newest" means newest first, so it opens
 * descending — and now renders ↓, which is what it has always actually done.
 */
export function defaultAscending(sortKey: SortKey): boolean {
  return sortKey !== 'createdAt';
}
