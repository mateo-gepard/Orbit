import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESUMABLE_UPLOAD_SESSION_RISK_MS,
  UPLOAD_CLEANUP_INTERVAL_MS,
  attachmentUploadOriginAllowed,
  decideUploadCleanup,
  resumableUploadMetadata,
  shouldReleaseUploadRegistry,
} from './upload-cleanup-policy';

test('attachment uploads accept only the configured app origin outside the emulator', () => {
  const staging = 'https://staging.threadmap.app';
  assert.equal(attachmentUploadOriginAllowed(staging, staging), true);
  assert.equal(attachmentUploadOriginAllowed('https://threadmap.app', staging), false);
  assert.equal(attachmentUploadOriginAllowed('http://localhost:3000', staging), false);
  assert.equal(attachmentUploadOriginAllowed('http://127.0.0.1:3000', staging), false);
  assert.equal(attachmentUploadOriginAllowed('http://localhost:3000', staging, true), true);
  assert.equal(attachmentUploadOriginAllowed('http://127.0.0.1:3000', staging, true), true);
});

test('resumable session metadata binds the provider upload to the quota-charged size', () => {
  assert.deepEqual(resumableUploadMetadata(12_345, 'application/pdf', 'file-one'), {
    contentType: 'application/pdf',
    contentLength: 12_345,
    metadata: { threadmapUploadId: 'file-one' },
  });
  assert.throws(() => resumableUploadMetadata(0, 'text/plain', 'x'));
  assert.throws(() => resumableUploadMetadata(Number.MAX_SAFE_INTEGER + 1, 'text/plain', 'x'));
});

test('an absent object at the first intent-expiry sweep retains the cleanup barrier', () => {
  const createdAt = Date.UTC(2026, 7, 20, 12, 0, 0);
  const now = createdAt + 60 * 60_000;
  const decision = decideUploadCleanup({
    createdAt,
    intentExpiresAt: now,
    now,
  });
  assert.equal(decision.phase, 'sweep-and-retain');
  assert.equal(decision.cleanupUntil, createdAt + RESUMABLE_UPLOAD_SESSION_RISK_MS);
  assert.equal(decision.nextAttemptAt, now + UPLOAD_CLEANUP_INTERVAL_MS);
});

test('hourly sweeps continue so an object uploaded after an earlier absent sweep is removed', () => {
  const createdAt = Date.UTC(2026, 7, 20, 12, 0, 0);
  const cleanupUntil = createdAt + RESUMABLE_UPLOAD_SESSION_RISK_MS;
  const first = decideUploadCleanup({
    createdAt,
    intentExpiresAt: createdAt + 60 * 60_000,
    cleanupUntil,
    now: createdAt + 2 * 60 * 60_000,
  });
  const delayed = decideUploadCleanup({
    createdAt,
    intentExpiresAt: createdAt + 60 * 60_000,
    cleanupUntil,
    now: first.nextAttemptAt,
  });
  assert.equal(first.phase, 'sweep-and-retain');
  assert.equal(delayed.phase, 'sweep-and-retain');
  assert.equal(delayed.nextAttemptAt, first.nextAttemptAt + UPLOAD_CLEANUP_INTERVAL_MS);
});

test('registry reservation release is idempotent and the final sweep removes the barrier', () => {
  assert.equal(shouldReleaseUploadRegistry(undefined), true);
  assert.equal(shouldReleaseUploadRegistry(1), false);

  const createdAt = Date.UTC(2026, 7, 20, 12, 0, 0);
  const cleanupUntil = createdAt + RESUMABLE_UPLOAD_SESSION_RISK_MS;
  const decision = decideUploadCleanup({
    createdAt,
    intentExpiresAt: createdAt + 60 * 60_000,
    cleanupUntil,
    now: cleanupUntil,
  });
  assert.equal(decision.phase, 'sweep-and-finalize');
  assert.equal(decision.nextAttemptAt, Number.MAX_SAFE_INTEGER);
});

test('force expiry releases the attach intent but never shortens the provider cleanup window', () => {
  const createdAt = Date.UTC(2026, 7, 20, 12, 0, 0);
  const decision = decideUploadCleanup({
    createdAt,
    intentExpiresAt: createdAt + 60 * 60_000,
    now: createdAt + 1_000,
    forceIntentExpiry: true,
  });
  assert.equal(decision.phase, 'sweep-and-retain');
  assert.equal(decision.cleanupUntil, createdAt + RESUMABLE_UPLOAD_SESSION_RISK_MS);
});
