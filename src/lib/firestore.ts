import {
  collection,
  doc,
  deleteField,
  arrayRemove,
  arrayUnion,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  setDoc,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions, db } from './firebase';
import type { OrbitItem } from './types';
import { useOrbitStore } from './store';
import { DEMO_USER_ID, migrateLegacyStorageToDemo, scopedStorageKey } from './account-storage';
import { KeyedSerialQueue } from './keyed-serial-queue';
import { writeLocalStorageVerified } from './verified-storage';
import {
  blockingItemMutationIds,
  enqueueItemMutation,
  itemMutationLineageCovers,
  itemMutationMatches,
  listItemMutations,
  mergeItemMutationRecovery,
  rejectItemMutation,
  removeItemMutation,
  type ItemMutationRecord,
} from './item-mutation-outbox';
import { preserveToolConflict } from './tool-conflict-recovery';
import { getAllowedParentTypes } from './links';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const ITEMS_COLLECTION = 'items';
const LOCAL_STORAGE_KEY = 'orbit-items';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const FIRESTORE_WRITE_WAIT_MS = 10_000;
const MAX_TOOL_DOCUMENT_BYTES = 850_000;
const itemUpdateQueue = new KeyedSerialQueue();

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

export type FirestoreDataMode = 'signed-out' | 'local' | 'cloud';

let activeUserId: string | null = null;
let activeDataMode: FirestoreDataMode = 'signed-out';
let activeDataGeneration = 0;

/** Bind every browser cache and mutation to the current authenticated account. */
export function setFirestoreDataContext(
  userId: string | null,
  mode: FirestoreDataMode
): void {
  if (activeUserId !== userId || activeDataMode !== mode) activeDataGeneration += 1;
  activeUserId = userId;
  activeDataMode = mode;
  if (userId === DEMO_USER_ID) {
    migrateLegacyStorageToDemo(LOCAL_STORAGE_KEY, userId);
    migrateLegacyStorageToDemo(LOCAL_SETTINGS_KEY, userId);
  }
}

export function isFirestoreDataContextCurrent(userId: string, generation: number): boolean {
  return activeUserId === userId && activeDataGeneration === generation;
}

function captureActiveDataContext(userId: string): number {
  assertActiveAccount(userId);
  return activeDataGeneration;
}

function assertActiveDataContext(userId: string, generation: number): void {
  if (!isFirestoreDataContextCurrent(userId, generation)) {
    throw new Error('The active account changed before this operation completed.');
  }
}

function assertActiveAccount(userId: string): void {
  if (!activeUserId || activeUserId !== userId) {
    throw new Error('The active account changed before this operation completed.');
  }
}

function isFirebaseAvailable(userId: string): boolean {
  return db !== null && activeDataMode === 'cloud' && activeUserId === userId;
}

function getDb(): Firestore {
  if (!db) throw new Error('Firebase not initialized');
  return db;
}

/** Sleep for ms with jitter */
function sleep(ms: number): Promise<void> {
  const jitter = Math.random() * ms * 0.3;
  return new Promise((r) => setTimeout(r, ms + jitter));
}

function equalStringArrays(left: unknown, right: readonly string[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

/** Retry an async operation with exponential backoff */
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const code = String((err as { code?: unknown })?.code || '').replace(/^[^/]+\//, '');
      const retryable = new Set([
        'aborted',
        'cancelled',
        'deadline-exceeded',
        'internal',
        'resource-exhausted',
        'unavailable',
        'unknown',
      ]).has(code);
      console.warn(
        `[THREADMAP] ${context} failed (attempt ${attempt + 1}/${retries}):`,
        err
      );
      if (!retryable || attempt === retries - 1) break;
      if (attempt < retries - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }
  console.error(`[THREADMAP] ${context} failed after ${retries} attempts`);
  throw lastError;
}

export type QueueableWriteOutcome = 'committed' | 'pending' | 'rejected';

interface QueueableWriteObserver {
  userId?: string;
  generation?: number;
  onCommit?: () => void;
  onReject?: (error: unknown) => void;
}

function isRetryableFirestoreError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || '').replace(/^[^/]+\//, '');
  return new Set([
    'aborted',
    'cancelled',
    'deadline-exceeded',
    'internal',
    'resource-exhausted',
    'unavailable',
    'unknown',
  ]).has(code);
}

function reportQueuedWrite(
  message: string,
  owner?: Pick<QueueableWriteObserver, 'userId' | 'generation'>,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
    detail: { message, userId: owner?.userId, generation: owner?.generation },
  }));
}

function notifyWriteObserver(
  callback: QueueableWriteObserver['onCommit'] | QueueableWriteObserver['onReject'],
  value?: unknown,
): void {
  try {
    if (callback) (callback as (argument?: unknown) => void)(value);
  } catch (error) {
    console.error('[THREADMAP] Failed to update the browser mutation journal:', error);
    reportQueuedWrite('A cloud write finished, but its browser recovery record could not be updated. Export your data before clearing this site’s storage.');
  }
}

/**
 * Firestore's persistent local cache accepts ordinary writes while offline,
 * but their promises intentionally wait for a server acknowledgement. Invoke
 * each mutation exactly once, return once it is durably queued, and keep a
 * rejection observer attached so controls never remain busy indefinitely.
 */
async function commitQueueableWrite(
  operation: () => Promise<void>,
  context: string,
  observer: QueueableWriteObserver = {},
): Promise<QueueableWriteOutcome> {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    let operationPromise: Promise<void>;
    try {
      operationPromise = operation();
    } catch (error) {
      if (observer.onReject) {
        notifyWriteObserver(observer.onReject, error);
        reportQueuedWrite(`${context} is saved in this browser, but cloud sync rejected it.`, observer);
        return 'rejected';
      }
      throw error;
    }

    if (offline) {
      void operationPromise.then(
        () => notifyWriteObserver(observer.onCommit),
        (error) => {
          console.error(`[THREADMAP] Queued ${context} was rejected:`, error);
          notifyWriteObserver(observer.onReject, error);
          reportQueuedWrite(`${context} is still saved in this browser, but cloud sync needs attention.`, observer);
        },
      );
      reportQueuedWrite(`${context} is saved in this browser and will sync when the connection returns.`, observer);
      return 'pending';
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      operationPromise.then(
        () => ({ type: 'committed' as const }),
        (error: unknown) => ({ type: 'error' as const, error }),
      ),
      new Promise<{ type: 'pending' }>((resolve) => {
        timeout = setTimeout(() => resolve({ type: 'pending' }), FIRESTORE_WRITE_WAIT_MS);
      }),
    ]);
    if (timeout) clearTimeout(timeout);

    if (result.type === 'committed') {
      notifyWriteObserver(observer.onCommit);
      return 'committed';
    }
    if (result.type === 'pending') {
      void operationPromise.then(
        () => notifyWriteObserver(observer.onCommit),
        (error) => {
          console.error(`[THREADMAP] Pending ${context} was rejected:`, error);
          notifyWriteObserver(observer.onReject, error);
          reportQueuedWrite(`${context} is still saved in this browser, but cloud sync needs attention.`, observer);
          if (isRetryableFirestoreError(error)
              && observer.userId
              && (observer.generation === undefined
                || isFirestoreDataContextCurrent(observer.userId, observer.generation))) {
            setTimeout(() => {
              void retryQueuedItemMutations(observer.userId!, { includeRejected: true });
            }, RETRY_BASE_MS);
          }
        },
      );
      reportQueuedWrite(`${context} is saved in this browser; cloud confirmation is still pending.`, observer);
      return 'pending';
    }

    if (!isRetryableFirestoreError(result.error) || attempt === MAX_RETRIES - 1) {
      if (observer.onReject) {
        notifyWriteObserver(observer.onReject, result.error);
        reportQueuedWrite(`${context} is saved in this browser, but cloud sync rejected it.`, observer);
        return 'rejected';
      }
      throw result.error;
    }
    await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
  }
  throw new Error(`${context} could not be queued.`);
}

// ═══════════════════════════════════════════════════════════
// Data Validation
// ═══════════════════════════════════════════════════════════

const VALID_TYPES = new Set(['task', 'project', 'habit', 'event', 'goal', 'note']);
const VALID_STATUSES = new Set<string>(['active', 'waiting', 'done', 'archived']);

function validateItem(item: Partial<OrbitItem>): boolean {
  if (!item.title || typeof item.title !== 'string') return false;
  if (item.type && !VALID_TYPES.has(item.type)) return false;
  if (item.status && !VALID_STATUSES.has(item.status)) return false;
  if (item.createdAt && typeof item.createdAt !== 'number') return false;
  if (item.updatedAt && typeof item.updatedAt !== 'number') return false;
  return true;
}

function sanitizeItem(item: OrbitItem): OrbitItem {
  // Preserve ALL existing fields — never strip unknown/future fields.
  // Only validate & default the required ones.
  const sanitized: Record<string, unknown> = {};

  // Copy every field from the source item
  for (const [key, value] of Object.entries(item)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  // Ensure required fields have valid defaults
  sanitized.id = item.id || crypto.randomUUID();
  sanitized.title = (item.title || '').trim() || 'Untitled';
  sanitized.type = VALID_TYPES.has(item.type) ? item.type : 'task';
  sanitized.status =
    (item.status as string) === 'inbox'
      ? 'active'
      : VALID_STATUSES.has(item.status)
        ? item.status
        : 'active';
  sanitized.createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
  sanitized.updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();
  sanitized.revision = Number.isSafeInteger(item.revision) && Number(item.revision) >= 0
    ? Number(item.revision)
    : 0;
  sanitized.userId = item.userId || 'demo-user';
  sanitized.tags = Array.isArray(item.tags) ? item.tags : [];
  sanitized.linkedIds = Array.isArray(item.linkedIds) ? item.linkedIds : [];

  return sanitized as unknown as OrbitItem;
}

function itemDocumentFields(item: OrbitItem): Record<string, unknown> {
  const fields = { ...item } as unknown as Record<string, unknown>;
  delete fields.id;
  return fields;
}

// ═══════════════════════════════════════════════════════════
// Local (Demo) Storage — Bulletproof
// ═══════════════════════════════════════════════════════════

function localItemsKey(userId: string): string {
  return scopedStorageKey(LOCAL_STORAGE_KEY, userId);
}

function loadLocalItems(userId: string): OrbitItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = localItemsKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[THREADMAP] Local data is unreadable; the original browser value was preserved for recovery.');
      return [];
    }
    // Sanitize each item to handle any schema drift
    return parsed.map(sanitizeItem);
  } catch (err) {
    console.warn('[THREADMAP] Failed to load local data; the original browser value was preserved:', err);
    return [];
  }
}

function saveLocalItems(userId: string, items: OrbitItem[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(items);
    const key = localItemsKey(userId);
    localStorage.setItem(key, serialized);
    // Verify write succeeded by reading back
    const verification = localStorage.getItem(key);
    if (verification !== serialized) {
      console.error('[THREADMAP] localStorage write verification failed');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[THREADMAP] Failed to save local data:', err);
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[THREADMAP] Storage quota exceeded; no user data was deleted.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
          detail: {
            message: 'Browser storage is full. Your change was rolled back—export your data or free space before retrying.',
          },
        }));
      }
    }
    return false;
  }
}

/**
 * Reconcile a finished mutation against its owner's scoped recovery cache.
 * Async Firestore/Google operations may settle after the user has switched
 * accounts; in that case the shared Zustand store belongs to the new account
 * and must never be read from or written to by the stale operation.
 */
function updateScopedItems(
  userId: string,
  mutator: (items: OrbitItem[]) => OrbitItem[],
  generation?: number,
): OrbitItem[] {
  const isStillActive = activeUserId === userId
    && (generation === undefined || activeDataGeneration === generation);
  const source = isStillActive
    ? useOrbitStore.getState().items
    : loadLocalItems(userId);
  const next = mutator([...source]);
  if (isStillActive) useOrbitStore.getState().setItems(next);
  saveLocalItems(userId, next);
  return next;
}

/** Optimistic update: immediately update Zustand, then persist. If persistence fails, rollback. */
function optimisticLocalUpdate(
  userId: string,
  mutator: (items: OrbitItem[]) => OrbitItem[],
  rollbackItems?: OrbitItem[]
): boolean {
  assertActiveAccount(userId);
  const oldItems = rollbackItems || loadLocalItems(userId);
  const newItems = mutator([...oldItems]);

  // Update store immediately (optimistic)
  useOrbitStore.getState().setItems(newItems);

  // Persist
  const saved = saveLocalItems(userId, newItems);
  if (!saved) {
    // Rollback on failure
    console.warn('[THREADMAP] Persistence failed — rolling back optimistic update');
    useOrbitStore.getState().setItems(oldItems);
    return false;
  }
  return true;
}

function mutationObserver(
  record: ItemMutationRecord,
  generation: number,
): QueueableWriteObserver {
  return {
    userId: record.userId,
    generation,
    onCommit: () => {
      removeItemMutation(record);
      warnedMutationIds.delete(record.id);
      if (isFirestoreDataContextCurrent(record.userId, generation)) {
        setTimeout(() => void retryQueuedItemMutations(record.userId), 0);
      }
    },
    onReject: (error) => rejectItemMutation(record, error),
  };
}

class ItemMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItemMutationConflictError';
  }
}

export class ItemRevisionConflictError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} changed on another device. Your browser copy was preserved for recovery.`);
    this.name = 'ItemRevisionConflictError';
  }
}

const itemMutationRetryQueue = new KeyedSerialQueue();
const warnedMutationIds = new Set<string>();

function reportMutationRecovery(record: ItemMutationRecord, message: string): void {
  if (warnedMutationIds.has(record.id)) return;
  warnedMutationIds.add(record.id);
  reportQueuedWrite(message, {
    userId: record.userId,
    generation: activeUserId === record.userId ? activeDataGeneration : undefined,
  });
}

async function replayItemMutation(record: ItemMutationRecord): Promise<void> {
  const generation = captureActiveDataContext(record.userId);
  const database = getDb();
  await runTransaction(database, async (transaction) => {
    assertActiveDataContext(record.userId, generation);
    const refs = record.patches.map((patch) => doc(database, ITEMS_COLLECTION, patch.itemId));
    const settingsRef = record.tagSettings
      ? doc(database, SETTINGS_COLLECTION, record.userId)
      : null;
    const [snapshots, settingsSnapshot] = await Promise.all([
      Promise.all(refs.map((ref) => transaction.get(ref))),
      settingsRef ? transaction.get(settingsRef) : Promise.resolve(null),
    ]);
    const requiredParentIds = [...new Set(record.patches
      .map((patch) => patch.fields.parentId)
      .filter((parentId): parentId is string => typeof parentId === 'string'))];
    const parentSnapshots = await Promise.all(requiredParentIds.map((parentId) =>
      transaction.get(doc(database, ITEMS_COLLECTION, parentId))
    ));
    parentSnapshots.forEach((snapshot, index) => {
      const childPatch = record.patches.find((patch) => patch.fields.parentId === requiredParentIds[index]);
      const childSnapshot = childPatch
        ? snapshots[record.patches.indexOf(childPatch)]
        : null;
      const childType = String(childPatch?.fields.type || childSnapshot?.data()?.type || '');
      if (!snapshot.exists()
          || snapshot.data().userId !== record.userId
          || snapshot.data().status === 'archived'
          || !getAllowedParentTypes(childType as OrbitItem['type']).includes(snapshot.data().type)) {
        throw new ItemMutationConflictError('The selected parent item no longer exists in this account.');
      }
    });
    const current = new Map<string, OrbitItem>();
    snapshots.forEach((snapshot) => {
      if (snapshot.exists()) {
        current.set(snapshot.id, sanitizeItem({ id: snapshot.id, ...snapshot.data() } as OrbitItem));
      }
    });
    const itemsAlreadyMatch = itemMutationMatches(record, current);
    if (record.tagSettings && settingsRef) {
      const targetRevision = Number(record.tagSettings.revision || 0);
      const settingsData = settingsSnapshot?.data();
      const remoteRevision = settingsSnapshot?.exists()
        ? Number(settingsData?.revision || 0)
        : 0;
      const remoteUpdatedAt = settingsSnapshot?.exists()
        ? Number(settingsData?.updatedAt || 0)
        : 0;
      const settingsAlreadyMatch = targetRevision > 0
        && remoteRevision === targetRevision
        && settingsData?.updatedAt === record.tagSettings.updatedAt
        && equalStringArrays(settingsData?.customTags, record.tagSettings.customTags)
        && equalStringArrays(settingsData?.removedDefaultTags, record.tagSettings.removedDefaultTags);
      if (itemsAlreadyMatch && settingsAlreadyMatch) return;
      if (!Number.isSafeInteger(record.tagSettings.baseRevision)
          || !Number.isSafeInteger(record.tagSettings.revision)
          || record.tagSettings.revision !== record.tagSettings.baseRevision! + 1
          || remoteRevision !== record.tagSettings.baseRevision
          || (record.tagSettings.baseRevision === 0
            && remoteUpdatedAt !== record.tagSettings.baseUpdatedAt)) {
        throw new ItemMutationConflictError('Tag definitions changed before this browser edit could sync.');
      }
      if (itemsAlreadyMatch) {
        transaction.set(settingsRef, {
          customTags: record.tagSettings.customTags,
          removedDefaultTags: record.tagSettings.removedDefaultTags,
          updatedAt: record.tagSettings.updatedAt,
          revision: record.tagSettings.revision,
        });
        return;
      }
    } else if (itemsAlreadyMatch) {
      return;
    }

    record.patches.forEach((patch, index) => {
      const snapshot = snapshots[index];
      if (patch.mode === 'create') {
        if (snapshot.exists()) {
          throw new ItemMutationConflictError('A different cloud item already uses this recovery record’s ID.');
        }
        if (patch.fields.userId !== record.userId) {
          throw new ItemMutationConflictError('The recovery record owner is invalid.');
        }
        return;
      }
      if (!snapshot.exists()) {
        throw new ItemMutationConflictError('The cloud item was deleted before this browser edit could sync.');
      }
      if (snapshot.data().userId !== record.userId) {
        throw new ItemMutationConflictError('The cloud item belongs to a different account.');
      }
      const remoteUpdatedAt = Number(snapshot.data().updatedAt || 0);
      const mutationUpdatedAt = Number(patch.fields.updatedAt || record.createdAt);
      const usesCommutativeTransform = Boolean(patch.arrayUnionFields || patch.arrayRemoveFields);
      const remoteRevision = Number(snapshot.data().revision || 0);
      if (!usesCommutativeTransform
          && patch.baseRevision !== undefined
          && remoteRevision !== patch.baseRevision) {
        throw new ItemMutationConflictError('A newer cloud revision superseded this browser edit.');
      }
      if (!usesCommutativeTransform
          && patch.baseRevision === 0
          && patch.baseUpdatedAt !== undefined
          && remoteUpdatedAt !== patch.baseUpdatedAt) {
        throw new ItemMutationConflictError('A legacy cloud item changed before this browser edit could sync.');
      }
      if (!usesCommutativeTransform && patch.baseRevision === undefined && remoteUpdatedAt > mutationUpdatedAt) {
        throw new ItemMutationConflictError('A newer cloud edit superseded this browser edit.');
      }
    });

    record.patches.forEach((patch, index) => {
      const payload: Record<string, unknown> = { ...patch.fields };
      for (const field of patch.deleteFields || []) payload[field] = deleteField();
      for (const [field, values] of Object.entries(patch.arrayUnionFields || {})) {
        payload[field] = arrayUnion(...values);
      }
      for (const [field, values] of Object.entries(patch.arrayRemoveFields || {})) {
        payload[field] = arrayRemove(...values);
      }
      if ((patch.arrayUnionFields || patch.arrayRemoveFields) && snapshots[index].exists()) {
        payload.updatedAt = Math.max(Date.now(), Number(snapshots[index].data().updatedAt || 0) + 1);
        payload.revision = Number(snapshots[index].data().revision || 0) + 1;
      }
      if (patch.mode === 'create') transaction.set(refs[index], payload);
      else transaction.update(refs[index], payload);
    });
    if (record.kind === 'tag' && record.tagSettings && settingsRef) {
      transaction.set(settingsRef, {
        customTags: record.tagSettings.customTags,
        removedDefaultTags: record.tagSettings.removedDefaultTags,
        updatedAt: record.tagSettings.updatedAt,
        revision: record.tagSettings.revision,
      });
    }
  });
}

/** Retry browser-verified item mutations without rebuilding account state. */
export function retryQueuedItemMutations(
  userId: string,
  options: { includeRejected?: boolean } = {},
): Promise<void> {
  if (!isFirebaseAvailable(userId)
      || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return Promise.resolve();
  }
  return itemMutationRetryQueue.run(userId, async () => {
    const generation = captureActiveDataContext(userId);
    const mutations = listItemMutations(userId)
      .filter((record) => record.state === 'pending' || options.includeRejected);
    const outstandingIds = new Set(listItemMutations(userId).map((record) => record.id));
    for (const record of mutations) {
      if (!isFirestoreDataContextCurrent(userId, generation)) return;
      const blockers = blockingItemMutationIds(record, outstandingIds);
      if (blockers.length > 0) {
        const blockingRecords = listItemMutations(userId)
          .filter((candidate) => blockers.includes(candidate.id));
        if (blockingRecords.some((candidate) => candidate.state === 'rejected')) {
          const error = new ItemMutationConflictError(
            'An earlier browser edit in this item’s revision chain could not be applied safely.',
          );
          rejectItemMutation(record, error);
          reportMutationRecovery(
            record,
            `${record.label} is blocked by an earlier conflicting edit and remains in this browser’s recovery data.`,
          );
        }
        continue;
      }
      try {
        await replayItemMutation(record);
        removeItemMutation(record);
        outstandingIds.delete(record.id);
        warnedMutationIds.delete(record.id);
      } catch (error) {
        if (error instanceof ItemMutationConflictError || !isRetryableFirestoreError(error)) {
          rejectItemMutation(record, error);
          reportMutationRecovery(
            record,
            `${record.label} remains in this browser’s recovery data because cloud sync could not apply it safely.`,
          );
        }
      }
    }
  });
}

function mergeQueuedItemMutations(
  userId: string,
  cloudItems: OrbitItem[],
  authoritative: boolean,
): OrbitItem[] {
  const merge = mergeItemMutationRecovery(cloudItems, listItemMutations(userId), authoritative);
  for (const confirmed of merge.confirmed) {
    try {
      removeItemMutation(confirmed);
      warnedMutationIds.delete(confirmed.id);
    } catch {
      // The verified-storage helper already reported the recovery-record issue.
    }
  }
  for (const record of merge.superseded) {
    try { rejectItemMutation(record, new ItemMutationConflictError('A newer cloud edit superseded this browser edit.')); } catch { /* reported elsewhere */ }
    reportMutationRecovery(
      record,
      `${record.label} conflicts with a newer cloud edit and remains available in this account’s export.`,
    );
  }
  if (authoritative && merge.recovered.some((record) => record.state === 'pending')) {
    void retryQueuedItemMutations(userId);
  }
  return merge.items;
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

export function subscribeToItems(
  userId: string,
  callback: (items: OrbitItem[], source: 'cloud' | 'local' | 'fallback' | 'pending') => void,
  onError?: (error: Error) => void
): () => void {
  const generation = captureActiveDataContext(userId);
  if (!isFirebaseAvailable(userId)) {
    // Local mode: load and listen to storage events from other tabs
    const items = loadLocalItems(userId);
    callback(items, 'local');

    const handler = (e: StorageEvent) => {
      if (!isFirestoreDataContextCurrent(userId, generation)) return;
      if (e.key === localItemsKey(userId)) {
        callback(loadLocalItems(userId), 'local');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  const q = query(
    collection(getDb(), ITEMS_COLLECTION),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  let unsubscribed = false;

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (unsubscribed || !isFirestoreDataContextCurrent(userId, generation)) return;
      const cloudItems: OrbitItem[] = [];
      snapshot.forEach((d) => {
        cloudItems.push(sanitizeItem({ id: d.id, ...d.data() } as OrbitItem));
      });

      const authoritative = !snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache;
      const items = mergeQueuedItemMutations(userId, cloudItems, authoritative);

      // Preserve both the cloud view and any independently journaled browser
      // mutation. A late rejected write must never be erased by a snapshot.
      if (!saveLocalItems(userId, items)) {
        reportQueuedWrite('The latest cloud snapshot could not be added to this browser’s recovery cache.', {
          userId,
          generation,
        });
      }

      callback(
        items,
        authoritative ? 'cloud' : 'pending',
      );
    },
    (error) => {
      if (unsubscribed || !isFirestoreDataContextCurrent(userId, generation)) return;
      console.error('[THREADMAP] Firestore subscription error:', error);
      onError?.(error);
      // Fallback: load from local cache backup
      const cached = loadLocalItems(userId);
      if (cached.length > 0) {
        console.warn('[THREADMAP] Using local cache as fallback (' + cached.length + ' items)');
        callback(cached, 'fallback');
      } else {
        // No cache available — still call callback so loading screen dismisses
        // and user sees an error state rather than infinite loading
        console.error('[THREADMAP] No local cache available — showing empty state');
        callback([], 'fallback');
      }
    }
  );

  return () => {
    unsubscribed = true;
    unsubscribe();
  };
}

export interface CreateItemOptions {
  /** Stable IDs make externally-sourced imports idempotent across tabs/devices. */
  id?: string;
}

export async function createItem(
  item: Omit<OrbitItem, 'id'>,
  options: CreateItemOptions = {},
): Promise<string> {
  const now = Date.now();
  const id = options.id || crypto.randomUUID();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
    throw new Error('Invalid item ID.');
  }
  const contextGeneration = captureActiveDataContext(item.userId);

  if (!validateItem(item as Partial<OrbitItem>)) {
    console.error('[THREADMAP] Invalid item data, creating with defaults');
  }

  const newItem = sanitizeItem({
    ...item,
    id,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  } as OrbitItem);
  if (newItem.parentId) {
    const parent = useOrbitStore.getState().items.find((candidate) => candidate.id === newItem.parentId);
    if (!parent
        || parent.userId !== item.userId
        || parent.id === id
        || parent.status === 'archived'
        || !getAllowedParentTypes(newItem.type).includes(parent.type)) {
      throw new Error('Cannot create an item with a missing or invalid parent.');
    }
  }
  const addWithoutDuplicate = (items: OrbitItem[]) => [
    newItem,
    ...items.filter((entry) => entry.id !== id),
  ];

  if (!isFirebaseAvailable(item.userId)) {
    const success = optimisticLocalUpdate(item.userId, addWithoutDuplicate);
    if (!success) {
      throw new Error('Failed to create item — storage error');
    }
    return id;
  }

  const previousItems = useOrbitStore.getState().items;
  const optimisticItems = addWithoutDuplicate(previousItems);
  useOrbitStore.getState().setItems(optimisticItems);
  if (!saveLocalItems(item.userId, optimisticItems)) {
    useOrbitStore.getState().setItems(previousItems);
    throw new Error('The item could not be saved in browser storage. Free space and try again.');
  }

  let mutation: ItemMutationRecord;
  try {
    mutation = enqueueItemMutation(item.userId, {
      kind: 'create',
      label: 'This new item',
      createdAt: now,
      recoveryItems: [newItem],
      patches: [{
        itemId: id,
        mode: 'create',
        fields: itemDocumentFields(newItem),
      }],
    });
  } catch (error) {
    useOrbitStore.getState().setItems(previousItems);
    saveLocalItems(item.userId, previousItems);
    throw error;
  }

  try {
    const itemRef = doc(getDb(), ITEMS_COLLECTION, id);
    const persistedItem = itemDocumentFields(newItem);
    let existingCanonical: OrbitItem | null = null;
    const observer = mutationObserver(mutation, contextGeneration);
    const adoptingObserver: QueueableWriteObserver = {
      ...observer,
      onCommit: () => {
        if (existingCanonical) {
          const canonical = existingCanonical;
          updateScopedItems(item.userId, (items) => [
            canonical,
            ...items.filter((entry) => entry.id !== id),
          ], contextGeneration);
        }
        observer.onCommit?.();
      },
    };
    await commitQueueableWrite(
      async () => {
        if (options.id) {
          await runTransaction(getDb(), async (transaction) => {
            const existing = await transaction.get(itemRef);
            if (existing.exists()) {
              if (existing.data().userId !== item.userId) {
                throw new Error('The stable item ID is already owned by another account.');
              }
              // Deterministic imports are create-if-absent. A concurrent tab or
              // device may already have created the canonical document; never
              // overwrite its newer edits with an import race. Adopt that
              // canonical copy into both Zustand and the scoped recovery cache.
              existingCanonical = sanitizeItem({ id: existing.id, ...existing.data() } as OrbitItem);
              return;
            }
            transaction.set(itemRef, persistedItem);
          });
          return;
        }
        await setDoc(itemRef, persistedItem);
      },
      'This new item',
      adoptingObserver,
    );
    return id;
  } catch (error) {
    rejectItemMutation(mutation, error);
    reportMutationRecovery(mutation, 'This new item remains in this browser’s recovery data because cloud sync failed.');
    return id;
  }
}

export async function updateItem(
  id: string,
  updates: Partial<OrbitItem>,
  options: { expectedRevision?: number; expectedUpdatedAt?: number } = {},
): Promise<QueueableWriteOutcome> {
  if (updates.id && updates.id !== id) throw new Error('Cannot change an item ID.');
  const existingItem = useOrbitStore.getState().items.find((i) => i.id === id);
  const ownerId = existingItem?.userId || updates.userId || activeUserId;
  if (!ownerId) throw new Error('Cannot update an item without an active owner.');
  assertActiveAccount(ownerId);
  if (updates.userId && updates.userId !== ownerId) {
    throw new Error('Cannot transfer an item to another account.');
  }
  const safeUpdates = { ...updates };
  delete safeUpdates.id;
  delete safeUpdates.revision;

  return itemUpdateQueue.run(`${ownerId}:${id}`, () =>
    updateItemUnqueued(id, safeUpdates, ownerId, options)
  );
}

async function updateItemUnqueued(
  id: string,
  updates: Partial<OrbitItem>,
  ownerId: string,
  options: { expectedRevision?: number; expectedUpdatedAt?: number },
): Promise<QueueableWriteOutcome> {
  // A queued save may start after an account transition. Reject it instead of
  // allowing a stale mutation to reach local storage or Firestore.
  const contextGeneration = captureActiveDataContext(ownerId);
  const now = Date.now();
  const existingItem = useOrbitStore.getState().items.find((i) => i.id === id);
  if (!existingItem) throw new Error(`Item ${id} was not found.`);
  const parentFieldSpecified = Object.prototype.hasOwnProperty.call(updates, 'parentId');
  const effectiveParentId = parentFieldSpecified ? updates.parentId : existingItem.parentId;
  if (typeof effectiveParentId === 'string') {
    const parent = useOrbitStore.getState().items.find((candidate) => candidate.id === effectiveParentId);
    const nextType = updates.type || existingItem.type;
    if (!parent
        || parent.userId !== ownerId
        || parent.id === id
        || parent.status === 'archived'
        || !getAllowedParentTypes(nextType).includes(parent.type)) {
      throw new Error('Cannot set a missing or invalid parent item.');
    }
  }
  const currentRevision = Number(existingItem.revision || 0);
  const baseRevision = options.expectedRevision ?? currentRevision;
  const baseUpdatedAt = options.expectedUpdatedAt ?? existingItem.updatedAt;
  const hasConfirmedBaseLineage = options.expectedRevision !== undefined
    && itemMutationLineageCovers(
      listItemMutations(ownerId),
      id,
      baseRevision,
      currentRevision,
      baseUpdatedAt,
    );
  if ((currentRevision !== baseRevision && !hasConfirmedBaseLineage)
      || (currentRevision === baseRevision
        && baseRevision === 0
        && existingItem.updatedAt !== baseUpdatedAt)) {
    throw new ItemRevisionConflictError(id);
  }
  const mutationBaseRevision = currentRevision;
  const mutationBaseUpdatedAt = existingItem.updatedAt;
  const nextRevision = mutationBaseRevision + 1;

  if (!isFirebaseAvailable(ownerId)) {
    const success = optimisticLocalUpdate(ownerId, (items) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) {
        throw new Error(`Item ${id} was not found.`);
      }
      items[idx] = { ...items[idx], ...updates, updatedAt: now, revision: nextRevision };
      return items;
    });
    if (!success) {
      throw new Error('Failed to update item — storage error');
    }
    return 'committed';
  }

  // Optimistic: update store immediately
  const previousItem = existingItem;
  const optimisticItems = useOrbitStore.getState().items.map((i) =>
    i.id === id ? { ...i, ...updates, updatedAt: now, revision: nextRevision } : i
  );
  const optimisticItem = optimisticItems.find((item) => item.id === id);
  if (!optimisticItem) throw new Error(`Item ${id} was not found.`);
  useOrbitStore.getState().setItems(optimisticItems);
  if (!saveLocalItems(ownerId, optimisticItems)) {
    useOrbitStore.getState().setItems(previousItem
      ? optimisticItems.map((item) => item.id === id ? previousItem : item)
      : optimisticItems);
    throw new Error('The change could not be saved in browser storage. Free space and try again.');
  }

  const patchFields: Record<string, unknown> = { updatedAt: now, revision: nextRevision };
  const deleteFields: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue;
    if (value === undefined) deleteFields.push(key);
    else patchFields[key] = value;
  }
  let mutation: ItemMutationRecord;
  try {
    mutation = enqueueItemMutation(ownerId, {
      kind: 'update',
      label: 'This item change',
      createdAt: now,
      recoveryItems: [optimisticItem],
      patches: [{
        itemId: id,
        mode: 'update',
        baseRevision: mutationBaseRevision,
        baseUpdatedAt: mutationBaseUpdatedAt,
        fields: patchFields,
        deleteFields,
      }],
    });
  } catch (error) {
    useOrbitStore.getState().setItems(previousItem
      ? optimisticItems.map((item) => item.id === id ? previousItem : item)
      : optimisticItems);
    if (previousItem) {
      saveLocalItems(ownerId, optimisticItems.map((item) => item.id === id ? previousItem : item));
    }
    throw error;
  }

  if (mutation.dependsOnMutationIds?.length) {
    reportQueuedWrite(
      'This item change is saved in this browser and will sync after its earlier edit is confirmed.',
      { userId: ownerId, generation: contextGeneration },
    );
    return 'pending';
  }

  try {
    let rejectedError: unknown;
    const observer = mutationObserver(mutation, contextGeneration);
    const outcome = await commitQueueableWrite(async () => {
      const ref = doc(getDb(), ITEMS_COLLECTION, id);
      await runTransaction(getDb(), async (transaction) => {
        const parentRef = typeof effectiveParentId === 'string'
          ? doc(getDb(), ITEMS_COLLECTION, effectiveParentId)
          : null;
        const [snapshot, parentSnapshot] = await Promise.all([
          transaction.get(ref),
          parentRef ? transaction.get(parentRef) : Promise.resolve(null),
        ]);
        if (!snapshot.exists() || snapshot.data().userId !== ownerId) {
          throw new ItemRevisionConflictError(id);
        }
        const nextType = updates.type || snapshot.data().type;
        if (parentRef && (!parentSnapshot?.exists()
            || parentSnapshot.data().userId !== ownerId
            || parentSnapshot.data().status === 'archived'
            || !getAllowedParentTypes(nextType).includes(parentSnapshot.data().type))) {
          throw new ItemRevisionConflictError(id);
        }
        const currentRevision = Number(snapshot.data().revision || 0);
        if (currentRevision !== mutationBaseRevision
            || (mutationBaseRevision === 0
              && Number(snapshot.data().updatedAt || 0) !== mutationBaseUpdatedAt)) {
          throw new ItemRevisionConflictError(id);
        }

        const firestoreUpdates: Record<string, unknown> = {
          updatedAt: now,
          revision: nextRevision,
        };
        for (const [key, value] of Object.entries(updates)) {
          if (key === 'id' || key === 'revision') continue;
          firestoreUpdates[key] = value === undefined ? deleteField() : value;
        }
        transaction.update(ref, firestoreUpdates);
      });
    }, 'This item change', {
      ...observer,
      onReject: (error) => {
        rejectedError = error;
        observer.onReject?.(error);
      },
    });
    if (outcome === 'rejected' && rejectedError instanceof ItemRevisionConflictError) {
      throw rejectedError;
    }
    return outcome;
  } catch (err) {
    rejectItemMutation(mutation, err);
    reportMutationRecovery(mutation, 'This item change remains in this browser’s recovery data because cloud sync failed.');
    if (err instanceof ItemRevisionConflictError) throw err;
    return 'rejected';
  }
}

export async function deleteItem(
  id: string,
  options: { skipCalendar?: boolean } = {}
): Promise<void> {
  const existingItem = useOrbitStore.getState().items.find((i) => i.id === id);
  const ownerId = existingItem?.userId || activeUserId;
  if (!ownerId) throw new Error('Cannot delete an item without an active owner.');
  if (!existingItem || existingItem.userId !== ownerId) {
    throw new Error('Cannot delete an item that is missing from this account.');
  }
  const contextGeneration = captureActiveDataContext(ownerId);
  const now = Date.now();
  const cascade = (items: OrbitItem[]) => items
    .filter((item) => item.id !== id)
    .map((item) => {
      const linkedIds = (item.linkedIds || []).filter((linkedId) => linkedId !== id);
      const hadLink = linkedIds.length !== (item.linkedIds || []).length;
      const wasChild = item.parentId === id;
      if (!hadLink && !wasChild) return item;
      return {
        ...item,
        ...(hadLink ? { linkedIds } : {}),
        ...(wasChild ? { parentId: undefined } : {}),
        updatedAt: now,
        revision: Number(item.revision || 0) + 1,
      };
    });

  if (!isFirebaseAvailable(ownerId)) {
    const success = optimisticLocalUpdate(ownerId, cascade);
    if (!success) {
      throw new Error('Failed to delete item — storage error');
    }
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Deletion needs an internet connection so Threadmap can confirm it safely.');
  }

  // Delete the external copy first. If Google rejects the request, preserve the
  // Threadmap item and its mapping so the next inbound sync cannot recreate a
  // supposedly deleted event after its local tombstone has disappeared.
  let calendarDeleted = false;
  if (existingItem?.googleCalendarId && !options.skipCalendar) {
    try {
      const { deleteGoogleEvent } = await import('./google-calendar');
      await deleteGoogleEvent(existingItem.googleCalendarId);
      calendarDeleted = true;
    } catch (error) {
      const message = 'This event was not deleted because Google Calendar could not confirm removal. Reconnect Google Calendar and retry.';
      console.warn(`[THREADMAP] ${message}`, error);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadmap:sync-warning', { detail: { message } }));
      }
      throw new Error(message, { cause: error });
    }
  }

  // An account transition may occur while Google is responding. Never apply
  // the remainder of account A's deletion to account B's live store.
  if (!isFirestoreDataContextCurrent(ownerId, contextGeneration)) {
    if (calendarDeleted && existingItem) {
      updateScopedItems(ownerId, (items) => items.map((item) =>
        item.id === id
          ? { ...item, googleCalendarId: undefined, calendarSynced: false }
          : item
      ), contextGeneration);
    }
    throw new Error('The active account changed before this deletion completed. Please retry from the original account.');
  }

  // Optimistically remove the item and clean all in-browser references.
  const prevItems = useOrbitStore.getState().items;
  const affectedBefore = new Map(
    prevItems
      .filter((item) => item.id === id || item.parentId === id || item.linkedIds?.includes(id))
      .map((item) => [item.id, item])
  );
  const optimisticItems = cascade(prevItems);
  useOrbitStore.getState().setItems(optimisticItems);
  if (!saveLocalItems(ownerId, optimisticItems)) {
    useOrbitStore.getState().setItems(prevItems);
    if (calendarDeleted && existingItem) {
      try {
        await updateItem(id, { googleCalendarId: undefined, calendarSynced: false });
      } catch { /* the original browser-storage failure remains authoritative */ }
    }
    throw new Error('The deletion could not be saved in browser storage.');
  }

  try {
    if (!cloudFunctions) throw new Error('Cloud item deletion is unavailable.');
    const deleteCallable = httpsCallable<
      {
        userId: string;
        itemId: string;
        expectedRevision: number;
        expectedUpdatedAt: number;
        calendarDeleted: boolean;
        expectedGoogleCalendarId: string | null;
      },
      {
        success: boolean;
        cleanupPending: boolean;
        conflict?: boolean;
        calendarDetached?: boolean;
      }
    >(cloudFunctions, 'deleteThreadmapItem');
    await withRetry(async () => {
      const result = await deleteCallable({
        userId: ownerId,
        itemId: id,
        expectedRevision: Number(existingItem.revision || 0),
        expectedUpdatedAt: existingItem.updatedAt,
        calendarDeleted,
        expectedGoogleCalendarId: existingItem.googleCalendarId || null,
      });
      if (result.data.conflict) throw new ItemRevisionConflictError(id);
      if (!result.data.success) throw new Error('Item deletion did not complete.');
      if (result.data.cleanupPending) {
        console.warn('[THREADMAP] Attachment cleanup is queued for retry.');
      }
    }, 'deleteItem');
  } catch (err) {
    // Restore only participants that still carry this mutation's version.
    console.warn('[THREADMAP] Rolling back delete for', id);
    updateScopedItems(ownerId, (current) => {
      const restored = current.map((item) => {
        const original = affectedBefore.get(item.id);
        return original && item.updatedAt === now ? original : item;
      });
      if (existingItem && !restored.some((item) => item.id === id)) {
        restored.unshift(existingItem);
      }
      return restored;
    }, contextGeneration);
    if (err instanceof ItemRevisionConflictError
        && isFirestoreDataContextCurrent(ownerId, contextGeneration)) {
      try {
        const currentSnapshot = await getDoc(doc(getDb(), ITEMS_COLLECTION, id));
        if (currentSnapshot.exists() && currentSnapshot.data().userId === ownerId) {
          const currentItem = sanitizeItem({ id, ...currentSnapshot.data() } as OrbitItem);
          updateScopedItems(ownerId, (items) => [
            currentItem,
            ...items.filter((item) => item.id !== id),
          ], contextGeneration);
        }
      } catch (refreshError) {
        console.warn('[THREADMAP] Could not refresh the item after a deletion conflict:', refreshError);
      }
    }
    if (calendarDeleted && existingItem && !(err instanceof ItemRevisionConflictError)) {
      // Google no longer has the event. Detach the restored local record so a
      // failed Threadmap deletion cannot leave a stale external mapping.
      if (isFirestoreDataContextCurrent(ownerId, contextGeneration)) {
        try {
          await updateItem(id, {
            googleCalendarId: undefined,
            calendarSynced: false,
          });
        } catch (detachError) {
          console.warn('[THREADMAP] The restored item could not be detached from its deleted Google event:', detachError);
        }
      } else {
        updateScopedItems(ownerId, (items) => items.map((item) =>
          item.id === id
            ? { ...item, googleCalendarId: undefined, calendarSynced: false }
            : item
        ), contextGeneration);
      }
    }
    throw err;
  }
}

export async function getItem(id: string): Promise<OrbitItem | null> {
  const ownerId = activeUserId;
  if (!ownerId) return null;
  const localItem = useOrbitStore.getState().items.find((i) => i.id === id)
    || loadLocalItems(ownerId).find((i) => i.id === id)
    || null;

  if (!isFirebaseAvailable(ownerId)) {
    return localItem?.userId === ownerId ? localItem : null;
  }

  const result = await withRetry(async () => {
    const snap = await getDoc(doc(getDb(), ITEMS_COLLECTION, id));
    if (!snap.exists()) return null;
    return sanitizeItem({ id: snap.id, ...snap.data() } as OrbitItem);
  }, 'getItem');
  assertActiveAccount(ownerId);
  return result?.userId === ownerId ? result : null;
}

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Link/Unlink — Bidirectional with Atomic Writes
// ═══════════════════════════════════════════════════════════

export async function linkItems(
  itemAId: string,
  itemBId: string
): Promise<void> {
  if (itemAId === itemBId) throw new Error('An item cannot link to itself.');
  const now = Date.now();
  const currentItems = useOrbitStore.getState().items;
  const localA = currentItems.find((item) => item.id === itemAId);
  const localB = currentItems.find((item) => item.id === itemBId);
  const localUserId = localA?.userId || localB?.userId || activeUserId;
  if (!localUserId) throw new Error('Cannot link items without an active owner.');
  const contextGeneration = captureActiveDataContext(localUserId);
  if (!localA || !localB) throw new Error('Cannot link missing items.');
  if (localA.userId !== localUserId || localB.userId !== localUserId) {
    throw new Error('Cannot link items owned by another account.');
  }

  if (!isFirebaseAvailable(localUserId)) {
    const success = optimisticLocalUpdate(localUserId, (items) => {
      const a = items.find((i) => i.id === itemAId);
      const b = items.find((i) => i.id === itemBId);
      if (!a || !b) throw new Error('Cannot link missing items.');
      const linkedA = new Set(a.linkedIds || []);
      const linkedB = new Set(b.linkedIds || []);
      linkedA.add(itemBId);
      linkedB.add(itemAId);
      a.linkedIds = Array.from(linkedA);
      b.linkedIds = Array.from(linkedB);
      a.updatedAt = now;
      b.updatedAt = now;
      a.revision = Number(a.revision || 0) + 1;
      b.revision = Number(b.revision || 0) + 1;
      return items;
    });
    if (!success) throw new Error('Failed to link items — storage error.');
    return;
  }

  const linkedA = [...new Set([...(localA.linkedIds || []), itemBId])];
  const linkedB = [...new Set([...(localB.linkedIds || []), itemAId])];
  const nextRevisionA = Number(localA.revision || 0) + 1;
  const nextRevisionB = Number(localB.revision || 0) + 1;
  const optimisticItems = currentItems.map((item) => {
    if (item.id === itemAId) return { ...item, linkedIds: linkedA, updatedAt: now, revision: nextRevisionA };
    if (item.id === itemBId) return { ...item, linkedIds: linkedB, updatedAt: now, revision: nextRevisionB };
    return item;
  });
  useOrbitStore.getState().setItems(optimisticItems);
  if (!saveLocalItems(localUserId, optimisticItems)) {
    useOrbitStore.getState().setItems(currentItems);
    throw new Error('The link could not be saved in browser storage.');
  }

  const recoveryA = optimisticItems.find((item) => item.id === itemAId)!;
  const recoveryB = optimisticItems.find((item) => item.id === itemBId)!;
  let mutation: ItemMutationRecord;
  try {
    mutation = enqueueItemMutation(localUserId, {
      kind: 'link',
      label: 'This item link',
      createdAt: now,
      recoveryItems: [recoveryA, recoveryB],
      patches: [
        {
          itemId: itemAId,
          mode: 'update',
          baseRevision: Number(localA.revision || 0),
          baseUpdatedAt: localA.updatedAt,
          fields: { updatedAt: now, revision: nextRevisionA },
          arrayUnionFields: { linkedIds: [itemBId] },
        },
        {
          itemId: itemBId,
          mode: 'update',
          baseRevision: Number(localB.revision || 0),
          baseUpdatedAt: localB.updatedAt,
          fields: { updatedAt: now, revision: nextRevisionB },
          arrayUnionFields: { linkedIds: [itemAId] },
        },
      ],
    });
  } catch (error) {
    useOrbitStore.getState().setItems(currentItems);
    saveLocalItems(localUserId, currentItems);
    throw error;
  }

  if (mutation.dependsOnMutationIds?.length) {
    reportQueuedWrite(
      'This item link is saved in this browser and will sync after earlier edits are confirmed.',
      { userId: localUserId, generation: contextGeneration },
    );
    return;
  }

  try {
    await commitQueueableWrite(async () => {
      const database = getDb();
      const refA = doc(database, ITEMS_COLLECTION, itemAId);
      const refB = doc(database, ITEMS_COLLECTION, itemBId);
      await runTransaction(database, async (transaction) => {
        const [snapshotA, snapshotB] = await Promise.all([
          transaction.get(refA),
          transaction.get(refB),
        ]);
        if (!snapshotA.exists() || !snapshotB.exists()
            || snapshotA.data().userId !== localUserId
            || snapshotB.data().userId !== localUserId) {
          throw new ItemRevisionConflictError(!snapshotA.exists() ? itemAId : itemBId);
        }
        transaction.update(refA, {
          linkedIds: arrayUnion(itemBId),
          updatedAt: now,
          revision: Number(snapshotA.data().revision || 0) + 1,
        });
        transaction.update(refB, {
          linkedIds: arrayUnion(itemAId),
          updatedAt: now,
          revision: Number(snapshotB.data().revision || 0) + 1,
        });
      });
    }, 'This item link', mutationObserver(mutation, contextGeneration));
  } catch (error) {
    rejectItemMutation(mutation, error);
    reportMutationRecovery(mutation, 'This item link remains in this browser’s recovery data because cloud sync failed.');
  }
}

export async function unlinkItems(
  itemAId: string,
  itemBId: string
): Promise<void> {
  if (itemAId === itemBId) throw new Error('An item cannot unlink from itself.');
  const now = Date.now();
  const currentItems = useOrbitStore.getState().items;
  const localA = currentItems.find((item) => item.id === itemAId);
  const localB = currentItems.find((item) => item.id === itemBId);
  const localUserId = localA?.userId || localB?.userId || activeUserId;
  if (!localUserId) throw new Error('Cannot unlink items without an active owner.');
  const contextGeneration = captureActiveDataContext(localUserId);
  if (!localA || !localB) throw new Error('Cannot unlink missing items.');
  if (localA.userId !== localUserId || localB.userId !== localUserId) {
    throw new Error('Cannot unlink items owned by another account.');
  }

  if (!isFirebaseAvailable(localUserId)) {
    const success = optimisticLocalUpdate(localUserId, (items) => {
      const a = items.find((i) => i.id === itemAId);
      const b = items.find((i) => i.id === itemBId);
      if (!a || !b) throw new Error('Cannot unlink missing items.');
      const linkedA = new Set(a.linkedIds || []);
      const linkedB = new Set(b.linkedIds || []);
      linkedA.delete(itemBId);
      linkedB.delete(itemAId);
      a.linkedIds = Array.from(linkedA);
      b.linkedIds = Array.from(linkedB);
      a.updatedAt = now;
      b.updatedAt = now;
      a.revision = Number(a.revision || 0) + 1;
      b.revision = Number(b.revision || 0) + 1;
      return items;
    });
    if (!success) throw new Error('Failed to unlink items — storage error.');
    return;
  }

  const linkedA = (localA.linkedIds || []).filter((id) => id !== itemBId);
  const linkedB = (localB.linkedIds || []).filter((id) => id !== itemAId);
  const nextRevisionA = Number(localA.revision || 0) + 1;
  const nextRevisionB = Number(localB.revision || 0) + 1;
  const optimisticItems = currentItems.map((item) => {
    if (item.id === itemAId) return { ...item, linkedIds: linkedA, updatedAt: now, revision: nextRevisionA };
    if (item.id === itemBId) return { ...item, linkedIds: linkedB, updatedAt: now, revision: nextRevisionB };
    return item;
  });
  useOrbitStore.getState().setItems(optimisticItems);
  if (!saveLocalItems(localUserId, optimisticItems)) {
    useOrbitStore.getState().setItems(currentItems);
    throw new Error('The link change could not be saved in browser storage.');
  }

  const recoveryA = optimisticItems.find((item) => item.id === itemAId)!;
  const recoveryB = optimisticItems.find((item) => item.id === itemBId)!;
  let mutation: ItemMutationRecord;
  try {
    mutation = enqueueItemMutation(localUserId, {
      kind: 'unlink',
      label: 'This item link change',
      createdAt: now,
      recoveryItems: [recoveryA, recoveryB],
      patches: [
        {
          itemId: itemAId,
          mode: 'update',
          baseRevision: Number(localA.revision || 0),
          baseUpdatedAt: localA.updatedAt,
          fields: { updatedAt: now, revision: nextRevisionA },
          arrayRemoveFields: { linkedIds: [itemBId] },
        },
        {
          itemId: itemBId,
          mode: 'update',
          baseRevision: Number(localB.revision || 0),
          baseUpdatedAt: localB.updatedAt,
          fields: { updatedAt: now, revision: nextRevisionB },
          arrayRemoveFields: { linkedIds: [itemAId] },
        },
      ],
    });
  } catch (error) {
    useOrbitStore.getState().setItems(currentItems);
    saveLocalItems(localUserId, currentItems);
    throw error;
  }

  if (mutation.dependsOnMutationIds?.length) {
    reportQueuedWrite(
      'This item link change is saved in this browser and will sync after earlier edits are confirmed.',
      { userId: localUserId, generation: contextGeneration },
    );
    return;
  }

  try {
    await commitQueueableWrite(async () => {
      const database = getDb();
      const refA = doc(database, ITEMS_COLLECTION, itemAId);
      const refB = doc(database, ITEMS_COLLECTION, itemBId);
      await runTransaction(database, async (transaction) => {
        const [snapshotA, snapshotB] = await Promise.all([
          transaction.get(refA),
          transaction.get(refB),
        ]);
        if (!snapshotA.exists() || !snapshotB.exists()
            || snapshotA.data().userId !== localUserId
            || snapshotB.data().userId !== localUserId) {
          throw new ItemRevisionConflictError(!snapshotA.exists() ? itemAId : itemBId);
        }
        transaction.update(refA, {
          linkedIds: arrayRemove(itemBId),
          updatedAt: now,
          revision: Number(snapshotA.data().revision || 0) + 1,
        });
        transaction.update(refB, {
          linkedIds: arrayRemove(itemAId),
          updatedAt: now,
          revision: Number(snapshotB.data().revision || 0) + 1,
        });
      });
    }, 'This item link change', mutationObserver(mutation, contextGeneration));
  } catch (error) {
    rejectItemMutation(mutation, error);
    reportMutationRecovery(mutation, 'This item link change remains in this browser’s recovery data because cloud sync failed.');
  }
}

// ═══════════════════════════════════════════════════════════
// User Settings (tags/areas cloud sync)
// ═══════════════════════════════════════════════════════════

const SETTINGS_COLLECTION = 'userSettings';
const LOCAL_SETTINGS_KEY = 'orbit-user-settings';

function localSettingsKey(userId: string): string {
  return scopedStorageKey(LOCAL_SETTINGS_KEY, userId);
}

export interface UserSettings {
  customTags: string[];
  removedDefaultTags: string[];
  updatedAt: number;
  revision: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  customTags: [],
  removedDefaultTags: [],
  updatedAt: 0,
  revision: 0,
};

export interface UserSettingsBase {
  revision: number;
  updatedAt: number;
}

export interface UserSettingsSaveResult {
  outcome: QueueableWriteOutcome;
  saved: UserSettings;
}

export class UserSettingsRevisionConflictError extends Error {
  constructor() {
    super('Tag definitions changed on another device. This browser copy was preserved for recovery.');
    this.name = 'UserSettingsRevisionConflictError';
  }
}

/**
 * Subscribe to user settings (tags/areas) from Firestore.
 * Returns unsubscribe function.
 *
 * On first load, if no Firestore doc exists, seeds the cloud with
 * the user's current local tags (from Zustand/localStorage).
 */
export function subscribeToUserSettings(
  userId: string,
  callback: (settings: UserSettings, authoritative: boolean) => void,
  options: { getInitialData?: () => Omit<UserSettings, 'updatedAt' | 'revision'> } = {},
): () => void {
  assertActiveAccount(userId);
  if (!isFirebaseAvailable(userId)) {
    // Local mode: load from localStorage
    const key = localSettingsKey(userId);
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        callback(JSON.parse(stored), true);
      } catch {
        // Don't reset — keep whatever is in the store
      }
    }
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try { callback(JSON.parse(e.newValue), true); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  const docRef = doc(getDb(), SETTINGS_COLLECTION, userId);
  let seedAttempted = false;
  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserSettings;
        callback({
          customTags: data.customTags || [],
          removedDefaultTags: data.removedDefaultTags || [],
          updatedAt: data.updatedAt || 0,
          revision: Number.isSafeInteger(data.revision) ? Number(data.revision) : 0,
        }, !snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache);
      } else {
        const initial = options.getInitialData?.();
        const value = initial ? { ...initial, updatedAt: 0, revision: 0 } : DEFAULT_SETTINGS;
        callback(value, !snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache);
        if (!snapshot.metadata.fromCache && initial && !seedAttempted) {
          seedAttempted = true;
          void saveUserSettings(userId, initial, { revision: 0, updatedAt: 0 }).catch((error) => {
            console.error('[THREADMAP] Failed to seed account tags:', error);
            reportQueuedWrite('Tag settings are saved in this browser, but their first cloud sync did not finish.');
          });
        }
      }
    },
    (error) => {
      console.error('[THREADMAP] User settings subscription error:', error);
      // Don't reset — just keep whatever is in the store
    }
  );

  return unsubscribe;
}

/**
 * Save user settings (tags/areas) to Firestore.
 */
export async function saveUserSettings(
  userId: string,
  settings: Omit<UserSettings, 'updatedAt' | 'revision'>,
  base: UserSettingsBase,
): Promise<UserSettingsSaveResult> {
  assertActiveAccount(userId);
  const data: UserSettings = {
    ...settings,
    updatedAt: Date.now(),
    revision: base.revision + 1,
  };

  const serialized = JSON.stringify(data);
  if (!isFirebaseAvailable(userId)) {
    writeLocalStorageVerified(localSettingsKey(userId), serialized);
    return { outcome: 'committed', saved: data };
  }

  // The verified browser copy is the recovery source if the conditional cloud
  // update is rejected or remains offline.
  writeLocalStorageVerified(localSettingsKey(userId), serialized);

  const outcome = await commitQueueableWrite(async () => {
    const docRef = doc(getDb(), SETTINGS_COLLECTION, userId);
    await runTransaction(getDb(), async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const remoteRevision = snapshot.exists() ? Number(snapshot.data().revision || 0) : 0;
      const remoteUpdatedAt = snapshot.exists() ? Number(snapshot.data().updatedAt || 0) : 0;
      if (remoteRevision !== base.revision
          || (base.revision === 0 && remoteUpdatedAt !== base.updatedAt)) {
        throw new UserSettingsRevisionConflictError();
      }
      transaction.set(docRef, data);
    });
  }, 'Tag settings');
  return { outcome, saved: data };
}

/** Persist tag definitions and all item tag edits produced by rename/remove. */
export async function saveTagMutation(
  userId: string,
  settings: Omit<UserSettings, 'updatedAt' | 'revision'>,
  affectedItems: Array<Pick<OrbitItem, 'id' | 'tags'>>,
  settingsBase: UserSettingsBase,
): Promise<UserSettingsSaveResult> {
  const contextGeneration = captureActiveDataContext(userId);
  const updatedAt = Date.now();
  const settingsData: UserSettings = {
    ...settings,
    updatedAt,
    revision: settingsBase.revision + 1,
  };
  const tagsById = new Map(affectedItems.map((item) => [item.id, item.tags || []]));
  const previousLocal = loadLocalItems(userId);
  const previousById = new Map(previousLocal.map((item) => [item.id, item]));
  const updatedLocal = previousLocal.map((item) =>
    tagsById.has(item.id)
      ? {
          ...item,
          tags: tagsById.get(item.id)!,
          updatedAt,
          revision: Number(item.revision || 0) + 1,
        }
      : item
  );

  const updateLocalCopies = (): void => {
    writeLocalStorageVerified(localSettingsKey(userId), JSON.stringify(settingsData));
    if (!saveLocalItems(userId, updatedLocal)) {
      throw new Error('Browser storage write verification failed.');
    }
  };

  if (!isFirebaseAvailable(userId)) {
    updateLocalCopies();
    return { outcome: 'committed', saved: settingsData };
  }

  const chunks: Array<Array<Pick<OrbitItem, 'id' | 'tags'>>> = [];
  for (let index = 0; index < affectedItems.length; index += 498) {
    chunks.push(affectedItems.slice(index, index + 498));
  }
  if (chunks.length === 0) chunks.push([]);

  const mutations: ItemMutationRecord[] = [];
  const tagChainDependencies: string[] = [];
  try {
    for (const chunk of chunks) {
      if (chunk.length === 0) continue;
      const ids = new Set(chunk.map((item) => item.id));
      const recoveryItems = updatedLocal.filter((item) => ids.has(item.id));
      if (recoveryItems.length !== ids.size) {
        throw new Error('A tagged item is missing from this browser’s recovery cache.');
      }
      const isLastChunk = chunks.indexOf(chunk) === chunks.length - 1;
      const mutation = enqueueItemMutation(userId, {
        kind: 'tag',
        label: 'This tag change',
        createdAt: updatedAt,
        recoveryItems,
        patches: chunk.map((item) => ({
          itemId: item.id,
          mode: 'update' as const,
          baseRevision: Number(previousById.get(item.id)?.revision || 0),
          baseUpdatedAt: previousById.get(item.id)?.updatedAt,
          fields: {
            tags: item.tags || [],
            updatedAt,
            revision: Number(previousById.get(item.id)?.revision || 0) + 1,
          },
        })),
        dependsOnMutationIds: tagChainDependencies,
        ...(isLastChunk ? {
          tagSettings: {
            ...settingsData,
            baseRevision: settingsBase.revision,
            baseUpdatedAt: settingsBase.updatedAt,
          },
        } : {}),
      });
      mutations.push(mutation);
      tagChainDependencies.push(mutation.id);
    }
    updateLocalCopies();
    const revisions = new Map(updatedLocal
      .filter((item) => tagsById.has(item.id))
      .map((item) => [item.id, item]));
    useOrbitStore.getState().setItems(useOrbitStore.getState().items.map((item) => {
      const updated = revisions.get(item.id);
      return updated
        ? { ...item, updatedAt: updated.updatedAt, revision: updated.revision }
        : item;
    }));
  } catch (error) {
    for (const mutation of mutations) {
      try { removeItemMutation(mutation); } catch { /* verified-storage reports this */ }
    }
    throw error;
  }

  const currentMutationIds = new Set(mutations.map((mutation) => mutation.id));
  const hasExternalDependency = mutations.some((mutation) =>
    mutation.dependsOnMutationIds?.some((dependencyId) => !currentMutationIds.has(dependencyId))
  );
  if (hasExternalDependency) {
    reportQueuedWrite(
      'This tag change is saved in this browser and will sync after earlier item edits are confirmed.',
      { userId, generation: contextGeneration },
    );
    return { outcome: 'pending', saved: settingsData };
  }

  try {
    const outcome = await commitQueueableWrite(async () => {
      const database = getDb();
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        await runTransaction(database, async (transaction) => {
          const refs = chunk.map((item) => doc(database, ITEMS_COLLECTION, item.id));
          const isLastChunk = index === chunks.length - 1;
          const settingsRef = doc(database, SETTINGS_COLLECTION, userId);
          const [snapshots, settingsSnapshot] = await Promise.all([
            Promise.all(refs.map((ref) => transaction.get(ref))),
            isLastChunk ? transaction.get(settingsRef) : Promise.resolve(null),
          ]);
          snapshots.forEach((snapshot, itemIndex) => {
            const before = previousById.get(chunk[itemIndex].id);
            const baseRevision = Number(before?.revision || 0);
            if (!snapshot.exists()
                || snapshot.data().userId !== userId
                || Number(snapshot.data().revision || 0) !== baseRevision
                || (baseRevision === 0 && Number(snapshot.data().updatedAt || 0) !== before?.updatedAt)) {
              throw new ItemRevisionConflictError(chunk[itemIndex].id);
            }
          });
          // Publishing settings last makes a matching settings snapshot a
          // confirmation that every earlier item chunk also committed.
          if (isLastChunk) {
            const remoteRevision = settingsSnapshot?.exists()
              ? Number(settingsSnapshot.data().revision || 0)
              : 0;
            const remoteUpdatedAt = settingsSnapshot?.exists()
              ? Number(settingsSnapshot.data().updatedAt || 0)
              : 0;
            if (remoteRevision !== settingsBase.revision
                || (settingsBase.revision === 0 && remoteUpdatedAt !== settingsBase.updatedAt)) {
              throw new UserSettingsRevisionConflictError();
            }
            transaction.set(settingsRef, settingsData);
          }
          chunk.forEach((item, itemIndex) => {
            transaction.update(refs[itemIndex], {
              tags: item.tags || [],
              updatedAt,
              revision: Number(snapshots[itemIndex]!.data()?.revision || 0) + 1,
            });
          });
        });
      }
    }, 'This tag change', {
      userId,
      generation: contextGeneration,
      onCommit: () => mutations.forEach((mutation) => removeItemMutation(mutation)),
      onReject: (error) => mutations.forEach((mutation) => rejectItemMutation(mutation, error)),
    });
    if (outcome === 'rejected') {
      mutations.forEach((mutation) => reportMutationRecovery(
        mutation,
        'This tag change remains in this browser’s recovery data because cloud sync failed.',
      ));
    }
    return { outcome, saved: settingsData };
  } catch (error) {
    mutations.forEach((mutation) => rejectItemMutation(mutation, error));
    mutations.forEach((mutation) => reportMutationRecovery(
      mutation,
      'This tag change remains in this browser’s recovery data because cloud sync failed.',
    ));
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// Tool Data (per-user tool state cloud sync)
// ═══════════════════════════════════════════════════════════

const TOOL_DATA_COLLECTION = 'toolData';
const toolRevisions = new Map<string, number>();
const acceptedToolData = new Map<string, Record<string, unknown> | null>();
const toolSaveQueue = new KeyedSerialQueue();

export class ToolDataConflictError extends Error {
  readonly toolId: string;
  readonly baseRevision: number | null;
  readonly serverRevision: number;

  constructor(toolId: string, baseRevision: number | null, serverRevision: number) {
    super(`${toolId} changed on another device. The cloud copy was not overwritten.`);
    this.name = 'ToolDataConflictError';
    this.toolId = toolId;
    this.baseRevision = baseRevision;
    this.serverRevision = serverRevision;
  }
}

function localToolDataKey(userId: string, toolId: string): string {
  return scopedStorageKey(`orbit-tool-${toolId}`, userId);
}

function localToolRevisionKey(userId: string, toolId: string): string {
  return scopedStorageKey(`orbit-tool-base-revision-${toolId}`, userId);
}

function readToolBaseRevision(userId: string, toolId: string): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.localStorage.getItem(localToolRevisionKey(userId, toolId));
  if (raw === null) return undefined;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
}

function rememberToolBaseRevision(userId: string, toolId: string, revision: number): void {
  toolRevisions.set(`${userId}_${toolId}`, revision);
  try {
    writeLocalStorageVerified(localToolRevisionKey(userId, toolId), String(revision));
  } catch (error) {
    console.warn(`[THREADMAP] Could not persist ${toolId}'s cloud base revision:`, error);
  }
}

/**
 * Save tool data to Firestore.
 * Doc ID = `${userId}_${toolId}` for simple per-user-per-tool storage.
 */
export function saveToolData<T extends Record<string, unknown>>(
  userId: string,
  toolId: string,
  data: T
): Promise<void> {
  assertActiveAccount(userId);
  const revisionKey = `${userId}_${toolId}`;
  return toolSaveQueue.run(revisionKey, () => saveToolDataUnqueued(userId, toolId, data));
}

async function saveToolDataUnqueued<T extends Record<string, unknown>>(
  userId: string,
  toolId: string,
  data: T
): Promise<void> {
  // Recheck after waiting behind an earlier same-tool write. Account switches
  // invalidate queued work rather than saving it under a stale identity.
  const contextGeneration = captureActiveDataContext(userId);
  const payload = { ...data, userId, toolId, updatedAt: Date.now() };
  const revisionKey = `${userId}_${toolId}`;
  if (!toolRevisions.has(revisionKey)) {
    const storedRevision = readToolBaseRevision(userId, toolId);
    if (storedRevision !== undefined) toolRevisions.set(revisionKey, storedRevision);
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (payloadBytes > MAX_TOOL_DOCUMENT_BYTES) {
    const error = new Error(`${toolId} has reached its cloud storage limit. Export or remove older data.`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('threadmap:sync-conflict', {
        detail: { userId, generation: contextGeneration, toolId, message: error.message },
      }));
    }
    throw error;
  }

  if (!isFirebaseAvailable(userId)) {
    writeLocalStorageVerified(localToolDataKey(userId, toolId), JSON.stringify(payload));
    acceptedToolData.set(revisionKey, payload);
    return;
  }

  try {
    let committedRevision: number | null = null;
    await withRetry(async () => {
      assertActiveDataContext(userId, contextGeneration);
      const database = getDb();
      const docRef = doc(database, TOOL_DATA_COLLECTION, revisionKey);
      const knownRevision = toolRevisions.get(revisionKey);
      await runTransaction(database, async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const currentRevision = snapshot.exists() ? Number(snapshot.data().revision || 0) : 0;
        if ((snapshot.exists() && knownRevision === undefined) ||
            (knownRevision !== undefined && currentRevision !== knownRevision)) {
          throw new ToolDataConflictError(toolId, knownRevision ?? null, currentRevision);
        }
        const nextRevision = currentRevision + 1;
        transaction.set(docRef, {
          ...payload,
          userId,
          revision: nextRevision,
        }, { merge: true });
        committedRevision = nextRevision;
      });
    }, `saveToolData(${toolId})`);
    if (committedRevision === null) throw new Error('Tool data transaction did not commit.');
    rememberToolBaseRevision(userId, toolId, committedRevision);
    acceptedToolData.set(revisionKey, payload);
    try {
      localStorage.setItem(localToolDataKey(userId, toolId), JSON.stringify({
        ...payload,
        revision: committedRevision,
      }));
    } catch { /* quota exceeded — ignore */ }
  } catch (error) {
    if (error instanceof ToolDataConflictError && typeof window !== 'undefined') {
      const acceptedData = acceptedToolData.get(revisionKey) ?? null;
      try {
        preserveToolConflict({
          userId,
          toolId,
          baseRevision: error.baseRevision,
          serverRevision: error.serverRevision,
          localData: payload,
          cloudData: acceptedData,
        });
      } catch (recoveryError) {
        console.error(`[THREADMAP] Could not preserve ${toolId}'s conflict recovery record:`, recoveryError);
        reportQueuedWrite(
          `${toolId} has a cloud conflict and browser recovery storage is full. Export this account now.`,
          { userId, generation: contextGeneration },
        );
      }
      if (isFirestoreDataContextCurrent(userId, contextGeneration)) {
        window.dispatchEvent(new CustomEvent('threadmap:sync-conflict', {
          detail: {
            userId,
            generation: contextGeneration,
            toolId,
            message: error.message,
          },
        }));
      }
    }
    throw error;
  }
}

/**
 * Subscribe to tool data from Firestore.
 * On first load, if no cloud doc exists, seeds Firestore with current local state.
 */
export function subscribeToToolData<T extends Record<string, unknown>>(
  userId: string,
  toolId: string,
  callback: (data: T | null) => void,
  options: {
    /** Account-scoped state already rehydrated from verified browser storage. */
    getInitialData?: () => T | null;
    /** Keep the revision that the current dirty local payload was based on. */
    hasPendingLocalChanges?: () => boolean;
  } = {}
): () => void {
  assertActiveAccount(userId);
  const localKey = localToolDataKey(userId, toolId);
  if (userId === DEMO_USER_ID) {
    migrateLegacyStorageToDemo(`orbit-tool-${toolId}`, userId);
  }

  if (!isFirebaseAvailable(userId)) {
    // Local mode
    let delivered = false;
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        callback(JSON.parse(stored) as T);
        delivered = true;
      }
    } catch { /* ignore */ }
    if (!delivered) callback(options.getInitialData?.() ?? null);

    const handler = (e: StorageEvent) => {
      if (e.key === localKey && e.newValue) {
        try { callback(JSON.parse(e.newValue) as T); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  const docRef = doc(getDb(), TOOL_DATA_COLLECTION, `${userId}_${toolId}`);
  const revisionKey = `${userId}_${toolId}`;
  const storedRevision = readToolBaseRevision(userId, toolId);
  if (storedRevision !== undefined) toolRevisions.set(revisionKey, storedRevision);
  let seedAttempted = false;
  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const revision = Number(snapshot.data().revision || 0);
        const hasPendingLocalChanges = options.hasPendingLocalChanges?.() === true;
        acceptedToolData.set(revisionKey, snapshot.data());
        // A dirty local snapshot must retain the revision it was based on.
        // Advancing here would let a stale whole-document save erase a newer
        // edit from another device.
        if (!hasPendingLocalChanges) rememberToolBaseRevision(userId, toolId, revision);
        console.log(`[THREADMAP] Tool data received from cloud (${toolId})`);
        callback(snapshot.data() as T);
      } else {
        if (!snapshot.metadata.fromCache) rememberToolBaseRevision(userId, toolId, 0);
        acceptedToolData.set(revisionKey, null);
        const initialData = options.getInitialData?.() ?? null;
        // Keep the already account-scoped browser copy on first cloud use. An
        // absent cache snapshot is not proof that the server document is
        // absent, so only seed after a server-confirmed missing document.
        callback(initialData);
        if (!snapshot.metadata.fromCache && initialData && !seedAttempted) {
          seedAttempted = true;
          void saveToolData(userId, toolId, initialData).catch((error) => {
            console.error(`[THREADMAP] Failed to seed tool data (${toolId}):`, error);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
                detail: {
                  userId,
                  generation: activeDataGeneration,
                  message: `${toolId} is saved on this device, but its first cloud sync did not finish.`,
                },
              }));
            }
          });
        }
      }
    },
    (error) => {
      console.error(`[THREADMAP] Tool data subscription error (${toolId}):`, error);
    }
  );

  return unsubscribe;
}
