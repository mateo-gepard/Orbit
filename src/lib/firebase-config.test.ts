import { describe, expect, it } from 'vitest';
import nextConfig, {
  createContentSecurityPolicy,
  createFirebaseAuthRewrite,
  resolveDeploymentFirebaseProject,
} from '../../next.config';
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

  it('proxies the Firebase helper path through the selected environment', () => {
    expect(createFirebaseAuthRewrite('threadmap-staging-9e0b6')).toEqual({
      source: '/__/auth/:path*',
      destination: 'https://threadmap-staging-9e0b6.firebaseapp.com/__/auth/:path*',
    });
  });

  it('selects production and staging consistently and rejects provider/config drift', () => {
    expect(resolveDeploymentFirebaseProject('production', 'orbit-9e0b6')).toBe('orbit-9e0b6');
    expect(resolveDeploymentFirebaseProject('preview', 'threadmap-staging-9e0b6'))
      .toBe('threadmap-staging-9e0b6');
    expect(() => resolveDeploymentFirebaseProject('preview', 'orbit-9e0b6'))
      .toThrow(/requires Firebase project threadmap-staging-9e0b6/);
    expect(() => resolveDeploymentFirebaseProject('production', 'attacker-project'))
      .toThrow(/Unsupported Firebase project/);
  });

  it('keeps insecure-request upgrades in deployed CSP but permits explicit loopback testing', () => {
    expect(createContentSecurityPolicy({
      development: false,
      upgradeInsecureRequests: true,
    })).toContain('upgrade-insecure-requests');
    expect(createContentSecurityPolicy({
      development: false,
      upgradeInsecureRequests: false,
    })).not.toContain('upgrade-insecure-requests');
  });

  it('applies the loopback CSP override after the deployed-host policy', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();
    const deployedRuleIndex = rules?.findIndex((rule) =>
      rule.source === '/:path*'
      && !rule.has
      && rule.headers.some((header) => header.key === 'Content-Security-Policy')) ?? -1;
    const loopbackRuleIndex = rules?.findIndex((rule) =>
      rule.source === '/:path*'
      && rule.has?.some((condition) =>
        condition.type === 'host' && condition.value === '(?:localhost|127\\.0\\.0\\.1)')) ?? -1;

    expect(deployedRuleIndex).toBeGreaterThanOrEqual(0);
    expect(loopbackRuleIndex).toBeGreaterThan(deployedRuleIndex);
    const loopbackCsp = rules?.[loopbackRuleIndex]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;
    expect(loopbackCsp).not.toContain('upgrade-insecure-requests');
  });
});
