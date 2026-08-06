import {
  collection,
  doc,
  updateDoc,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  getDoc,
  getDocs,
  setDoc,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { db } from './firebase';
import type { OrbitItem } from './types';
import { useOrbitStore } from './store';
import { trackItemEvent } from './analytics';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const ITEMS_COLLECTION = 'items';
const LOCAL_STORAGE_KEY = 'orbit-items';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

let activeUserId = 'demo-user';
let localOnlyMode = true;

/**
 * Select the account that owns browser caches and whether writes are local-only.
 * DataProvider must call this before subscribing or mutating data.
 */
export function setFirestoreDataContext(userId: string | null, localOnly: boolean): void {
  activeUserId = userId || 'anonymous';
  localOnlyMode = localOnly;
  if (typeof window !== 'undefined' && activeUserId === 'demo-user') {
    const scopedKey = `${LOCAL_STORAGE_KEY}:${encodeURIComponent(activeUserId)}`;
    const legacy = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!localStorage.getItem(scopedKey) && legacy) {
      localStorage.setItem(scopedKey, legacy);
    }
  }
}

function storageOwner(userId?: string): string {
  return encodeURIComponent(userId || activeUserId || 'anonymous');
}

function localItemsKey(userId?: string): string {
  return `${LOCAL_STORAGE_KEY}:${storageOwner(userId)}`;
}

function isFirebaseAvailable(): boolean {
  return db !== null && !localOnlyMode;
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
      const code = (err as { code?: string })?.code || '';
      const retryable = new Set([
        'aborted',
        'cancelled',
        'deadline-exceeded',
        'internal',
        'resource-exhausted',
        'unavailable',
        'unknown',
      ]).has(code.replace(/^firestore\//, ''));
      console.warn(
        `[ORBIT] ${context} failed (attempt ${attempt + 1}/${retries}):`,
        err
      );
      if (!retryable || attempt === retries - 1) break;
      if (attempt < retries - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }
  console.error(`[ORBIT] ${context} failed after ${retries} attempts`);
  throw lastError;
}

// ═══════════════════════════════════════════════════════════
// Data Validation
// ═══════════════════════════════════════════════════════════

const VALID_TYPES = new Set(['task', 'project', 'habit', 'event', 'goal', 'note']);
const VALID_STATUSES = new Set(['active', 'waiting', 'done', 'archived']);

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
  sanitized.status = VALID_STATUSES.has(item.status) ? item.status : 'active';
  sanitized.createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
  sanitized.updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();
  sanitized.userId = item.userId || 'demo-user';
  sanitized.tags = Array.isArray(item.tags) ? item.tags : [];
  sanitized.linkedIds = Array.isArray(item.linkedIds) ? item.linkedIds : [];

  return sanitized as unknown as OrbitItem;
}

// ═══════════════════════════════════════════════════════════
// Local (Demo) Storage — Bulletproof
// ═══════════════════════════════════════════════════════════

function loadLocalItems(userId?: string): OrbitItem[] {
  if (typeof window === 'undefined') return [];
  const key = localItemsKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[ORBIT] Corrupted localStorage data — resetting');
      localStorage.removeItem(key);
      return [];
    }
    // Sanitize each item to handle any schema drift
    return parsed.map(sanitizeItem);
  } catch (err) {
    console.warn('[ORBIT] Failed to load local data, resetting:', err);
    try {
      localStorage.removeItem(key);
    } catch { /* noop */ }
    return [];
  }
}

function saveLocalItems(items: OrbitItem[], userId?: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = localItemsKey(userId);
  try {
    const serialized = JSON.stringify(items);
    localStorage.setItem(key, serialized);
    // Verify write succeeded by reading back
    const verification = localStorage.getItem(key);
    if (verification !== serialized) {
      console.error('[ORBIT] localStorage write verification failed');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ORBIT] Failed to save local data:', err);
    // If storage is full, try to recover by compacting
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[ORBIT] Storage quota exceeded — compacting old archived items');
      try {
        const compacted = items.filter(
          (i) => i.status !== 'archived' || Date.now() - i.updatedAt < 30 * 24 * 60 * 60 * 1000
        );
        localStorage.setItem(key, JSON.stringify(compacted));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Optimistic update: immediately update Zustand, then persist. If persistence fails, rollback. */
function optimisticLocalUpdate(
  mutator: (items: OrbitItem[]) => OrbitItem[],
  rollbackItems?: OrbitItem[],
  userId?: string
): boolean {
  const oldItems = rollbackItems || loadLocalItems(userId);
  const newItems = mutator([...oldItems]);

  // Update store immediately (optimistic)
  useOrbitStore.getState().setItems(newItems);

  // Persist
  const saved = saveLocalItems(newItems, userId);
  if (!saved) {
    // Rollback on failure
    console.warn('[ORBIT] Persistence failed — rolling back optimistic update');
    useOrbitStore.getState().setItems(oldItems);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

export function subscribeToItems(
  userId: string,
  callback: (items: OrbitItem[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!isFirebaseAvailable()) {
    // Local mode: load and listen to storage events from other tabs
    const items = loadLocalItems(userId);
    callback(items);

    const handler = (e: StorageEvent) => {
      if (e.key === localItemsKey(userId)) {
        callback(loadLocalItems(userId));
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
      if (unsubscribed) return;
      const items: OrbitItem[] = [];
      snapshot.forEach((d) => {
        items.push(sanitizeItem({ id: d.id, ...d.data() } as OrbitItem));
      });

      // Backup to localStorage for catastrophic recovery
      try {
        localStorage.setItem(localItemsKey(userId), JSON.stringify(items));
      } catch { /* quota exceeded — ignore */ }

      callback(items);
    },
    (error) => {
      console.error('[ORBIT] Firestore subscription error:', error);
      onError?.(error);
      // The cache is account-scoped; never expose another account's backup.
      const cached = loadLocalItems(userId);
      if (cached.length > 0) {
        console.warn('[ORBIT] Using local cache as fallback (' + cached.length + ' items)');
        callback(cached);
      } else {
        // No cache available — still call callback so loading screen dismisses
        // and user sees an error state rather than infinite loading
        console.error('[ORBIT] No local cache available — showing empty state');
        callback([]);
      }
    }
  );

  return () => {
    unsubscribed = true;
    unsubscribe();
  };
}

export async function createItem(
  item: Omit<OrbitItem, 'id'>
): Promise<string> {
  const now = Date.now();
  const id = crypto.randomUUID();

  if (!validateItem(item as Partial<OrbitItem>)) {
    console.error('[ORBIT] Invalid item data, creating with defaults');
  }

  if (!isFirebaseAvailable()) {
    const newItem = sanitizeItem({
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    } as OrbitItem);

    const success = optimisticLocalUpdate((items) => [newItem, ...items], undefined, item.userId);
    if (!success) {
      throw new Error('Failed to create item — storage error');
    }
    trackItemEvent('item_created', newItem);
    return id;
  }

  return withRetry(async () => {
    const docRef = doc(getDb(), ITEMS_COLLECTION, id);
    await setDoc(docRef, {
      ...item,
      createdAt: now,
      updatedAt: now,
    });

    // Also save to local cache as backup
    try {
      const localItems = loadLocalItems(item.userId);
      if (!localItems.some((localItem) => localItem.id === id)) {
        localItems.unshift(sanitizeItem({ ...item, id, createdAt: now, updatedAt: now } as OrbitItem));
      }
      saveLocalItems(localItems, item.userId);
    } catch { /* best-effort local backup */ }

    trackItemEvent('item_created', { ...item, id } as OrbitItem);
    return id;
  }, 'createItem');
}

export async function updateItem(
  id: string,
  updates: Partial<OrbitItem>
): Promise<void> {
  const now = Date.now();

  // Snapshot the item before update for analytics diffing
  const existingItem = useOrbitStore.getState().items.find((i) => i.id === id);

  if (!isFirebaseAvailable()) {
    const success = optimisticLocalUpdate((items) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) {
        console.warn(`[ORBIT] Item ${id} not found for update`);
        return items;
      }
      items[idx] = { ...items[idx], ...updates, updatedAt: now };
      return items;
    }, undefined, existingItem?.userId);
    if (!success) {
      throw new Error('Failed to update item — storage error');
    }
    _trackUpdateAnalytics(existingItem, updates);
    return;
  }

  // Optimistic: update store immediately
  const optimisticItems = useOrbitStore.getState().items.map((i) =>
    i.id === id ? { ...i, ...updates, updatedAt: now } : i
  );
  useOrbitStore.getState().setItems(optimisticItems);

  try {
    await withRetry(async () => {
      const ref = doc(getDb(), ITEMS_COLLECTION, id);
      
      // Convert undefined values to deleteField() for Firestore
      const firestoreUpdates: Record<string, unknown> = { updatedAt: now };
      for (const [key, value] of Object.entries(updates)) {
        firestoreUpdates[key] = value === undefined ? deleteField() : value;
      }
      
      await updateDoc(ref, firestoreUpdates);
    }, 'updateItem');
    _trackUpdateAnalytics(existingItem, updates);
  } catch (err) {
    // Roll back only this mutation; preserve edits made while the request ran.
    console.warn('[ORBIT] Rolling back optimistic update for', id);
    if (existingItem) {
      const current = useOrbitStore.getState().items;
      useOrbitStore.getState().setItems(current.map((item) =>
        item.id === id && item.updatedAt === now ? existingItem : item
      ));
    }
    throw err;
  }
}

export async function deleteItem(
  id: string,
  options: { skipCalendar?: boolean } = {}
): Promise<void> {
  const existingItem = useOrbitStore.getState().items.find((i) => i.id === id);
  const now = Date.now();
  const cascade = (items: OrbitItem[]) => items
    .filter((item) => item.id !== id)
    .map((item) => {
      const nextLinkedIds = (item.linkedIds || []).filter((linkedId) => linkedId !== id);
      const hadLink = nextLinkedIds.length !== (item.linkedIds || []).length;
      const wasChild = item.parentId === id;
      if (!hadLink && !wasChild) return item;
      return {
        ...item,
        ...(hadLink ? { linkedIds: nextLinkedIds } : {}),
        ...(wasChild ? { parentId: undefined } : {}),
        updatedAt: now,
      };
    });

  if (!isFirebaseAvailable()) {
    const success = optimisticLocalUpdate(cascade, undefined, existingItem?.userId);
    if (!success) {
      throw new Error('Failed to delete item — storage error');
    }
    if (existingItem) trackItemEvent('item_deleted', existingItem);
    return;
  }

  if (existingItem?.googleCalendarId && !options.skipCalendar) {
    const { deleteGoogleEvent } = await import('./google-calendar');
    await deleteGoogleEvent(existingItem.googleCalendarId);
  }

  if (existingItem?.files?.length) {
    const { deleteProjectFile } = await import('./storage');
    await Promise.all(existingItem.files.map((file) => deleteProjectFile(file.storagePath)));
  }

  // Optimistic cascade
  const prevItems = useOrbitStore.getState().items;
  const affectedBefore = new Map(
    prevItems
      .filter((item) => item.id === id || item.parentId === id || item.linkedIds?.includes(id))
      .map((item) => [item.id, item])
  );
  useOrbitStore.getState().setItems(cascade(prevItems));

  try {
    await withRetry(async () => {
      const database = getDb();
      const batch = writeBatch(database);
      batch.delete(doc(database, ITEMS_COLLECTION, id));
      for (const item of prevItems) {
        if (item.id === id) continue;
        const linkedIds = (item.linkedIds || []).filter((linkedId) => linkedId !== id);
        const hadLink = linkedIds.length !== (item.linkedIds || []).length;
        const wasChild = item.parentId === id;
        if (!hadLink && !wasChild) continue;
        batch.update(doc(database, ITEMS_COLLECTION, item.id), {
          ...(hadLink ? { linkedIds } : {}),
          ...(wasChild ? { parentId: deleteField() } : {}),
          updatedAt: now,
        });
      }
      await batch.commit();
    }, 'deleteItem');
    if (existingItem) trackItemEvent('item_deleted', existingItem);
  } catch (err) {
    // Restore only cascade participants that still have this mutation's version.
    console.warn('[ORBIT] Rolling back delete for', id);
    const current = useOrbitStore.getState().items;
    const restored = current.map((item) => {
      const original = affectedBefore.get(item.id);
      return original && item.updatedAt === now ? original : item;
    });
    if (existingItem && !restored.some((item) => item.id === id)) {
      restored.unshift(existingItem);
    }
    useOrbitStore.getState().setItems(restored);
    throw err;
  }
}

export async function getItem(id: string): Promise<OrbitItem | null> {
  if (!isFirebaseAvailable()) {
    return loadLocalItems().find((i) => i.id === id) || null;
  }

  return withRetry(async () => {
    const snap = await getDoc(doc(getDb(), ITEMS_COLLECTION, id));
    if (!snap.exists()) return null;
    return sanitizeItem({ id: snap.id, ...snap.data() } as OrbitItem);
  }, 'getItem');
}

// ═══════════════════════════════════════════════════════════
// Analytics helper — detects status transitions
// ═══════════════════════════════════════════════════════════

function _trackUpdateAnalytics(
  existing: OrbitItem | undefined,
  updates: Partial<OrbitItem>
): void {
  if (!existing) return;

  const merged = { ...existing, ...updates };

  // Status transitions
  if (updates.status && updates.status !== existing.status) {
    const oldStatus = existing.status;
    const newStatus = updates.status;

    if (newStatus === 'done') {
      const durationMs = existing.createdAt ? Date.now() - existing.createdAt : undefined;
      trackItemEvent('item_completed', merged, { durationMs });
    } else if (newStatus === 'archived') {
      trackItemEvent('item_archived', merged);
    } else if (oldStatus === 'done') {
      trackItemEvent('item_uncompleted', merged);
    } else if (oldStatus === 'archived') {
      trackItemEvent('item_unarchived', merged);
    }
    return; // Status change is the primary event
  }

  // Habit completions change
  if (updates.completions && existing.type === 'habit') {
    const oldKeys = Object.keys(existing.completions || {}).filter(
      (k) => (existing.completions || {})[k]
    );
    const newKeys = Object.keys(updates.completions).filter(
      (k) => updates.completions![k]
    );
    if (newKeys.length > oldKeys.length) {
      trackItemEvent('habit_checked', merged);
    } else if (newKeys.length < oldKeys.length) {
      trackItemEvent('habit_unchecked', merged);
    }
    return;
  }

  // Generic update (title, priority, dueDate, etc.)
  trackItemEvent('item_updated', merged);
}

// ═══════════════════════════════════════════════════════════
// Link/Unlink — Bidirectional with Atomic Writes
// ═══════════════════════════════════════════════════════════

export async function linkItems(
  itemAId: string,
  itemBId: string
): Promise<void> {
  const now = Date.now();

  if (!isFirebaseAvailable()) {
    optimisticLocalUpdate((items) => {
      const a = items.find((i) => i.id === itemAId);
      const b = items.find((i) => i.id === itemBId);
      if (!a || !b) return items;
      const linkedA = new Set(a.linkedIds || []);
      const linkedB = new Set(b.linkedIds || []);
      linkedA.add(itemBId);
      linkedB.add(itemAId);
      a.linkedIds = Array.from(linkedA);
      b.linkedIds = Array.from(linkedB);
      a.updatedAt = now;
      b.updatedAt = now;
      return items;
    });
    return;
  }

  await withRetry(async () => {
    const d = getDb();
    const refA = doc(d, ITEMS_COLLECTION, itemAId);
    const refB = doc(d, ITEMS_COLLECTION, itemBId);
    await runTransaction(d, async (transaction) => {
      const [snapA, snapB] = await Promise.all([transaction.get(refA), transaction.get(refB)]);
      if (!snapA.exists() || !snapB.exists()) {
        throw new Error('Cannot link missing items');
      }
      const linkedA = new Set((snapA.data() as OrbitItem).linkedIds || []);
      const linkedB = new Set((snapB.data() as OrbitItem).linkedIds || []);
      linkedA.add(itemBId);
      linkedB.add(itemAId);
      transaction.update(refA, { linkedIds: Array.from(linkedA), updatedAt: now });
      transaction.update(refB, { linkedIds: Array.from(linkedB), updatedAt: now });
    });
  }, 'linkItems');
}

export async function unlinkItems(
  itemAId: string,
  itemBId: string
): Promise<void> {
  const now = Date.now();

  if (!isFirebaseAvailable()) {
    optimisticLocalUpdate((items) => {
      const a = items.find((i) => i.id === itemAId);
      const b = items.find((i) => i.id === itemBId);
      if (!a || !b) return items;
      const linkedA = new Set(a.linkedIds || []);
      const linkedB = new Set(b.linkedIds || []);
      linkedA.delete(itemBId);
      linkedB.delete(itemAId);
      a.linkedIds = Array.from(linkedA);
      b.linkedIds = Array.from(linkedB);
      a.updatedAt = now;
      b.updatedAt = now;
      return items;
    });
    return;
  }

  await withRetry(async () => {
    const d = getDb();
    const refA = doc(d, ITEMS_COLLECTION, itemAId);
    const refB = doc(d, ITEMS_COLLECTION, itemBId);
    await runTransaction(d, async (transaction) => {
      const [snapA, snapB] = await Promise.all([transaction.get(refA), transaction.get(refB)]);
      if (!snapA.exists() || !snapB.exists()) {
        throw new Error('Cannot unlink missing items');
      }
      const linkedA = new Set((snapA.data() as OrbitItem).linkedIds || []);
      const linkedB = new Set((snapB.data() as OrbitItem).linkedIds || []);
      linkedA.delete(itemBId);
      linkedB.delete(itemAId);
      transaction.update(refA, { linkedIds: Array.from(linkedA), updatedAt: now });
      transaction.update(refB, { linkedIds: Array.from(linkedB), updatedAt: now });
    });
  }, 'unlinkItems');
}

// ═══════════════════════════════════════════════════════════
// User Settings (tags/areas cloud sync)
// ═══════════════════════════════════════════════════════════

const SETTINGS_COLLECTION = 'userSettings';
const LOCAL_SETTINGS_KEY = 'orbit-user-settings';

function localSettingsKey(userId: string): string {
  return `${LOCAL_SETTINGS_KEY}:${storageOwner(userId)}`;
}

export interface UserSettings {
  customTags: string[];
  removedDefaultTags: string[];
  updatedAt: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  customTags: [],
  removedDefaultTags: [],
  updatedAt: 0,
};

/**
 * Subscribe to user settings (tags/areas) from Firestore.
 * Returns unsubscribe function.
 *
 * On first load, if no Firestore doc exists, seeds the cloud with
 * the user's current local tags (from Zustand/localStorage).
 */
export function subscribeToUserSettings(
  userId: string,
  callback: (settings: UserSettings) => void
): () => void {
  if (!isFirebaseAvailable()) {
    // Local mode: load from localStorage
    const key = localSettingsKey(userId);
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        callback(JSON.parse(stored));
      } catch {
        // Don't reset — keep whatever is in the store
      }
    }
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try { callback(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  const docRef = doc(getDb(), SETTINGS_COLLECTION, userId);
  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserSettings;
        callback({
          customTags: data.customTags || [],
          removedDefaultTags: data.removedDefaultTags || [],
          updatedAt: data.updatedAt || 0,
        });
      } else {
        // A new account starts clean. Never seed it from another browser user's cache.
        callback(DEFAULT_SETTINGS);
      }
    },
    (error) => {
      console.error('[ORBIT] User settings subscription error:', error);
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
  settings: Omit<UserSettings, 'updatedAt'>
): Promise<void> {
  const data: UserSettings = {
    ...settings,
    updatedAt: Date.now(),
  };

  // Always save locally
  try {
    localStorage.setItem(localSettingsKey(userId), JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }

  if (!isFirebaseAvailable()) return;

  await withRetry(async () => {
    const docRef = doc(getDb(), SETTINGS_COLLECTION, userId);
    await setDoc(docRef, data, { merge: true });
  }, 'saveUserSettings');
}

/** Persist a tag definition change and every affected item in one Firestore batch. */
export async function saveTagMutation(
  userId: string,
  settings: Omit<UserSettings, 'updatedAt'>,
  affectedItems: Array<Pick<OrbitItem, 'id' | 'tags'>>
): Promise<void> {
  const updatedAt = Date.now();
  const settingsData: UserSettings = { ...settings, updatedAt };

  try {
    localStorage.setItem(localSettingsKey(userId), JSON.stringify(settingsData));
    const affectedById = new Map(affectedItems.map((item) => [item.id, item.tags || []]));
    const local = loadLocalItems(userId).map((item) =>
      affectedById.has(item.id)
        ? { ...item, tags: affectedById.get(item.id)!, updatedAt }
        : item
    );
    saveLocalItems(local, userId);
  } catch { /* local backup is best effort in cloud mode */ }

  if (!isFirebaseAvailable()) return;
  if (affectedItems.length > 498) {
    throw new Error('Too many items reference this tag to update atomically');
  }

  await withRetry(async () => {
    const database = getDb();
    const batch = writeBatch(database);
    batch.set(doc(database, SETTINGS_COLLECTION, userId), settingsData, { merge: true });
    for (const item of affectedItems) {
      batch.update(doc(database, ITEMS_COLLECTION, item.id), {
        tags: item.tags || [],
        updatedAt,
      });
    }
    await batch.commit();
  }, 'saveTagMutation');
}

// ═══════════════════════════════════════════════════════════
// Tool Data (per-user tool state cloud sync)
// ═══════════════════════════════════════════════════════════

const TOOL_DATA_COLLECTION = 'toolData';

function localToolDataKey(userId: string, toolId: string): string {
  return `orbit-tool-${toolId}:${storageOwner(userId)}`;
}

/**
 * Save tool data to Firestore.
 * Doc ID = `${userId}_${toolId}` for simple per-user-per-tool storage.
 */
export async function saveToolData<T extends Record<string, unknown>>(
  userId: string,
  toolId: string,
  data: T
): Promise<void> {
  const payload = { ...data, userId, toolId, updatedAt: Date.now() };

  // Always save locally as fallback
  try {
    localStorage.setItem(localToolDataKey(userId, toolId), JSON.stringify(payload));
  } catch { /* quota exceeded — ignore */ }

  if (!isFirebaseAvailable()) return;

  await withRetry(async () => {
    const docRef = doc(getDb(), TOOL_DATA_COLLECTION, `${userId}_${toolId}`);
    await setDoc(docRef, payload, { merge: true });
  }, `saveToolData(${toolId})`);
}

/**
 * Subscribe to tool data from Firestore.
 * On first load, if no cloud doc exists, seeds Firestore with current local state.
 */
export function subscribeToToolData<T extends Record<string, unknown>>(
  userId: string,
  toolId: string,
  callback: (data: T | null) => void,
  _getLocalState?: () => T | null
): () => void {
  const localKey = localToolDataKey(userId, toolId);

  if (!isFirebaseAvailable()) {
    // Local mode
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        callback(JSON.parse(stored) as T);
      }
    } catch { /* ignore */ }

    const handler = (e: StorageEvent) => {
      if (e.key === localKey && e.newValue) {
        try { callback(JSON.parse(e.newValue) as T); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  const docRef = doc(getDb(), TOOL_DATA_COLLECTION, `${userId}_${toolId}`);
  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        // Cloud document exists — always push to store (cloud first)
        console.log(`[ORBIT] Tool data received from cloud (${toolId})`);
        callback(snapshot.data() as T);
      } else {
        // Missing cloud data represents a clean account, not an invitation to
        // upload whatever a previous account left in this browser.
        callback(null);
      }
    },
    (error) => {
      console.error(`[ORBIT] Tool data subscription error (${toolId}):`, error);
    }
  );

  return unsubscribe;
}

/**
 * Delete all Firestore data for a user (items + tool data).
 * Called during account deletion.
 */
export async function deleteAllUserData(userId: string): Promise<void> {
  if (!isFirebaseAvailable()) {
    // Clear local storage instead
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    const toolKeys = Object.keys(localStorage).filter((k) => k.startsWith('orbit-'));
    toolKeys.forEach((k) => localStorage.removeItem(k));
    return;
  }

  const database = getDb();

  // Collect all document refs to delete
  const refsToDelete: ReturnType<typeof doc>[] = [];

  // 1. All items owned by the user
  const itemsSnap = await getDocs(
    query(collection(database, ITEMS_COLLECTION), where('userId', '==', userId))
  );
  itemsSnap.forEach((d) => refsToDelete.push(d.ref));

  // 2. All tool data docs owned by the user
  const toolDataSnap = await getDocs(
    query(collection(database, TOOL_DATA_COLLECTION), where('userId', '==', userId))
  );
  toolDataSnap.forEach((d) => refsToDelete.push(d.ref));

  // 3. All analytics docs owned by the user
  const analyticsSnap = await getDocs(
    query(collection(database, 'analytics'), where('userId', '==', userId))
  );
  analyticsSnap.forEach((d) => refsToDelete.push(d.ref));

  // 4. User settings doc (doc ID = userId)
  const settingsRef = doc(database, SETTINGS_COLLECTION, userId);
  const settingsSnap = await getDoc(settingsRef);
  if (settingsSnap.exists()) {
    refsToDelete.push(settingsRef);
  }

  // Commit in batches of 500 (Firestore limit)
  const BATCH_SIZE = 500;
  for (let i = 0; i < refsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(database);
    const chunk = refsToDelete.slice(i, i + BATCH_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  // Clear local storage
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  const toolKeys = Object.keys(localStorage).filter((k) => k.startsWith('orbit-'));
  toolKeys.forEach((k) => localStorage.removeItem(k));

  console.info('[ORBIT] All user data deleted for', userId);
}
