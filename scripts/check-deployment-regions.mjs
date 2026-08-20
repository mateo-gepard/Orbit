#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const FIREBASE_REGION = 'europe-west1';
const VERCEL_REGION = 'fra1';
const RUNTIME_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const GOOGLE_REGION_LITERAL = /['"]((?:africa|asia|australia|europe|me|northamerica|southamerica|us)-[a-z]+\d)['"]/g;
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function runtimeFiles(directory) {
  const absoluteDirectory = path.join(ROOT, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...runtimeFiles(relativePath));
      continue;
    }
    if (!RUNTIME_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (/\.(?:test|spec)\.[^.]+$/.test(entry.name)) continue;
    found.push(relativePath);
  }
  return found;
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function regionalTriggerImports(sourceFile) {
  const triggers = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
        || !ts.isStringLiteral(statement.moduleSpecifier)
        || !statement.moduleSpecifier.text.startsWith('firebase-functions/v2/')
        || statement.moduleSpecifier.text === 'firebase-functions/v2/core') {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text || element.name.text;
      if (/^on[A-Z]/.test(importedName)) triggers.add(element.name.text);
    }
  }
  return triggers;
}

function inspectRegionalFunctionDeclarations(relativePath, content) {
  if (!relativePath.startsWith('functions/src/')) return;
  const sourceFile = ts.createSourceFile(
    relativePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const triggerNames = regionalTriggerImports(sourceFile);

  function visit(node) {
    if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && triggerNames.has(node.expression.text)) {
      const options = node.arguments[0];
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (!options || !ts.isObjectLiteralExpression(options)) {
        failures.push(`${relativePath}:${line} ${node.expression.text} must declare an inline region option`);
      } else {
        const regionProperty = options.properties.find((property) =>
          (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
          && ((ts.isIdentifier(property.name) && property.name.text === 'region')
            || (ts.isStringLiteral(property.name) && property.name.text === 'region'))
        );
        if (!regionProperty) {
          failures.push(`${relativePath}:${line} ${node.expression.text} is missing an explicit region`);
        } else {
          const expression = ts.isShorthandPropertyAssignment(regionProperty)
            ? regionProperty.name.text
            : regionProperty.initializer.getText(sourceFile);
          const allowedFactoryParameter = relativePath === 'functions/src/auth-email.ts'
            && expression === 'region';
          if (!allowedFactoryParameter && expression !== 'FUNCTION_REGION') {
            failures.push(`${relativePath}:${line} ${node.expression.text} uses an unverified region expression: ${expression}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const appRegionConfig = read('src/lib/deployment-config.ts');
if (!appRegionConfig.includes(`FIREBASE_FUNCTIONS_REGION = '${FIREBASE_REGION}'`)) {
  failures.push(`src/lib/deployment-config.ts must export ${FIREBASE_REGION} as FIREBASE_FUNCTIONS_REGION`);
}

const functionsIndex = read('functions/src/index.ts');
if (!functionsIndex.includes(`const FUNCTION_REGION = '${FIREBASE_REGION}'`)) {
  failures.push(`functions/src/index.ts must declare ${FIREBASE_REGION} as FUNCTION_REGION`);
}
if (!/createThreadmapAuthEmailFunction\(\s*auth,\s*db,\s*FUNCTION_REGION,?\s*\)/m.test(functionsIndex)) {
  failures.push('functions/src/index.ts must pass FUNCTION_REGION into the auth-email function factory');
}

const runtimePaths = [
  ...runtimeFiles('src'),
  ...runtimeFiles('functions/src'),
  'next.config.ts',
];

for (const relativePath of runtimePaths) {
  const content = read(relativePath);
  inspectRegionalFunctionDeclarations(relativePath, content);
  for (const match of content.matchAll(/\bus-central1\b/g)) {
    failures.push(`${relativePath}:${lineNumber(content, match.index)} references the disallowed US Firebase region`);
  }

  for (const match of content.matchAll(/https:\/\/([a-z0-9-]+)-[^\s`'"/]+\.cloudfunctions\.net/g)) {
    if (match[1] !== FIREBASE_REGION && match[1] !== '${FIREBASE_FUNCTIONS_REGION}') {
      failures.push(`${relativePath}:${lineNumber(content, match.index)} hard-codes Cloud Functions region ${match[1]}`);
    } else if (relativePath.startsWith('src/') || relativePath === 'next.config.ts') {
      failures.push(`${relativePath}:${lineNumber(content, match.index)} hard-codes the Firebase Functions origin; use the shared region helper`);
    }
  }

  if (relativePath.startsWith('src/') && relativePath !== 'src/lib/deployment-config.ts') {
    for (const match of content.matchAll(GOOGLE_REGION_LITERAL)) {
      failures.push(`${relativePath}:${lineNumber(content, match.index)} embeds Google region ${match[1]}; import FIREBASE_FUNCTIONS_REGION`);
    }
  }

  if (relativePath.startsWith('functions/src/')) {
    for (const match of content.matchAll(GOOGLE_REGION_LITERAL)) {
      if (match[1] !== FIREBASE_REGION) {
        failures.push(`${relativePath}:${lineNumber(content, match.index)} embeds unsupported Firebase region ${match[1]}`);
      }
    }
  }
}

const nextConfig = read('next.config.ts');
for (const required of [
  'FIREBASE_FUNCTIONS_REGION',
  'orbit-9e0b6',
  'threadmap-staging-9e0b6',
  'vercelEnvironment === "production"',
  'vercelEnvironment === "preview"',
  'resolveDeploymentFirebaseProject',
]) {
  if (!nextConfig.includes(required)) failures.push(`next.config.ts is missing ${required}`);
}

let vercelConfig = {};
try {
  vercelConfig = JSON.parse(read('vercel.json') || '{}');
} catch (error) {
  failures.push(`vercel.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}
if ('rewrites' in vercelConfig) {
  failures.push('vercel.json must not contain environment-blind MCP rewrites');
}
if (JSON.stringify(vercelConfig.regions) !== JSON.stringify([VERCEL_REGION])) {
  failures.push(`vercel.json must configure Vercel Functions independently in ${VERCEL_REGION}`);
}

if (failures.length) {
  console.error('Deployment region policy failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`Deployment region policy passed: Firebase Functions use ${FIREBASE_REGION}.`);
console.log(`Vercel Functions are independently configured for ${VERCEL_REGION}; verify the deployed region with release:verify.`);
