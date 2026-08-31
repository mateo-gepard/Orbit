import { describe, expect, it, vi } from 'vitest';
import { revokeCalendarIntegrationForAccountDeletion } from './account-integration-cleanup';

describe('account deletion integration cleanup', () => {
  it('confirms a live Google token only after GIS reports revocation', async () => {
    const revoke = vi.fn().mockResolvedValue('revoked');
    await expect(revokeCalendarIntegrationForAccountDeletion({
      configured: true,
      hasLiveToken: true,
      revoke,
    })).resolves.toBe(true);
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('treats an already-disconnected integration as idempotently clean', async () => {
    const revoke = vi.fn();
    await expect(revokeCalendarIntegrationForAccountDeletion({
      configured: false,
      hasLiveToken: false,
      revoke,
    })).resolves.toBe(true);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('surfaces provider failure and configured integrations without a usable token', async () => {
    await expect(revokeCalendarIntegrationForAccountDeletion({
      configured: true,
      hasLiveToken: true,
      revoke: async () => 'local-only',
    })).resolves.toBe(false);
    await expect(revokeCalendarIntegrationForAccountDeletion({
      configured: true,
      hasLiveToken: false,
      revoke: async () => 'revoked',
    })).resolves.toBe(false);
  });
});
