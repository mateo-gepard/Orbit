import { describe, expect, it } from 'vitest';

import {
  MFA_RECOVERY_CODE_LENGTH,
  mfaErrorMessage,
  mfaRecoveryErrorMessage,
  normalizeMfaRecoveryCode,
  normalizeTotpCode,
  TOTP_CODE_LENGTH,
} from './mfa';

describe('normalizeTotpCode', () => {
  it('keeps only the first six digits', () => {
    expect(normalizeTotpCode(' 12-34 56 78 ')).toBe('123456');
    expect(normalizeTotpCode('123')).toBe('123');
    expect(TOTP_CODE_LENGTH).toBe(6);
  });
});

describe('normalizeMfaRecoveryCode', () => {
  it('formats only the supported recovery alphabet into four-character groups', () => {
    expect(normalizeMfaRecoveryCode('2345 6789 abcd efgh')).toBe('2345-6789-ABCD-EFGH');
    expect(normalizeMfaRecoveryCode('OI01-2345')).toBe('2345');
    expect(MFA_RECOVERY_CODE_LENGTH).toBe(16);
  });
});

describe('mfaErrorMessage', () => {
  it('maps verification errors without exposing provider internals', () => {
    expect(mfaErrorMessage({ code: 'auth/invalid-verification-code' }, 'en'))
      .toBe('That six-digit code is not correct.');
    expect(mfaErrorMessage({ code: 'auth/invalid-verification-code' }, 'de'))
      .toBe('Der sechsstellige Code ist nicht korrekt.');
  });

  it('uses a safe fallback for unknown failures', () => {
    expect(mfaErrorMessage(new Error('provider detail'), 'en'))
      .toBe('The two-factor action could not be completed.');
  });
});

describe('mfaRecoveryErrorMessage', () => {
  it('does not reveal whether an account or recovery set exists', () => {
    expect(mfaRecoveryErrorMessage({ code: 'functions/invalid-argument' }, 'en'))
      .toBe('That recovery code is invalid or has already been used.');
  });
});
