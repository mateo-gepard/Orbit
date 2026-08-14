import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
  'SCRAPE_RATE_LIMIT_SHARED_SECRET',
  'LEGAL_ENTITY_NAME',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_POSTAL_ADDRESS',
  'SECURITY_CONTACT_EMAIL',
];

const missing = required.filter((name) => !process.env[name]?.trim());
const placeholder = required.filter((name) => /example|changeme|placeholder/i.test(process.env[name] || ''));
const invalidEmails = ['LEGAL_CONTACT_EMAIL', 'SECURITY_CONTACT_EMAIL']
  .filter((name) => process.env[name] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env[name]));

if (missing.length || placeholder.length || invalidEmails.length) {
  console.error('Threadmap production preflight failed.');
  if (missing.length) console.error(`Missing: ${missing.join(', ')}`);
  if (placeholder.length) console.error(`Placeholder values: ${placeholder.join(', ')}`);
  if (invalidEmails.length) console.error(`Invalid email values: ${invalidEmails.join(', ')}`);
  console.error('See PRODUCTION_READINESS.md for console-only launch controls.');
  process.exitCode = 1;
} else {
  console.log('Threadmap production environment preflight passed.');
  console.log('Complete the console-only controls in PRODUCTION_READINESS.md before release.');
}
