import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '@/lib/firebase';

interface SignInLinkRequest {
  email: string;
}

interface SignInLinkResponse {
  sent: boolean;
}

export async function requestThreadmapSignInLink(email: string): Promise<void> {
  if (!cloudFunctions) throw new Error('Threadmap sign-in is not configured.');
  const sendSignInLink = httpsCallable<SignInLinkRequest, SignInLinkResponse>(
    cloudFunctions,
    'sendThreadmapSignInLink',
  );
  const result = await sendSignInLink({ email: email.trim() });
  if (!result.data.sent) throw new Error('Threadmap could not send the sign-in email.');
}
