import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMcpRequestOrigin } from './config';

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
