import type { OrbitItem } from './types';

/** Calendar events remain visible on every local date in their inclusive span. */
export function eventOccursOnDate(event: OrbitItem, dateKey: string): boolean {
  if (event.type !== 'event' || event.status === 'archived') return false;
  const start = event.startDate || event.dueDate;
  if (!start) return false;
  const end = event.endDate || start;
  return start <= dateKey && end >= dateKey;
}

/** Match the Projects view: direct tasks plus tasks nested under project goals. */
export function getProjectTaskProgress(items: OrbitItem[], projectId: string): number {
  const goalIds = new Set(
    items
      .filter((item) => item.type === 'goal' && item.parentId === projectId && item.status !== 'archived')
      .map((item) => item.id)
  );
  const tasks = items.filter((item) => (
    item.type === 'task'
    && item.status !== 'archived'
    && (item.parentId === projectId || (Boolean(item.parentId) && goalIds.has(item.parentId!)))
  ));
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((item) => item.status === 'done').length / tasks.length) * 100);
}
