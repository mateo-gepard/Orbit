import { TotpMultiFactorGenerator, type MultiFactorInfo } from 'firebase/auth';

export const TOTP_CODE_LENGTH = 6;

export function normalizeTotpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH);
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
