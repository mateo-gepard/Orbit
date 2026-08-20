#!/usr/bin/env node

import fs from 'node:fs';

function abort(message) {
  console.error(`Vercel project-link verification failed: ${message}`);
  process.exit(1);
}

const expectedOrganization = process.env.VERCEL_ORG_ID?.trim();
const expectedProject = process.env.VERCEL_PROJECT_ID?.trim();
if (!expectedOrganization || !expectedProject) {
  abort('VERCEL_ORG_ID and VERCEL_PROJECT_ID are required');
}

let actual;
try {
  actual = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
} catch (error) {
  abort(`cannot read .vercel/project.json: ${error instanceof Error ? error.message : String(error)}`);
}

if (actual.orgId !== expectedOrganization) {
  abort(`linked organization ${actual.orgId || '(missing)'} does not match VERCEL_ORG_ID`);
}
if (actual.projectId !== expectedProject) {
  abort(`linked project ${actual.projectId || '(missing)'} does not match VERCEL_PROJECT_ID`);
}

console.log(`Vercel project link verified: ${actual.projectName || actual.projectId}.`);
