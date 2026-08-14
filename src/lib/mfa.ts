import { TotpMultiFactorGenerator, type MultiFactorInfo } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from './firebase';

export const TOTP_CODE_LENGTH = 6;
export const MFA_RECOVERY_CODE_LENGTH = 16;
const MFA_RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface MfaRecoveryCodeStatus {
  generatedAt: number | null;
  expiresAt: number | null;
  remaining: number;
}

export interface GeneratedMfaRecoveryCodes {
  codes: string[];
  generatedAt: number;
  expiresAt: number;
}

export function normalizeTotpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH);
}

export function normalizeMfaRecoveryCode(value: string): string {
  const allowed = new Set(MFA_RECOVERY_ALPHABET);
  const raw = value.toUpperCase().split('').filter((character) => allowed.has(character)).slice(0, MFA_RECOVERY_CODE_LENGTH).join('');
  return raw.match(/.{1,4}/g)?.join('-') || raw;
}

export async function getMfaRecoveryCodeStatus(): Promise<MfaRecoveryCodeStatus> {
  if (!cloudFunctions) throw new Error('Account recovery is unavailable.');
  const callable = httpsCallable<Record<string, never>, MfaRecoveryCodeStatus>(
    cloudFunctions,
    'getMfaRecoveryCodeStatus',
  );
  return (await callable({})).data;
}

export async function generateMfaRecoveryCodes(): Promise<GeneratedMfaRecoveryCodes> {
  if (!cloudFunctions) throw new Error('Account recovery is unavailable.');
  const callable = httpsCallable<Record<string, never>, GeneratedMfaRecoveryCodes>(
    cloudFunctions,
    'generateMfaRecoveryCodes',
  );
  return (await callable({})).data;
}

export async function recoverMfaWithCode(code: string): Promise<void> {
  if (!cloudFunctions) throw new Error('Account recovery is unavailable.');
  const callable = httpsCallable<{ code: string }, { success: boolean }>(
    cloudFunctions,
    'recoverMfaWithCode',
  );
  const result = await callable({ code });
  if (!result.data.success) throw new Error('Account recovery could not be completed.');
}

export function findTotpFactor(
  factors: readonly MultiFactorInfo[],
): MultiFactorInfo | undefined {
  return factors.find((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

function authErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

export function mfaErrorMessage(error: unknown, language: string = 'en'): string {
  const de = language === 'de';
  switch (authErrorCode(error)) {
    case 'auth/invalid-verification-code':
      return de ? 'Der sechsstellige Code ist nicht korrekt.' : 'That six-digit code is not correct.';
    case 'auth/code-expired':
      return de ? 'Der Code ist abgelaufen. Verwende den aktuellen Code.' : 'That code expired. Use the current code.';
    case 'auth/requires-recent-login':
      return de ? 'Melde dich erneut an und versuche es dann noch einmal.' : 'Sign in again, then try this action once more.';
    case 'auth/unverified-email':
      return de ? 'Bestatige zuerst deine E-Mail-Adresse.' : 'Verify your email address first.';
    case 'auth/second-factor-already-in-use':
      return de ? 'Dieser Authenticator ist bereits registriert.' : 'This authenticator is already enrolled.';
    case 'auth/maximum-second-factor-count-exceeded':
      return de ? 'Die maximale Anzahl an zweiten Faktoren ist erreicht.' : 'The maximum number of second factors is already enrolled.';
    case 'auth/too-many-requests':
      return de ? 'Zu viele Versuche. Warte kurz und versuche es erneut.' : 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return de ? 'Die Verbindung ist fehlgeschlagen. Prufe dein Netzwerk.' : 'The connection failed. Check your network and try again.';
    default:
      return de ? 'Die Zwei-Faktor-Aktion konnte nicht abgeschlossen werden.' : 'The two-factor action could not be completed.';
  }
}

export function mfaRecoveryErrorMessage(error: unknown, language: string = 'en'): string {
  const de = language === 'de';
  switch (authErrorCode(error)) {
    case 'functions/invalid-argument':
      return de ? 'Dieser Wiederherstellungscode ist ungultig oder wurde bereits verwendet.' : 'That recovery code is invalid or has already been used.';
    case 'functions/resource-exhausted':
      return de ? 'Zu viele Versuche. Warte 15 Minuten und versuche es erneut.' : 'Too many attempts. Wait 15 minutes and try again.';
    case 'functions/failed-precondition':
      return de ? 'Melde dich erneut an und versuche es dann noch einmal.' : 'Sign in again, then try this action once more.';
    case 'functions/unavailable':
    case 'functions/internal':
      return de ? 'Die Kontowiederherstellung ist vorubergehend nicht verfugbar.' : 'Account recovery is temporarily unavailable.';
    default:
      return de ? 'Die Kontowiederherstellung konnte nicht abgeschlossen werden.' : 'Account recovery could not be completed.';
  }
}
