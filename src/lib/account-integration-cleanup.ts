import type { GoogleCalendarRevocationOutcome } from './google-calendar';

export async function revokeCalendarIntegrationForAccountDeletion(input: {
  configured: boolean;
  hasLiveToken: boolean;
  revoke: () => Promise<GoogleCalendarRevocationOutcome>;
}): Promise<boolean> {
  if (!input.hasLiveToken) {
    // No configured integration and no usable token is an idempotently clean
    // state. A configured integration without a token cannot be proven revoked
    // from this device and must be surfaced for manual Google-account cleanup.
    return !input.configured;
  }
  return (await input.revoke()) === 'revoked';
}
