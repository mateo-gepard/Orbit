export const DISPATCH_DAY_START_MINUTES = 8 * 60;
export const DISPATCH_DAY_END_MINUTES = 22 * 60;

export interface DispatchBusyInterval {
  /** Minutes after midnight, clipped to the Dispatch planning window. */
  startMinutes: number;
  /** Exclusive minutes after midnight, clipped to the Dispatch planning window. */
  endMinutes: number;
  title: string;
  allDay: boolean;
}

export interface DispatchCalendarEvent {
  type: string;
  status: string;
  title: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}

/** Round planning forward to the next half-hour without scheduling before 08:00. */
export function getDispatchStartMinutes(now: Date): number {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(
    DISPATCH_DAY_START_MINUTES,
    Math.ceil(currentMinutes / 30) * 30,
  );
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function toMinutes(value: string | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : null;
}

/**
 * Returns active calendar events which occupy the provided local date. Date-only
 * events deliberately reserve the entire Dispatch window: treating an all-day
 * event as a free day is a much worse surprise than leaving tasks unscheduled.
 */
export function getDispatchBusyIntervals(
  events: DispatchCalendarEvent[],
  date: string,
): DispatchBusyInterval[] {
  const intervals: DispatchBusyInterval[] = [];

  for (const event of events) {
    if (event.type !== 'event' || event.status !== 'active' || !isIsoDate(event.startDate)) continue;
    const endDate = isIsoDate(event.endDate) ? event.endDate : event.startDate;
    if (date < event.startDate || date > endDate) continue;

    const startTime = toMinutes(event.startTime);
    const endTime = toMinutes(event.endTime);
    const allDay = startTime === null && endTime === null;
    let startMinutes = allDay || date > event.startDate ? 0 : startTime ?? 0;
    let endMinutes = allDay || date < endDate ? 24 * 60 : endTime ?? 24 * 60;

    // A malformed or zero-length timed event should not create an impossible
    // gap. Calendar providers normally encode overnight spans using endDate.
    if (!allDay && endMinutes <= startMinutes) endMinutes = 24 * 60;

    startMinutes = Math.max(DISPATCH_DAY_START_MINUTES, startMinutes);
    endMinutes = Math.min(DISPATCH_DAY_END_MINUTES, endMinutes);
    if (endMinutes <= startMinutes) continue;
    intervals.push({
      startMinutes,
      endMinutes,
      title: event.title || 'Untitled event',
      allDay,
    });
  }

  return mergeDispatchBusyIntervals(intervals);
}

/** Merge overlapping intervals so every later scheduling decision is deterministic. */
export function mergeDispatchBusyIntervals(intervals: DispatchBusyInterval[]): DispatchBusyInterval[] {
  const sorted = intervals
    .filter((interval) => interval.endMinutes > interval.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  const merged: DispatchBusyInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.startMinutes <= previous.endMinutes) {
      previous.endMinutes = Math.max(previous.endMinutes, interval.endMinutes);
      previous.allDay ||= interval.allDay;
      if (!previous.title.includes(interval.title)) previous.title = `${previous.title} · ${interval.title}`;
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Find the first in-hours gap that fits the full focus block. */
export function findDispatchSlot(
  requestedStartMinutes: number,
  durationMinutes: number,
  busyIntervals: DispatchBusyInterval[],
): number | null {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  let candidate = Math.max(DISPATCH_DAY_START_MINUTES, Math.ceil(requestedStartMinutes / 30) * 30);
  for (const busy of busyIntervals) {
    if (candidate + durationMinutes <= busy.startMinutes) break;
    if (candidate < busy.endMinutes) candidate = Math.ceil(busy.endMinutes / 30) * 30;
  }
  return candidate + durationMinutes <= DISPATCH_DAY_END_MINUTES ? candidate : null;
}

export interface DispatchBlockTiming {
  startHour: number;
  startMin: number;
  durationMin: number;
}

/**
 * Places an ordered plan into free time. `null` means the reordered plan cannot
 * fit today, so callers can keep the existing safe plan instead of overlapping it.
 */
export function reflowDispatchBlocks<T extends DispatchBlockTiming>(
  blocks: T[],
  now: Date,
  busyIntervals: DispatchBusyInterval[],
): T[] | null {
  let requestedStart = getDispatchStartMinutes(now);
  const reflowed: T[] = [];
  for (const block of blocks) {
    const start = findDispatchSlot(requestedStart, block.durationMin, busyIntervals);
    if (start === null) return null;
    reflowed.push({
      ...block,
      startHour: Math.floor(start / 60),
      startMin: start % 60,
    });
    requestedStart = start + block.durationMin + 15;
  }
  return reflowed;
}
