import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMfaRecoveryCodeSet,
  formatMfaRecoveryCode,
  mfaRecoveryDigest,
  normalizeMfaRecoveryCode,
} from './mfa-recovery';

test('recovery codes normalize only the unambiguous alphabet', () => {
  assert.equal(normalizeMfaRecoveryCode('2345-6789-abcd-efgh'), '23456789ABCDEFGH');
  assert.equal(normalizeMfaRecoveryCode('2345-6789-ABCD-EFG0'), '');
  assert.equal(formatMfaRecoveryCode('23456789ABCDEFGH'), '2345-6789-ABCD-EFGH');
});

test('generated recovery codes are unique and contain 80 bits of encoded entropy', () => {
  let seed = 0;
  const codes = createMfaRecoveryCodeSet(10, (size) => {
    const bytes = Buffer.alloc(size, seed);
    seed += 1;
    return bytes;
  });
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every((code) => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/.test(code)));
});

test('stored recovery digests are keyed and never contain the plaintext code', () => {
  const code = '2345-6789-ABCD-EFGH';
  const digest = mfaRecoveryDigest(code, 'a-secure-test-key-with-at-least-32-bytes');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.ok(!digest.includes(normalizeMfaRecoveryCode(code)));
  assert.notEqual(digest, mfaRecoveryDigest(code, 'another-secure-test-key-over-32-bytes'));
});
