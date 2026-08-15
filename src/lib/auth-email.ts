'use client';

import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from './firebase';

export type ThreadmapAuthEmailKind =
  | 'email-sign-in'
  | 'password-reset'
  | 'email-verification';

interface AuthEmailResponse {
  accepted: boolean;
}

/**
 * Route every account email through Threadmap's authenticated transactional
 * sender instead of Firebase's generic project-branded templates.
 */
export async function sendThreadmapAuthEmail(
  kind: ThreadmapAuthEmailKind,
  email: string,
  continueUrl: string,
): Promise<void> {
  if (!cloudFunctions) throw new Error('Threadmap email delivery is unavailable.');

  const callable = httpsCallable<
    { kind: ThreadmapAuthEmailKind; email: string; continueUrl: string },
    AuthEmailResponse
  >(cloudFunctions, 'sendThreadmapAuthEmail');
  const result = await callable({ kind, email: email.trim(), continueUrl });
  if (!result.data.accepted) throw new Error('Threadmap could not accept this email request.');
}
