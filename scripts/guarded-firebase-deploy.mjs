#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { assertProductionFunctionsEnvironment } from './production-functions-env-policy.mjs';

const PRODUCTION_PROJECT = 'orbit-9e0b6';
const ALLOWED_RESOURCES = new Set([
  'functions',
  'firestore:rules',
  'firestore:indexes',
  'storage',
]);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function abort(message) {
  console.error(`Firebase deployment refused: ${message}`);
  process.exit(1);
}

const project = argument('--project');
const checkOnly = process.argv.includes('--check-only');
const resources = argument('--only')?.split(',').filter(Boolean) || [];
if (project !== PRODUCTION_PROJECT) abort(`--project must be exactly ${PRODUCTION_PROJECT}`);
if (!checkOnly && (!resources.length || resources.some((resource) => !ALLOWED_RESOURCES.has(resource)))) {
  abort(`--only must contain approved resources: ${[...ALLOWED_RESOURCES].join(', ')}`);
}
if (checkOnly && resources.length) abort('--check-only cannot be combined with --only');
if (process.env.THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION !== PRODUCTION_PROJECT) {
  abort(`set THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=${PRODUCTION_PROJECT}`);
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expectedSha = process.env.THREADMAP_RELEASE_SHA?.trim();
if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha) || expectedSha !== head) {
  abort('THREADMAP_RELEASE_SHA must equal the checked-out commit SHA');
}

const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (status) abort('the worktree must be clean');

const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const ciBranch = process.env.GITHUB_REF_NAME?.trim();
if ((ciBranch && ciBranch !== 'main') || (!ciBranch && branch !== 'main')) {
  abort('production deploys must run from main');
}
const mainReference = ciBranch ? 'origin/main' : 'main';
const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', head, mainReference]);
if (ancestry.status !== 0) abort(`the release commit must belong to ${mainReference}`);

if (resources.includes('functions')) {
  try {
    const policy = assertProductionFunctionsEnvironment();
    console.log(
      `Production Functions dotenv policy verified across ${policy.files.join(', ') || 'no files'}.`,
    );
  } catch (error) {
    abort(error instanceof Error ? error.message : 'Functions dotenv policy verification failed');
  }
}

execFileSync(process.execPath, ['scripts/check-production-readiness.mjs'], { stdio: 'inherit' });

if (checkOnly) {
  console.log(`Production change guard passed for ${project} at ${head.slice(0, 12)}.`);
  process.exit(0);
}

console.log(`Deploying ${resources.join(', ')} to ${project} from ${head.slice(0, 12)}.`);
const result = spawnSync(
  'firebase',
  ['deploy', '--project', project, '--only', resources.join(','), '--non-interactive'],
  { stdio: 'inherit' },
);
if (result.error) abort(result.error.message);
process.exit(result.status ?? 1);
