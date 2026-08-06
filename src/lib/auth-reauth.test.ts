import { describe, expect, it } from 'vitest';
import { chooseAccountReauthMethod, isRecentLoginRequiredError } from './auth-reauth';

describe('account deletion reauthentication', () => {
  it('recognizes callable and Firebase recent-login failures', () => {
    expect(isRecentLoginRequiredError({
      code: 'functions/failed-precondition',
      details: { reason: 'recent-login-required' },
    })).toBe(true);
    expect(isRecentLoginRequiredError({ code: 'auth/requires-recent-login' })).toBe(true);
    expect(isRecentLoginRequiredError(new Error('Sign in again before deleting your account.'))).toBe(true);
    expect(isRecentLoginRequiredError({ code: 'functions/internal' })).toBe(false);
    expect(isRecentLoginRequiredError({
      code: 'functions/failed-precondition',
      message: 'This item has too many relationships.',
    })).toBe(false);
  });

  it('selects Google, password, passwordless, and unsupported recovery paths', () => {
    expect(chooseAccountReauthMethod(['google.com'], ['password'])).toBe('google');
    expect(chooseAccountReauthMethod(['password'], ['password'])).toBe('password');
    expect(chooseAccountReauthMethod(['password'], ['emailLink'])).toBe('email-link');
    expect(chooseAccountReauthMethod(['github.com'], [])).toBe('unsupported');
  });
});
