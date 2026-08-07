/**
 * Account-scoped sync warning bus.
 *
 * Two rules hold this together, and both exist because breaking them produced
 * banners that outlived the condition they described:
 *
 * 1. Every warning names the account it belongs to. A warning raised for one
 *    account must never survive into the next one, so `userId` is required —
 *    warnings about this browser rather than an account use `DEVICE_SCOPE`.
 * 2. Every warning for a condition that retries must clear itself with
 *    `reportSyncRecovered` under the same `key` once the retry succeeds.
 *    Silent success leaves the banner up forever.
 */

export const SYNC_WARNING_EVENT = 'threadmap:sync-warning';
export const SYNC_RECOVERED_EVENT = 'threadmap:sync-recovered';

/** Scope for warnings about this browser rather than one account's cloud data. */
export const DEVICE_SCOPE = '*';

/**
 * Stable identity of a warning condition. Recovery clears the banner only when
 * it carries the same key, so a retry for one tool cannot dismiss another
 * tool's still-failing warning.
 */
export type SyncWarningKey =
  | `tool:${string}`
  | `tool-seed:${string}`
  | 'items:load'
  | 'items:queued-write'
  | 'items:auto-archive'
  | 'calendar:outbound'
  | 'calendar:delete'
  | 'network:offline'
  | 'files:cleanup'
  | 'device:storage-write'
  | 'device:storage-quota'
  | 'device:cache-reset';

export interface SyncWarningDetail {
  key: SyncWarningKey;
  /** Owning account, or `DEVICE_SCOPE` when the warning is not account-specific. */
  userId: string;
  /** Firestore data-context generation, when the emitter tracks one. */
  generation?: number;
  toolId?: string;
  message: string;
}

export interface SyncRecoveredDetail {
  key: SyncWarningKey;
  userId: string;
  generation?: number;
}

export function reportSyncWarning(detail: SyncWarningDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SyncWarningDetail>(SYNC_WARNING_EVENT, { detail }));
}

/** Announce that the condition behind `key` has resolved, clearing its banner. */
export function reportSyncRecovered(detail: SyncRecoveredDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SyncRecoveredDetail>(SYNC_RECOVERED_EVENT, { detail }));
}

/**
 * Whether a warning or recovery addressed to `detailUserId` applies to the
 * account currently on screen. Device-scoped notices apply to every account.
 */
export function syncScopeMatches(
  detailUserId: string,
  activeUserId: string | null,
): boolean {
  return detailUserId === DEVICE_SCOPE || detailUserId === activeUserId;
}
