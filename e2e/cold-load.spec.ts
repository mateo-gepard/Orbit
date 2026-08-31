import { expect, test } from '@playwright/test';
import axe from 'axe-core';

interface AxeViolationSummary {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    target: string[];
    failureSummary: string | null;
    html: string;
  }>;
}

async function materialWcagViolations(page: import('@playwright/test').Page) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async (): Promise<AxeViolationSummary[]> => {
    const axeApi = (window as unknown as {
      axe: {
        run: (context: Document, options: { resultTypes: string[] }) => Promise<{
          violations: AxeViolationSummary[];
        }>;
      };
    }).axe;
    const results = await axeApi.run(document, { resultTypes: ['violations'] });
    return results.violations.filter((violation) =>
      (violation.impact === 'moderate'
        || violation.impact === 'serious'
        || violation.impact === 'critical')
      && violation.tags.some((tag) => tag.startsWith('wcag'))
    );
  });
}

function formatViolations(violations: AxeViolationSummary[]): string {
  if (!violations.length) return 'No moderate, serious, or critical WCAG violations.';
  return violations.map((violation) => [
    `${violation.id} [${violation.impact}] ${violation.help} (${violation.helpUrl})`,
    ...violation.nodes.map((node) =>
      `  ${node.target.join(' > ')}\n    ${node.failureSummary || 'No failure summary'}\n    ${node.html}`
    ),
  ].join('\n')).join('\n\n');
}

const routes = [
  '/',
  '/areas/work',
  '/today',
  '/tasks',
  '/projects',
  '/habits',
  '/goals',
  '/notes',
  '/calendar',
  '/files',
  '/archive',
  '/briefing',
  '/settings',
  '/toolbox',
  '/tools/wishlist',
  '/tools/abitur',
  '/tools/briefing',
  '/tools/dispatch',
  '/tools/flight',
  '/about',
  '/privacy',
  '/security',
  '/terms',
  '/integrations/authorize',
  '/integrations/google-workspace',
  '/definitely-not-a-threadmap-route',
];

const NOT_FOUND_ROUTE = '/definitely-not-a-threadmap-route';
const PRIVATE_ROUTE_PREFIXES = new Set([
  'archive',
  'areas',
  'briefing',
  'calendar',
  'files',
  'goals',
  'habits',
  'integrations',
  'notes',
  'projects',
  'settings',
  'tasks',
  'today',
  'toolbox',
  'tools',
]);

function isPrivateRoute(path: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.has(path.split('/')[1]);
}

function isExpectedBrowserDiagnostic(
  message: import('@playwright/test').ConsoleMessage,
  path: string,
  browserName: string,
): boolean {
  const text = message.text();
  if (browserName === 'webkit'
      && text.includes('Viewport argument key "interactive-widget" not recognized and ignored')) {
    // WebKit ignores this Chromium-supported viewport extension. The default
    // Safari viewport behavior remains active, so this is not a runtime fault.
    return true;
  }
  if (path !== NOT_FOUND_ROUTE
      || !/^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(text)) {
    return false;
  }
  const location = message.location().url;
  if (!location) return false;
  try {
    return new URL(location).pathname === NOT_FOUND_ROUTE;
  } catch {
    return false;
  }
}

test.beforeEach(async ({ baseURL, context }) => {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!bypassSecret || !baseURL) return;

  const target = new URL(baseURL);
  if (target.protocol !== 'https:') {
    throw new Error('Vercel protection bypass may only be used with an HTTPS test target.');
  }
  const response = await context.request.get(target.origin, {
    headers: {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    },
    maxRedirects: 0,
  });
  expect(response.status(), 'Vercel protection bypass bootstrap failed').toBeLessThan(400);
});

for (const path of routes) {
  test(`cold-loads ${path} in local mode without runtime errors`, async ({
    browserName,
    context,
    page,
  }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('orbitLocalMode', '1');
    });
    const runtimeErrors: string[] = [];
    const consentRequests: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error'
          && !isExpectedBrowserDiagnostic(message, path, browserName)) {
        runtimeErrors.push(message.text());
      }
    });
    page.on('request', (request) => {
      if (request.url().includes('/api/mcp/oauth/consent')) consentRequests.push(request.url());
    });

    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    if (path === NOT_FOUND_ROUTE) {
      expect(response?.status(), `${path} must exercise the real not-found response`).toBe(404);
    } else {
      expect(response?.ok(), `${path} did not return a successful document`).toBe(true);
    }
    const contentSecurityPolicy = response?.headers()['content-security-policy'] || '';
    expect(contentSecurityPolicy, `${path} must send a Content-Security-Policy header`).toContain(
      "default-src 'self'",
    );
    const target = new URL(response?.url() || page.url());
    if (target.hostname === 'localhost' || target.hostname === '127.0.0.1') {
      expect(
        contentSecurityPolicy,
        `${path} loopback CSP must not upgrade the HTTP test origin to unavailable TLS`,
      ).not.toContain('upgrade-insecure-requests');
    } else {
      expect(
        contentSecurityPolicy,
        `${path} deployed CSP must retain HTTPS upgrade enforcement`,
      ).toContain('upgrade-insecure-requests');
    }
    if (isPrivateRoute(path)) {
      expect(response?.headers()['x-robots-tag'], `${path} must not be indexed`)
        .toBe('noindex, nofollow, noarchive');
    } else if (path !== NOT_FOUND_ROUTE) {
      expect(response?.headers()['x-robots-tag'] || '', `${path} must remain publicly indexable`)
        .not.toContain('noindex');
    }
    if (path === '/integrations/authorize') {
      expect(response?.headers()['cache-control']).toContain('no-store');
      expect(response?.headers()['x-robots-tag']).toContain('noindex');
      await expect(page.getByText(
        /does not contain an authorization request|enthält keine autorisierungsanfrage/i,
      )).toBeVisible();
      expect(consentRequests, 'invalid consent state must not call the consent API').toEqual([]);
    }
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1').first()).toBeAttached();
    await expect(page.getByText(/something went wrong|etwas ist schiefgelaufen/i)).toHaveCount(0);
    // Do not sample axe while the account-scoped loading dialog is fading in
    // or out. Its inert underlying tree can otherwise be treated as a second
    // translucent background by WebKit, producing a timing-only contrast
    // result even though neither state is interactable. The same semantic
    // readiness signal is used by the keyboard smoke below.
    await expect(page.locator('div[aria-busy="false"]:has(main)')).toHaveCount(1);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    const violations = await materialWcagViolations(page);
    expect(violations, `${path} accessibility violations:\n${formatViolations(violations)}`).toEqual([]);

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth, `${path} overflows horizontally`).toBeLessThanOrEqual(
      geometry.clientWidth + 1,
    );
    expect(runtimeErrors, `${path} emitted browser errors`).toEqual([]);
  });
}

test('keyboard reaches primary content and opens the command surface', async ({
  browserName,
  context,
  page,
}) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('orbitLocalMode', '1');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toBeVisible();

  const skipLink = page.getByRole('link', { name: /skip to main content|zum hauptinhalt springen/i });
  await expect(skipLink).toBeVisible();
  // The signed-out wrapper is briefly ready before local-mode auth resolves,
  // and the loading dialog starts transparent. The account-scoped wrapper is
  // the stable semantic signal: it becomes non-busy only when the focus trap is
  // closed and the real workspace can receive input.
  await expect(page.locator('[aria-busy="false"]:has(#main-content)')).toHaveCount(1);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  if (browserName === 'webkit') {
    // Playwright's touch-enabled iPhone WebKit context does not advance DOM
    // focus for a synthetic hardware Tab. Prove that the link is focusable and
    // then exercise activation through the keyboard; Chromium retains the true
    // sequential-focus assertion below.
    await skipLink.focus();
  } else {
    await page.keyboard.press('Tab');
  }
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.keyboard.press(browserName === 'webkit' ? 'Meta+k' : 'Control+k');
  const commandInput = page.getByRole('combobox', { name: /search or create|suchen oder erstellen/i });
  await expect(commandInput).toBeVisible();
  await expect(commandInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(commandInput).toBeHidden();
});

for (const path of [
  '/',
  '/about',
  '/privacy',
  '/terms',
  '/security',
  '/integrations/authorize',
  '/integrations/google-workspace',
]) {
  test(`keeps the bottom of ${path} reachable in a short viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response?.ok(), `${path} did not return a successful document`).toBe(true);
    const main = page.locator('main');
    await expect(main).toBeVisible();
    // WebKit can expose the SSR node for one frame before the hydrated scroll
    // utility has a computed value. Wait for the actual scroll owner instead
    // of sampling that transient state; reachability is still asserted below.
    await expect(main).toHaveCSS('overflow-y', /^(auto|scroll)$/);

    const result = await main.evaluate(async (element) => {
      const target = element as HTMLElement;
      const bottom = target.lastElementChild as HTMLElement | null;
      const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
      target.scrollTop = target.scrollHeight;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const targetRect = target.getBoundingClientRect();
      const bottomRect = bottom?.getBoundingClientRect();
      return {
        maxScrollTop,
        scrollTop: target.scrollTop,
        overflowY: getComputedStyle(target).overflowY,
        bottomReachable: !bottomRect || (
          bottomRect.bottom <= targetRect.bottom + 1
          && bottomRect.bottom >= targetRect.top - 1
        ),
      };
    });

    if (result.maxScrollTop > 1) {
      expect(['auto', 'scroll'], `${path} main must own vertical scrolling`)
        .toContain(result.overflowY);
      expect(result.scrollTop, `${path} main did not scroll to its end`)
        .toBeGreaterThanOrEqual(result.maxScrollTop - 1);
    }
    expect(result.bottomReachable, `${path} bottom content/action is unreachable`).toBe(true);
  });
}

test('health endpoint is uncached and identifies the release', async ({ context }) => {
  const response = await context.request.get('/api/health');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
  const payload = await response.json();
  expect(payload).toMatchObject({
    status: 'ok',
    service: 'threadmap',
    release: {
      version: '0.1.0',
    },
    dependencies: {
      firebaseFunctions: {
        region: 'europe-west1',
      },
    },
  });
  expect(payload.release.sha).toBeTruthy();
  expect(response.headers()['x-threadmap-release']).toBe(payload.release.shortSha);
});
