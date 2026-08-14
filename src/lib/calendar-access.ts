/** Shared, testable precondition for consent and enabled Calendar API calls. */
export function assertCalendarAccess(
  ownerId: string | null,
  enabled: boolean,
  requireEnabled: boolean
): void {
  if (!ownerId || ownerId === 'demo-user') {
    throw new Error('Sign in to use Google Calendar sync.');
  }
  if (requireEnabled && !enabled) {
    throw new Error('Enable Google Calendar sync in Settings first.');
  }
}
