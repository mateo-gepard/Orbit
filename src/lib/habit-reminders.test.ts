import { describe, expect, it } from 'vitest';
import { formatHabitTime, getDueHabitReminders, parseHabitTime } from './habit-reminders';
import type { ItemStatus, ThreadmapItem } from './types';

function habit(overrides: Partial<ThreadmapItem> = {}): ThreadmapItem {
  return {
    id: 'h1',
    title: 'Read',
    type: 'habit',
    status: 'active' as ItemStatus,
    frequency: 'daily',
    completions: {},
    createdAt: 0,
    updatedAt: 0,
    userId: 'u1',
    habitTime: '07:30',
    ...overrides,
  };
}

// A Friday, 07:32 local.
const now = new Date(2026, 7, 7, 7, 32);

describe('parseHabitTime', () => {
  it('reads a valid HH:mm', () => {
    expect(parseHabitTime('07:30')).toBe(450);
    expect(parseHabitTime('00:00')).toBe(0);
    expect(parseHabitTime('23:59')).toBe(1439);
  });

  it('rejects anything else', () => {
    expect(parseHabitTime(undefined)).toBeNull();
    expect(parseHabitTime('')).toBeNull();
    expect(parseHabitTime('7:30')).toBeNull();
    expect(parseHabitTime('24:00')).toBeNull();
    expect(parseHabitTime('12:60')).toBeNull();
    expect(parseHabitTime('half seven')).toBeNull();
  });
});

describe('formatHabitTime', () => {
  it('respects the 12/24-hour setting', () => {
    expect(formatHabitTime('07:30', true)).toBe('07:30');
    expect(formatHabitTime('07:30', false)).toBe('7:30 AM');
    expect(formatHabitTime('19:05', false)).toBe('7:05 PM');
    expect(formatHabitTime('00:15', false)).toBe('12:15 AM');
    expect(formatHabitTime('12:00', false)).toBe('12:00 PM');
  });

  it('returns nothing for an unset or malformed time', () => {
    expect(formatHabitTime(undefined, true)).toBeNull();
    expect(formatHabitTime('nope', true)).toBeNull();
  });
});

describe('getDueHabitReminders', () => {
  it('reminds about an outstanding habit inside the window (F-23)', () => {
    expect(getDueHabitReminders([habit()], now).map((h) => h.id)).toEqual(['h1']);
  });

  it('does not remind before the set time', () => {
    expect(getDueHabitReminders([habit({ habitTime: '07:35' })], now)).toEqual([]);
  });

  it('does not remind once the window has passed', () => {
    expect(getDueHabitReminders([habit({ habitTime: '07:00' })], now)).toEqual([]);
  });

  it('does not remind about a habit already ticked today', () => {
    expect(getDueHabitReminders([habit({ completions: { '2026-08-07': true } })], now)).toEqual([]);
  });

  it('does not remind on a day the habit is not scheduled', () => {
    // 2026-08-07 is a Friday; customDays is 0=Mon … 6=Sun.
    const monWed = habit({ frequency: 'custom', customDays: [0, 2] });
    expect(getDueHabitReminders([monWed], now)).toEqual([]);
  });

  it('reminds on a scheduled custom day', () => {
    const friday = habit({ frequency: 'custom', customDays: [4] });
    expect(getDueHabitReminders([friday], now).map((h) => h.id)).toEqual(['h1']);
  });

  it('ignores paused, done and archived habits', () => {
    for (const status of ['waiting', 'done', 'archived'] as ItemStatus[]) {
      expect(getDueHabitReminders([habit({ status })], now)).toEqual([]);
    }
  });

  it('ignores habits with no reminder time set', () => {
    expect(getDueHabitReminders([habit({ habitTime: undefined })], now)).toEqual([]);
    expect(getDueHabitReminders([habit({ habitTime: 'x' })], now)).toEqual([]);
  });

  it('ignores non-habit items that happen to carry the field', () => {
    expect(getDueHabitReminders([habit({ type: 'task' })], now)).toEqual([]);
  });

  it('never wraps past midnight', () => {
    const lateNight = new Date(2026, 7, 7, 23, 58);
    expect(getDueHabitReminders([habit({ habitTime: '00:01' })], lateNight)).toEqual([]);
  });

  it('fires exactly on the minute', () => {
    const onTime = new Date(2026, 7, 7, 7, 30);
    expect(getDueHabitReminders([habit()], onTime)).toHaveLength(1);
  });
});
