import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  authEmailRateDigest,
  brandedThreadmapSignInUrl,
  normalizeSignInEmail,
} from './auth-email';

const TEST_SECRET = 'a-secure-auth-email-test-key-over-32-bytes';

test('sign-in email normalization accepts canonical addresses and rejects malformed input', () => {
  assert.equal(normalizeSignInEmail('  Person@Example.com '), 'person@example.com');
  assert.equal(normalizeSignInEmail('not-an-email'), '');
  assert.equal(normalizeSignInEmail('two@@example.com'), '');
  assert.equal(normalizeSignInEmail('person@example'), '');
});

test('email quota identifiers are keyed and cannot be reproduced with an unkeyed hash', () => {
  const value = 'person@example.com';
  const digest = authEmailRateDigest('address', value, TEST_SECRET);
  const publicDigest = createHash('sha256')
    .update(`threadmap-auth-email:v1:address:${value}`)
    .digest('hex');

  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, publicDigest);
  assert.notEqual(digest, authEmailRateDigest('address', value, `${TEST_SECRET}-different`));
});

test('email quota identifiers require a sufficiently strong secret', () => {
  assert.throws(
    () => authEmailRateDigest('address', 'person@example.com', 'too-short'),
    /at least 32 characters/,
  );
});

test('Firebase sign-in actions are rewritten onto the Threadmap origin', () => {
  const generated = new URL('https://orbit-9e0b6.firebaseapp.com/__/auth/action');
  generated.searchParams.set('apiKey', 'test-api-key');
  generated.searchParams.set('mode', 'signIn');
  generated.searchParams.set('oobCode', 'one-time-code');
  generated.searchParams.set('continueUrl', 'https://threadmap.app/');

  const branded = new URL(brandedThreadmapSignInUrl(generated.toString()));
  assert.equal(branded.origin, 'https://threadmap.app');
  assert.equal(branded.searchParams.get('mode'), 'signIn');
  assert.equal(branded.searchParams.get('oobCode'), 'one-time-code');
  assert.equal(branded.searchParams.get('apiKey'), 'test-api-key');
});

test('nested Firebase links are unwrapped and non-sign-in actions are rejected', () => {
  const action = 'https://orbit-9e0b6.firebaseapp.com/__/auth/action?apiKey=key&mode=signIn&oobCode=code';
  const wrapped = `https://orbit-9e0b6.firebaseapp.com/__/auth/links?link=${encodeURIComponent(action)}`;
  assert.equal(new URL(brandedThreadmapSignInUrl(wrapped)).searchParams.get('oobCode'), 'code');
  assert.throws(
    () => brandedThreadmapSignInUrl('https://orbit-9e0b6.firebaseapp.com/__/auth/action?mode=resetPassword'),
    /invalid sign-in link/,
  );
});
