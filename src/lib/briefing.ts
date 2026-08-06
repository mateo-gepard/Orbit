import { db } from './firebase';
import { DEMO_USER_ID, scopedStorageKey } from './account-storage';
import { saveToolData, subscribeToToolData, ToolDataConflictError } from './firestore';
import { reportSyncRecovered, reportSyncWarning as emitSyncWarning } from './sync-warning';

export interface DailyBriefingJournal {
  date: string;
  priorityIds: string[];
  morningIntention: string;
  eveningReflection: string;
  morningCompletedAt?: number;
  eveningCompletedAt?: number;
  updatedAt?: number;
}

export interface WeeklyBriefingJournal {
  weekKey: string;
  focus: string;
  completedAt?: number;
  updatedAt?: number;
}

export interface BriefingJournal {
  version: 2;
  daily: DailyBriefingJournal;
  weekly: WeeklyBriefingJournal;
}

export interface BriefingPersistenceOutcome {
  localCommitted: boolean;
  cloudCommitted: boolean;
}

interface BriefingArchive {
  version: 2;
  dailyRecords: DailyBriefingJournal[];
  weeklyRecords: WeeklyBriefingJournal[];
  updatedAt: number;
}

const STORAGE_PREFIX = 'threadmap-briefing-journal';
const TOOL_ID = 'briefing-journal';
const MAX_TEXT_LENGTH = 4000;
const MAX_DAILY_RECORDS = 90;
const MAX_WEEKLY_RECORDS = 26;
const WARNING_THROTTLE_MS = 30_000;
const warningTimes = new Map<string, number>();

function storageKey(userId?: string | null): string {
  return scopedStorageKey(STORAGE_PREFIX, userId || DEMO_USER_ID);
}

export function createBriefingJournal(date: string, weekKey: string): BriefingJournal {
  return {
    version: 2,
    daily: { date, priorityIds: [], morningIntention: '', eveningReflection: '' },
    weekly: { weekKey, focus: '' },
  };
}

function timestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function sanitizeDaily(value: unknown): DailyBriefingJournal | null {
  if (!value || typeof value !== 'object') return null;
  const daily = value as Partial<DailyBriefingJournal>;
  if (typeof daily.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(daily.date)) return null;
  return {
    date: daily.date,
    priorityIds: Array.isArray(daily.priorityIds)
      ? [...new Set(daily.priorityIds.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 3)
      : [],
    morningIntention: typeof daily.morningIntention === 'string' ? daily.morningIntention.slice(0, MAX_TEXT_LENGTH) : '',
    eveningReflection: typeof daily.eveningReflection === 'string' ? daily.eveningReflection.slice(0, MAX_TEXT_LENGTH) : '',
    morningCompletedAt: timestamp(daily.morningCompletedAt),
    eveningCompletedAt: timestamp(daily.eveningCompletedAt),
    updatedAt: timestamp(daily.updatedAt),
  };
}

function sanitizeWeekly(value: unknown): WeeklyBriefingJournal | null {
  if (!value || typeof value !== 'object') return null;
  const weekly = value as Partial<WeeklyBriefingJournal>;
  if (typeof weekly.weekKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekly.weekKey)) return null;
  return {
    weekKey: weekly.weekKey,
    focus: typeof weekly.focus === 'string' ? weekly.focus.slice(0, MAX_TEXT_LENGTH) : '',
    completedAt: timestamp(weekly.completedAt),
    updatedAt: timestamp(weekly.updatedAt),
  };
}

function sanitizeArchive(value: unknown): BriefingArchive {
  const parsed = value && typeof value === 'object' ? value as Partial<BriefingArchive> & Partial<BriefingJournal> : {};
  const dailySource = Array.isArray(parsed.dailyRecords)
    ? parsed.dailyRecords
    : parsed.daily ? [parsed.daily] : [];
  const weeklySource = Array.isArray(parsed.weeklyRecords)
    ? parsed.weeklyRecords
    : parsed.weekly ? [parsed.weekly] : [];
  return {
    version: 2,
    dailyRecords: dailySource.map(sanitizeDaily).filter((record): record is DailyBriefingJournal => Boolean(record))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_DAILY_RECORDS),
    weeklyRecords: weeklySource.map(sanitizeWeekly).filter((record): record is WeeklyBriefingJournal => Boolean(record))
      .sort((a, b) => b.weekKey.localeCompare(a.weekKey)).slice(0, MAX_WEEKLY_RECORDS),
    updatedAt: timestamp(parsed.updatedAt) || 0,
  };
}

function loadArchive(userId?: string | null): BriefingArchive {
  if (typeof window === 'undefined') return sanitizeArchive(null);
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return sanitizeArchive(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeArchive(null);
  }
}

function writeArchive(userId: string | null | undefined, archive: BriefingArchive): boolean {
  const key = storageKey(userId);
  const serialized = JSON.stringify(archive);
  try {
    window.localStorage.setItem(key, serialized);
    return window.localStorage.getItem(key) === serialized;
  } catch {
    // A cloud commit may still make this snapshot durable. The caller retries
    // once and warns only if neither persistence path commits.
    return false;
  }
}

function writeArchiveVerified(userId: string | null | undefined, archive: BriefingArchive): void {
  if (writeArchive(userId, archive)) return;
  reportSyncWarning(userId, 'Briefing could not save its latest browser draft. It will retry.');
  throw new Error('Briefing browser draft write verification failed.');
}

function reportSyncWarning(userId: string | null | undefined, message: string): void {
  if (typeof window === 'undefined') return;
  const owner = userId || DEMO_USER_ID;
  const warningKey = `${owner}:${message}`;
  const now = Date.now();
  const previous = warningTimes.get(warningKey);
  if (previous !== undefined && now - previous < WARNING_THROTTLE_MS) return;
  warningTimes.set(warningKey, now);
  emitSyncWarning({ key: 'tool:briefing', userId: owner, toolId: TOOL_ID, message });
}

/** Clear the banner and the throttle so a later failure notifies again. */
function reportSyncSuccess(userId: string | null | undefined): void {
  const owner = userId || DEMO_USER_ID;
  for (const key of [...warningTimes.keys()]) {
    if (key.startsWith(`${owner}:`)) warningTimes.delete(key);
  }
  reportSyncRecovered({ key: 'tool:briefing', userId: owner });
}

function journalFromArchive(archive: BriefingArchive, date: string, weekKey: string): BriefingJournal {
  const empty = createBriefingJournal(date, weekKey);
  const storedDaily = archive.dailyRecords.find((record) => record.date === date);
  const storedWeekly = archive.weeklyRecords.find((record) => record.weekKey === weekKey);
  const daily: DailyBriefingJournal = storedDaily ? {
    date: storedDaily.date,
    priorityIds: storedDaily.priorityIds,
    morningIntention: storedDaily.morningIntention,
    eveningReflection: storedDaily.eveningReflection,
    morningCompletedAt: storedDaily.morningCompletedAt,
    eveningCompletedAt: storedDaily.eveningCompletedAt,
  } : empty.daily;
  const weekly: WeeklyBriefingJournal = storedWeekly ? {
    weekKey: storedWeekly.weekKey,
    focus: storedWeekly.focus,
    completedAt: storedWeekly.completedAt,
  } : empty.weekly;
  return {
    version: 2,
    daily,
    weekly,
  };
}

function mergeArchives(local: BriefingArchive, cloud: BriefingArchive): BriefingArchive {
  const daily = new Map<string, DailyBriefingJournal>();
  const weekly = new Map<string, WeeklyBriefingJournal>();
  for (const record of [...cloud.dailyRecords, ...local.dailyRecords]) {
    const current = daily.get(record.date);
    if (!current || (record.updatedAt || 0) >= (current.updatedAt || 0)) daily.set(record.date, record);
  }
  for (const record of [...cloud.weeklyRecords, ...local.weeklyRecords]) {
    const current = weekly.get(record.weekKey);
    if (!current || (record.updatedAt || 0) >= (current.updatedAt || 0)) weekly.set(record.weekKey, record);
  }
  return sanitizeArchive({
    version: 2,
    dailyRecords: [...daily.values()],
    weeklyRecords: [...weekly.values()],
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
  });
}

export function loadBriefingJournal(userId: string | null | undefined, date: string, weekKey: string): BriefingJournal {
  return journalFromArchive(loadArchive(userId), date, weekKey);
}

function archiveWithJournal(
  userId: string | null | undefined,
  journal: BriefingJournal,
): BriefingArchive {
  const archive = loadArchive(userId);
  const previousDaily = archive.dailyRecords.find((record) => record.date === journal.daily.date);
  const previousWeekly = archive.weeklyRecords.find((record) => record.weekKey === journal.weekly.weekKey);
  const now = Math.max(
    Date.now(),
    archive.updatedAt + 1,
    (previousDaily?.updatedAt || 0) + 1,
    (previousWeekly?.updatedAt || 0) + 1,
  );
  archive.dailyRecords = [
    { ...journal.daily, updatedAt: now },
    ...archive.dailyRecords.filter((record) => record.date !== journal.daily.date),
  ];
  archive.weeklyRecords = [
    { ...journal.weekly, updatedAt: now },
    ...archive.weeklyRecords.filter((record) => record.weekKey !== journal.weekly.weekKey),
  ];
  archive.updatedAt = now;
  return sanitizeArchive(archive);
}

/** Synchronously persist the active account's current edit before navigation. */
export function persistBriefingJournalDraft(
  userId: string | null | undefined,
  journal: BriefingJournal,
): void {
  if (typeof window === 'undefined') {
    throw new Error('Briefing journals can only be saved in the browser.');
  }
  writeArchiveVerified(userId, archiveWithJournal(userId, journal));
}

export async function flushBriefingJournal(
  userId: string | null | undefined,
  journal: BriefingJournal,
): Promise<BriefingPersistenceOutcome> {
  if (typeof window === 'undefined') {
    throw new Error('Briefing journals can only be saved in the browser.');
  }

  const archive = archiveWithJournal(userId, journal);
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
          'Briefing is saved in this browser, but cloud sync needs attention.',
        );
      }
    }
  }

  if (localCommitted && (cloudCommitted || !usesCloud)) reportSyncSuccess(userId);

  if (!localCommitted && !cloudCommitted) {
    localCommitted = writeArchive(userId, archive);
    if (!localCommitted) {
      reportSyncWarning(userId, 'Briefing could not save locally or in the cloud. It will retry.');
      throw cloudError instanceof Error
        ? cloudError
        : new Error('Briefing could not save locally or in the cloud.');
    }
  }

  return { localCommitted, cloudCommitted };
}

export async function saveBriefingJournal(
  userId: string | null | undefined,
  journal: BriefingJournal,
): Promise<void> {
  await flushBriefingJournal(userId, journal);
}

export function subscribeToBriefingJournal(
  userId: string,
  date: string,
  weekKey: string,
  callback: (journal: BriefingJournal) => void,
): () => void {
  const local = loadArchive(userId);
  const usesCloud = Boolean(db) && userId !== DEMO_USER_ID;
  if (!usesCloud) {
    callback(journalFromArchive(local, date, weekKey));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey(userId)) callback(loadBriefingJournal(userId, date, weekKey));
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
        reportSyncWarning(userId, 'Briefing could not update its verified browser cache.');
      }
      if (JSON.stringify(merged) !== JSON.stringify(cloud)) {
        try {
          await saveToolData(userId, TOOL_ID, merged as unknown as Record<string, unknown>);
        } catch (error) {
          if (!(error instanceof ToolDataConflictError)) {
            reportSyncWarning(userId, 'Briefing could not finish syncing its merged journal.');
          }
        }
      }
      if (active) callback(journalFromArchive(merged, date, weekKey));
    })();
  });
  return () => {
    active = false;
    unsubscribe();
  };
}
