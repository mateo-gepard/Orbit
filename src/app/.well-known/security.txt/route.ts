import { legalConfig } from '@/lib/legal-config';

export const dynamic = 'force-static';

export function GET() {
  const body = [
    `Contact: mailto:${legalConfig.securityEmail}`,
    'Expires: 2027-08-12T23:59:59.000Z',
    'Preferred-Languages: en, de',
    `Canonical: ${legalConfig.serviceUrl}/.well-known/security.txt`,
    `Policy: ${legalConfig.serviceUrl}/security`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
