import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The MCP OAuth metadata advertises these paths on the app's own origin, so
 * they are a published contract with every connected client. If the rewrites
 * that proxy them to the Cloud Function gateway go missing, each path falls
 * through to the Next.js 404 page and returns HTML where clients expect JSON —
 * which breaks the connect flow at registration with no build or type error to
 * warn anyone. That regression shipped once; this test is why it cannot again.
 */
const ADVERTISED_PATHS = [
  '/mcp',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/authorize',
  '/register',
  '/token',
  '/revoke',
];

const ORIGINAL_ENV = { ...process.env };

async function loadRewrites() {
  vi.resetModules();
  const { default: config } = await import('../../next.config');
  const rewrites = await config.rewrites?.();
  return Array.isArray(rewrites) ? rewrites : [];
}

beforeEach(() => {
  delete process.env.MCP_GATEWAY_ORIGIN;
  delete process.env.NEXT_PUBLIC_MCP_GATEWAY_ORIGIN;
  delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('MCP gateway rewrites', () => {
  it('routes every advertised OAuth path to the gateway', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-project';
    const rewrites = await loadRewrites();

    expect(rewrites.map((rule) => rule.source).sort()).toEqual([...ADVERTISED_PATHS].sort());
    for (const rule of rewrites) {
      expect(rule.destination).toBe(
        `https://us-central1-demo-project.cloudfunctions.net/threadmapMcpGateway${rule.source}`
      );
    }
  });

  it('prefers an explicit gateway origin over the project-id default', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-project';
    process.env.MCP_GATEWAY_ORIGIN = 'https://gateway.example';
    const rewrites = await loadRewrites();

    const register = rewrites.find((rule) => rule.source === '/register');
    expect(register?.destination).toBe('https://gateway.example/register');
  });

  it('routes nothing when no gateway is configured', async () => {
    // A local or self-hosted run without Firebase. Proxying to an empty origin
    // would be worse than serving the app's own 404.
    await expect(loadRewrites()).resolves.toEqual([]);
  });
});
