import { describe, expect, it } from 'vitest';
import {
  assertValidCalendarEventSchedule,
  isValidCalendarDate,
  isValidCalendarTime,
  validateCalendarEventSchedule,
} from './calendar-event';

describe('calendar event schedule validation', () => {
  it('accepts valid single-day, multi-day, and all-day schedules', () => {
    expect(validateCalendarEventSchedule({
      startDate: '2026-08-06',
      startTime: '09:00',
      endTime: '10:00',
    }).valid).toBe(true);
    expect(validateCalendarEventSchedule({
      startDate: '2026-08-06',
      endDate: '2026-08-07',
      startTime: '23:30',
      endTime: '00:30',
    }).valid).toBe(true);
    expect(validateCalendarEventSchedule({
      startDate: '2026-08-06',
      endDate: '2026-08-08',
    }).valid).toBe(true);
  });

  it('rejects missing and impossible dates', () => {
    expect(validateCalendarEventSchedule({}).valid).toBe(false);
    expect(isValidCalendarDate('2026-02-29')).toBe(false);
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
  });

  it('rejects partial, invalid, zero-length, and reversed time ranges', () => {
    expect(validateCalendarEventSchedule({
      startDate: '2026-08-06',
      startTime: '09:00',
    })).toEqual({ valid: false, error: 'incomplete-time-range' });
    expect(isValidCalendarTime('24:00')).toBe(false);
    expect(validateCalendarEventSchedule({
      startDate: '2026-08-06',
      startTime: '09:00',
      endTime: '09:00',
    })).toEqual({ valid: false, error: 'end-before-start' });
    expect(validateCalendarEventSchedule({
      startDate: '2026-08-07',
      endDate: '2026-08-06',
    })).toEqual({ valid: false, error: 'end-before-start' });
  });

  it('throws before an invalid schedule can be serialized', () => {
    expect(() => assertValidCalendarEventSchedule({ startDate: undefined })).toThrow(
      'Invalid calendar event schedule: missing-start-date',
    );
  });
});
