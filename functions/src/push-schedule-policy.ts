/**
 * The server queue intentionally supports only generic morning/evening
 * briefings. Habit titles and completion state are never accepted in push
 * registration documents; foreground clients evaluate those locally.
 */
export const BACKGROUND_BRIEFING_SCHEDULE_FIELDS = [
  'morningEnabled',
  'morningTime',
  'eveningEnabled',
  'eveningTime',
  'timezoneOffset',
  'timezone',
] as const;

export function hasOnlyBackgroundBriefingScheduleFields(
  schedule: Record<string, unknown>,
): boolean {
  const allowed = new Set<string>(BACKGROUND_BRIEFING_SCHEDULE_FIELDS);
  return Object.keys(schedule).every((key) => allowed.has(key));
}
