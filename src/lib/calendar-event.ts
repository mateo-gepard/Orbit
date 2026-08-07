import type { OrbitItem } from './types';

export interface CalendarEventSchedule {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}

export type CalendarEventScheduleError =
  | 'missing-start-date'
  | 'invalid-start-date'
  | 'invalid-end-date'
  | 'incomplete-time-range'
  | 'invalid-start-time'
  | 'invalid-end-time'
  | 'end-before-start';

export type CalendarEventScheduleValidation =
  | { valid: true; schedule: Required<Pick<CalendarEventSchedule, 'startDate'>> & CalendarEventSchedule }
  | { valid: false; error: CalendarEventScheduleError };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidCalendarTime(value: string): boolean {
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

/**
 * Validates the four schedule fields as one value. A timed event must provide
 * both times, while an all-day event provides neither. `endDate` is optional
 * and means the same day when omitted.
 */
export function validateCalendarEventSchedule(
  value: CalendarEventSchedule,
): CalendarEventScheduleValidation {
  const startDate = optionalValue(value.startDate);
  const endDate = optionalValue(value.endDate);
  const startTime = optionalValue(value.startTime);
  const endTime = optionalValue(value.endTime);

  if (!startDate) return { valid: false, error: 'missing-start-date' };
  if (!isValidCalendarDate(startDate)) return { valid: false, error: 'invalid-start-date' };
  if (endDate && !isValidCalendarDate(endDate)) return { valid: false, error: 'invalid-end-date' };

  const hasStartTime = Boolean(startTime);
  const hasEndTime = Boolean(endTime);
  if (hasStartTime !== hasEndTime) {
    return { valid: false, error: 'incomplete-time-range' };
  }
  if (startTime && !isValidCalendarTime(startTime)) {
    return { valid: false, error: 'invalid-start-time' };
  }
  if (endTime && !isValidCalendarTime(endTime)) {
    return { valid: false, error: 'invalid-end-time' };
  }

  const effectiveEndDate = endDate || startDate;
  if (effectiveEndDate < startDate) {
    return { valid: false, error: 'end-before-start' };
  }
  if (startTime && endTime && `${effectiveEndDate}T${endTime}` <= `${startDate}T${startTime}`) {
    return { valid: false, error: 'end-before-start' };
  }

  return {
    valid: true,
    schedule: {
      startDate,
      ...(endDate && { endDate }),
      ...(startTime && { startTime }),
      ...(endTime && { endTime }),
    },
  };
}

export function assertValidCalendarEventSchedule(
  value: CalendarEventSchedule,
): CalendarEventScheduleValidation & { valid: true } {
  const validation = validateCalendarEventSchedule(value);
  if (!validation.valid) {
    throw new Error(`Invalid calendar event schedule: ${validation.error}`);
  }
  return validation;
}

export function calendarEventScheduleFromItem(item: OrbitItem): CalendarEventSchedule {
  return {
    startDate: item.startDate,
    endDate: item.endDate,
    startTime: item.startTime,
    endTime: item.endTime,
  };
}
