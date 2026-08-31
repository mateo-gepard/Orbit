export const SECURITY_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60_000;

export function securityAuditExpireAtMillis(createdAt: number): number {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0
      || createdAt > Number.MAX_SAFE_INTEGER - SECURITY_AUDIT_RETENTION_MS) {
    throw new Error('Audit creation time must be a non-negative safe integer.');
  }
  return createdAt + SECURITY_AUDIT_RETENTION_MS;
}

export function scrapeQuotaExpireAtMillis(windowEnd: number, windowMs: number): number {
  if (!Number.isSafeInteger(windowEnd) || windowEnd < 0
      || !Number.isSafeInteger(windowMs) || windowMs <= 0
      || windowEnd > Number.MAX_SAFE_INTEGER - windowMs) {
    throw new Error('Scrape quota retention values are invalid.');
  }
  // One additional window preserves enough state for clock skew/retry
  // diagnostics without retaining hashed IP subjects indefinitely.
  return windowEnd + windowMs;
}
