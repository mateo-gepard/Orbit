import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MCP_DEFAULT_DYNAMIC_CLIENT_SCOPES,
  resolveConfiguredMcpOrigin,
  resolveMcpEndpoints,
  resolveMcpOAuthConfiguration,
  resolveMcpRequestOrigin,
} from './config';

test('dynamic registration defaults to least-privilege read access', () => {
  assert.deepEqual([...MCP_DEFAULT_DYNAMIC_CLIENT_SCOPES], [
    'threadmap.read',
    'workspace.read',
    'offline_access',
  ]);
});

test('staging accepts only this Vercel project preview host over HTTPS', () => {
  assert.equal(resolveMcpRequestOrigin({
    projectId: 'threadmap-staging-9e0b6',
    forwardedHost: 'orbit-git-codex-quality-mateos-projects-c394726f.vercel.app',
    forwardedProto: 'https',
  }), 'https://orbit-git-codex-quality-mateos-projects-c394726f.vercel.app');

  assert.equal(resolveMcpRequestOrigin({
    projectId: 'threadmap-staging-9e0b6',
    forwardedHost: 'evil-project.vercel.app',
    forwardedProto: 'https',
  }), undefined);

  assert.equal(resolveMcpRequestOrigin({
    projectId: 'threadmap-staging-9e0b6',
    forwardedHost: 'orbit-git-codex-quality-mateos-projects-c394726f.vercel.app',
    forwardedProto: 'http',
  }), undefined);
});

test('production never trusts a forwarded preview host', () => {
  assert.equal(resolveMcpRequestOrigin({
    projectId: 'orbit-9e0b6',
    forwardedHost: 'orbit-git-codex-quality-mateos-projects-c394726f.vercel.app',
    forwardedProto: 'https',
  }), undefined);
});

test('MCP origin defaults only for the exact production Firebase project', () => {
  assert.equal(resolveConfiguredMcpOrigin({ GCLOUD_PROJECT: 'orbit-9e0b6' }), 'https://threadmap.app');
  assert.equal(resolveConfiguredMcpOrigin({
    GCLOUD_PROJECT: 'threadmap-staging-9e0b6',
    MCP_ORIGIN: 'https://staging.threadmap.app',
  }), 'https://staging.threadmap.app');
  assert.throws(
    () => resolveConfiguredMcpOrigin({ GCLOUD_PROJECT: 'threadmap-staging-9e0b6' }),
    /must be configured/,
  );
  assert.throws(
    () => resolveConfiguredMcpOrigin({
      GCLOUD_PROJECT: 'threadmap-staging-9e0b6',
      MCP_ORIGIN: 'http://staging.threadmap.app',
    }),
    /must use https/,
  );
});

test('staging OAuth consent stays on the same configured staging plane', () => {
  const origin = 'https://staging.threadmap.app';
  const configuration = resolveMcpOAuthConfiguration(resolveMcpEndpoints(origin));
  assert.equal(configuration.authorizationConsentUrl, `${origin}/integrations/authorize`);
});
