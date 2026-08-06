import { describe, expect, it } from 'vitest';
import {
  DISPATCH_DAY_START_MINUTES,
  DISPATCH_DAY_END_MINUTES,
  findDispatchSlot,
  getDispatchBusyIntervals,
  getDispatchStartMinutes,
  reflowDispatchBlocks,
} from './dispatch-schedule';

describe('getDispatchStartMinutes', () => {
  it('does not plan before the dispatch day starts', () => {
    expect(getDispatchStartMinutes(new Date(2026, 7, 6, 6, 45))).toBe(DISPATCH_DAY_START_MINUTES);
  });

  it('keeps an exact half-hour boundary', () => {
    expect(getDispatchStartMinutes(new Date(2026, 7, 6, 13, 30))).toBe(13 * 60 + 30);
  });

  it('rounds forward instead of placing work in the past', () => {
    expect(getDispatchStartMinutes(new Date(2026, 7, 6, 13, 31))).toBe(14 * 60);
  });

  it('moves a focus block past a calendar meeting instead of overlapping it', () => {
    const busy = getDispatchBusyIntervals([{
      type: 'event', status: 'active', title: 'Stand-up', startDate: '2026-08-06', startTime: '09:00', endTime: '10:00',
    }], '2026-08-06');

    expect(findDispatchSlot(8 * 60 + 30, 50, busy)).toBe(10 * 60);
  });

  it('reserves the Dispatch window for a multi-day all-day event', () => {
    const busy = getDispatchBusyIntervals([{
      type: 'event', status: 'active', title: 'Conference', startDate: '2026-08-05', endDate: '2026-08-07',
    }], '2026-08-06');

    expect(busy).toEqual([{
      startMinutes: DISPATCH_DAY_START_MINUTES,
      endMinutes: DISPATCH_DAY_END_MINUTES,
      title: 'Conference',
      allDay: true,
    }]);
    expect(findDispatchSlot(DISPATCH_DAY_START_MINUTES, 50, busy)).toBeNull();
  });

  it('keeps a reordered plan out of busy gaps and never schedules it in the past', () => {
    const busy = getDispatchBusyIntervals([{
      type: 'event', status: 'active', title: 'Review', startDate: '2026-08-06', startTime: '14:00', endTime: '15:30',
    }], '2026-08-06');
    const plan = reflowDispatchBlocks([
      { startHour: 9, startMin: 0, durationMin: 50, id: 'second' },
      { startHour: 10, startMin: 5, durationMin: 50, id: 'first' },
    ], new Date(2026, 7, 6, 13, 40), busy);

    expect(plan).toEqual([
      { startHour: 15, startMin: 30, durationMin: 50, id: 'second' },
      { startHour: 17, startMin: 0, durationMin: 50, id: 'first' },
    ]);
  });
});
