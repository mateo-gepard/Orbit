import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWeekCompletionRate, isHabitScheduledForDate } from './habits';
import type { ThreadmapItem } from './types';

function habit(overrides: Partial<ThreadmapItem> = {}): ThreadmapItem {
  return {
    id: 'habit-1',
    type: 'habit',
    status: 'active',
    title: 'Habit',
    frequency: 'daily',
    completions: {},
    createdAt: 1,
    updatedAt: 1,
    userId: 'user-1',
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('habit scheduling and completion rates', () => {
  it('excludes future days from the active-week completion rate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));

    const item = habit({
      completions: {
        '2026-08-03': true,
        '2026-08-04': true,
      },
    });

    expect(getWeekCompletionRate([item], new Date('2026-08-03T00:00:00Z'))).toBe(67);
  });

  it('uses all seven days for a past week and reports future weeks as unavailable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));

    const item = habit({
      completions: {
        '2026-07-27': true,
        '2026-07-28': true,
      },
    });

    expect(getWeekCompletionRate([item], new Date('2026-07-27T00:00:00Z'))).toBe(29);
    expect(getWeekCompletionRate([item], new Date('2026-08-10T00:00:00Z'))).toBeNull();
  });

  it('uses the explicit day stored on a weekly habit', () => {
    const weekly = habit({ frequency: 'weekly', customDays: [6] });

    expect(isHabitScheduledForDate(weekly, new Date('2026-08-09T12:00:00Z'))).toBe(true);
    expect(isHabitScheduledForDate(weekly, new Date('2026-08-03T12:00:00Z'))).toBe(false);
  });
});
