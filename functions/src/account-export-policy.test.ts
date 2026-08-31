import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES,
  ACCOUNT_EXPORT_MAX_ATTACHMENTS,
  ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES,
  accountExportAttachmentBytesAllowed,
  accountExportAttachmentCountAllowed,
  accountExportMayReturn,
  accountExportSerializedByteLength,
  accountExportSerializedBytesAllowed,
  mapWithConcurrency,
  sanitizeAccountExportAuditEvent,
} from './account-export-policy.js';

test('single-file account export rejects attachment fan-out above its explicit cap', () => {
  assert.equal(accountExportAttachmentCountAllowed(
    ACCOUNT_EXPORT_MAX_ATTACHMENTS - 1,
    1,
  ), true);
  assert.equal(accountExportAttachmentCountAllowed(
    ACCOUNT_EXPORT_MAX_ATTACHMENTS,
    1,
  ), false);
});

test('an export response is suppressed if deletion starts during its point-in-time read', () => {
  assert.equal(accountExportMayReturn(false), true);
  assert.equal(accountExportMayReturn(true), false);
});

test('single-file export enforces cumulative attachment bytes without integer overflow', () => {
  assert.equal(ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES, 128 * 1024 * 1024);
  assert.equal(accountExportAttachmentBytesAllowed(
    ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES - 1,
    1,
  ), true);
  assert.equal(accountExportAttachmentBytesAllowed(
    ACCOUNT_EXPORT_MAX_ATTACHMENT_BYTES,
    1,
  ), false);
  assert.equal(accountExportAttachmentBytesAllowed(0, Number.MAX_SAFE_INTEGER), false);
  assert.equal(accountExportAttachmentBytesAllowed(Number.MAX_SAFE_INTEGER, 1), false);
  assert.equal(accountExportAttachmentBytesAllowed(0, 1.5), false);
  assert.equal(accountExportAttachmentBytesAllowed(0, -1), false);
});

test('single-response export enforces a UTF-8 JSON budget below the callable limit', () => {
  assert.equal(ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES, 20 * 1024 * 1024);
  assert.equal(accountExportSerializedByteLength({ value: '€' }), 15);
  assert.equal(accountExportSerializedBytesAllowed(
    ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES - 1,
    1,
  ), true);
  assert.equal(accountExportSerializedBytesAllowed(
    ACCOUNT_EXPORT_MAX_SERIALIZED_BYTES,
    1,
  ), false);
  assert.equal(accountExportSerializedBytesAllowed(0, Number.MAX_SAFE_INTEGER), false);
  assert.equal(accountExportSerializedBytesAllowed(Number.MAX_SAFE_INTEGER, 1), false);
});

test('security audit export keeps useful metadata and drops secrets and request arguments', () => {
  const mcp = sanitizeAccountExportAuditEvent('mcp', {
    userId: 'user-secret',
    clientId: 'client-1',
    tool: 'update_item',
    kind: 'write',
    success: false,
    resultCode: 'conflict',
    requestId: 'request-1',
    targetIds: ['item-1'],
    changedFields: ['title'],
    arguments: { title: 'private title' },
    accessTokenHash: 'secret-hash',
    createdAt: 123,
    expireAt: new Date(456),
  });
  assert.deepEqual(mcp, {
    source: 'mcp',
    event: 'mcp-tool-access',
    clientId: 'client-1',
    tool: 'update_item',
    kind: 'write',
    success: false,
    resultCode: 'conflict',
    durationMs: null,
    requestId: 'request-1',
    targetIds: ['item-1'],
    changedFields: ['title'],
    createdAt: 123,
    expiresAt: 456,
  });
  assert.equal(JSON.stringify(mcp).includes('private title'), false);
  assert.equal(JSON.stringify(mcp).includes('secret-hash'), false);

  assert.deepEqual(sanitizeAccountExportAuditEvent('mfa', {
    uid: 'user-secret',
    event: 'mfa-recovered',
    codeDigest: 'never-export',
    createdAt: 789,
  }), {
    source: 'mfa',
    event: 'mfa-recovered',
    createdAt: 789,
    expiresAt: null,
  });
});

test('account export preserves order while bounding concurrent storage checks', async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await mapWithConcurrency(
    Array.from({ length: 40 }, (_, index) => index),
    5,
    async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      return value * 2;
    },
  );

  assert.deepEqual(results, Array.from({ length: 40 }, (_, index) => index * 2));
  assert.ok(maximumActive <= 5);
  assert.ok(maximumActive > 1);
});

test('account export rejects an invalid concurrency instead of silently serializing', async () => {
  await assert.rejects(mapWithConcurrency([1], 0, async (value) => value));
});
