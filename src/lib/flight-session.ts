import type {
  Airport,
  FlightClass,
  FlightDuration,
  FlightRoute,
  FlightTask,
  TurbulenceLog,
} from './flight';

export const FLIGHT_SESSION_VERSION = 2 as const;
export const FLIGHT_SESSION_MAX_RAW_LENGTH = 256_000;
const MAX_QUARANTINE_PAYLOAD_LENGTH = 32_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const VALID_DURATIONS = new Set<number>([
  20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100, 105, 120, 125, 130, 135, 140, 145, 150, 170, 180, 185, 190, 200,
  210, 225, 230, 240, 260, 270, 280, 290, 300, 310, 330, 335, 340, 350,
  360, 365, 375, 380, 390, 400, 405, 410, 420, 425, 430, 435, 440, 445,
  450, 460,
]);
const VALID_REGIONS = new Set<Airport['region']>([
  'europe', 'americas', 'asia', 'middle-east', 'africa', 'oceania',
]);
const VALID_TURBULENCE_TYPES = new Set<TurbulenceLog['type']>([
  'phone', 'thought', 'notification', 'person', 'other',
]);
const VALID_SESSION_STATUSES = new Set<FlightSession['status']>([
  'inflight', 'paused', 'debrief',
]);

export type FlightSessionParseFailure =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-shape'
  | 'unsupported-version'
  | 'invalid-timing'
  | 'invalid-duration'
  | 'invalid-route'
  | 'invalid-flight-details'
  | 'invalid-tasks'
  | 'invalid-turbulence'
  | 'invalid-reconciliation';

export interface FlightTaskReconciliationFailure {
  taskId: string;
  title: string;
}

export interface FlightPendingReconciliation {
  stage: 'tasks' | 'log';
  endedAt: number;
  remainingTaskIds: string[];
  failures: FlightTaskReconciliationFailure[];
  attemptCount: number;
  lastAttemptAt: number;
}

export interface FlightSession {
  version: typeof FLIGHT_SESSION_VERSION;
  status: 'inflight' | 'paused' | 'debrief';
  startTimestamp: number;
  resumeTimestamp: number;
  accumulatedBeforePause: number;
  duration: FlightDuration;
  route: FlightRoute;
  flightNumber: string;
  flightClass: FlightClass;
  tasks: FlightTask[];
  turbulence: TurbulenceLog[];
  gateNumber: number;
  seatRow: number;
  seatLetter: string;
  completedNormally?: boolean;
  debriefSummary?: string;
  debriefNextAction?: string;
  pendingReconciliation?: FlightPendingReconciliation;
}

export type FlightSessionParseResult =
  | { ok: true; session: FlightSession; migrated: boolean; sanitized: boolean }
  | { ok: false; reason: FlightSessionParseFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
    ? value
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim().slice(0, maxLength);
  return result || null;
}

function sanitizeAirport(value: unknown): Airport | null {
  if (!isRecord(value)) return null;
  const code = boundedString(value.code, 4)?.toUpperCase();
  const name = boundedString(value.name, 120);
  const city = boundedString(value.city, 120);
  const region = value.region;
  if (!code || !/^[A-Z0-9]{3,4}$/.test(code) || !name || !city) return null;
  if (typeof region !== 'string' || !VALID_REGIONS.has(region as Airport['region'])) return null;
  return { code, name, city, region: region as Airport['region'] };
}

function sanitizeRoute(value: unknown): FlightRoute | null {
  if (!isRecord(value)) return null;
  const from = sanitizeAirport(value.from);
  const to = sanitizeAirport(value.to);
  const distanceKm = finiteInteger(value.distanceKm);
  const realFlightMin = finiteInteger(value.realFlightMin);
  if (!from || !to || from.code === to.code) return null;
  if (distanceKm === null || distanceKm < 1 || distanceKm > 25_000) return null;
  if (realFlightMin === null || !VALID_DURATIONS.has(realFlightMin)) return null;
  return { from, to, distanceKm, realFlightMin };
}

function sanitizeTasks(
  value: unknown,
  flightClass: FlightClass,
  markSanitized: () => void,
): FlightTask[] | null {
  if (!Array.isArray(value)) return null;
  const result: FlightTask[] = [];
  const ids = new Set<string>();
  for (const [index, rawTask] of value.slice(0, 100).entries()) {
    if (!isRecord(rawTask)) {
      markSanitized();
      continue;
    }
    const id = boundedString(rawTask.id, 256);
    const title = boundedString(rawTask.title, 500);
    if (!id || !title || ids.has(id)) {
      markSanitized();
      continue;
    }
    const expectedType = index < 3 ? 'primary' : 'carry-on';
    const type = rawTask.type === 'primary' || rawTask.type === 'carry-on'
      ? rawTask.type
      : expectedType;
    const completed = typeof rawTask.completed === 'boolean' ? rawTask.completed : false;
    if (type !== rawTask.type || completed !== rawTask.completed) markSanitized();
    ids.add(id);
    result.push({ id, title, type, completed });
  }
  if (value.length > 100) markSanitized();
  if (flightClass === 'private' && result.length > 1) {
    markSanitized();
    return [{ ...result[0], type: 'primary' }];
  }
  return result;
}

function sanitizeTurbulence(
  value: unknown,
  startTimestamp: number,
  now: number,
  markSanitized: () => void,
): TurbulenceLog[] | null {
  if (!Array.isArray(value)) return null;
  const result: TurbulenceLog[] = [];
  for (const rawEntry of value.slice(0, 1_000)) {
    if (!isRecord(rawEntry)) {
      markSanitized();
      continue;
    }
    const timestamp = finiteInteger(rawEntry.timestamp);
    const type = rawEntry.type;
    if (
      timestamp === null || timestamp < startTimestamp || timestamp > now + MAX_CLOCK_SKEW_MS ||
      typeof type !== 'string' || !VALID_TURBULENCE_TYPES.has(type as TurbulenceLog['type'])
    ) {
      markSanitized();
      continue;
    }
    result.push({ timestamp, type: type as TurbulenceLog['type'] });
  }
  if (value.length > 1_000) markSanitized();
  return result;
}

function sanitizePendingReconciliation(
  value: unknown,
  tasks: FlightTask[],
  startTimestamp: number,
  now: number,
  markSanitized: () => void,
): FlightPendingReconciliation | null {
  if (!isRecord(value)) return null;
  const endedAt = finiteInteger(value.endedAt);
  const lastAttemptAt = finiteInteger(value.lastAttemptAt);
  const attemptCount = finiteInteger(value.attemptCount);
  if (
    endedAt === null || endedAt < startTimestamp || endedAt > now + MAX_CLOCK_SKEW_MS ||
    lastAttemptAt === null || lastAttemptAt < startTimestamp || lastAttemptAt > now + MAX_CLOCK_SKEW_MS ||
    attemptCount === null || attemptCount < 0 || attemptCount > 10_000 ||
    !Array.isArray(value.remainingTaskIds) || !Array.isArray(value.failures)
  ) return null;

  const completedTasks = new Map(tasks.filter((task) => task.completed).map((task) => [task.id, task]));
  const remainingTaskIds = [...new Set(value.remainingTaskIds
    .filter((taskId): taskId is string => typeof taskId === 'string')
    .map((taskId) => taskId.trim())
    .filter((taskId) => completedTasks.has(taskId)))];
  if (remainingTaskIds.length !== value.remainingTaskIds.length) markSanitized();

  const remaining = new Set(remainingTaskIds);
  const failures: FlightTaskReconciliationFailure[] = [];
  const failedIds = new Set<string>();
  for (const rawFailure of value.failures.slice(0, 100)) {
    if (!isRecord(rawFailure) || typeof rawFailure.taskId !== 'string') {
      markSanitized();
      continue;
    }
    const taskId = rawFailure.taskId.trim();
    const task = completedTasks.get(taskId);
    if (!task || !remaining.has(taskId) || failedIds.has(taskId)) {
      markSanitized();
      continue;
    }
    failedIds.add(taskId);
    failures.push({ taskId, title: task.title });
  }
  if (value.failures.length > 100) markSanitized();

  const expectedStage = remainingTaskIds.length > 0 ? 'tasks' : 'log';
  if (value.stage !== expectedStage) markSanitized();
  return {
    stage: expectedStage,
    endedAt,
    remainingTaskIds,
    failures,
    attemptCount,
    lastAttemptAt,
  };
}

export function parseFlightSession(raw: string, now = Date.now()): FlightSessionParseResult {
  if (raw.length > FLIGHT_SESSION_MAX_RAW_LENGTH) return { ok: false, reason: 'too-large' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!isRecord(value)) return { ok: false, reason: 'invalid-shape' };

  const storedVersion = value.version;
  const migrated = storedVersion === undefined || storedVersion === 1;
  if (!migrated && storedVersion !== FLIGHT_SESSION_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }

  let sanitized = migrated;
  const markSanitized = () => { sanitized = true; };
  const status = value.status;
  if (typeof status !== 'string' || !VALID_SESSION_STATUSES.has(status as FlightSession['status'])) {
    return { ok: false, reason: 'invalid-shape' };
  }

  const startTimestamp = finiteInteger(value.startTimestamp);
  const resumeTimestamp = finiteInteger(value.resumeTimestamp);
  const accumulatedRaw = finiteInteger(value.accumulatedBeforePause);
  if (
    startTimestamp === null || startTimestamp <= 0 || startTimestamp > now + MAX_CLOCK_SKEW_MS ||
    resumeTimestamp === null || resumeTimestamp < startTimestamp || resumeTimestamp > now + MAX_CLOCK_SKEW_MS ||
    accumulatedRaw === null
  ) return { ok: false, reason: 'invalid-timing' };

  const duration = finiteInteger(value.duration);
  if (duration === null || !VALID_DURATIONS.has(duration)) {
    return { ok: false, reason: 'invalid-duration' };
  }
  const accumulatedBeforePause = Math.min(Math.max(accumulatedRaw, 0), duration * 60);
  if (accumulatedBeforePause !== accumulatedRaw) markSanitized();

  const route = sanitizeRoute(value.route);
  if (!route) return { ok: false, reason: 'invalid-route' };

  const rawFlightNumber = boundedString(value.flightNumber, 64);
  const flightNumber = rawFlightNumber?.toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
  const flightClass: FlightClass = value.flightClass === 'private' ? 'private' : 'commercial';
  const gateNumber = finiteInteger(value.gateNumber);
  const seatRow = finiteInteger(value.seatRow);
  const seatLetter = typeof value.seatLetter === 'string' ? value.seatLetter.trim().toUpperCase() : '';
  if (
    !flightNumber || gateNumber === null || gateNumber < 1 || gateNumber > 999 ||
    seatRow === null || seatRow < 1 || seatRow > 999 || !/^[A-F]$/.test(seatLetter)
  ) return { ok: false, reason: 'invalid-flight-details' };
  if (flightNumber !== rawFlightNumber || value.flightClass !== flightClass || seatLetter !== value.seatLetter) {
    markSanitized();
  }

  const tasks = sanitizeTasks(value.tasks, flightClass, markSanitized);
  if (!tasks) return { ok: false, reason: 'invalid-tasks' };
  const turbulence = sanitizeTurbulence(value.turbulence, startTimestamp, now, markSanitized);
  if (!turbulence) return { ok: false, reason: 'invalid-turbulence' };

  const completedNormally = typeof value.completedNormally === 'boolean'
    ? value.completedNormally
    : undefined;
  if (value.completedNormally !== undefined && completedNormally === undefined) markSanitized();
  const debriefSummary = typeof value.debriefSummary === 'string'
    ? value.debriefSummary.slice(0, 10_000)
    : undefined;
  const debriefNextAction = typeof value.debriefNextAction === 'string'
    ? value.debriefNextAction.slice(0, 2_000)
    : undefined;
  if (debriefSummary !== value.debriefSummary || debriefNextAction !== value.debriefNextAction) {
    markSanitized();
  }

  let pendingReconciliation: FlightPendingReconciliation | undefined;
  if (value.pendingReconciliation !== undefined) {
    if (status !== 'debrief') return { ok: false, reason: 'invalid-reconciliation' };
    pendingReconciliation = sanitizePendingReconciliation(
      value.pendingReconciliation,
      tasks,
      startTimestamp,
      now,
      markSanitized,
    ) ?? undefined;
    if (!pendingReconciliation) return { ok: false, reason: 'invalid-reconciliation' };
  }

  return {
    ok: true,
    migrated,
    sanitized,
    session: {
      version: FLIGHT_SESSION_VERSION,
      status: status as FlightSession['status'],
      startTimestamp,
      resumeTimestamp,
      accumulatedBeforePause,
      duration: duration as FlightDuration,
      route,
      flightNumber,
      flightClass,
      tasks,
      turbulence,
      gateNumber,
      seatRow,
      seatLetter,
      completedNormally,
      debriefSummary,
      debriefNextAction,
      pendingReconciliation,
    },
  };
}

export function serializeFlightSession(session: FlightSession): string {
  return JSON.stringify(session);
}

export function beginFlightReconciliation(
  tasks: FlightTask[],
  previous: FlightPendingReconciliation | null,
  now = Date.now(),
): FlightPendingReconciliation {
  const base = previous ?? {
    stage: tasks.some((task) => task.completed) ? 'tasks' as const : 'log' as const,
    endedAt: now,
    remainingTaskIds: tasks.filter((task) => task.completed).map((task) => task.id),
    failures: [],
    attemptCount: 0,
    lastAttemptAt: now,
  };
  return {
    ...base,
    failures: [],
    attemptCount: base.attemptCount + 1,
    lastAttemptAt: now,
  };
}

export function finishFlightTaskReconciliation(
  attempt: FlightPendingReconciliation,
  tasks: FlightTask[],
  failedTaskIds: Iterable<string>,
): FlightPendingReconciliation {
  const failed = new Set(failedTaskIds);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const failures = attempt.remainingTaskIds
    .filter((taskId) => failed.has(taskId))
    .map((taskId) => ({
      taskId,
      title: tasksById.get(taskId)?.title
        ?? attempt.failures.find((failure) => failure.taskId === taskId)?.title
        ?? taskId,
    }));
  return {
    ...attempt,
    stage: failures.length > 0 ? 'tasks' : 'log',
    remainingTaskIds: failures.map((failure) => failure.taskId),
    failures,
  };
}

export function buildFlightSessionQuarantine(
  raw: string,
  reason: FlightSessionParseFailure,
  capturedAt = Date.now(),
): string {
  return JSON.stringify({
    version: 1,
    capturedAt,
    reason,
    truncated: raw.length > MAX_QUARANTINE_PAYLOAD_LENGTH,
    payload: raw.slice(0, MAX_QUARANTINE_PAYLOAD_LENGTH),
  });
}
