import type { ItemType, ThreadmapItem } from './types';

/**
 * Types that have a completion lifecycle, and so belong in a progress ratio.
 *
 * Notes, events and habits never reach `status: 'done'` — habits track
 * `completions` per day instead, and a note or an event is reference material,
 * not work to finish. Counting them only ever grows the denominator, which is
 * how attaching three reference notes to a goal with two finished tasks made
 * it read 40% and capped it below 100% permanently.
 */
const COMPLETABLE_TYPES: ReadonlySet<ItemType> = new Set<ItemType>(['task', 'project', 'goal']);

export interface ProgressStats {
  total: number;
  done: number;
  inProgress: number;
  waiting: number;
  /** Whole percent, 0 when nothing countable is attached. */
  progress: number;
}

export function isCompletable(item: ThreadmapItem): boolean {
  return COMPLETABLE_TYPES.has(item.type);
}

function summarise(items: ThreadmapItem[]): ProgressStats {
  const total = items.length;
  const done = items.filter((item) => item.status === 'done').length;
  return {
    total,
    done,
    inProgress: items.filter((item) => item.status === 'active').length,
    waiting: items.filter((item) => item.status === 'waiting').length,
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

/**
 * Everything attached to a goal, as child or as link, that can actually
 * complete. Archived items are excluded — they are no longer part of the work.
 */
export function getGoalRelatedItems(items: ThreadmapItem[], goalId: string): ThreadmapItem[] {
  const goal = items.find((item) => item.id === goalId);
  if (!goal) return [];
  return items.filter((candidate) => (
    candidate.id !== goalId
    && candidate.status !== 'archived'
    && (
      candidate.parentId === goalId
      || Boolean(goal.linkedIds?.includes(candidate.id))
      || Boolean(candidate.linkedIds?.includes(goalId))
    )
  ));
}

export interface GoalStats extends ProgressStats {
  /** Everything attached, including items that cannot complete. */
  relatedCount: number;
}

export function getGoalStats(items: ThreadmapItem[], goalId: string): GoalStats {
  const related = getGoalRelatedItems(items, goalId);
  return {
    ...summarise(related.filter(isCompletable)),
    relatedCount: related.length,
  };
}

/**
 * A project's tasks: direct children plus tasks nested under the project's
 * goals (which the Projects view calls milestones).
 *
 * This is the single definition. The Projects page and the dashboard used to
 * compute it separately — they agreed, but `dashboard.ts` carried the comment
 * "Match the Projects view", which is exactly the note you leave on a copy
 * that is free to drift.
 */
export function getProjectTasks(items: ThreadmapItem[], projectId: string): ThreadmapItem[] {
  const goalIds = new Set(
    items
      .filter((item) => item.type === 'goal' && item.parentId === projectId && item.status !== 'archived')
      .map((item) => item.id)
  );
  return items.filter((item) => (
    item.type === 'task'
    && item.status !== 'archived'
    && (item.parentId === projectId || (Boolean(item.parentId) && goalIds.has(item.parentId!)))
  ));
}

export function getProjectStats(items: ThreadmapItem[], projectId: string): ProgressStats {
  return summarise(getProjectTasks(items, projectId));
}

export function getProjectTaskProgress(items: ThreadmapItem[], projectId: string): number {
  return getProjectStats(items, projectId).progress;
}
