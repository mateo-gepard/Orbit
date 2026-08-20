import { Buffer } from 'node:buffer';

export const ACCOUNT_EXPORT_MAX_ATTACHMENTS = 2_000;
// The client currently assembles attachment Blobs and the ZIP in memory.
// 128 MiB keeps the single-browser path usable on constrained mobile devices;
// larger exports require the future paged/streaming support path.
export const ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES = 128 * 1024 * 1024;
export const ACCOUNT_EXPORT_STORAGE_CONCURRENCY = 20;
// Gen2 non-streaming callable responses are limited to 32 MiB. Stay
// materially below that ceiling for envelope/base64/protocol overhead.
export const ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES = 20 * 1024 * 1024;
export const ACCOUNT_EXPORT_RESPONSE_OVERHEAD_BYTES = 256 * 1024;

export function accountExportMayReturn(accountDeletionBarrierExists: boolean): boolean {
  return accountDeletionBarrierExists === false;
}

export function accountExportAttachmentCountAllowed(
  current: number,
  incoming: number,
  maximum = ACCOUNT_EXPORT_MAX_ATTACHMENTS,
): boolean {
  return Number.isSafeInteger(current)
    && current >= 0
    && Number.isSafeInteger(incoming)
    && incoming >= 0
    && current + incoming <= maximum;
}

export function accountExportAttachmentBytesAllowed(
  current: number,
  incoming: number,
  maximum = ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES,
): boolean {
  return Number.isSafeInteger(maximum)
    && maximum >= 0
    && Number.isSafeInteger(current)
    && current >= 0
    && current <= maximum
    && Number.isSafeInteger(incoming)
    && incoming >= 0
    // Subtraction avoids an overflowing addition becoming authoritative.
    && incoming <= maximum - current;
}

export function accountExportSerializedByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') {
    throw new Error('Export data is not JSON serializable.');
  }
  return Buffer.byteLength(serialized, 'utf8');
}

export function accountExportSerializedBytesAllowed(
  current: number,
  incoming: number,
  maximum = ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES,
): boolean {
  return Number.isSafeInteger(maximum)
    && maximum >= 0
    && Number.isSafeInteger(current)
    && current >= 0
    && current <= maximum
    && Number.isSafeInteger(incoming)
    && incoming >= 0
    && incoming <= maximum - current;
}

function boundedAuditString(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, maximum)
    : null;
}

function boundedAuditStrings(value: unknown, maximumItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map((candidate) => candidate.slice(0, 200))
    .slice(0, maximumItems);
}

function auditTimestamp(value: unknown): number | null {
  if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value
      && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = Number((value as { toMillis(): unknown }).toMillis());
    return Number.isSafeInteger(millis) && millis >= 0 ? millis : null;
  }
  return null;
}

/** Export privacy-safe event metadata, never request arguments or secret hashes. */
export function sanitizeAccountExportAuditEvent(
  source: 'mfa' | 'mcp',
  value: Record<string, unknown>,
): Record<string, unknown> {
  const createdAt = auditTimestamp(value.createdAt);
  const expiresAt = auditTimestamp(value.expireAt);
  if (source === 'mfa') {
    return {
      source,
      event: boundedAuditString(value.event, 100) || 'mfa-security-event',
      createdAt,
      expiresAt,
    };
  }

  const targetIds = boundedAuditStrings(value.targetIds, 20);
  const changedFields = boundedAuditStrings(value.changedFields, 50);
  return {
    source,
    event: 'mcp-tool-access',
    clientId: boundedAuditString(value.clientId, 200),
    tool: boundedAuditString(value.tool, 100),
    kind: boundedAuditString(value.kind, 20),
    success: value.success === true,
    resultCode: boundedAuditString(value.resultCode, 100),
    durationMs: Number.isSafeInteger(value.durationMs)
      ? Math.max(0, Math.min(Number(value.durationMs), 3_600_000))
      : null,
    requestId: boundedAuditString(value.requestId, 100),
    ...(targetIds.length ? { targetIds } : {}),
    ...(changedFields.length ? { changedFields } : {}),
    createdAt,
    expiresAt,
  };
}

export async function mapWithConcurrency<T, Result>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Export concurrency must be a positive integer.');
  }
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}
