import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveAllowedReleaseOrigin,
  resolveExpectedMcpOrigin,
  resolveReleaseTargetProfile,
} from './release-target-policy.mjs';

const PRODUCTION_DEPLOYMENT = 'https://orbit-abc123-mateos-projects-c394726f.vercel.app';

test('production accepts only the canonical hostname or this Vercel project', () => {
  const profile = resolveReleaseTargetProfile('production');
  assert.equal(resolveAllowedReleaseOrigin('https://threadmap.app', profile), 'https://threadmap.app');
  assert.equal(resolveAllowedReleaseOrigin(PRODUCTION_DEPLOYMENT, profile), PRODUCTION_DEPLOYMENT);
  assert.equal(resolveExpectedMcpOrigin(profile, PRODUCTION_DEPLOYMENT), 'https://threadmap.app');
  assert.throws(
    () => resolveAllowedReleaseOrigin('https://attacker.example', profile),
    /approved production hostname/,
  );
});

test('staging accepts its stable origin or this project preview and keeps discovery on target', () => {
  const profile = resolveReleaseTargetProfile('staging');
  const preview = resolveAllowedReleaseOrigin(PRODUCTION_DEPLOYMENT, profile);
  assert.equal(preview, PRODUCTION_DEPLOYMENT);
  assert.equal(resolveExpectedMcpOrigin(profile, preview), preview);
  assert.equal(
    resolveAllowedReleaseOrigin('https://staging.threadmap.app/', profile),
    'https://staging.threadmap.app',
  );
  assert.throws(
    () => resolveAllowedReleaseOrigin('https://threadmap.app', profile),
    /approved staging hostname/,
  );
});

test('target URLs cannot smuggle paths, credentials, query strings, or plaintext transport', () => {
  const profile = resolveReleaseTargetProfile('production');
  for (const target of [
    'http://threadmap.app',
    'https://threadmap.app/other',
    'https://threadmap.app?target=other',
    'https://user:password@threadmap.app',
  ]) {
    assert.throws(() => resolveAllowedReleaseOrigin(target, profile));
  }
});

test('unknown environment names fail closed', () => {
  assert.throws(() => resolveReleaseTargetProfile('preview'), /production or staging/);
});
