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

/**
 * A foreground that stays legible on an arbitrary user-picked accent colour.
 *
 * The accent picker accepts any hex, so a fixed white or black foreground
 * would be unreadable across half the range.
 *
 * Use WCAG relative luminance and the 0.179 crossover. Picking the visually
 * conventional foreground is not sufficient at the boundary: white on the
 * default indigo is 4.46:1 and fails normal-text contrast, while black passes.
 */
export function readableForeground(hex: string): '#000000' | '#ffffff' {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return '#ffffff';

  const int = parseInt(match[1], 16);
  const red = (int >> 16) & 0xff;
  const green = (int >> 8) & 0xff;
  const blue = int & 0xff;
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (0.2126 * linear(red)) + (0.7152 * linear(green)) + (0.0722 * linear(blue));

  return luminance > 0.179 ? '#000000' : '#ffffff';
}
