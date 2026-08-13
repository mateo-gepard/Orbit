import { format, subDays, startOfWeek, addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { ThreadmapItem } from './types';

/**
 * Check if a habit is scheduled for a given date
 */
export function isHabitScheduledForDate(habit: ThreadmapItem, date: Date): boolean {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekly') {
    const dayOfWeek = (date.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
    // Weekly habits persist one explicit scheduled day. Legacy habits without
    // one retain the historical Monday behavior until edited.
    return dayOfWeek === (habit.customDays?.[0] ?? 0);
  }
  if (habit.frequency === 'custom' && habit.customDays) {
    const dayOfWeek = (date.getDay() + 6) % 7; // Mon=0, Sun=6
    return habit.customDays.includes(dayOfWeek);
  }
  return true;
}

/**
 * Check if a habit is completed for a given date
 */
export function isHabitCompletedForDate(habit: ThreadmapItem, date: Date): boolean {
  const dateKey = format(date, 'yyyy-MM-dd');
  return habit.completions?.[dateKey] === true;
}

/**
 * Calculate streak for a habit (consecutive scheduled days completed)
 */
export function calculateStreak(habit: ThreadmapItem): number {
  let streak = 0;
  let currentDate = new Date();

  // If today is scheduled but not completed, start from yesterday
  if (isHabitScheduledForDate(habit, currentDate) && !isHabitCompletedForDate(habit, currentDate)) {
    currentDate = subDays(currentDate, 1);
  }

  // Go back day by day
  for (let i = 0; i < 365; i++) {
    const checkDate = subDays(currentDate, i);

    if (!isHabitScheduledForDate(habit, checkDate)) {
      // Not scheduled — skip, don't break
      continue;
    }

    if (isHabitCompletedForDate(habit, checkDate)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get week completion rate for all habits
 */
export function getWeekCompletionRate(habits: ThreadmapItem[], weekStart?: Date): number | null {
  const start = weekStart || startOfWeek(new Date(), { weekStartsOn: 1 });
  const today = startOfDay(new Date());
  const daysThroughToday = differenceInCalendarDays(today, startOfDay(start));
  if (daysThroughToday < 0) return null;
  const finalDayIndex = Math.min(6, daysThroughToday);
  let scheduled = 0;
  let completed = 0;

  for (const habit of habits) {
    for (let i = 0; i <= finalDayIndex; i++) {
      const date = addDays(start, i);
      if (isHabitScheduledForDate(habit, date)) {
        scheduled++;
        if (isHabitCompletedForDate(habit, date)) {
          completed++;
        }
      }
    }
  }

  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}
