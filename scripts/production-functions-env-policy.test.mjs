import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertProductionFunctionsEnvironment,
  resolveFirebaseFunctionsEnvironment,
} from './production-functions-env-policy.mjs';

const GUARDED_DEPLOY_SOURCE = fs.readFileSync(
  new URL('./guarded-firebase-deploy.mjs', import.meta.url),
  'utf8',
);

const SAFE_POLICY = [
  'ENFORCE_APP_CHECK=true',
  'THREADMAP_PRIVATE_MODE=true',
  'MCP_ORIGIN=https://threadmap.app',
  'MCP_ALLOW_LOOPBACK_REDIRECTS=false',
  'MCP_DYNAMIC_CLIENT_SCOPES=threadmap.read workspace.read offline_access',
  'GOOGLE_WORKSPACE_CLIENT_ID=production-client.apps.googleusercontent.com',
  'MCP_EXTRA_REDIRECT_URIS=',
  'THREADMAP_APP_ORIGIN=https://threadmap.app',
  'AUTH_EMAIL_FIREBASE_ACTION_HOSTS=orbit-9e0b6.firebaseapp.com,orbit-9e0b6.web.app',
  '',
].join('\n');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadmap-functions-env-'));
  const functionsDirectory = path.join(root, 'functions');
  fs.mkdirSync(functionsDirectory);
  return {
    functionsDirectory,
    write(name, value) {
      fs.writeFileSync(path.join(functionsDirectory, name), value, { mode: 0o600 });
    },
  };
}

test('project dotenv overrides a broader generic development policy', () => {
  const target = fixture();
  target.write('.env', [
    'MCP_ORIGIN=https://threadmap.app',
    'MCP_ALLOW_LOOPBACK_REDIRECTS=true',
    'MCP_DYNAMIC_CLIENT_SCOPES=threadmap.read threadmap.write offline_access',
  ].join('\n'));
  target.write('.env.orbit-9e0b6', SAFE_POLICY);

  const result = assertProductionFunctionsEnvironment({
    functionsDirectory: target.functionsDirectory,
  });

  assert.deepEqual(result.files, ['.env', '.env.orbit-9e0b6']);
});

test('the production Functions deploy path invokes the dotenv policy guard', () => {
  assert.match(GUARDED_DEPLOY_SOURCE, /import \{ assertProductionFunctionsEnvironment \}/);
  assert.match(GUARDED_DEPLOY_SOURCE, /resources\.includes\('functions'\)/);
  assert.match(GUARDED_DEPLOY_SOURCE, /assertProductionFunctionsEnvironment\(\)/);
});

test('missing project override fails with key names and no dotenv values', () => {
  const target = fixture();
  const sensitiveMarker = 'https://private-callback.invalid/not-for-logs';
  target.write('.env', [
    'MCP_ALLOW_LOOPBACK_REDIRECTS=true',
    `MCP_EXTRA_REDIRECT_URIS=${sensitiveMarker}`,
  ].join('\n'));

  assert.throws(
    () => assertProductionFunctionsEnvironment({ functionsDirectory: target.functionsDirectory }),
    (error) => {
      assert.match(error.message, /MCP_ALLOW_LOOPBACK_REDIRECTS/);
      assert.match(error.message, /MCP_EXTRA_REDIRECT_URIS/);
      assert.doesNotMatch(error.message, new RegExp(sensitiveMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});

test('configured callback additions are not part of the exact launch policy', () => {
  const target = fixture();
  target.write('.env.orbit-9e0b6', SAFE_POLICY.replace(
    'MCP_EXTRA_REDIRECT_URIS=',
    'MCP_EXTRA_REDIRECT_URIS=https://approved.example/callback',
  ));

  assert.throws(
    () => assertProductionFunctionsEnvironment({ functionsDirectory: target.functionsDirectory }),
    /MCP_EXTRA_REDIRECT_URIS/,
  );
});

test('dotenv parse failures withhold the invalid source line', () => {
  const target = fixture();
  const sensitiveMarker = 'do-not-disclose-this-value';
  target.write('.env.orbit-9e0b6', `NOT VALID ${sensitiveMarker}\n`);

  assert.throws(
    () => resolveFirebaseFunctionsEnvironment({ functionsDirectory: target.functionsDirectory }),
    (error) => {
      assert.match(error.message, /contents withheld/);
      assert.doesNotMatch(error.message, new RegExp(sensitiveMarker));
      return true;
    },
  );
});
