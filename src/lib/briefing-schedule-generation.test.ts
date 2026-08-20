import { describe, expect, it } from 'vitest';
import {
  briefingUpdateIsCurrent,
  nextBriefingScheduleGeneration,
} from './briefing-schedule-generation';

describe('briefing schedule generations', () => {
  it('advances monotonically even for multiple operations in one millisecond', () => {
    const update = nextBriefingScheduleGeneration(0, 1_000);
    const clear = nextBriefingScheduleGeneration(update, 1_000);
    expect(clear).toBe(update + 1);
  });

  it('invalidates a delayed old-owner update after clear advances the barrier', () => {
    const update = nextBriefingScheduleGeneration(0, 1_000);
    const clear = nextBriefingScheduleGeneration(update, 1_001);
    expect(briefingUpdateIsCurrent(update, clear, 'user-a', null)).toBe(false);
  });
});
