import { format, subDays, startOfWeek, addDays, isToday, parseISO } from 'date-fns';
import type { OrbitItem } from './types';

/**
 * Check if a habit is scheduled for a given date
 */
export function isHabitScheduledForDate(habit: OrbitItem, date: Date): boolean {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekly') {
    // Default to Monday if no custom days
    const dayOfWeek = (date.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
    return dayOfWeek === 0; // Monday
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
export function isHabitCompletedForDate(habit: OrbitItem, date: Date): boolean {
  const dateKey = format(date, 'yyyy-MM-dd');
  return habit.completions?.[dateKey] === true;
}

/**
 * Calculate streak for a habit (consecutive scheduled days completed)
 */
export function calculateStreak(habit: OrbitItem): number {
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
 * Get the week grid data for a habit (Mon-Sun)
 */
export function getWeekGrid(habit: OrbitItem, weekStart?: Date) {
  const start = weekStart || startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    days.push({
      date,
      dateKey: format(date, 'yyyy-MM-dd'),
      scheduled: isHabitScheduledForDate(habit, date),
      completed: isHabitCompletedForDate(habit, date),
      isToday: isToday(date),
    });
  }

  return days;
}

/**
 * Get week completion rate for all habits
 */
export function getWeekCompletionRate(habits: OrbitItem[], weekStart?: Date): number {
  const start = weekStart || startOfWeek(new Date(), { weekStartsOn: 1 });
  let scheduled = 0;
  let completed = 0;

  for (const habit of habits) {
    for (let i = 0; i < 7; i++) {
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
