import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/privacy', '/terms', '/security', '/.well-known/security.txt'],
      disallow: [
        '/api/',
        '/archive',
        '/areas/',
        '/briefing',
        '/calendar',
        '/files',
        '/goals',
        '/habits',
        '/integrations/',
        '/notes',
        '/projects',
        '/settings',
        '/tasks',
        '/tools/',
      ],
    },
    host: 'https://threadmap.app',
  };
}
