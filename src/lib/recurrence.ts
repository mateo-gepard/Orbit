/**
 * A recurrence model for events.
 *
 * There was none, which is why the Google Calendar importer had to expand
 * Google's own recurrences into one loose Threadmap item per occurrence — a
 * weekly meeting produced roughly 68 items and a daily standup roughly 455,
 * with no relationship to each other, no way to bulk-edit them, and every one
 * of them flowing into the dashboard, search results and the item count.
 *
 * One item now carries the rule, and views expand it at render time.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  freq: RecurrenceFrequency;
  /** Every N periods. Always >= 1. */
  interval: number;
  /** Weekly only. 0 = Sunday … 6 = Saturday. */
  byWeekday?: number[];
  /** Inclusive last date, `YYYY-MM-DD`. */
  until?: string;
  /** Total number of occurrences, counted from the start date. */
  count?: number;
  /** Dates the series skips, `YYYY-MM-DD` — Google's EXDATE, and edited-out instances. */
  exceptions?: string[];
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Guards runaway expansion regardless of what a rule claims. */
export const MAX_OCCURRENCES = 750;

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parse `YYYY-MM-DD` as a UTC instant, so arithmetic never crosses a DST seam. */
function parseKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function toKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addMonthsUtc(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  const targetMonth = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const candidate = Date.UTC(date.getUTCFullYear(), targetMonth, 1);
  const probe = new Date(candidate);
  const daysInTargetMonth = new Date(
    Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0)
  ).getUTCDate();
  // A 31st that lands in a 30-day month clamps rather than spilling forward.
  return Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), Math.min(day, daysInTargetMonth));
}

/**
 * Read an RFC 5545 RRULE, the form Google Calendar returns.
 *
 * Unsupported parts are ignored rather than rejected: a rule we understand
 * approximately is better than dropping the series back to loose copies.
 * Returns null only when there is no usable frequency.
 */
export function parseRRule(input: string): RecurrenceRule | null {
  const body = input.trim().replace(/^RRULE:/i, '');
  if (!body) return null;

  const parts = new Map<string, string>();
  for (const segment of body.split(';')) {
    const [key, value] = segment.split('=');
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim());
  }

  const freqRaw = parts.get('FREQ')?.toUpperCase();
  const freq = freqRaw === 'DAILY' ? 'daily'
    : freqRaw === 'WEEKLY' ? 'weekly'
      : freqRaw === 'MONTHLY' ? 'monthly'
        : freqRaw === 'YEARLY' ? 'yearly'
          : null;
  if (!freq) return null;

  const rule: RecurrenceRule = { freq, interval: 1 };

  const interval = Number(parts.get('INTERVAL'));
  if (Number.isInteger(interval) && interval > 0) rule.interval = interval;

  const byDay = parts.get('BYDAY');
  if (byDay && freq === 'weekly') {
    const days = byDay
      .split(',')
      // Strip an ordinal prefix like "2MO"; plain weekly rules have none.
      .map((token) => WEEKDAY_CODES.indexOf(token.trim().toUpperCase().slice(-2) as typeof WEEKDAY_CODES[number]))
      .filter((index) => index >= 0);
    if (days.length > 0) rule.byWeekday = [...new Set(days)].sort((a, b) => a - b);
  }

  const count = Number(parts.get('COUNT'));
  if (Number.isInteger(count) && count > 0) rule.count = count;

  const until = parts.get('UNTIL');
  if (until) {
    const match = until.match(/^(\d{4})(\d{2})(\d{2})/);
    if (match) rule.until = `${match[1]}-${match[2]}-${match[3]}`;
  }

  return rule;
}

/** Render back to an RRULE, for round-tripping to Google. */
export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && rule.byWeekday?.length) {
    parts.push(`BYDAY=${rule.byWeekday.map((day) => WEEKDAY_CODES[day]).join(',')}`);
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}T000000Z`);
  return `RRULE:${parts.join(';')}`;
}

/** Normalise anything stored on an item into a usable rule. */
export function normalizeRecurrence(value: unknown): RecurrenceRule | null {
  if (typeof value === 'string') return parseRRule(value);
  if (!value || typeof value !== 'object') return null;

  const raw = value as Partial<RecurrenceRule>;
  if (!raw.freq || !['daily', 'weekly', 'monthly', 'yearly'].includes(raw.freq)) return null;

  const rule: RecurrenceRule = {
    freq: raw.freq,
    interval: Number.isInteger(raw.interval) && (raw.interval as number) > 0 ? raw.interval as number : 1,
  };
  if (Array.isArray(raw.byWeekday)) {
    const days = raw.byWeekday.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (days.length > 0) rule.byWeekday = [...new Set(days)].sort((a, b) => a - b);
  }
  if (isDateKey(raw.until)) rule.until = raw.until;
  if (Number.isInteger(raw.count) && (raw.count as number) > 0) rule.count = raw.count as number;
  if (Array.isArray(raw.exceptions)) {
    const exceptions = raw.exceptions.filter(isDateKey);
    if (exceptions.length > 0) rule.exceptions = exceptions;
  }
  return rule;
}

/**
 * Every date the series lands on, within `[rangeStart, rangeEnd]` inclusive.
 *
 * `count` and `until` are measured from `startDate`, not from the range, so
 * asking about a window in the middle of a series gives the right answer.
 */
export function expandRecurrence(
  startDate: string,
  rule: RecurrenceRule,
  rangeStart: string,
  rangeEnd: string
): string[] {
  if (!isDateKey(startDate) || !isDateKey(rangeStart) || !isDateKey(rangeEnd)) return [];
  if (rangeEnd < rangeStart) return [];

  const exceptions = new Set(rule.exceptions ?? []);
  const hardEnd = rule.until && rule.until < rangeEnd ? rule.until : rangeEnd;

  const occurrences: string[] = [];
  let emitted = 0;

  const consider = (key: string): boolean => {
    // `count` counts occurrences of the series, including ones before the
    // window and ones the caller never sees.
    if (rule.count !== undefined && emitted >= rule.count) return false;
    emitted += 1;
    if (exceptions.has(key)) return true;
    if (key >= rangeStart && key <= hardEnd) occurrences.push(key);
    return true;
  };

  const start = parseKey(startDate);
  const limit = parseKey(hardEnd);
  const interval = Math.max(1, rule.interval);

  if (rule.freq === 'weekly' && rule.byWeekday?.length) {
    // Walk week by week from the start's own week, emitting each selected day.
    const startWeekday = new Date(start).getUTCDay();
    let weekAnchor = start - startWeekday * MS_PER_DAY;
    let guard = 0;
    while (weekAnchor <= limit && guard < MAX_OCCURRENCES) {
      for (const weekday of rule.byWeekday) {
        const stamp = weekAnchor + weekday * MS_PER_DAY;
        if (stamp < start) continue;
        if (stamp > limit) continue;
        if (!consider(toKey(stamp))) return occurrences;
        guard += 1;
        if (guard >= MAX_OCCURRENCES) break;
      }
      weekAnchor += interval * 7 * MS_PER_DAY;
    }
    return occurrences;
  }

  // Each occurrence is measured from the start date rather than from the
  // previous one. Stepping from the previous value compounds the month-length
  // clamp: a series starting on the 31st became 31, 28, 28, 28 instead of
  // 31, 28, 31, 30. RFC 5545 takes the day-of-month from DTSTART every time.
  const offsetFromStart = (step: number): number => {
    if (rule.freq === 'daily') return start + step * interval * MS_PER_DAY;
    if (rule.freq === 'weekly') return start + step * interval * 7 * MS_PER_DAY;
    if (rule.freq === 'monthly') return addMonthsUtc(start, step * interval);
    return addMonthsUtc(start, step * interval * 12);
  };

  for (let step = 0; step < MAX_OCCURRENCES; step += 1) {
    const cursor = offsetFromStart(step);
    if (cursor > limit) break;
    if (!consider(toKey(cursor))) break;
  }

  return occurrences;
}

/** Whether the series lands on one specific day. */
export function recurrenceOccursOnDate(
  startDate: string,
  rule: RecurrenceRule,
  dateKey: string
): boolean {
  if (!isDateKey(dateKey) || dateKey < startDate) return false;
  return expandRecurrence(startDate, rule, dateKey, dateKey).length > 0;
}

/**
 * Infer a rule from dates Google already expanded for us.
 *
 * Used when the importer sees a series' instances but not its master rule. It
 * only claims a pattern that the observed dates actually support, and returns
 * null otherwise, so an irregular series stays a set of individual events
 * rather than being misrepresented as regular.
 */
export function inferRecurrence(dateKeys: string[]): RecurrenceRule | null {
  const sorted = [...new Set(dateKeys.filter(isDateKey))].sort();
  if (sorted.length < 2) return null;

  const parsed = sorted.map((key) => new Date(parseKey(key)));

  // Same calendar day every year — check before day arithmetic, so an annual
  // birthday reads as yearly rather than "every 365 days" (which drifts).
  const monthDays = new Set(parsed.map((date) => `${date.getUTCMonth()}-${date.getUTCDate()}`));
  if (monthDays.size === 1) {
    const yearGaps: number[] = [];
    for (let i = 1; i < parsed.length; i += 1) {
      yearGaps.push(parsed[i].getUTCFullYear() - parsed[i - 1].getUTCFullYear());
    }
    if (yearGaps.every((gap) => gap === yearGaps[0]) && yearGaps[0] > 0) {
      return { freq: 'yearly', interval: yearGaps[0] };
    }
  }

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(Math.round((parseKey(sorted[i]) - parseKey(sorted[i - 1])) / MS_PER_DAY));
  }

  const uniformGap = gaps.every((gap) => gap === gaps[0]) ? gaps[0] : null;
  if (uniformGap !== null && uniformGap > 0) {
    if (uniformGap % 7 === 0) {
      return { freq: 'weekly', interval: uniformGap / 7 };
    }
    return { freq: 'daily', interval: uniformGap };
  }

  // Same weekday set every week (a Mon/Wed/Fri standup, say).
  const weekdays = [...new Set(sorted.map((key) => new Date(parseKey(key)).getUTCDay()))].sort();
  if (weekdays.length > 1 && weekdays.length <= 7) {
    const spanWeeks = Math.ceil(
      (parseKey(sorted[sorted.length - 1]) - parseKey(sorted[0])) / (7 * MS_PER_DAY)
    ) + 1;
    if (sorted.length >= weekdays.length * Math.max(1, spanWeeks - 1)) {
      return { freq: 'weekly', interval: 1, byWeekday: weekdays };
    }
  }

  // Same day-of-month each month.
  const domSet = new Set(sorted.map((key) => new Date(parseKey(key)).getUTCDate()));
  if (domSet.size === 1) return { freq: 'monthly', interval: 1 };

  return null;
}
