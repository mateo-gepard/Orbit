import { describe, expect, it } from 'vitest';
import { firebaseAuthRewrite } from '../../next.config';
import { resolveFirebaseAuthDomain } from './firebase-config';

describe('Firebase redirect authentication configuration', () => {
  it('uses the same-origin helper domain for production', () => {
    expect(resolveFirebaseAuthDomain('orbit-9e0b6', 'orbit-9e0b6.firebaseapp.com'))
      .toBe('threadmap.app');
  });

  it('preserves the configured helper domain for non-production projects', () => {
    expect(resolveFirebaseAuthDomain('threadmap-staging', 'threadmap-staging.firebaseapp.com'))
      .toBe('threadmap-staging.firebaseapp.com');
  });

  it('transparently proxies the Firebase helper path instead of redirecting it', () => {
    expect(firebaseAuthRewrite).toEqual({
      source: '/__/auth/:path*',
      destination: 'https://orbit-9e0b6.firebaseapp.com/__/auth/:path*',
    });
  });
});
