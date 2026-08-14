import { inferRecurrence, parseRRule, type RecurrenceRule } from './recurrence';
import type { GCalEvent } from './google-calendar';

/**
 * Collapse Google's expanded instances back into one event per series.
 *
 * The importer asks Google for `singleEvents=true` over a window of −90 days
 * to +1 year, which is right — it is the only way to get concrete times and
 * per-instance edits. What was wrong is that each expanded instance then
 * became its own Threadmap item: a weekly meeting produced roughly 68 and a
 * daily standup roughly 455, carrying no relationship to each other, unable to
 * be bulk-edited, and all of them flowing into the dashboard week strip, the
 * calendar, search results and the item count.
 *
 * One representative per series survives, carrying the rule. Instances Google
 * reports as cancelled become exceptions on that rule, which is exactly what
 * they are.
 */

export interface CollapsedSeries {
  /** The event to import, with its `id` set to the stable series id. */
  event: GCalEvent;
  rule: RecurrenceRule | null;
  /** How many instances Google returned inside the sync window. */
  instanceCount: number;
}

function startKey(event: GCalEvent): string | null {
  const raw = event.start?.dateTime ?? event.start?.date;
  if (!raw) return null;
  const key = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/**
 * Split into series representatives and ordinary one-off events.
 *
 * `recurringEventId` is Google's id for the series master, so it is stable
 * across syncs even as the sliding window changes which instances are visible.
 * The representative takes it as its own id, which keeps the existing
 * match-by-`googleCalendarId` update and cancellation paths working unchanged
 * — they simply now operate on the series.
 */
export function collapseRecurringInstances(events: GCalEvent[]): {
  events: GCalEvent[];
  series: Map<string, CollapsedSeries>;
} {
  const singles: GCalEvent[] = [];
  const groups = new Map<string, GCalEvent[]>();

  for (const event of events) {
    const seriesId = event.recurringEventId;
    if (!seriesId) {
      singles.push(event);
      continue;
    }
    const group = groups.get(seriesId);
    if (group) group.push(event);
    else groups.set(seriesId, [event]);
  }

  const series = new Map<string, CollapsedSeries>();
  const collapsed: GCalEvent[] = [];

  for (const [seriesId, instances] of groups) {
    const ordered = [...instances].sort((a, b) => (startKey(a) ?? '').localeCompare(startKey(b) ?? ''));
    const live = ordered.filter((instance) => instance.status !== 'cancelled');

    // Every instance cancelled means the series itself is gone. Keep one
    // cancelled representative so the delete pass can act on it.
    if (live.length === 0) {
      collapsed.push({ ...ordered[0], id: seriesId });
      continue;
    }

    const representative = live[0];
    const liveKeys = live.map(startKey).filter((key): key is string => Boolean(key));

    // Prefer the master's own rule when Google sent one; otherwise read the
    // pattern off the instances it actually returned.
    const declared = representative.recurrence?.map(parseRRule).find(Boolean) ?? null;
    const rule = declared ?? inferRecurrence(liveKeys);

    if (rule) {
      const firstKey = liveKeys[0];
      const exceptions = ordered
        .filter((instance) => instance.status === 'cancelled')
        .map(startKey)
        .filter((key): key is string => Boolean(key) && key! > firstKey);
      if (exceptions.length > 0) {
        rule.exceptions = [...new Set([...(rule.exceptions ?? []), ...exceptions])];
      }
    }

    const event: GCalEvent = { ...representative, id: seriesId };
    collapsed.push(event);
    series.set(seriesId, { event, rule, instanceCount: live.length });
  }

  return { events: [...singles, ...collapsed], series };
}
