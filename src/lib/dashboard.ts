import type { ThreadmapItem } from './types';
import { normalizeRecurrence, recurrenceOccursOnDate } from './recurrence';

/**
 * Calendar events remain visible on every local date in their inclusive span.
 *
 * A repeating event is one item carrying a rule, so its later occurrences are
 * computed here rather than existing as hundreds of separate items.
 */
export function eventOccursOnDate(event: ThreadmapItem, dateKey: string): boolean {
  if (event.type !== 'event' || event.status === 'archived') return false;
  const start = event.startDate || event.dueDate;
  if (!start) return false;

  const end = event.endDate || start;
  if (start <= dateKey && end >= dateKey) return true;

  const rule = normalizeRecurrence(event.recurrence);
  if (!rule) return false;

  // Multi-day series repeat their whole span, so check each day the event
  // could have started on and still be running on `dateKey`.
  const spanDays = Math.max(
    0,
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
  );
  for (let offset = 0; offset <= spanDays; offset += 1) {
    const candidate = new Date(Date.parse(`${dateKey}T00:00:00Z`) - offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (recurrenceOccursOnDate(start, rule, candidate)) return true;
  }
  return false;
}

// Project progress lives in `./progress`, which both the dashboard and the
// Projects view call. Re-exported here so existing dashboard imports keep
// working without a second definition to keep in step.
export { getProjectTaskProgress } from './progress';
