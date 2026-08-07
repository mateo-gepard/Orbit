import { describe, expect, it } from 'vitest';
import {
  applyDrag,
  exceedsDragThreshold,
  isDragMeaningful,
  minutesToTime,
  MIN_DURATION_MINUTES,
} from './calendar-drag';

const base = {
  startMinute: 9 * 60,
  endMinute: 10 * 60,
  dayIndex: 2,
  hourHeight: 64,
  dayWidth: 100,
  dayCount: 7,
  deltaX: 0,
  deltaY: 0,
} as const;

describe('applyDrag — moving', () => {
  it('moves an event down the day and keeps its duration', () => {
    const result = applyDrag({ ...base, mode: 'move', deltaY: 64 });
    expect(result).toEqual({ startMinute: 10 * 60, endMinute: 11 * 60, dayIndex: 2 });
  });

  it('snaps to the nearest quarter hour', () => {
    // 20px at 64px/hour is 18.75 minutes, which snaps to 15.
    const result = applyDrag({ ...base, mode: 'move', deltaY: 20 });
    expect(result.startMinute).toBe(9 * 60 + 15);
  });

  it('moves across day columns', () => {
    expect(applyDrag({ ...base, mode: 'move', deltaX: 210 }).dayIndex).toBe(4);
    expect(applyDrag({ ...base, mode: 'move', deltaX: -100 }).dayIndex).toBe(1);
  });

  it('never leaves the visible day range', () => {
    expect(applyDrag({ ...base, mode: 'move', deltaX: 9999 }).dayIndex).toBe(6);
    expect(applyDrag({ ...base, mode: 'move', deltaX: -9999 }).dayIndex).toBe(0);
  });

  it('never pushes the event off either end of the day', () => {
    const up = applyDrag({ ...base, mode: 'move', deltaY: -9999 });
    expect(up).toMatchObject({ startMinute: 0, endMinute: 60 });

    const down = applyDrag({ ...base, mode: 'move', deltaY: 9999 });
    expect(down).toMatchObject({ startMinute: 23 * 60, endMinute: 24 * 60 });
  });

  it('preserves a long duration when clamping', () => {
    const long = applyDrag({
      ...base, mode: 'move', startMinute: 8 * 60, endMinute: 12 * 60, deltaY: 9999,
    });
    expect(long.endMinute - long.startMinute).toBe(4 * 60);
    expect(long.endMinute).toBe(24 * 60);
  });

  it('ignores a horizontal drag in a single-day view', () => {
    expect(applyDrag({ ...base, mode: 'move', dayIndex: 0, dayCount: 1, deltaX: 500 }).dayIndex).toBe(0);
  });
});

describe('applyDrag — resizing', () => {
  it('moves only the end', () => {
    const result = applyDrag({ ...base, mode: 'resize', deltaY: 64 });
    expect(result).toEqual({ startMinute: 9 * 60, endMinute: 11 * 60, dayIndex: 2 });
  });

  it('never shrinks below the minimum duration', () => {
    const result = applyDrag({ ...base, mode: 'resize', deltaY: -9999 });
    expect(result.endMinute - result.startMinute).toBe(MIN_DURATION_MINUTES);
  });

  it('never extends past midnight', () => {
    const result = applyDrag({ ...base, mode: 'resize', deltaY: 9999 });
    expect(result.endMinute).toBe(24 * 60);
  });

  it('does not change the day', () => {
    expect(applyDrag({ ...base, mode: 'resize', deltaX: 500 }).dayIndex).toBe(2);
  });
});

describe('minutesToTime', () => {
  it('formats a minute-of-day', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(9 * 60 + 5)).toBe('09:05');
    expect(minutesToTime(23 * 60 + 45)).toBe('23:45');
  });

  it('caps the end-of-day sentinel at a real clock time', () => {
    expect(minutesToTime(24 * 60)).toBe('23:59');
  });

  it('clamps anything out of range', () => {
    expect(minutesToTime(-30)).toBe('00:00');
    expect(minutesToTime(99999)).toBe('23:59');
  });
});

describe('drag bookkeeping', () => {
  it('reports whether anything actually changed', () => {
    const before = { startMinute: 540, endMinute: 600, dayIndex: 2 };
    expect(isDragMeaningful(before, { ...before })).toBe(false);
    expect(isDragMeaningful(before, { ...before, startMinute: 555 })).toBe(true);
    expect(isDragMeaningful(before, { ...before, dayIndex: 3 })).toBe(true);
  });

  it('treats a small movement as a click', () => {
    expect(exceedsDragThreshold(1, 2)).toBe(false);
    expect(exceedsDragThreshold(0, 9)).toBe(true);
    expect(exceedsDragThreshold(-9, 0)).toBe(true);
  });
});
