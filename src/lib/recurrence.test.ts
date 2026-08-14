import { describe, expect, it } from 'vitest';
import {
  expandRecurrence,
  formatRRule,
  inferRecurrence,
  MAX_OCCURRENCES,
  normalizeRecurrence,
  parseRRule,
  recurrenceOccursOnDate,
  type RecurrenceRule,
} from './recurrence';

describe('parseRRule', () => {
  it('reads the forms Google Calendar sends', () => {
    expect(parseRRule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual({
      freq: 'weekly',
      interval: 1,
      byWeekday: [1, 3, 5],
    });
    expect(parseRRule('FREQ=DAILY;INTERVAL=2;COUNT=10')).toEqual({
      freq: 'daily',
      interval: 2,
      count: 10,
    });
    expect(parseRRule('RRULE:FREQ=MONTHLY;UNTIL=20261231T000000Z')).toEqual({
      freq: 'monthly',
      interval: 1,
      until: '2026-12-31',
    });
  });

  it('ignores an ordinal prefix on a weekday', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=2MO')).toMatchObject({ byWeekday: [1] });
  });

  it('rejects a rule with no usable frequency', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule('RRULE:BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
  });

  it('ignores a nonsense interval instead of failing', () => {
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')).toMatchObject({ interval: 1 });
    expect(parseRRule('FREQ=DAILY;INTERVAL=abc')).toMatchObject({ interval: 1 });
  });

  it('round-trips through formatRRule', () => {
    const rule: RecurrenceRule = { freq: 'weekly', interval: 2, byWeekday: [1, 4] };
    expect(parseRRule(formatRRule(rule))).toEqual(rule);
  });
});

describe('expandRecurrence', () => {
  it('expands a daily series', () => {
    expect(expandRecurrence('2026-08-07', { freq: 'daily', interval: 1 }, '2026-08-07', '2026-08-10'))
      .toEqual(['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']);
  });

  it('expands every other day', () => {
    expect(expandRecurrence('2026-08-07', { freq: 'daily', interval: 2 }, '2026-08-07', '2026-08-12'))
      .toEqual(['2026-08-07', '2026-08-09', '2026-08-11']);
  });

  it('expands a weekly series on chosen weekdays', () => {
    // 2026-08-07 is a Friday.
    expect(expandRecurrence(
      '2026-08-07',
      { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] },
      '2026-08-07',
      '2026-08-19'
    )).toEqual(['2026-08-07', '2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17', '2026-08-19']);
  });

  it('never emits a date before the series starts', () => {
    const dates = expandRecurrence(
      '2026-08-12',
      { freq: 'weekly', interval: 1, byWeekday: [1, 3] },
      '2026-08-01',
      '2026-08-20'
    );
    expect(dates.every((date) => date >= '2026-08-12')).toBe(true);
  });

  it('honours until', () => {
    expect(expandRecurrence(
      '2026-08-07',
      { freq: 'daily', interval: 1, until: '2026-08-09' },
      '2026-08-07',
      '2026-08-31'
    )).toEqual(['2026-08-07', '2026-08-08', '2026-08-09']);
  });

  it('counts occurrences from the start, not from the window', () => {
    // Five occurrences total; the window starts after the third.
    expect(expandRecurrence(
      '2026-08-01',
      { freq: 'daily', interval: 1, count: 5 },
      '2026-08-04',
      '2026-08-31'
    )).toEqual(['2026-08-04', '2026-08-05']);
  });

  it('skips exception dates', () => {
    expect(expandRecurrence(
      '2026-08-07',
      { freq: 'daily', interval: 1, exceptions: ['2026-08-08'] },
      '2026-08-07',
      '2026-08-09'
    )).toEqual(['2026-08-07', '2026-08-09']);
  });

  it('clamps a monthly series that starts on the 31st', () => {
    expect(expandRecurrence(
      '2026-01-31',
      { freq: 'monthly', interval: 1 },
      '2026-01-01',
      '2026-04-30'
    )).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('expands a yearly series', () => {
    expect(expandRecurrence('2026-03-15', { freq: 'yearly', interval: 1 }, '2026-01-01', '2029-01-01'))
      .toEqual(['2026-03-15', '2027-03-15', '2028-03-15']);
  });

  it('returns nothing for an inverted or invalid range', () => {
    expect(expandRecurrence('2026-08-07', { freq: 'daily', interval: 1 }, '2026-08-10', '2026-08-01')).toEqual([]);
    expect(expandRecurrence('nope', { freq: 'daily', interval: 1 }, '2026-08-01', '2026-08-10')).toEqual([]);
  });

  it('stays bounded on an open-ended daily rule', () => {
    const dates = expandRecurrence('2020-01-01', { freq: 'daily', interval: 1 }, '2020-01-01', '2099-01-01');
    expect(dates.length).toBeLessThanOrEqual(MAX_OCCURRENCES);
  });
});

describe('recurrenceOccursOnDate', () => {
  const rule: RecurrenceRule = { freq: 'weekly', interval: 1, byWeekday: [1] };

  it('answers for a single day', () => {
    expect(recurrenceOccursOnDate('2026-08-10', rule, '2026-08-17')).toBe(true);
    expect(recurrenceOccursOnDate('2026-08-10', rule, '2026-08-18')).toBe(false);
  });

  it('is false before the series starts', () => {
    expect(recurrenceOccursOnDate('2026-08-10', rule, '2026-08-03')).toBe(false);
  });
});

describe('normalizeRecurrence', () => {
  it('accepts a stored object', () => {
    expect(normalizeRecurrence({ freq: 'weekly', interval: 2, byWeekday: [1, 1, 3] })).toEqual({
      freq: 'weekly',
      interval: 2,
      byWeekday: [1, 3],
    });
  });

  it('accepts an RRULE string', () => {
    expect(normalizeRecurrence('FREQ=DAILY')).toEqual({ freq: 'daily', interval: 1 });
  });

  it('rejects junk', () => {
    expect(normalizeRecurrence(null)).toBeNull();
    expect(normalizeRecurrence({ freq: 'hourly' })).toBeNull();
    expect(normalizeRecurrence(42)).toBeNull();
  });

  it('drops malformed dates rather than trusting them', () => {
    expect(normalizeRecurrence({ freq: 'daily', interval: 1, until: '31.12.2026' })).toEqual({
      freq: 'daily',
      interval: 1,
    });
  });
});

describe('inferRecurrence', () => {
  it('reads a daily standup from its instances', () => {
    expect(inferRecurrence(['2026-08-07', '2026-08-08', '2026-08-09']))
      .toEqual({ freq: 'daily', interval: 1 });
  });

  it('reads a weekly meeting', () => {
    expect(inferRecurrence(['2026-08-07', '2026-08-14', '2026-08-21']))
      .toEqual({ freq: 'weekly', interval: 1 });
  });

  it('reads a fortnightly meeting', () => {
    expect(inferRecurrence(['2026-08-07', '2026-08-21', '2026-09-04']))
      .toEqual({ freq: 'weekly', interval: 2 });
  });

  it('reads a Mon/Wed/Fri pattern', () => {
    expect(inferRecurrence([
      '2026-08-10', '2026-08-12', '2026-08-14',
      '2026-08-17', '2026-08-19', '2026-08-21',
    ])).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] });
  });

  it('reads a monthly series', () => {
    expect(inferRecurrence(['2026-01-15', '2026-02-15', '2026-03-15']))
      .toMatchObject({ freq: 'monthly', interval: 1 });
  });

  it('reads an annual date as yearly, not "every 365 days"', () => {
    expect(inferRecurrence(['2026-03-15', '2027-03-15', '2028-03-15']))
      .toEqual({ freq: 'yearly', interval: 1 });
  });

  it('claims nothing for an irregular set', () => {
    expect(inferRecurrence(['2026-08-01', '2026-08-05', '2026-09-30'])).toBeNull();
  });

  it('claims nothing from a single date', () => {
    expect(inferRecurrence(['2026-08-01'])).toBeNull();
    expect(inferRecurrence([])).toBeNull();
  });
});
