#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '.');
const manifestPath = path.join(target, 'package.json');

if (!fs.existsSync(manifestPath)) {
  console.error(`License policy: package.json not found in ${target}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const approvedExpressions = new Set([
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  '(MIT OR CC0-1.0)',
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'public domain',
]);

// These baseline expressions have redistribution obligations. They are kept
// visible in every report and must not expand without an explicit policy edit.
const reviewedBaselineExpressions = new Set([
  'Apache-2.0 AND LGPL-3.0-or-later AND MIT',
  'CC-BY-4.0',
  'LGPL-3.0-or-later',
]);

// valid-url ships an MIT license file but omits the package.json field.
const metadataOverrides = new Map([
  ['valid-url@1.0.9', 'MIT'],
]);

function packageLicense(pkg) {
  const key = `${pkg.name}@${pkg.version}`;
  if (metadataOverrides.has(key)) return metadataOverrides.get(key);
  if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type.trim();
  if (Array.isArray(pkg.licenses)) {
    const values = pkg.licenses
      .map((entry) => typeof entry === 'string' ? entry : entry?.type)
      .filter(Boolean);
    if (values.length) return values.join(' OR ');
  }
  return null;
}

let packages;
try {
  packages = JSON.parse(execFileSync(
    'npm',
    ['query', ':not(:root)', '--omit=dev', '--json'],
    { cwd: target, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ));
} catch (error) {
  console.error('License policy: npm query failed. Run npm ci before this check.');
  if (error?.stderr) console.error(String(error.stderr).trim());
  process.exit(1);
}

const uniquePackages = new Map();
for (const pkg of packages) {
  if (!pkg?.name || !pkg?.version) continue;
  if (pkg.name === manifest.name && pkg.version === manifest.version) continue;
  uniquePackages.set(`${pkg.name}@${pkg.version}`, pkg);
}

const failures = [];
const reviewRequired = [];
const counts = new Map();

for (const [key, pkg] of [...uniquePackages].sort(([a], [b]) => a.localeCompare(b))) {
  const license = packageLicense(pkg);
  if (!license) {
    failures.push(`${key}: missing license metadata and no reviewed override`);
    continue;
  }
  counts.set(license, (counts.get(license) || 0) + 1);
  if (reviewedBaselineExpressions.has(license)) {
    reviewRequired.push(`${key}: ${license}`);
    continue;
  }
  if (!approvedExpressions.has(license)) {
    failures.push(`${key}: unapproved license expression ${JSON.stringify(license)}`);
  }
}

console.log(`License policy: scanned ${uniquePackages.size} production packages in ${manifest.name}.`);
for (const [license, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${license}: ${count}`);
}
if (reviewRequired.length) {
  console.log('Reviewed baseline packages with notice/source obligations:');
  for (const item of reviewRequired) console.log(`  ${item}`);
}
if (failures.length) {
  console.error('License policy failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error('Review the package and its license before updating the policy.');
  process.exit(1);
}

console.log('License policy passed. New or missing license expressions will fail CI.');
