import { createHmac, randomBytes } from 'node:crypto';

export const MFA_RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MFA_RECOVERY_CODE_COUNT = 10;
export const MFA_RECOVERY_CODE_LENGTH = 16;

export function normalizeMfaRecoveryCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  const pattern = new RegExp(`^[${MFA_RECOVERY_ALPHABET}]{${MFA_RECOVERY_CODE_LENGTH}}$`);
  return pattern.test(normalized) ? normalized : '';
}

export function formatMfaRecoveryCode(value: string): string {
  return value.match(/.{1,4}/g)?.join('-') || value;
}

export function createMfaRecoveryCodeSet(
  count: number = MFA_RECOVERY_CODE_COUNT,
  randomSource: (size: number) => Buffer = randomBytes,
): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const entropy = randomSource(MFA_RECOVERY_CODE_LENGTH);
    let raw = '';
    for (const byte of entropy) raw += MFA_RECOVERY_ALPHABET[byte & 31];
    codes.add(formatMfaRecoveryCode(raw));
  }
  return [...codes];
}

export function mfaRecoveryDigest(code: string, secret: string): string {
  const normalized = normalizeMfaRecoveryCode(code);
  if (!normalized) throw new Error('Invalid MFA recovery code.');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('MFA recovery HMAC secret must contain at least 32 bytes.');
  }
  return createHmac('sha256', secret).update(`threadmap-mfa-recovery:v1:${normalized}`).digest('hex');
}

/** A code is usable only while it belongs to the account's current code set. */
export function isCurrentMfaRecoveryCode(
  code: Record<string, unknown>,
  set: Record<string, unknown>,
  now: number,
): code is Record<string, unknown> & { uid: string; generationId: string } {
  return code.status === 'active'
    && typeof code.uid === 'string'
    && typeof code.generationId === 'string'
    && Number(code.expiresAt || 0) > now
    && set.uid === code.uid
    && set.generationId === code.generationId
    && Number(set.expiresAt || 0) > now
    && Number(set.remaining || 0) > 0;
}
