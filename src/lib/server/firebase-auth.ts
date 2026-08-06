import { NextRequest, NextResponse } from 'next/server';
import { firebaseConfig } from '../firebase-config';

const MAX_TOKEN_LENGTH = 4_096;

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
}

export class RequestAuthError extends Error {
  constructor(
    public readonly code: 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'AUTH_UNAVAILABLE',
    message: string,
    public readonly status: 401 | 503
  ) {
    super(message);
    this.name = 'RequestAuthError';
  }
}

export function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer ([^\s]+)$/i);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) return null;
  return match[1];
}

export async function requireFirebaseUser(request: NextRequest): Promise<VerifiedFirebaseUser> {
  const idToken = getBearerToken(request);
  if (!idToken) {
    throw new RequestAuthError('AUTH_REQUIRED', 'Sign in to use product import.', 401);
  }
  if (!firebaseConfig.apiKey) {
    throw new RequestAuthError('AUTH_UNAVAILABLE', 'Authentication verification is unavailable.', 503);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      }
    );
  } catch {
    throw new RequestAuthError('AUTH_UNAVAILABLE', 'Authentication verification is unavailable.', 503);
  }

  if (!response.ok) {
    throw new RequestAuthError('AUTH_INVALID', 'Your session is invalid or expired.', 401);
  }
  const payload = await response.json() as {
    users?: Array<{ localId?: string; email?: string }>;
  };
  const verified = payload.users?.[0];
  if (!verified?.localId) {
    throw new RequestAuthError('AUTH_INVALID', 'Your session is invalid or expired.', 401);
  }
  return { uid: verified.localId, email: verified.email };
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof RequestAuthError)) return null;
  return NextResponse.json(
    { code: error.code, error: error.message },
    { status: error.status, headers: { 'Cache-Control': 'no-store' } }
  );
}
