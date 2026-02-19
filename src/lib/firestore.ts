import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  getDoc,
  getDocs,
  setDoc,
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
const LOCAL_STORAGE_VERSION_KEY = 'orbit-version';
const CURRENT_VERSION = 1;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function isFirebaseAvailable(): boolean {
  return db !== null;
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
      console.warn(
        `[ORBIT] ${context} failed (attempt ${attempt + 1}/${retries}):`,
        err
      );
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
  // Remove all undefined fields (Firestore doesn't accept undefined)
  const sanitized: Record<string, unknown> = {
    id: item.id || crypto.randomUUID(),
    title: (item.title || '').trim() || 'Untitled',
    type: VALID_TYPES.has(item.type) ? item.type : 'task',
    status: VALID_STATUSES.has(item.status) ? item.status : 'active',
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    userId: item.userId || 'demo-user',
    tags: Array.isArray(item.tags) ? item.tags : [],
    linkedIds: Array.isArray(item.linkedIds) ? item.linkedIds : [],
  };

  // Only include optional fields if they have valid values
  if (item.content) sanitized.content = item.content;
  if (item.dueDate) sanitized.dueDate = item.dueDate;
  if (item.priority) sanitized.priority = item.priority;
  if (item.assignee) sanitized.assignee = item.assignee;
  if (item.parentId) sanitized.parentId = item.parentId;
  if (item.completedAt) sanitized.completedAt = item.completedAt;
  
  if (Array.isArray(item.checklist) && item.checklist.length > 0) {
    sanitized.checklist = item.checklist;
  }
  
  // Project-specific fields
  if (item.emoji) sanitized.emoji = item.emoji;
  if (item.color) sanitized.color = item.color;
  if (Array.isArray(item.files)) sanitized.files = item.files;
  
  // Habit-specific fields
  if (item.frequency) sanitized.frequency = item.frequency;
  if (Array.isArray(item.customDays)) sanitized.customDays = item.customDays;
  if (item.habitTime) sanitized.habitTime = item.habitTime;
  if (item.completions && typeof item.completions === 'object') {
    sanitized.completions = item.completions;
  }
  
  // Event-specific fields
  if (item.startDate) sanitized.startDate = item.startDate;
  if (item.endDate) sanitized.endDate = item.endDate;
  if (item.startTime) sanitized.startTime = item.startTime;
  if (item.endTime) sanitized.endTime = item.endTime;
  if (item.googleCalendarId) sanitized.googleCalendarId = item.googleCalendarId;
  if (item.calendarSynced !== undefined) sanitized.calendarSynced = item.calendarSynced;
  
  // Goal-specific fields
  if (item.timeframe) sanitized.timeframe = item.timeframe;
  if (item.metric) sanitized.metric = item.metric;
  
  // Note-specific fields
  if (item.noteSubtype) sanitized.noteSubtype = item.noteSubtype;

  return sanitized as unknown as OrbitItem;
}

// ═══════════════════════════════════════════════════════════
// Local (Demo) Storage — Bulletproof
// ═══════════════════════════════════════════════════════════

function loadLocalItems(): OrbitItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[ORBIT] Corrupted localStorage data — resetting');
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return [];
    }
    // Sanitize each item to handle any schema drift
    return parsed.map(sanitizeItem);
  } catch (err) {
    console.warn('[ORBIT] Failed to load local data, resetting:', err);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch { /* noop */ }
    return [];
  }
}

function saveLocalItems(items: OrbitItem[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(items);
    localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
    // Verify write succeeded by reading back
    const verification = localStorage.getItem(LOCAL_STORAGE_KEY);
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
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compacted));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Optimistic update: immediately update Zustand, then persist. If persistence fails, rollback. */
function syncStoreFromLocal() {
  const items = loadLocalItems();
  useOrbitStore.getState().setItems(items);
}

function optimisticLocalUpdate(
  mutator: (items: OrbitItem[]) => OrbitItem[],
  rollbackItems?: OrbitItem[]
): boolean {
  const oldItems = rollbackItems || loadLocalItems();
  const newItems = mutator([...oldItems]);

  // Update store immediately (optimistic)
  useOrbitStore.getState().setItems(newItems);

  // Persist
  const saved = saveLocalItems(newItems);
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
  callback: (items: OrbitItem[]) => void
): () => void {
  if (!isFirebaseAvailable()) {
    // Local mode: load and listen to storage events from other tabs
    const items = loadLocalItems();
    callback(items);

    const handler = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY) {
        callback(loadLocalItems());
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
      callback(items);
    },
    (error) => {
      console.error('[ORBIT] Firestore subscription error:', error);
      // Fallback: try to load from local cache
      const cached = loadLocalItems();
      if (cached.length > 0) {
        console.warn('[ORBIT] Using local cache as fallback');
        callback(cached);
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

    const success = optimisticLocalUpdate((items) => [newItem, ...items]);
    if (!success) {
      throw new Error('Failed to create item — storage error');
    }
    trackItemEvent('item_created', newItem);
    return id;
  }

  return withRetry(async () => {
    const docRef = await addDoc(collection(getDb(), ITEMS_COLLECTION), {
      ...item,
      createdAt: now,
      updatedAt: now,
    });

    // Also save to local cache as backup
    try {
      const localItems = loadLocalItems();
      localItems.unshift(sanitizeItem({ ...item, id: docRef.id, createdAt: now, updatedAt: now } as OrbitItem));
      saveLocalItems(localItems);
    } catch { /* best-effort local backup */ }

    trackItemEvent('item_created', { ...item, id: docRef.id } as OrbitItem);
    return docRef.id;
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
    });
    if (!success) {
      throw new Error('Failed to update item — storage error');
    }
    _trackUpdateAnalytics(existingItem, updates);
    return;
  }

  // Optimistic: update store immediately
  const prevItems = useOrbitStore.getState().items;
  const optimisticItems = prevItems.map((i) =>
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
    // Rollback optimistic update
    console.warn('[ORBIT] Rolling back optimistic update for', id);
    useOrbitStore.getState().setItems(prevItems);
    throw err;
  }
}

export async function deleteItem(id: string): Promise<void> {
  const existingItem = useOrbitStore.getState().items.find((i) => i.id === id);

  if (!isFirebaseAvailable()) {
    const success = optimisticLocalUpdate((items) =>
      items.filter((i) => i.id !== id)
    );
    if (!success) {
      throw new Error('Failed to delete item — storage error');
    }
    if (existingItem) trackItemEvent('item_deleted', existingItem);
    return;
  }

  // Optimistic
  const prevItems = useOrbitStore.getState().items;
  useOrbitStore.getState().setItems(prevItems.filter((i) => i.id !== id));

  try {
    await withRetry(async () => {
      await deleteDoc(doc(getDb(), ITEMS_COLLECTION, id));
    }, 'deleteItem');
    if (existingItem) trackItemEvent('item_deleted', existingItem);
  } catch (err) {
    // Rollback
    console.warn('[ORBIT] Rolling back delete for', id);
    useOrbitStore.getState().setItems(prevItems);
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
    const batch = writeBatch(d);
    const refA = doc(d, ITEMS_COLLECTION, itemAId);
    const refB = doc(d, ITEMS_COLLECTION, itemBId);

    const [snapA, snapB] = await Promise.all([getDoc(refA), getDoc(refB)]);
    if (!snapA.exists() || !snapB.exists()) return;

    const dataA = snapA.data() as OrbitItem;
    const dataB = snapB.data() as OrbitItem;

    const linkedA = new Set(dataA.linkedIds || []);
    const linkedB = new Set(dataB.linkedIds || []);
    linkedA.add(itemBId);
    linkedB.add(itemAId);

    batch.update(refA, { linkedIds: Array.from(linkedA), updatedAt: now });
    batch.update(refB, { linkedIds: Array.from(linkedB), updatedAt: now });

    await batch.commit();
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
    const batch = writeBatch(d);
    const refA = doc(d, ITEMS_COLLECTION, itemAId);
    const refB = doc(d, ITEMS_COLLECTION, itemBId);

    const [snapA, snapB] = await Promise.all([getDoc(refA), getDoc(refB)]);
    if (!snapA.exists() || !snapB.exists()) return;

    const dataA = snapA.data() as OrbitItem;
    const dataB = snapB.data() as OrbitItem;

    const linkedA = new Set(dataA.linkedIds || []);
    const linkedB = new Set(dataB.linkedIds || []);
    linkedA.delete(itemBId);
    linkedB.delete(itemAId);

    batch.update(refA, { linkedIds: Array.from(linkedA), updatedAt: now });
    batch.update(refB, { linkedIds: Array.from(linkedB), updatedAt: now });

    await batch.commit();
  }, 'unlinkItems');
}

// ═══════════════════════════════════════════════════════════
// User Settings (tags/areas cloud sync)
// ═══════════════════════════════════════════════════════════

const SETTINGS_COLLECTION = 'userSettings';
const LOCAL_SETTINGS_KEY = 'orbit-user-settings';

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
    const stored = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (stored) {
      try {
        callback(JSON.parse(stored));
      } catch {
        // Don't reset — keep whatever is in the store
      }
    }
    const handler = (e: StorageEvent) => {
      if (e.key === LOCAL_SETTINGS_KEY && e.newValue) {
        try { callback(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  const docRef = doc(getDb(), SETTINGS_COLLECTION, userId);
  let isFirstSnapshot = true;

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
      } else if (isFirstSnapshot) {
        // No settings doc yet — seed Firestore with current local state
        // (don't reset local tags to empty!)
        const store = useOrbitStore.getState();
        const localCustom = store.customTags;
        const localRemoved = store.removedDefaultTags;
        if (localCustom.length > 0 || localRemoved.length > 0) {
          // Push local tags to cloud
          saveUserSettings(userId, {
            customTags: localCustom,
            removedDefaultTags: localRemoved,
          }).catch(() => { /* ignore seed error */ });
        }
        // Don't call callback — keep current local state as-is
      }
      isFirstSnapshot = false;
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
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }

  if (!isFirebaseAvailable()) return;

  await withRetry(async () => {
    const docRef = doc(getDb(), SETTINGS_COLLECTION, userId);
    await setDoc(docRef, data, { merge: true });
  }, 'saveUserSettings');
}

// ═══════════════════════════════════════════════════════════
// Tool Data (per-user tool state cloud sync)
// ═══════════════════════════════════════════════════════════

const TOOL_DATA_COLLECTION = 'toolData';

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
    localStorage.setItem(`orbit-tool-${toolId}`, JSON.stringify(payload));
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
  getLocalState?: () => T | null
): () => void {
  const localKey = `orbit-tool-${toolId}`;

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
  let isFirstSnapshot = true;

  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        // Cloud document exists — always push to store (cloud first)
        console.log(`[ORBIT] Tool data received from cloud (${toolId})`);
        callback(snapshot.data() as T);
      } else if (isFirstSnapshot) {
        // No cloud document yet — seed from local state so it syncs up
        console.log(`[ORBIT] No cloud data for ${toolId} — seeding from local`);
        const local = getLocalState?.();
        if (local) {
          saveToolData(userId, toolId, local).catch(() => { /* ignore seed error */ });
        }
      }
      isFirstSnapshot = false;
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
