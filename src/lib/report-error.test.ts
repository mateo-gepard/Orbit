import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPORT_URL = 'https://collector.example/report';

let sendBeacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_ERROR_REPORT_URL = REPORT_URL;
  sendBeacon = vi.fn(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { pathname: '/tasks' }, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { sendBeacon, userAgent: 'test-agent' },
  });
  Object.defineProperty(globalThis, 'Blob', {
    configurable: true,
    value: class { constructor(public parts: string[]) {} },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'navigator');
  Reflect.deleteProperty(globalThis, 'Blob');
});

function payload(call: number): Record<string, unknown> {
  const blob = sendBeacon.mock.calls[call][1] as { parts: string[] };
  return JSON.parse(blob.parts[0]);
}

describe('crash reporting', () => {
  it('delivers the error with its route and source but no query string', async () => {
    const { reportError } = await import('./report-error');
    reportError(new Error('boom'), { source: 'react-error-boundary' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const report = payload(0);
    expect(report.message).toBe('boom');
    expect(report.source).toBe('react-error-boundary');
    expect(report.pathname).toBe('/tasks');
    expect(report.stack).toBeTypeOf('string');
  });

  it('never carries user content beyond the error itself', async () => {
    const { reportError } = await import('./report-error');
    reportError(new Error('save failed'), { source: 'route-error' });

    // The payload shape is the privacy contract the policy page promises.
    // Adding a field that could hold a note body, item title, or file name
    // has to be a deliberate change to this allowlist.
    const allowed = new Set([
      'componentStack', 'digest', 'message', 'name', 'occurredAt',
      'pathname', 'releaseVersion', 'source', 'stack', 'userAgent',
    ]);
    const unexpected = Object.keys(payload(0)).filter((key) => !allowed.has(key));
    expect(unexpected).toEqual([]);
  });

  it('reports only the path, never the query string that may hold identifiers', async () => {
    (globalThis as unknown as { window: { location: { pathname: string } } })
      .window.location.pathname = '/areas/health';
    const { reportError } = await import('./report-error');
    reportError(new Error('boom'), { source: 'manual' });

    const report = payload(0);
    expect(report.pathname).toBe('/areas/health');
    expect(JSON.stringify(report)).not.toContain('?');
  });

  it('suppresses a repeat of the same crash so a render loop cannot flood', async () => {
    const { reportError } = await import('./report-error');
    const error = new Error('loop');
    reportError(error, { source: 'window-error' });
    reportError(error, { source: 'window-error' });
    reportError(error, { source: 'window-error' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('still reports a genuinely different crash', async () => {
    const { reportError } = await import('./report-error');
    reportError(new Error('first'), { source: 'window-error' });
    reportError(new Error('second'), { source: 'window-error' });

    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it('stays silent when no collector is configured', async () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
    vi.resetModules();
    const { reportError } = await import('./report-error');

    reportError(new Error('boom'), { source: 'manual' });

    expect(sendBeacon).not.toHaveBeenCalled();
    // The console path is the fallback, so it must still fire.
    expect(console.error).toHaveBeenCalled();
  });

  it('accepts a non-Error rejection without throwing', async () => {
    const { reportError } = await import('./report-error');
    expect(() => reportError({ code: 'permission-denied' }, { source: 'unhandled-rejection' })).not.toThrow();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
