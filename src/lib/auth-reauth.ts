export type AccountReauthMethod = 'google' | 'password' | 'email-link' | 'unsupported';

export function isRecentLoginRequiredError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  const message = String((error as { message?: unknown })?.message || '').toLowerCase();
  const details = (error as { details?: unknown })?.details;
  const reason = details && typeof details === 'object'
    ? String((details as { reason?: unknown }).reason || '').toLowerCase()
    : '';
  return reason === 'recent-login-required'
    || code === 'auth/requires-recent-login'
    || message.includes('sign in again before deleting')
    || message.includes('recent authentication');
}

export function chooseAccountReauthMethod(
  providerIds: string[],
  emailSignInMethods: string[] = [],
): AccountReauthMethod {
  if (providerIds.includes('google.com')) return 'google';
  if (emailSignInMethods.includes('password')) return 'password';
  if (emailSignInMethods.includes('emailLink')) return 'email-link';
  // Firebase represents both password and passwordless email users with the
  // same provider ID in some configurations. Prefer a password prompt only
  // when the sign-in-method lookup cannot disambiguate it; failures then show
  // the explicit passwordless recovery path.
  if (providerIds.includes('password') && emailSignInMethods.length === 0) return 'password';
  return 'unsupported';
}
