/**
 * The geometry behind dragging an event on the calendar's time grid.
 *
 * Rescheduling used to mean opening the detail panel and editing time fields —
 * the interaction a calendar exists to avoid. Kept separate from the grid so
 * the arithmetic (snapping, clamping, day changes, minimum duration) can be
 * tested without a DOM.
 */

/** Drag snaps to this many minutes, which is the grid's visual half-slot. */
export const SNAP_MINUTES = 15;

/** An event can never be dragged shorter than this. */
export const MIN_DURATION_MINUTES = 15;

const MINUTES_PER_DAY = 24 * 60;

export type DragMode = 'move' | 'resize';

export interface DragInput {
  /** Minutes from midnight. */
  startMinute: number;
  endMinute: number;
  /** Index of the day column the event started in. */
  dayIndex: number;
  /** Pointer travel in pixels since the drag began. */
  deltaY: number;
  deltaX: number;
  /** Pixels per hour in the grid. */
  hourHeight: number;
  /** Width of one day column, in pixels. */
  dayWidth: number;
  /** How many day columns the grid shows. */
  dayCount: number;
  mode: DragMode;
}

export interface DragResult {
  startMinute: number;
  endMinute: number;
  dayIndex: number;
}

function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/**
 * Where the event lands.
 *
 * A move keeps the duration and may cross into another day column; a resize
 * moves only the end, never below the minimum, and never past midnight.
 */
export function applyDrag(input: DragInput): DragResult {
  const {
    startMinute, endMinute, dayIndex, deltaY, deltaX,
    hourHeight, dayWidth, dayCount, mode,
  } = input;

  const minuteDelta = snap((deltaY / hourHeight) * 60);

  if (mode === 'resize') {
    const proposedEnd = snap(endMinute + minuteDelta);
    return {
      startMinute,
      dayIndex,
      endMinute: Math.min(MINUTES_PER_DAY, Math.max(startMinute + MIN_DURATION_MINUTES, proposedEnd)),
    };
  }

  const duration = Math.max(MIN_DURATION_MINUTES, endMinute - startMinute);

  // Clamp so a move never pushes the event off either end of the day.
  const proposedStart = snap(startMinute + minuteDelta);
  const clampedStart = Math.min(MINUTES_PER_DAY - duration, Math.max(0, proposedStart));

  const dayDelta = dayWidth > 0 ? Math.round(deltaX / dayWidth) : 0;
  const nextDayIndex = Math.min(dayCount - 1, Math.max(0, dayIndex + dayDelta));

  return {
    startMinute: clampedStart,
    endMinute: clampedStart + duration,
    dayIndex: nextDayIndex,
  };
}

/** `HH:mm` for a minute-of-day value. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)));
  // 24:00 is a valid end but not a valid clock time.
  const capped = clamped === MINUTES_PER_DAY ? MINUTES_PER_DAY - 1 : clamped;
  const hours = Math.floor(capped / 60);
  const mins = capped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Whether a drag actually changed anything worth writing. */
export function isDragMeaningful(before: DragResult, after: DragResult): boolean {
  return before.startMinute !== after.startMinute
    || before.endMinute !== after.endMinute
    || before.dayIndex !== after.dayIndex;
}

/** Pointer travel below this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

export function exceedsDragThreshold(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX;
}
