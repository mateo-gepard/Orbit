import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { de } from "date-fns/locale/de"
import { enUS } from "date-fns/locale/en-US"
import type { DateFormat, TimeFormat, Language, WeekStart } from "./settings-store"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Settings-aware date formatting ─────────────────────────

/** Get date-fns Locale object from a Language code */
export function getLocale(lang: Language = 'en') {
  return lang === 'de' ? de : enUS;
}

/** Convert WeekStart setting to date-fns weekStartsOn number */
export function getWeekStartsOn(ws: WeekStart = 'monday'): 0 | 1 {
  return ws === 'sunday' ? 0 : 1;
}

/** Map DateFormat setting to a date-fns format string */
function dateFmtToPattern(df: DateFormat): string {
  switch (df) {
    case 'DD.MM.YYYY': return 'dd.MM.yyyy';
    case 'MM/DD/YYYY': return 'MM/dd/yyyy';
    case 'YYYY-MM-DD': return 'yyyy-MM-dd';
    default: return 'dd.MM.yyyy';
  }
}

/** Map TimeFormat setting to date-fns time pattern */
function timeFmtToPattern(tf: TimeFormat): string {
  return tf === '12h' ? 'h:mm a' : 'HH:mm';
}

/** Short date for item rows (e.g. "31 Jan" or "Jan 31") */
export function shortDatePattern(df: DateFormat): string {
  switch (df) {
    case 'DD.MM.YYYY': return 'dd MMM';
    case 'MM/DD/YYYY': return 'MMM dd';
    case 'YYYY-MM-DD': return 'MMM dd';
    default: return 'dd MMM';
  }
}

/** Full timestamp pattern (e.g. "Jan 5, 2025 · 14:30" or "5. Jan 2025 · 2:30 PM") */
export function fullTimestampPattern(df: DateFormat, tf: TimeFormat): string {
  const time = timeFmtToPattern(tf);
  switch (df) {
    case 'DD.MM.YYYY': return `dd. MMM yyyy · ${time}`;
    case 'MM/DD/YYYY': return `MMM d, yyyy · ${time}`;
    case 'YYYY-MM-DD': return `yyyy-MM-dd · ${time}`;
    default: return `MMM d, yyyy · ${time}`;
  }
}

// Standardized date format constants (legacy — prefer settings-aware helpers above)
export const DATE_FORMAT_FULL = 'MMM d, yyyy · HH:mm';
export const DATE_FORMAT_SHORT = 'dd MMM';

export function formatTimestamp(timestamp: number, fmt: string = DATE_FORMAT_FULL): string {
  return format(new Date(timestamp), fmt);
}
