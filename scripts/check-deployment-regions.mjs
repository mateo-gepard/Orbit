#!/usr/bin/env node

import fs from 'node:fs';

const deploymentFiles = [
  'functions/src/index.ts',
  'src/lib/firebase.ts',
  'next.config.ts',
  'vercel.json',
];

const failures = [];
const contents = new Map(
  deploymentFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]),
);

for (const [file, content] of contents) {
  if (content.includes('us-central1')) {
    failures.push(`${file} still references the US Functions region`);
  }
}

if (!contents.get('functions/src/index.ts')?.includes("const FUNCTION_REGION = 'europe-west1'")) {
  failures.push('Functions do not declare europe-west1 as their single deployment region');
}
if (!contents.get('src/lib/firebase.ts')?.includes("getFunctions(app, 'europe-west1')")) {
  failures.push('The browser callable client does not target europe-west1');
}

const nextConfig = contents.get('next.config.ts') || '';
for (const required of [
  'europe-west1-',
  'orbit-9e0b6',
  'threadmap-staging-9e0b6',
  'process.env.VERCEL_ENV === "production"',
]) {
  if (!nextConfig.includes(required)) failures.push(`next.config.ts is missing ${required}`);
}

const vercelConfig = JSON.parse(contents.get('vercel.json') || '{}');
if ('rewrites' in vercelConfig) {
  failures.push('vercel.json must not contain environment-blind MCP rewrites');
}

if (failures.length) {
  console.error('Deployment region policy failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('Deployment region policy passed: Functions and MCP routing are EU-only and preview-aware.');
