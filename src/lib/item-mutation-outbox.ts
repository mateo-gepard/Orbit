import type { ThreadmapItem } from './types';
import { removeStorageVerified, writeStorageVerified } from './verified-storage';

export const ITEM_MUTATION_STORAGE_PREFIX = 'orbit-item-mutation';
const MAX_MUTATIONS_PER_ACCOUNT = 100;

type MutationStorage = Pick<
  Storage,
  'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'
>;

export type ItemMutationKind = 'create' | 'update' | 'link' | 'unlink' | 'tag';
export type ItemMutationState = 'pending' | 'rejected';

export interface ItemMutationPatch {
  itemId: string;
  mode: 'create' | 'update';
  baseRevision?: number;
  baseUpdatedAt?: number;
  fields: Record<string, unknown>;
  deleteFields?: string[];
  arrayUnionFields?: Record<string, unknown[]>;
  arrayRemoveFields?: Record<string, unknown[]>;
}

export interface ItemMutationRecord {
  version: 1;
  id: string;
  userId: string;
  kind: ItemMutationKind;
  label: string;
  createdAt: number;
  state: ItemMutationState;
  recoveryItems: ThreadmapItem[];
  patches: ItemMutationPatch[];
  /**
   * Earlier browser mutations whose optimistic revisions this mutation was
   * built on. Descendants may only reach Firestore after every dependency has
   * been confirmed and removed from the journal.
   */
  dependsOnMutationIds?: string[];
  tagSettings?: {
    customTags: string[];
    removedDefaultTags: string[];
    updatedAt: number;
    revision?: number;
    baseRevision?: number;
    baseUpdatedAt?: number;
  };
  error?: string;
}

export interface NewItemMutation {
  id?: string;
  kind: ItemMutationKind;
  label: string;
  createdAt: number;
  recoveryItems: ThreadmapItem[];
  patches: ItemMutationPatch[];
  dependsOnMutationIds?: string[];
  tagSettings?: ItemMutationRecord['tagSettings'];
}

function browserStorage(): MutationStorage {
  if (typeof localStorage === 'undefined') {
    throw new Error('Browser storage is unavailable.');
  }
  return localStorage;
}

function accountSuffix(userId: string): string {
  return `:${encodeURIComponent(userId)}`;
}

function mutationKey(userId: string, id: string): string {
  return `${ITEM_MUTATION_STORAGE_PREFIX}:${id}${accountSuffix(userId)}`;
}

function isRecord(value: unknown, userId: string, expectedId?: string): value is ItemMutationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ItemMutationRecord>;
  return record.version === 1
    && typeof record.id === 'string'
    && (!expectedId || record.id === expectedId)
    && record.userId === userId
    && typeof record.createdAt === 'number'
    && (record.state === 'pending' || record.state === 'rejected')
    && Array.isArray(record.recoveryItems)
    && record.recoveryItems.every((item) => item && item.userId === userId && typeof item.id === 'string')
    && Array.isArray(record.patches)
    && record.patches.every((patch) => patch
      && typeof patch.itemId === 'string'
      && (patch.mode === 'create' || patch.mode === 'update')
      && (patch.baseRevision === undefined || (Number.isSafeInteger(patch.baseRevision) && patch.baseRevision >= 0))
      && (patch.baseUpdatedAt === undefined || typeof patch.baseUpdatedAt === 'number')
      && patch.fields
      && typeof patch.fields === 'object')
    && (record.dependsOnMutationIds === undefined || (
      Array.isArray(record.dependsOnMutationIds)
      && record.dependsOnMutationIds.length <= MAX_MUTATIONS_PER_ACCOUNT
      && record.dependsOnMutationIds.every((id) => typeof id === 'string' && id !== record.id)
    ))
    && (record.tagSettings === undefined || (
      record.kind === 'tag'
      && Array.isArray(record.tagSettings.customTags)
      && record.tagSettings.customTags.every((tag) => typeof tag === 'string')
      && Array.isArray(record.tagSettings.removedDefaultTags)
      && record.tagSettings.removedDefaultTags.every((tag) => typeof tag === 'string')
      && Number.isSafeInteger(record.tagSettings.updatedAt)
      && record.tagSettings.updatedAt > 0
      && (record.tagSettings.revision === undefined
        || (Number.isSafeInteger(record.tagSettings.revision) && record.tagSettings.revision > 0))
      && (record.tagSettings.baseRevision === undefined
        || (Number.isSafeInteger(record.tagSettings.baseRevision) && record.tagSettings.baseRevision >= 0))
      && (record.tagSettings.baseUpdatedAt === undefined
        || (Number.isSafeInteger(record.tagSettings.baseUpdatedAt) && record.tagSettings.baseUpdatedAt >= 0))
    ));
}

function parseRecord(raw: string | null, userId: string, expectedId?: string): ItemMutationRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed, userId, expectedId) ? parsed : null;
  } catch {
    return null;
  }
}

export function listItemMutations(
  userId: string,
  storage: MutationStorage = browserStorage(),
): ItemMutationRecord[] {
  const suffix = accountSuffix(userId);
  const keyPrefix = `${ITEM_MUTATION_STORAGE_PREFIX}:`;
  const records: ItemMutationRecord[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(keyPrefix) || !key.endsWith(suffix)) continue;
    const id = key.slice(keyPrefix.length, -suffix.length);
    const record = parseRecord(storage.getItem(key), userId, id);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function hasOutstandingItemMutation(
  userId: string,
  itemId: string,
  storage: MutationStorage = browserStorage(),
): boolean {
  return listItemMutations(userId, storage).some((mutation) => itemMutationTouches(mutation, itemId));
}

export function enqueueItemMutation(
  userId: string,
  input: NewItemMutation,
  storage: MutationStorage = browserStorage(),
): ItemMutationRecord {
  const existing = listItemMutations(userId, storage);
  if (existing.length >= MAX_MUTATIONS_PER_ACCOUNT) {
    throw new Error('Too many item changes still need cloud confirmation. Reconnect or export your data before editing more.');
  }
  const id = input.id || crypto.randomUUID();
  const touchedItemIds = new Set(input.patches.map((patch) => patch.itemId));
  const inferredDependencies = existing
    .filter((mutation) => mutation.id !== id
      && mutation.patches.some((patch) => touchedItemIds.has(patch.itemId)))
    .map((mutation) => mutation.id);
  const dependsOnMutationIds = [...new Set(
    [...inferredDependencies, ...(input.dependsOnMutationIds || [])],
  )].filter((dependencyId) => dependencyId !== id);
  const record: ItemMutationRecord = {
    version: 1,
    id,
    userId,
    kind: input.kind,
    label: input.label.slice(0, 120),
    createdAt: input.createdAt,
    state: 'pending',
    recoveryItems: input.recoveryItems,
    patches: input.patches,
    ...(dependsOnMutationIds.length > 0 ? { dependsOnMutationIds } : {}),
    ...(input.tagSettings ? { tagSettings: input.tagSettings } : {}),
  };
  writeStorageVerified(storage, mutationKey(userId, id), JSON.stringify(record));
  return record;
}

export function itemMutationTouches(
  record: Pick<ItemMutationRecord, 'patches'>,
  itemId: string,
): boolean {
  return record.patches.some((patch) => patch.itemId === itemId);
}

export function blockingItemMutationIds(
  record: Pick<ItemMutationRecord, 'dependsOnMutationIds'>,
  outstandingIds: ReadonlySet<string>,
): string[] {
  return (record.dependsOnMutationIds || []).filter((id) => outstandingIds.has(id));
}

/**
 * Prove that an optimistic item revision is a contiguous descendant of a
 * caller's last confirmed base. This lets editors keep accepting local input
 * while earlier writes await acknowledgement without rebasing onto those
 * unconfirmed revisions.
 */
export function itemMutationLineageCovers(
  mutations: readonly ItemMutationRecord[],
  itemId: string,
  baseRevision: number,
  currentRevision: number,
  baseUpdatedAt?: number,
): boolean {
  if (currentRevision === baseRevision) return true;
  let revision = baseRevision;
  let first = true;
  for (const mutation of mutations) {
    const patch = mutation.patches.find((candidate) => candidate.itemId === itemId);
    if (!patch || patch.mode !== 'update' || patch.baseRevision !== revision) continue;
    if (first && baseRevision === 0 && baseUpdatedAt !== undefined
        && patch.baseUpdatedAt !== baseUpdatedAt) {
      continue;
    }
    const nextRevision = Number(patch.fields.revision);
    if (!Number.isSafeInteger(nextRevision) || nextRevision !== revision + 1) continue;
    revision = nextRevision;
    first = false;
    if (revision === currentRevision) return true;
  }
  return false;
}

export function rejectItemMutation(
  record: Pick<ItemMutationRecord, 'userId' | 'id'>,
  error: unknown,
  storage: MutationStorage = browserStorage(),
): void {
  const key = mutationKey(record.userId, record.id);
  const current = parseRecord(storage.getItem(key), record.userId, record.id);
  if (!current) return;
  const message = error instanceof Error ? error.message : String(error || 'Cloud write rejected.');
  writeStorageVerified(storage, key, JSON.stringify({
    ...current,
    state: 'rejected',
    error: message.slice(0, 300),
  } satisfies ItemMutationRecord));
}

export function removeItemMutation(
  record: Pick<ItemMutationRecord, 'userId' | 'id'>,
  storage: MutationStorage = browserStorage(),
): void {
  removeStorageVerified(storage, mutationKey(record.userId, record.id));
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => equalValue(entry, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && equalValue(leftRecord[key], rightRecord[key]));
}

export function itemMutationMatches(
  record: ItemMutationRecord,
  itemsById: ReadonlyMap<string, ThreadmapItem>,
): boolean {
  return record.patches.every((patch) => {
    const item = itemsById.get(patch.itemId);
    if (!item) return false;
    if (patch.deleteFields?.some((field) => (item as unknown as Record<string, unknown>)[field] !== undefined)) {
      return false;
    }
    const itemData = item as unknown as Record<string, unknown>;
    const hasTransforms = Boolean(patch.arrayUnionFields || patch.arrayRemoveFields);
    const fieldsMatch = Object.entries(patch.fields).every(([field, expected]) =>
      hasTransforms && (field === 'updatedAt' || field === 'revision')
        ? true
        : equalValue(itemData[field], expected));
    const unionsMatch = Object.entries(patch.arrayUnionFields || {}).every(([field, expected]) => {
      const actual = itemData[field];
      return Array.isArray(actual) && expected.every((value) => actual.some((entry) => equalValue(entry, value)));
    });
    const removalsMatch = Object.entries(patch.arrayRemoveFields || {}).every(([field, expected]) => {
      const actual = itemData[field];
      return !Array.isArray(actual) || expected.every((value) => !actual.some((entry) => equalValue(entry, value)));
    });
    return fieldsMatch && unionsMatch && removalsMatch;
  });
}

export interface MutationRecoveryMerge {
  items: ThreadmapItem[];
  confirmed: ItemMutationRecord[];
  superseded: ItemMutationRecord[];
  recovered: ItemMutationRecord[];
}

/**
 * Overlay browser-verified mutations on a Firestore snapshot. A server copy
 * may supersede an older rejected edit, but that edit remains in the outbox
 * (and account export) until the user can resolve it.
 */
export function mergeItemMutationRecovery(
  cloudItems: ThreadmapItem[],
  mutations: ItemMutationRecord[],
  authoritative: boolean,
): MutationRecoveryMerge {
  const merged = new Map(cloudItems.map((item) => [item.id, item]));
  const confirmed: ItemMutationRecord[] = [];
  const superseded: ItemMutationRecord[] = [];
  const recovered: ItemMutationRecord[] = [];
  const unresolvedIds = new Set(mutations.map((mutation) => mutation.id));

  for (const mutation of mutations) {
    const blockedByAncestor = blockingItemMutationIds(mutation, unresolvedIds).length > 0;
    if (!blockedByAncestor && authoritative && itemMutationMatches(mutation, merged)) {
      confirmed.push(mutation);
      unresolvedIds.delete(mutation.id);
      continue;
    }

    let overlaid = false;
    let hasNewerCloudCopy = false;
    for (const recoveryItem of mutation.recoveryItems) {
      const cloudItem = merged.get(recoveryItem.id);
      const patch = mutation.patches.find((candidate) => candidate.itemId === recoveryItem.id);
      const cloudRevision = Number(cloudItem?.revision || 0);
      const hasRevisionOrdering = Boolean(
        cloudItem
          && patch?.baseRevision !== undefined
          && Number.isInteger(cloudRevision)
          && cloudRevision > 0
      );
      const cloudSupersedes = !blockedByAncestor && Boolean(cloudItem && (
        (authoritative && patch?.mode === 'create')
        || (hasRevisionOrdering && cloudRevision > patch!.baseRevision!)
        || (!hasRevisionOrdering && cloudItem.updatedAt > recoveryItem.updatedAt)
      ));
      if (cloudSupersedes) {
        hasNewerCloudCopy = true;
        continue;
      }
      merged.set(recoveryItem.id, recoveryItem);
      overlaid = true;
    }
    if (overlaid) recovered.push(mutation);
    if (hasNewerCloudCopy) superseded.push(mutation);
  }

  return {
    items: [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    confirmed,
    superseded,
    recovered,
  };
}
