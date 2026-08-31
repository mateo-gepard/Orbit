/**
 * Shared browser/server deployment coordinates.
 *
 * Firebase Functions source has its own build boundary, so the release-region
 * audit verifies that its declaration matches this value. Application code
 * must import this constant instead of embedding a regional endpoint.
 */
export const FIREBASE_FUNCTIONS_REGION = 'europe-west1' as const;

export function firebaseFunctionsOrigin(projectId: string): string {
  return `https://${FIREBASE_FUNCTIONS_REGION}-${encodeURIComponent(projectId)}.cloudfunctions.net`;
}
