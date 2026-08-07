import type { OrbitItem } from './types';

/** Calendar events remain visible on every local date in their inclusive span. */
export function eventOccursOnDate(event: OrbitItem, dateKey: string): boolean {
  if (event.type !== 'event' || event.status === 'archived') return false;
  const start = event.startDate || event.dueDate;
  if (!start) return false;
  const end = event.endDate || start;
  return start <= dateKey && end >= dateKey;
}

// Project progress lives in `./progress`, which both the dashboard and the
// Projects view call. Re-exported here so existing dashboard imports keep
// working without a second definition to keep in step.
export { getProjectTaskProgress } from './progress';
