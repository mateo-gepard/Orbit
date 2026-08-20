const BRIEFING_GENERATION_TICKS_PER_MS = 1_024;

export function nextBriefingScheduleGeneration(previous: number, now = Date.now()): number {
  const wallClockGeneration = now * BRIEFING_GENERATION_TICKS_PER_MS;
  if (!Number.isSafeInteger(previous) || previous < 0
      || !Number.isSafeInteger(wallClockGeneration) || wallClockGeneration < 0) {
    throw new Error('Briefing schedule generation is outside the safe integer range.');
  }
  return Math.max(previous + 1, wallClockGeneration);
}

export function briefingUpdateIsCurrent(
  capturedGeneration: number,
  currentGeneration: number,
  capturedOwnerId: string,
  currentOwnerId: string | null,
): boolean {
  return capturedGeneration === currentGeneration
    && capturedOwnerId === currentOwnerId;
}
