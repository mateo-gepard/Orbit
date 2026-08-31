import 'server-only';

function configured(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const deploymentMode = process.env.THREADMAP_DEPLOYMENT_MODE === 'private'
  ? 'private'
  : 'public';

export const legalConfig = {
  deploymentMode,
  privateDeployment: deploymentMode === 'private',
  operatorName: configured('LEGAL_ENTITY_NAME', 'Threadmap'),
  contactEmail: configured('LEGAL_CONTACT_EMAIL', 'privacy@threadmap.app'),
  postalAddress: process.env.LEGAL_POSTAL_ADDRESS?.trim() || null,
  securityEmail: configured('SECURITY_CONTACT_EMAIL', 'security@threadmap.app'),
  serviceUrl: 'https://threadmap.app',
} as const;
