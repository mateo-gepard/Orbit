import fs from 'node:fs';
import path from 'node:path';
import firebaseFunctionsEnv from 'firebase-tools/lib/functions/env.js';

export const PRODUCTION_FIREBASE_PROJECT = 'orbit-9e0b6';

const REQUIRED_PRODUCTION_VALUES = Object.freeze({
  ENFORCE_APP_CHECK: 'true',
  MCP_ORIGIN: 'https://threadmap.app',
  MCP_ALLOW_LOOPBACK_REDIRECTS: 'false',
  MCP_DYNAMIC_CLIENT_SCOPES: 'threadmap.read offline_access',
  THREADMAP_APP_ORIGIN: 'https://threadmap.app',
  AUTH_EMAIL_FIREBASE_ACTION_HOSTS: 'orbit-9e0b6.firebaseapp.com,orbit-9e0b6.web.app',
});

const EMPTY_PRODUCTION_VALUES = Object.freeze([
  'MCP_EXTRA_REDIRECT_URIS',
]);

function parseDotenvWithoutDisclosure(file) {
  try {
    return firebaseFunctionsEnv.parseStrict(fs.readFileSync(file, 'utf8'));
  } catch {
    // Firebase's parser includes the invalid source line in its error. Never
    // forward that text because ignored dotenv files can contain sensitive data.
    throw new Error(`invalid dotenv syntax in ${path.basename(file)} (contents withheld)`);
  }
}

/**
 * Mirrors the Firebase CLI's non-emulator load order for an explicit project
 * id: `.env`, followed by `.env.<projectId>`. The production wrapper always
 * passes the literal project id, so no alias-specific dotenv file is loaded.
 */
export function resolveFirebaseFunctionsEnvironment({
  functionsDirectory = 'functions',
  projectId = PRODUCTION_FIREBASE_PROJECT,
} = {}) {
  const candidates = [
    path.join(functionsDirectory, '.env'),
    path.join(functionsDirectory, `.env.${projectId}`),
  ];
  const files = candidates.filter((file) => fs.existsSync(file));
  const environment = {};
  for (const file of files) {
    Object.assign(environment, parseDotenvWithoutDisclosure(file));
  }
  return { environment, files };
}

/**
 * Proves the effective non-secret Functions configuration is the production
 * launch policy. Error messages expose key/file names only, never values.
 */
export function assertProductionFunctionsEnvironment(options = {}) {
  const { environment, files } = resolveFirebaseFunctionsEnvironment(options);
  const mismatches = [];

  for (const [key, expected] of Object.entries(REQUIRED_PRODUCTION_VALUES)) {
    if (environment[key] !== expected) mismatches.push(key);
  }
  for (const key of EMPTY_PRODUCTION_VALUES) {
    if (typeof environment[key] === 'string' && environment[key].trim()) {
      mismatches.push(key);
    }
  }

  if (mismatches.length) {
    const projectId = options.projectId || PRODUCTION_FIREBASE_PROJECT;
    throw new Error(
      `production Functions dotenv policy mismatch for keys: ${mismatches.sort().join(', ')}; `
      + `provide an exact override in functions/.env.${projectId} (values withheld)`,
    );
  }

  return {
    files: files.map((file) => path.basename(file)),
    checkedKeys: [
      ...Object.keys(REQUIRED_PRODUCTION_VALUES),
      ...EMPTY_PRODUCTION_VALUES,
    ],
  };
}
