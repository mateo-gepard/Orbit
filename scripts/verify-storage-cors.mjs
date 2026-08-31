#!/usr/bin/env node

import fs from 'node:fs';

function abort(message) {
  console.error(`Storage CORS verification failed: ${message}`);
  process.exit(1);
}

const policyPath = process.argv[2];
if (!policyPath) abort('provide the expected policy path');

let expected;
let bucket;
try {
  expected = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  bucket = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (error) {
  abort(error instanceof Error ? error.message : String(error));
}

const actual = bucket.cors_config ?? bucket.corsConfig ?? bucket.cors;
if (!Array.isArray(expected) || !Array.isArray(actual)) {
  abort('expected and live CORS values must both be arrays');
}

function normalize(rules) {
  return rules.map((rule) => ({
    origin: [...(rule.origin || [])].sort(),
    method: [...(rule.method || [])].map((method) => method.toUpperCase()).sort(),
    responseHeader: [...(rule.responseHeader || rule.response_header || [])]
      .map((header) => header.toLowerCase())
      .sort(),
    maxAgeSeconds: Number(rule.maxAgeSeconds ?? rule.max_age_seconds),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

const expectedNormalized = normalize(expected);
const actualNormalized = normalize(actual);
if (JSON.stringify(actualNormalized) !== JSON.stringify(expectedNormalized)) {
  abort(`live policy does not match ${policyPath}`);
}

const origins = expectedNormalized.flatMap((rule) => rule.origin);
console.log(`Storage CORS verified. Configured origins: ${origins.join(', ')}`);
