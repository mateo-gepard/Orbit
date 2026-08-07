import { describe, expect, it } from 'vitest';
import { collapseRecurringInstances } from './google-calendar-recurrence';
import type { GCalEvent } from './google-calendar';

function instance(
  seriesId: string | undefined,
  date: string,
  extra: Partial<GCalEvent> = {}
): GCalEvent {
  return {
    id: seriesId ? `${seriesId}_${date.replace(/-/g, '')}T090000Z` : `single-${date}`,
    summary: 'Standup',
    start: { dateTime: `${date}T09:00:00Z` },
    end: { dateTime: `${date}T09:15:00Z` },
    status: 'confirmed',
    ...(seriesId ? { recurringEventId: seriesId } : {}),
    ...extra,
  };
}

describe('collapseRecurringInstances', () => {
  it('turns a daily standup into one event, not hundreds (F-18)', () => {
    const days = Array.from({ length: 60 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
      return instance('standup', date);
    });

    const { events, series } = collapseRecurringInstances(days);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('standup');
    expect(series.get('standup')).toMatchObject({
      rule: { freq: 'daily', interval: 1 },
      instanceCount: 60,
    });
  });

  it('leaves one-off events alone', () => {
    const { events, series } = collapseRecurringInstances([
      instance(undefined, '2026-08-07'),
      instance(undefined, '2026-08-09'),
    ]);
    expect(events).toHaveLength(2);
    expect(series.size).toBe(0);
  });

  it('handles a mix of series and one-offs', () => {
    const { events } = collapseRecurringInstances([
      instance('weekly', '2026-08-07'),
      instance('weekly', '2026-08-14'),
      instance(undefined, '2026-08-10'),
    ]);
    expect(events).toHaveLength(2);
  });

  it('prefers the master rule Google declares over an inferred one', () => {
    const { series } = collapseRecurringInstances([
      instance('mwf', '2026-08-10', { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'] }),
      instance('mwf', '2026-08-12'),
    ]);
    expect(series.get('mwf')?.rule).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] });
  });

  it('reads cancelled instances as exceptions on a live series', () => {
    const { series } = collapseRecurringInstances([
      instance('standup', '2026-08-07'),
      instance('standup', '2026-08-08'),
      instance('standup', '2026-08-09', { status: 'cancelled' }),
      instance('standup', '2026-08-10'),
    ]);
    expect(series.get('standup')?.rule?.exceptions).toEqual(['2026-08-09']);
  });

  it('keeps one cancelled representative when the whole series is gone', () => {
    const { events, series } = collapseRecurringInstances([
      instance('dead', '2026-08-07', { status: 'cancelled' }),
      instance('dead', '2026-08-08', { status: 'cancelled' }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'dead', status: 'cancelled' });
    // Nothing to import, so no rule is published for it.
    expect(series.has('dead')).toBe(false);
  });

  it('represents the series by its earliest live instance', () => {
    const { events } = collapseRecurringInstances([
      instance('weekly', '2026-08-21'),
      instance('weekly', '2026-08-07'),
      instance('weekly', '2026-08-14'),
    ]);
    expect(events[0].start?.dateTime).toBe('2026-08-07T09:00:00Z');
  });

  it('carries the stable series id, not a sliding instance id', () => {
    const { events } = collapseRecurringInstances([
      instance('weekly', '2026-08-07'),
      instance('weekly', '2026-08-14'),
    ]);
    expect(events[0].id).toBe('weekly');
  });

  it('survives an all-day series with date-only fields', () => {
    const allDay = (date: string): GCalEvent => ({
      id: `birthday_${date}`,
      recurringEventId: 'birthday',
      summary: 'Birthday',
      start: { date },
      end: { date },
      status: 'confirmed',
    });
    const { series } = collapseRecurringInstances([
      allDay('2026-03-15'),
      allDay('2027-03-15'),
    ]);
    expect(series.get('birthday')?.rule).toMatchObject({ freq: 'yearly', interval: 1 });
  });

  it('publishes no rule for a series it cannot read a pattern from', () => {
    const { events, series } = collapseRecurringInstances([
      instance('odd', '2026-08-01'),
      instance('odd', '2026-08-05'),
      instance('odd', '2026-09-30'),
    ]);
    expect(events).toHaveLength(1);
    expect(series.get('odd')?.rule).toBeNull();
  });
});
