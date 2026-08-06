import { DEMO_USER_ID, scopedStorageKey } from './account-storage';
import { db } from './firebase';
import { saveToolData, subscribeToToolData, ToolDataConflictError } from './firestore';
import { writeLocalStorageVerified } from './verified-storage';
import { reportSyncRecovered, reportSyncWarning as emitSyncWarning } from './sync-warning';

export interface DispatchBlockSnapshot {
  id: string;
  label: string;
  startHour: number;
  startMin: number;
  durationMin: number;
  taskIds: string[];
  colorIndex: number;
}

export interface DispatchPlan {
  version: 1;
  date: string;
  updatedAt: number;
  blocks: DispatchBlockSnapshot[];
}

export interface DispatchFlightHandoff {
  version: 1;
  createdAt: number;
  label: string;
  durationMin: number;
  taskIds: string[];
}

export interface DispatchPersistenceOutcome {
  localCommitted: boolean;
  cloudCommitted: boolean;
}

interface DispatchArchive {
  version: 2;
  plans: DispatchPlan[];
  updatedAt: number;
}

const PLAN_PREFIX = 'threadmap-dispatch-plan';
const HANDOFF_PREFIX = 'threadmap-dispatch-flight-handoff';
const TOOL_ID = 'dispatch-plans';
const MAX_PLANS = 31;
const MAX_BLOCKS = 12;
const MAX_TASKS_PER_BLOCK = 20;
const HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;
const WARNING_THROTTLE_MS = 30_000;
const warningTimes = new Map<string, number>();

function planKey(userId?: string | null): string {
  return scopedStorageKey(PLAN_PREFIX, userId || DEMO_USER_ID);
}

function handoffKey(userId?: string | null): string {
  return scopedStorageKey(HANDOFF_PREFIX, userId || DEMO_USER_ID);
}

function isFiniteInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function sanitizeBlock(value: unknown): DispatchBlockSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Partial<DispatchBlockSnapshot>;
  if (typeof block.id !== 'string' || !block.id || typeof block.label !== 'string') return null;
  if (!isFiniteInteger(block.startHour, 0, 23) || !isFiniteInteger(block.startMin, 0, 59)) return null;
  if (!isFiniteInteger(block.durationMin, 5, 720) || !isFiniteInteger(block.colorIndex, 0, 20)) return null;
  const taskIds = Array.isArray(block.taskIds)
    ? [...new Set(block.taskIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      .slice(0, MAX_TASKS_PER_BLOCK)
    : [];
  if (taskIds.length === 0) return null;
  return {
    id: block.id.slice(0, 120),
    label: block.label.slice(0, 120),
    startHour: block.startHour,
    startMin: block.startMin,
    durationMin: block.durationMin,
    taskIds,
    colorIndex: block.colorIndex,
  };
}

function sanitizePlan(value: unknown): DispatchPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<DispatchPlan>;
  if (typeof plan.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date) || !Array.isArray(plan.blocks)) return null;
  return {
    version: 1,
    date: plan.date,
    updatedAt: typeof plan.updatedAt === 'number' && Number.isFinite(plan.updatedAt) ? plan.updatedAt : 0,
    blocks: plan.blocks.slice(0, MAX_BLOCKS).map(sanitizeBlock).filter((block): block is DispatchBlockSnapshot => Boolean(block)),
  };
}

function sanitizeArchive(value: unknown): DispatchArchive {
  const parsed = value && typeof value === 'object' ? value as Partial<DispatchArchive> & Partial<DispatchPlan> : {};
  const source = Array.isArray(parsed.plans) ? parsed.plans : parsed.date ? [parsed] : [];
  return {
    version: 2,
    plans: source.map(sanitizePlan).filter((plan): plan is DispatchPlan => Boolean(plan))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_PLANS),
    updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
  };
}

function loadArchive(userId?: string | null): DispatchArchive {
  if (typeof window === 'undefined') return sanitizeArchive(null);
  try {
    const raw = window.localStorage.getItem(planKey(userId));
    return sanitizeArchive(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeArchive(null);
  }
}

function writeArchive(userId: string | null | undefined, archive: DispatchArchive): boolean {
  const key = planKey(userId);
  const serialized = JSON.stringify(archive);
  try {
    window.localStorage.setItem(key, serialized);
    return window.localStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function writeArchiveVerified(userId: string | null | undefined, archive: DispatchArchive): void {
  if (writeArchive(userId, archive)) return;
  reportSyncWarning(userId, 'Dispatch could not save its latest browser draft. It will retry.');
  throw new Error('Dispatch browser draft write verification failed.');
}

function reportSyncWarning(userId: string | null | undefined, message: string): void {
  if (typeof window === 'undefined') return;
  const owner = userId || DEMO_USER_ID;
  const warningKey = `${owner}:${message}`;
  const now = Date.now();
  const previous = warningTimes.get(warningKey);
  if (previous !== undefined && now - previous < WARNING_THROTTLE_MS) return;
  warningTimes.set(warningKey, now);
  emitSyncWarning({ key: 'tool:dispatch', userId: owner, toolId: TOOL_ID, message });
}

/** Clear the banner and the throttle so a later failure notifies again. */
function reportSyncSuccess(userId: string | null | undefined): void {
  const owner = userId || DEMO_USER_ID;
  for (const key of [...warningTimes.keys()]) {
    if (key.startsWith(`${owner}:`)) warningTimes.delete(key);
  }
  reportSyncRecovered({ key: 'tool:dispatch', userId: owner });
}

function mergeArchives(local: DispatchArchive, cloud: DispatchArchive): DispatchArchive {
  const plans = new Map<string, DispatchPlan>();
  for (const plan of [...cloud.plans, ...local.plans]) {
    const current = plans.get(plan.date);
    // Local entries are visited last. On an equal millisecond timestamp, keep
    // the verified local draft rather than dropping a just-typed edit.
    if (!current || plan.updatedAt >= current.updatedAt) plans.set(plan.date, plan);
  }
  return sanitizeArchive({
    version: 2,
    plans: [...plans.values()],
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
  });
}

export function loadDispatchPlan(userId: string | null | undefined, date: string): DispatchPlan | null {
  return loadArchive(userId).plans.find((plan) => plan.date === date) || null;
}

function archiveWithPlan(
  userId: string | null | undefined,
  plan: Omit<DispatchPlan, 'version' | 'updatedAt'>,
): DispatchArchive {
  const archive = loadArchive(userId);
  const previous = archive.plans.find((entry) => entry.date === plan.date);
  const updatedAt = Math.max(Date.now(), archive.updatedAt + 1, (previous?.updatedAt || 0) + 1);
  const value = sanitizePlan({ ...plan, version: 1, updatedAt });
  if (!value) throw new Error('Dispatch plan is invalid and could not be saved.');
  archive.plans = [value, ...archive.plans.filter((entry) => entry.date !== value.date)];
  archive.updatedAt = value.updatedAt;
  return sanitizeArchive(archive);
}

/**
 * Commit the latest edit synchronously before React has a chance to unmount the
 * page. Firestore remains the cross-device copy, but this verified draft is the
 * navigation-safe source used on the next subscription pass.
 */
export function persistDispatchPlanDraft(
  userId: string | null | undefined,
  plan: Omit<DispatchPlan, 'version' | 'updatedAt'>,
): void {
  if (typeof window === 'undefined') {
    throw new Error('Dispatch plans can only be saved in the browser.');
  }
  writeArchiveVerified(userId, archiveWithPlan(userId, plan));
}

export async function flushDispatchPlan(
  userId: string | null | undefined,
  plan: Omit<DispatchPlan, 'version' | 'updatedAt'>,
): Promise<DispatchPersistenceOutcome> {
  if (typeof window === 'undefined') {
    throw new Error('Dispatch plans can only be saved in the browser.');
  }

  const archive = archiveWithPlan(userId, plan);
  let localCommitted = writeArchive(userId, archive);
  const usesCloud = Boolean(db) && Boolean(userId) && userId !== DEMO_USER_ID;
  let cloudCommitted = false;
  let cloudError: unknown;

  if (usesCloud) {
    try {
      await saveToolData(userId!, TOOL_ID, archive as unknown as Record<string, unknown>);
      cloudCommitted = true;
    } catch (error) {
      cloudError = error;
      if (!(error instanceof ToolDataConflictError) && localCommitted) {
        reportSyncWarning(
          userId,
          'Dispatch is saved in this browser, but cloud sync needs attention.',
        );
      }
    }
  }

  if (localCommitted && (cloudCommitted || !usesCloud)) reportSyncSuccess(userId);

  if (!localCommitted && !cloudCommitted) {
    // Retry a transient browser-cache failure once before declaring the
    // snapshot dirty. Both writes are read back, so a dropped write cannot be
    // mistaken for success.
    localCommitted = writeArchive(userId, archive);
    if (!localCommitted) {
      reportSyncWarning(userId, 'Dispatch could not save locally or in the cloud. It will retry.');
      throw cloudError instanceof Error
        ? cloudError
        : new Error('Dispatch could not save locally or in the cloud.');
    }
  }

  return { localCommitted, cloudCommitted };
}

export async function saveDispatchPlan(
  userId: string | null | undefined,
  plan: Omit<DispatchPlan, 'version' | 'updatedAt'>,
): Promise<void> {
  await flushDispatchPlan(userId, plan);
}

export function subscribeToDispatchPlan(
  userId: string,
  date: string,
  callback: (plan: DispatchPlan | null) => void,
): () => void {
  const local = loadArchive(userId);
  const usesCloud = Boolean(db) && userId !== DEMO_USER_ID;
  if (!usesCloud) {
    callback(local.plans.find((plan) => plan.date === date) || null);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === planKey(userId)) callback(loadDispatchPlan(userId, date));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }

  let active = true;
  const unsubscribe = subscribeToToolData<Record<string, unknown>>(userId, TOOL_ID, (data) => {
    void (async () => {
      const cloud = sanitizeArchive(data);
      const merged = mergeArchives(loadArchive(userId), cloud);
      if (!writeArchive(userId, merged)) {
        reportSyncWarning(userId, 'Dispatch could not update its verified browser cache.');
      }
      if (JSON.stringify(merged) !== JSON.stringify(cloud)) {
        try {
          await saveToolData(userId, TOOL_ID, merged as unknown as Record<string, unknown>);
        } catch (error) {
          if (!(error instanceof ToolDataConflictError)) {
            reportSyncWarning(userId, 'Dispatch could not finish syncing its merged plan.');
          }
        }
      }
      if (active) callback(merged.plans.find((plan) => plan.date === date) || null);
    })();
  });
  return () => {
    active = false;
    unsubscribe();
  };
}

export function saveDispatchFlightHandoff(userId: string | null | undefined, handoff: Omit<DispatchFlightHandoff, 'version' | 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  const value: DispatchFlightHandoff = {
    version: 1,
    createdAt: Date.now(),
    label: handoff.label.slice(0, 120),
    durationMin: Math.max(5, Math.min(720, Math.round(handoff.durationMin))),
    taskIds: [...new Set(handoff.taskIds.filter(Boolean))].slice(0, MAX_TASKS_PER_BLOCK),
  };
  writeLocalStorageVerified(handoffKey(userId), JSON.stringify(value));
}

export function consumeDispatchFlightHandoff(userId?: string | null): DispatchFlightHandoff | null {
  if (typeof window === 'undefined') return null;
  const key = handoffKey(userId);
  try {
    const raw = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DispatchFlightHandoff>;
    if (parsed.version !== 1 || typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > HANDOFF_MAX_AGE_MS) return null;
    if (typeof parsed.label !== 'string' || typeof parsed.durationMin !== 'number' || !Array.isArray(parsed.taskIds)) return null;
    return {
      version: 1,
      createdAt: parsed.createdAt,
      label: parsed.label.slice(0, 120),
      durationMin: Math.max(5, Math.min(720, Math.round(parsed.durationMin))),
      taskIds: [...new Set(parsed.taskIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        .slice(0, MAX_TASKS_PER_BLOCK),
    };
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}
