import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SECURITY_AUDIT_RETENTION_MS,
  scrapeQuotaExpireAtMillis,
  securityAuditExpireAtMillis,
} from './retention-policy.js';

test('security audit records share the documented 30-day retention', () => {
  assert.equal(
    securityAuditExpireAtMillis(1_000),
    1_000 + SECURITY_AUDIT_RETENTION_MS,
  );
});

test('hashed scrape quota subjects expire one window after enforcement ends', () => {
  assert.equal(scrapeQuotaExpireAtMillis(20_000, 10_000), 30_000);
  assert.throws(() => scrapeQuotaExpireAtMillis(Number.MAX_SAFE_INTEGER, 1));
});
