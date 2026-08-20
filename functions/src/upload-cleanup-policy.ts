export const RESUMABLE_UPLOAD_SESSION_RISK_MS =
  (7 * 24 * 60 * 60_000) + (15 * 60_000);
export const UPLOAD_CLEANUP_INTERVAL_MS = 60 * 60_000;

export function attachmentUploadOriginAllowed(
  requestOrigin: string,
  appOrigin: string,
  emulator = false,
): boolean {
  if (requestOrigin === appOrigin) return true;
  if (!emulator) return false;
  return requestOrigin === 'http://localhost:3000'
    || requestOrigin === 'http://127.0.0.1:3000';
}

export function resumableUploadMetadata(
  size: number,
  contentType: string,
  uploadId: string,
): {
  contentType: string;
  contentLength: number;
  metadata: { threadmapUploadId: string };
} {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error('Resumable upload size must be a positive safe integer.');
  }
  return {
    contentType,
    // The provider turns this into X-Upload-Content-Length, binding the bearer
    // session to the size already charged against the account's quota.
    contentLength: size,
    metadata: { threadmapUploadId: uploadId },
  };
}

export interface UploadCleanupPolicyInput {
  now: number;
  createdAt: number;
  intentExpiresAt: number;
  cleanupUntil?: number;
  forceIntentExpiry?: boolean;
}

export type UploadCleanupDecision =
  | { phase: 'wait-for-intent'; cleanupUntil: number; nextAttemptAt: number }
  | { phase: 'sweep-and-retain'; cleanupUntil: number; nextAttemptAt: number }
  | { phase: 'sweep-and-finalize'; cleanupUntil: number; nextAttemptAt: number };

/**
 * Decide the lifecycle of an abandoned resumable upload without touching I/O.
 *
 * The short intent deadline controls whether item attachment is still allowed.
 * It does not control object cleanup: the exact path remains under an hourly
 * deletion barrier for the full one-week provider session lifetime.
 */
export function decideUploadCleanup(input: UploadCleanupPolicyInput): UploadCleanupDecision {
  const createdAt = Number.isFinite(input.createdAt) && input.createdAt > 0
    ? input.createdAt
    : input.now;
  const derivedCleanupUntil = createdAt + RESUMABLE_UPLOAD_SESSION_RISK_MS;
  const cleanupUntil = Number.isFinite(input.cleanupUntil)
      && Number(input.cleanupUntil) >= derivedCleanupUntil
    ? Number(input.cleanupUntil)
    : derivedCleanupUntil;
  if (!input.forceIntentExpiry && input.now < input.intentExpiresAt) {
    return {
      phase: 'wait-for-intent',
      cleanupUntil,
      nextAttemptAt: input.intentExpiresAt,
    };
  }
  if (input.now < cleanupUntil) {
    return {
      phase: 'sweep-and-retain',
      cleanupUntil,
      nextAttemptAt: Math.min(cleanupUntil, input.now + UPLOAD_CLEANUP_INTERVAL_MS),
    };
  }
  return {
    phase: 'sweep-and-finalize',
    cleanupUntil,
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
  };
}

export function shouldReleaseUploadRegistry(registryReleasedAt: unknown): boolean {
  return !(typeof registryReleasedAt === 'number' && registryReleasedAt > 0);
}
