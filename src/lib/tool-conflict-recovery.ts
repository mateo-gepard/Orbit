import { writeStorageVerified } from './verified-storage';

export const TOOL_CONFLICT_STORAGE_PREFIX = 'orbit-tool-conflict';
const MAX_CONFLICTS_PER_ACCOUNT = 30;

type ConflictStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export interface ToolConflictRecovery {
  version: 1;
  id: string;
  userId: string;
  toolId: string;
  createdAt: number;
  baseRevision: number | null;
  serverRevision: number;
  localData: Record<string, unknown>;
  cloudData: Record<string, unknown> | null;
}

function browserStorage(): ConflictStorage {
  if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  return localStorage;
}

function suffix(userId: string): string {
  return `:${encodeURIComponent(userId)}`;
}

export function listToolConflicts(
  userId: string,
  storage: ConflictStorage = browserStorage(),
): ToolConflictRecovery[] {
  const accountSuffix = suffix(userId);
  const prefix = `${TOOL_CONFLICT_STORAGE_PREFIX}:`;
  const conflicts: ToolConflictRecovery[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix) || !key.endsWith(accountSuffix)) continue;
    try {
      const parsed = JSON.parse(storage.getItem(key) || '') as Partial<ToolConflictRecovery>;
      if (parsed.version === 1
          && parsed.userId === userId
          && typeof parsed.id === 'string'
          && typeof parsed.toolId === 'string'
          && typeof parsed.createdAt === 'number'
          && parsed.localData
          && typeof parsed.localData === 'object') {
        conflicts.push(parsed as ToolConflictRecovery);
      }
    } catch { /* preserve unreadable recovery values in storage */ }
  }
  return conflicts.sort((a, b) => b.createdAt - a.createdAt);
}

export function preserveToolConflict(
  input: Omit<ToolConflictRecovery, 'version' | 'id' | 'createdAt'>,
  storage: ConflictStorage = browserStorage(),
): ToolConflictRecovery {
  const existing = listToolConflicts(input.userId, storage);
  const duplicate = existing.find((entry) => entry.toolId === input.toolId
    && entry.baseRevision === input.baseRevision
    && entry.serverRevision === input.serverRevision
    && JSON.stringify(entry.localData) === JSON.stringify(input.localData));
  if (duplicate) return duplicate;
  if (existing.length >= MAX_CONFLICTS_PER_ACCOUNT) {
    throw new Error('The browser recovery log is full. Export account data before resolving more cloud conflicts.');
  }
  const id = crypto.randomUUID();
  const record: ToolConflictRecovery = {
    ...input,
    version: 1,
    id,
    createdAt: Date.now(),
  };
  const key = `${TOOL_CONFLICT_STORAGE_PREFIX}:${input.toolId}:${id}${suffix(input.userId)}`;
  writeStorageVerified(storage, key, JSON.stringify(record));
  return record;
}

/**
 * The storage key a preserved conflict lives under.
 *
 * Records were written and never read back by anything in the app: there was
 * no resolve path and no delete path, so they accumulated until the cap and
 * then `preserveToolConflict` started throwing — while the conflict toast
 * promised the user a recovery flow that did not exist.
 */
export function toolConflictStorageKey(record: ToolConflictRecovery): string {
  return `${TOOL_CONFLICT_STORAGE_PREFIX}:${record.toolId}:${record.id}${suffix(record.userId)}`;
}

/** Forget one preserved conflict. Returns whether a record was removed. */
export function removeToolConflict(
  userId: string,
  conflictId: string,
  storage: ConflictStorage = browserStorage(),
): boolean {
  const record = listToolConflicts(userId, storage).find((entry) => entry.id === conflictId);
  if (!record) return false;
  storage.removeItem(toolConflictStorageKey(record));
  return true;
}

/** Forget every preserved conflict for an account. */
export function clearToolConflicts(
  userId: string,
  storage: ConflictStorage = browserStorage(),
): number {
  const records = listToolConflicts(userId, storage);
  records.forEach((record) => storage.removeItem(toolConflictStorageKey(record)));
  return records.length;
}

export function countToolConflicts(
  userId: string,
  storage: ConflictStorage = browserStorage(),
): number {
  return listToolConflicts(userId, storage).length;
}

/** How close the account is to the cap that makes `preserveToolConflict` throw. */
export const TOOL_CONFLICT_LIMIT = MAX_CONFLICTS_PER_ACCOUNT;

/** A portable copy of everything preserved, for the "export" the toast mentions. */
export function exportToolConflicts(
  userId: string,
  storage: ConflictStorage = browserStorage(),
): { version: 1; userId: string; exportedAt: number; conflicts: ToolConflictRecovery[] } {
  return {
    version: 1,
    userId,
    exportedAt: Date.now(),
    conflicts: listToolConflicts(userId, storage),
  };
}
