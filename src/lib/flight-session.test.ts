import { describe, expect, it } from 'vitest';
import {
  FLIGHT_SESSION_MAX_RAW_LENGTH,
  FLIGHT_SESSION_VERSION,
  beginFlightReconciliation,
  buildFlightSessionQuarantine,
  finishFlightTaskReconciliation,
  parseFlightSession,
  type FlightSession,
} from './flight-session';

const NOW = 1_800_000_000_000;

function validSession(overrides: Partial<FlightSession> = {}): FlightSession {
  return {
    version: FLIGHT_SESSION_VERSION,
    status: 'inflight',
    startTimestamp: NOW - 60_000,
    resumeTimestamp: NOW - 30_000,
    accumulatedBeforePause: 30,
    duration: 50,
    route: {
      from: { code: 'MAD', name: 'Barajas', city: 'Madrid', region: 'europe' },
      to: { code: 'LHR', name: 'Heathrow', city: 'London', region: 'europe' },
      distanceKm: 1_200,
      realFlightMin: 50,
    },
    flightNumber: 'OF-123',
    flightClass: 'commercial',
    tasks: [{ id: 'task-1', title: 'Prepare report', type: 'primary', completed: true }],
    turbulence: [{ timestamp: NOW - 10_000, type: 'phone' }],
    gateNumber: 12,
    seatRow: 4,
    seatLetter: 'A',
    ...overrides,
  };
}

describe('parseFlightSession', () => {
  it('accepts a current session without changing it', () => {
    const source = validSession();
    const result = parseFlightSession(JSON.stringify(source), NOW);

    expect(result).toEqual({
      ok: true,
      session: source,
      migrated: false,
      sanitized: false,
    });
  });

  it('migrates a legacy unversioned session before it is restored', () => {
    const legacy: Record<string, unknown> = { ...validSession() };
    delete legacy.version;
    const result = parseFlightSession(JSON.stringify(legacy), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.sanitized).toBe(true);
    expect(result.session.version).toBe(FLIGHT_SESSION_VERSION);
  });

  it('rejects malformed nested route data before any consumer dereferences it', () => {
    const source = validSession({ route: null as unknown as FlightSession['route'] });

    expect(parseFlightSession(JSON.stringify(source), NOW)).toEqual({
      ok: false,
      reason: 'invalid-route',
    });
  });

  it('rejects unsupported future versions', () => {
    const source = { ...validSession(), version: 99 };

    expect(parseFlightSession(JSON.stringify(source), NOW)).toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
  });

  it('sanitizes bounded collections, duplicate tasks, and invalid turbulence', () => {
    const source = validSession({
      tasks: [
        { id: 'task-1', title: 'Prepare report', type: 'primary', completed: true },
        { id: 'task-1', title: 'Duplicate', type: 'carry-on', completed: false },
        null as unknown as FlightSession['tasks'][number],
      ],
      turbulence: [
        { timestamp: NOW - 10_000, type: 'phone' },
        { timestamp: NOW + 600_000, type: 'other' },
      ],
    });
    const result = parseFlightSession(JSON.stringify(source), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sanitized).toBe(true);
    expect(result.session.tasks).toHaveLength(1);
    expect(result.session.turbulence).toEqual([{ timestamp: NOW - 10_000, type: 'phone' }]);
  });

  it('normalizes pending reconciliation to completed tasks that still exist', () => {
    const source = validSession({
      status: 'debrief',
      pendingReconciliation: {
        stage: 'log',
        endedAt: NOW,
        remainingTaskIds: ['task-1', 'missing-task'],
        failures: [
          { taskId: 'task-1', title: 'Untrusted title' },
          { taskId: 'missing-task', title: 'Missing' },
        ],
        attemptCount: 1,
        lastAttemptAt: NOW,
      },
    });
    const result = parseFlightSession(JSON.stringify(source), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sanitized).toBe(true);
    expect(result.session.pendingReconciliation).toEqual({
      stage: 'tasks',
      endedAt: NOW,
      remainingTaskIds: ['task-1'],
      failures: [{ taskId: 'task-1', title: 'Prepare report' }],
      attemptCount: 1,
      lastAttemptAt: NOW,
    });
  });

  it('rejects oversized payloads without parsing them', () => {
    const raw = 'x'.repeat(FLIGHT_SESSION_MAX_RAW_LENGTH + 1);
    expect(parseFlightSession(raw, NOW)).toEqual({ ok: false, reason: 'too-large' });
  });
});

describe('buildFlightSessionQuarantine', () => {
  it('records the reason and safely bounds retained corrupt data', () => {
    const quarantine = JSON.parse(buildFlightSessionQuarantine(
      'x'.repeat(40_000),
      'invalid-json',
      NOW,
    ));

    expect(quarantine).toMatchObject({
      version: 1,
      capturedAt: NOW,
      reason: 'invalid-json',
      truncated: true,
    });
    expect(quarantine.payload).toHaveLength(32_000);
  });
});

describe('flight task reconciliation', () => {
  it('keeps failed task completions retryable and does not advance to the log', () => {
    const tasks = [
      { id: 'task-1', title: 'First task', type: 'primary' as const, completed: true },
      { id: 'task-2', title: 'Second task', type: 'primary' as const, completed: true },
    ];
    const attempt = beginFlightReconciliation(tasks, null, NOW);
    const result = finishFlightTaskReconciliation(attempt, tasks, ['task-2']);

    expect(attempt).toMatchObject({
      stage: 'tasks',
      endedAt: NOW,
      remainingTaskIds: ['task-1', 'task-2'],
      attemptCount: 1,
    });
    expect(result).toMatchObject({
      stage: 'tasks',
      remainingTaskIds: ['task-2'],
      failures: [{ taskId: 'task-2', title: 'Second task' }],
    });
  });

  it('advances to log persistence only after every selected task succeeds', () => {
    const tasks = [
      { id: 'task-1', title: 'First task', type: 'primary' as const, completed: true },
    ];
    const attempt = beginFlightReconciliation(tasks, null, NOW);
    const result = finishFlightTaskReconciliation(attempt, tasks, []);

    expect(result).toMatchObject({
      stage: 'log',
      remainingTaskIds: [],
      failures: [],
    });
  });

  it('retries only tasks that were still pending from a previous attempt', () => {
    const tasks = [
      { id: 'task-1', title: 'First task', type: 'primary' as const, completed: true },
      { id: 'task-2', title: 'Second task', type: 'primary' as const, completed: true },
    ];
    const first = beginFlightReconciliation(tasks, null, NOW);
    const failed = finishFlightTaskReconciliation(first, tasks, ['task-2']);
    const retry = beginFlightReconciliation(tasks, failed, NOW + 1_000);

    expect(retry.remainingTaskIds).toEqual(['task-2']);
    expect(retry.attemptCount).toBe(2);
    expect(retry.endedAt).toBe(NOW);
  });
});
