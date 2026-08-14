import { isHabitCompletedForDate, isHabitScheduledForDate } from './habits';
import type { OrbitItem } from './types';

/**
 * Habit reminders.
 *
 * The detail panel offered a `type="time"` input labelled *Habit reminder
 * time* and faithfully persisted `habitTime` — and nothing anywhere read it.
 * No notification scheduling, no display in the habits list, no sorting; its
 * only other appearance was field pass-through in the MCP layer. A user who
 * set it had every reason to believe they would be reminded.
 */

/** How long after the set time a reminder is still worth sending. */
export const REMINDER_WINDOW_MINUTES = 5;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHabitTime(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(TIME_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatHabitTime(value: string | undefined, use24Hour: boolean): string | null {
  const minutes = parseHabitTime(value);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (use24Hour) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/**
 * Habits whose reminder time has just arrived and that are still outstanding.
 *
 * Only habits scheduled for today, not already ticked, and inside the window
 * after their set time — a reminder for something already done, or for a day
 * the habit does not run, is noise.
 */
export function getDueHabitReminders(
  habits: readonly OrbitItem[],
  now: Date,
  windowMinutes = REMINDER_WINDOW_MINUTES,
): OrbitItem[] {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return habits.filter((habit) => {
    if (habit.type !== 'habit' || habit.status !== 'active') return false;

    const scheduled = parseHabitTime(habit.habitTime);
    if (scheduled === null) return false;

    // Inside [time, time + window). Never fires before the time, and never
    // wraps past midnight into the following day.
    if (nowMinutes < scheduled || nowMinutes >= scheduled + windowMinutes) return false;

    if (!isHabitScheduledForDate(habit, now)) return false;
    return !isHabitCompletedForDate(habit, now);
  });
}
