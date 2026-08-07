import { writeStorageVerified } from './verified-storage';

export const TOOL_CONFLICT_STORAGE_PREFIX = 'orbit-tool-conflict';
const MAX_CONFLICTS_PER_ACCOUNT = 30;

type ConflictStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>;

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
