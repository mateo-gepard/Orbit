import { createHmac } from 'node:crypto';

export type AuthEmailRateScope = 'address' | 'ip';

export function normalizeSignInEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || /\s/.test(email)) return '';
  const separator = email.indexOf('@');
  if (separator <= 0 || separator !== email.lastIndexOf('@')) return '';
  const domain = email.slice(separator + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return '';
  return email;
}

export function authEmailRateDigest(
  scope: AuthEmailRateScope,
  value: string,
  secret: string,
): string {
  if (secret.length < 32) throw new Error('AUTH_EMAIL_HMAC_KEY must contain at least 32 characters.');
  return createHmac('sha256', secret)
    .update(`threadmap-auth-email:v1:${scope}:${value}`)
    .digest('hex');
}

export function brandedThreadmapSignInUrl(
  generatedLink: string,
  appUrl = 'https://threadmap.app/',
): string {
  const generatedUrl = new URL(generatedLink);
  const nestedLink = generatedUrl.searchParams.get('link');
  const actionUrl = nestedLink ? new URL(nestedLink) : generatedUrl;
  if (actionUrl.searchParams.get('mode') !== 'signIn'
    || !actionUrl.searchParams.get('oobCode')
    || !actionUrl.searchParams.get('apiKey')) {
    throw new Error('Firebase returned an invalid sign-in link.');
  }

  const brandedUrl = new URL(appUrl);
  for (const key of ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang', 'tenantId']) {
    const value = actionUrl.searchParams.get(key);
    if (value) brandedUrl.searchParams.set(key, value);
  }
  return brandedUrl.toString();
}
