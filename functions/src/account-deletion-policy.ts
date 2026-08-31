export const ACCOUNT_DELETION_QUERY_PAGE_SIZE = 200;
export const ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT = 2_000;

export function accountDeletionFixedDocumentPaths(userId: string): string[] {
  return [
    `userSettings/${userId}`,
    `users/${userId}`,
    `pushDeviceRegistries/${userId}`,
    `mfaRecoverySets/${userId}`,
    // Contains the encrypted Google refresh credential. It is server-only and
    // must be removed before the Auth identity is deleted.
    `googleWorkspaceConnections/${userId}`,
    // This legacy singleton predates the userId field used by the paged
    // toolData query, so it must be named explicitly during deletion.
    `toolData/${userId}_flightLogs`,
  ];
}

export type AccountDeletionSweepDecision =
  | 'query-drained'
  | 'continue-query'
  | 'attempt-budget-exhausted'
  | 'stalled';

export function accountDeletionPageSize(
  deleted: number,
  maximum = ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT,
): number {
  if (!Number.isInteger(deleted) || deleted < 0 || !Number.isInteger(maximum) || maximum <= 0) {
    throw new Error('Account deletion sweep counters must be positive integers.');
  }
  return Math.min(ACCOUNT_DELETION_QUERY_PAGE_SIZE, Math.max(0, maximum - deleted));
}

/**
 * Decide whether a bounded deletion sweep should keep querying the current
 * collection or yield to a later invocation. An exactly full final page is
 * deliberately treated as continuation when it exhausts the budget: only a
 * subsequent empty query can prove the inventory drained.
 */
export function accountDeletionSweepDecision(input: {
  deleted: number;
  maximum?: number;
  requestedPageSize: number;
  returnedDocuments: number;
  deletedDocuments: number;
}): AccountDeletionSweepDecision {
  const maximum = input.maximum ?? ACCOUNT_DELETION_MAX_DOCUMENTS_PER_ATTEMPT;
  if (input.returnedDocuments > 0 && input.deletedDocuments === 0) return 'stalled';
  if (input.deleted >= maximum) return 'attempt-budget-exhausted';
  if (input.returnedDocuments < input.requestedPageSize) return 'query-drained';
  return 'continue-query';
}
