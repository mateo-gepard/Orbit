// ═══════════════════════════════════════════════════════════
// Threadmap — Real-time Google Calendar Sync Service
// ═══════════════════════════════════════════════════════════

import {
  cancelPendingGoogleCalendarRequests,
  deleteGoogleEvent,
  fetchGoogleEvents,
  findGoogleEventByThreadmapItemId,
  getGoogleEvent,
  googleEventIdForOrbitItem,
  hasCalendarPermission,
  googleToOrbitEvent,
  syncEventToGoogle,
  type GCalEvent
} from './google-calendar';
import { createItem, updateItem, deleteItem } from './firestore';
import { useOrbitStore } from './store';
import type { OrbitItem } from './types';
import { useSettingsStore } from './settings-store';
import { scopedStorageKey } from './account-storage';
import { removeLocalStorageVerified, writeLocalStorageVerified } from './verified-storage';

// ═══════════════════════════════════════════════════════════
// Sync State
// ═══════════════════════════════════════════════════════════

let syncInterval: NodeJS.Timeout | null = null;
const lastSyncByOwner = new Map<string, number>();
let syncOwnerId: string | null = null;
let syncGeneration = 0;
let syncInFlight: {
  ownerId: string;
  generation: number;
  promise: Promise<GoogleCalendarSyncResult>;
} | null = null;
let syncWakeHandler: (() => void) | null = null;
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const OUTBOUND_JOURNAL_KEY = 'orbit-google-calendar-outbound';

export interface GoogleCalendarSyncResult {
  success: boolean;
  pushed: number;
  imported: number;
  error?: Error;
}

export interface GoogleCalendarOutboundResult {
  success: boolean;
  pushed: number;
  failed: number;
}

type OutboundJournal = Record<string, string>;
type OutboundFinishOutcome = 'synced' | 'mapped-for-retry' | 'discarded' | 'deferred';

const outboundFlushByOwner = new Map<string, {
  generation: number;
  promise: Promise<GoogleCalendarOutboundResult>;
}>();
const memoryOutboundJournal = new Map<string, OutboundJournal>();

function isOutboundContextCurrent(userId: string, generation: number): boolean {
  return syncOwnerId === userId && syncGeneration === generation;
}

function reportSyncWarning(message: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('threadmap:sync-warning', { detail: { message } }));
  }
}

function outboundFailureMessage(): string {
  return useSettingsStore.getState().settings.language === 'de'
    ? 'Google Calendar konnte nicht vollständig synchronisiert werden. Deine lokalen Änderungen bleiben vorgemerkt und werden erneut versucht.'
    : 'Google Calendar could not finish syncing. Your local changes remain queued and will be retried.';
}

function outboundJournalStorageKey(userId: string): string {
  return scopedStorageKey(OUTBOUND_JOURNAL_KEY, userId);
}

function readOutboundJournal(userId: string): OutboundJournal {
  const inMemory = memoryOutboundJournal.get(userId) || {};
  if (typeof window === 'undefined') return { ...inMemory };
  try {
    const raw = localStorage.getItem(outboundJournalStorageKey(userId));
    if (!raw) return { ...inMemory };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...inMemory };
    const journal: OutboundJournal = {};
    for (const [itemId, googleCalendarId] of Object.entries(parsed)) {
      if (typeof googleCalendarId === 'string' && googleCalendarId) journal[itemId] = googleCalendarId;
    }
    return { ...inMemory, ...journal };
  } catch {
    return { ...inMemory };
  }
}

function writeOutboundJournal(userId: string, journal: OutboundJournal): void {
  memoryOutboundJournal.set(userId, { ...journal });
  if (typeof window === 'undefined') return;
  const key = outboundJournalStorageKey(userId);
  if (Object.keys(journal).length === 0) removeLocalStorageVerified(key);
  else writeLocalStorageVerified(key, JSON.stringify(journal));
}

function rememberCreatedGoogleEvent(userId: string, itemId: string, googleCalendarId: string): void {
  const journal = readOutboundJournal(userId);
  journal[itemId] = googleCalendarId;
  writeOutboundJournal(userId, journal);
}

function forgetCreatedGoogleEvent(userId: string, itemId: string): void {
  const journal = readOutboundJournal(userId);
  if (!(itemId in journal)) return;
  delete journal[itemId];
  writeOutboundJournal(userId, journal);
}

/** A false marker is a durable request to push this event before accepting inbound data. */
export function isPendingGoogleCalendarPush(item: OrbitItem): boolean {
  return item.type === 'event' && item.status !== 'archived' && item.calendarSynced === false;
}

/** Stable ordering keeps an interrupted flush deterministic and easy to resume. */
export function pendingGoogleCalendarPushes(items: OrbitItem[]): OrbitItem[] {
  return items
    .filter(isPendingGoogleCalendarPush)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

/** Pending local changes always take precedence over imported Calendar data. */
export function canAcceptInboundGoogleCalendarUpdate(item: OrbitItem): boolean {
  return Boolean(item.googleCalendarId) && item.calendarSynced !== false;
}

// ═══════════════════════════════════════════════════════════
// Bidirectional Sync Logic
// ═══════════════════════════════════════════════════════════

export function syncGoogleCalendar(userId: string): Promise<GoogleCalendarSyncResult> {
  if (
    syncOwnerId !== userId ||
    !hasCalendarPermission() ||
    !useSettingsStore.getState().settings.calendar.googleCalendarSync
  ) {
    return Promise.resolve({ success: false, pushed: 0, imported: 0 });
  }
  const generation = syncGeneration;
  if (
    syncInFlight?.ownerId === userId &&
    syncInFlight.generation === generation
  ) {
    return syncInFlight.promise;
  }
  const entry: NonNullable<typeof syncInFlight> = {
    ownerId: userId,
    generation,
    promise: Promise.resolve({ success: false, pushed: 0, imported: 0 }),
  };
  entry.promise = performSync(userId, generation)
    .catch((error) => {
      console.error('[THREADMAP Sync] Sync failed:', error);
      reportSyncWarning(outboundFailureMessage());
      return {
        success: false,
        pushed: 0,
        imported: 0,
        error: error instanceof Error ? error : new Error('Google Calendar sync failed.'),
      };
    })
    .finally(() => {
      if (syncInFlight === entry) syncInFlight = null;
    });
  syncInFlight = entry;
  return entry.promise;
}

async function performSync(userId: string, generation: number): Promise<GoogleCalendarSyncResult> {
    // Outbound always runs first. A local edit marked false must never be
    // overwritten by an older Google response or a cancellation.
    const outbound = await flushPendingGoogleCalendarEvents(userId);
    if (generation !== syncGeneration || syncOwnerId !== userId) {
      return { success: false, pushed: outbound.pushed, imported: 0 };
    }
    const now = new Date();
    const recentPast = new Date(now);
    recentPast.setDate(recentPast.getDate() - 90);
    const oneYearLater = new Date(now);
    oneYearLater.setFullYear(now.getFullYear() + 1);

    const timeMin = recentPast.toISOString();
    const timeMax = oneYearLater.toISOString();

    const googleEvents = await fetchGoogleEvents(timeMin, timeMax);
    if (generation !== syncGeneration || syncOwnerId !== userId) {
      return { success: false, pushed: outbound.pushed, imported: 0 };
    }
    const orbitItems = useOrbitStore.getState().items;
    const syncedItems = orbitItems.filter(i => i.googleCalendarId);

    // Map Google Calendar events by ID
    const googleEventMap = new Map<string, GCalEvent>();
    for (const gcalEvent of googleEvents) {
      if (gcalEvent.id) {
        googleEventMap.set(gcalEvent.id, gcalEvent);
      }
    }

    // CLEANUP: Preserve user content when legacy races produced multiple local
    // records for one Google event. Keep one deterministic canonical mapping
    // and detach the others from sync instead of deleting their notes/files.
    const byGoogleId = new Map<string, OrbitItem[]>();
    for (const item of syncedItems) {
      if (!item.googleCalendarId) continue;
      const matches = byGoogleId.get(item.googleCalendarId) || [];
      matches.push(item);
      byGoogleId.set(item.googleCalendarId, matches);
    }
    let detachedDuplicates = 0;
    for (const matches of byGoogleId.values()) {
      if (matches.length < 2) continue;
      matches.sort((left, right) =>
        right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || left.id.localeCompare(right.id)
      );
      for (const duplicate of matches.slice(1)) {
        await updateItem(duplicate.id, {
          googleCalendarId: undefined,
          // Detached duplicates are preserved as ordinary local events. `false`
          // is reserved for an intentional outbound request and would recreate
          // the duplicate in Google on the next pass.
          calendarSynced: undefined,
        });
        detachedDuplicates += 1;
      }
    }
    if (detachedDuplicates > 0) {
      console.warn(`[THREADMAP Sync] Detached ${detachedDuplicates} duplicate calendar mapping(s) without deleting user content.`);
    }

    // Refresh syncedItems after cleanup
    const cleanedOrbitItems = useOrbitStore.getState().items;
    // A false marker means a newer local edit is waiting to be pushed. Never
    // let an inbound update or cancellation win over that pending edit.
    const cleanedSyncedItems = cleanedOrbitItems.filter(canAcceptInboundGoogleCalendarUpdate);

    // Track imported IDs in this sync run to prevent duplicates
    const importedInThisRun = new Set<string>();

    // 1. IMPORT: Create new events from Google Calendar
    let imported = 0;
    for (const [gcalId, gcalEvent] of googleEventMap) {
      if (generation !== syncGeneration || syncOwnerId !== userId) {
        return { success: false, pushed: outbound.pushed, imported };
      }
      if (gcalEvent.status === 'cancelled') continue;
      const sourceItemId = threadmapSourceItemId(gcalEvent, userId);
      const sourceItem = sourceItemId
        ? cleanedOrbitItems.find((item) => item.id === sourceItemId && item.userId === userId)
        : undefined;
      if (
        sourceItem?.type === 'event'
        && !sourceItem.googleCalendarId
        && sourceItem.calendarSynced !== false
      ) {
        await updateItem(sourceItem.id, {
          googleCalendarId: gcalId,
          calendarSynced: true,
        });
      }
      const alreadyExists = cleanedOrbitItems.some(i => i.googleCalendarId === gcalId)
        || Boolean(sourceItem);
      if (!alreadyExists && !importedInThisRun.has(gcalId)) {
        await importGoogleEvent(gcalEvent, userId);
        importedInThisRun.add(gcalId);
        imported += 1;
      }
    }

    // 2. UPDATE: Check for changes in existing events
    for (const orbitItem of cleanedSyncedItems) {
      if (!orbitItem.googleCalendarId) continue;

      const gcalEvent = googleEventMap.get(orbitItem.googleCalendarId);
      if (gcalEvent && gcalEvent.status !== 'cancelled') {
        if (eventHasChanges(orbitItem, gcalEvent)) {
          await updateFromGoogleEvent(orbitItem.id, gcalEvent, userId);
        }
      }
    }

    // 3. DELETE: only explicit cancellation is authoritative. An event being
    // absent from this bounded time window is never treated as deletion.
    for (const orbitItem of cleanedSyncedItems) {
      if (!orbitItem.googleCalendarId) continue;

      const googleEvent = googleEventMap.get(orbitItem.googleCalendarId);
      if (googleEvent?.status === 'cancelled' && orbitItem.calendarSynced) {
        await deleteItem(orbitItem.id, { skipCalendar: true });
      }
    }

    lastSyncByOwner.set(userId, Date.now());
    return { success: outbound.failed === 0, pushed: outbound.pushed, imported };
}

/**
 * Flushes every durable local Calendar change. It is intentionally callable by
 * UI entry points (Quick Add) as well as the periodic sync service. The shared
 * promise prevents two callers from creating two Google events for one item.
 */
export function flushPendingGoogleCalendarEvents(
  userId: string,
  additionalItems: OrbitItem[] = []
): Promise<GoogleCalendarOutboundResult> {
  const generation = syncGeneration;
  if (!isOutboundContextCurrent(userId, generation)) {
    return Promise.resolve({
      success: false,
      pushed: 0,
      failed: additionalItems.filter(isPendingGoogleCalendarPush).length,
    });
  }
  const running = outboundFlushByOwner.get(userId);
  // Do not drop an event created while another flush is awaiting Google. The
  // follow-up pass sees the newest store snapshot and still shares the same
  // per-owner serialization boundary.
  if (running) {
    return running.promise.then(() => flushPendingGoogleCalendarEvents(userId, additionalItems));
  }

  const entry: NonNullable<ReturnType<typeof outboundFlushByOwner.get>> = {
    generation,
    promise: Promise.resolve({ success: false, pushed: 0, failed: 0 }),
  };
  entry.promise = performOutboundFlush(userId, additionalItems, generation)
    .catch((error) => {
      console.error('[THREADMAP Sync] Outbound Calendar sync failed:', error);
      if (isOutboundContextCurrent(userId, generation)) {
        reportSyncWarning(outboundFailureMessage());
      }
      return { success: false, pushed: 0, failed: 1 };
    })
    .finally(() => {
      if (outboundFlushByOwner.get(userId) === entry) outboundFlushByOwner.delete(userId);
    });
  outboundFlushByOwner.set(userId, entry);
  return entry.promise;
}

async function performOutboundFlush(
  userId: string,
  additionalItems: OrbitItem[],
  generation: number,
): Promise<GoogleCalendarOutboundResult> {
  if (
    !isOutboundContextCurrent(userId, generation) ||
    !useSettingsStore.getState().settings.calendar.googleCalendarSync ||
    !hasCalendarPermission()
  ) {
    if (additionalItems.some(isPendingGoogleCalendarPush)) reportSyncWarning(outboundFailureMessage());
    return { success: false, pushed: 0, failed: additionalItems.filter(isPendingGoogleCalendarPush).length };
  }

  const currentItems = useOrbitStore.getState().items;
  const byId = new Map<string, OrbitItem>();
  for (const item of currentItems) {
    if (item.userId === userId && isPendingGoogleCalendarPush(item)) byId.set(item.id, item);
  }
  for (const item of additionalItems) {
    if (item.userId === userId && isPendingGoogleCalendarPush(item) && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  const journal = readOutboundJournal(userId);
  const reconciledJournalItemIds = new Set<string>();
  let pushed = 0;
  let failed = 0;

  // If a Google create succeeded but the Firestore mapping did not, recover
  // that exact ID before attempting another create. This journal is the
  // idempotency boundary across refreshes and reconnects.
  for (const [itemId, googleCalendarId] of Object.entries(journal)) {
    if (!isOutboundContextCurrent(userId, generation)) {
      return { success: false, pushed, failed };
    }
    const item = byId.get(itemId) || useOrbitStore.getState().items.find((candidate) => candidate.id === itemId);
    if (
      item?.googleCalendarId === googleCalendarId
      && (item.calendarSynced !== false || !isPendingGoogleCalendarPush(item))
    ) {
      forgetCreatedGoogleEvent(userId, itemId);
      continue;
    }
    if (!item || item.userId !== userId || !isPendingGoogleCalendarPush(item)) {
      try {
        await deleteGoogleEvent(googleCalendarId);
        if (isOutboundContextCurrent(userId, generation)) {
          forgetCreatedGoogleEvent(userId, itemId);
        }
      } catch {
        failed += 1;
      }
      continue;
    }
    try {
      // A journal entry is written before a create starts. Confirm the remote
      // event actually exists before accepting the ID as a durable mapping;
      // a failed/ambiguous POST must remain a pending create, not be marked
      // synced merely because its deterministic ID was reserved locally.
      const exactEvent = await getGoogleEvent(googleCalendarId);
      const exactItemId = exactEvent?.extendedProperties?.private?.threadmapItemId;
      const recoveredEvent = exactEvent?.status !== 'cancelled' && exactItemId === itemId
        ? exactEvent
        : await findGoogleEventByThreadmapItemId(itemId);
      if (!isOutboundContextCurrent(userId, generation)) {
        return { success: false, pushed, failed };
      }
      if (!recoveredEvent?.id) {
        forgetCreatedGoogleEvent(userId, itemId);
        continue;
      }
      const recoveredGoogleCalendarId = recoveredEvent.id;
      if (recoveredGoogleCalendarId !== googleCalendarId) {
        rememberCreatedGoogleEvent(userId, itemId, recoveredGoogleCalendarId);
      }
      const outcome = await finishOutboundGoogleCalendarPush(
        item,
        recoveredGoogleCalendarId,
        true,
        generation,
      );
      if (outcome === 'synced' || outcome === 'discarded') {
        forgetCreatedGoogleEvent(userId, itemId);
      }
      if (outcome === 'synced') {
        reconciledJournalItemIds.add(itemId);
        pushed += 1;
      }
      if (outcome === 'mapped-for-retry') failed += 1;
    } catch {
      failed += 1;
    }
  }

  for (const item of pendingGoogleCalendarPushes([...byId.values()])) {
    if (!isOutboundContextCurrent(userId, generation)) {
      return { success: false, pushed, failed };
    }
    // A recovered journal mapping was already reconciled above.
    if (reconciledJournalItemIds.has(item.id) || readOutboundJournal(userId)[item.id]) continue;
    try {
      const journalManaged = !item.googleCalendarId;
      // Make the recovery record durable before the external side effect. New
      // events use a deterministic Google ID, so the record is valid even if
      // the HTTP response is lost. If browser storage cannot verify this write,
      // no Google event is created and the local false marker remains queued.
      if (journalManaged) {
        rememberCreatedGoogleEvent(
          userId,
          item.id,
          googleEventIdForOrbitItem(item),
        );
      }
      const googleCalendarId = await syncEventToGoogle(item);
      if (journalManaged && readOutboundJournal(userId)[item.id] !== googleCalendarId) {
        rememberCreatedGoogleEvent(userId, item.id, googleCalendarId);
      }
      const outcome = await finishOutboundGoogleCalendarPush(
        item,
        googleCalendarId,
        journalManaged,
        generation,
      );
      if (journalManaged && (outcome === 'synced' || outcome === 'discarded')) {
        forgetCreatedGoogleEvent(userId, item.id);
      }
      if (outcome === 'synced') pushed += 1;
      if (outcome === 'mapped-for-retry') failed += 1;
    } catch {
      failed += 1;
    }
  }

  const contextCurrent = isOutboundContextCurrent(userId, generation);
  if (failed > 0 && contextCurrent) reportSyncWarning(outboundFailureMessage());
  return { success: failed === 0 && contextCurrent, pushed, failed };
}

async function finishOutboundGoogleCalendarPush(
  source: OrbitItem,
  googleCalendarId: string,
  journalManaged: boolean,
  generation: number,
): Promise<OutboundFinishOutcome> {
  const discardUnmappedCreate = async (): Promise<OutboundFinishOutcome> => {
    if (!journalManaged) return 'discarded';
    if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
    await deleteGoogleEvent(googleCalendarId);
    return isOutboundContextCurrent(source.userId, generation) ? 'discarded' : 'deferred';
  };

  if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
  let latest = useOrbitStore.getState().items.find((item) => item.id === source.id);
  if (!latest || latest.userId !== source.userId || !isPendingGoogleCalendarPush(latest)) {
    if (latest?.userId === source.userId && latest.googleCalendarId === googleCalendarId) {
      return 'mapped-for-retry';
    }
    return discardUnmappedCreate();
  }

  // A journal proves that the POST already happened. Do not PATCH it again
  // unless a newer local edit arrived while the first request was in flight.
  const shouldPushLatest = journalManaged && latest.updatedAt !== source.updatedAt;
  if (shouldPushLatest) {
    await syncEventToGoogle({ ...latest, googleCalendarId });
    if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
  }

  const afterPush = useOrbitStore.getState().items.find((item) => item.id === source.id);
  // The item may have been archived, deleted, or converted while Google was
  // responding. Never reattach a Calendar mapping to a workflow that is no
  // longer an outbound event.
  if (!afterPush || afterPush.userId !== source.userId || !isPendingGoogleCalendarPush(afterPush)) {
    if (afterPush?.userId === source.userId && afterPush.googleCalendarId === googleCalendarId) {
      return 'mapped-for-retry';
    }
    return discardUnmappedCreate();
  }
  if (!sameOutboundEventPayload(afterPush, latest)) {
    // A later edit won the race. Its false marker remains queued for the next
    // pass rather than being incorrectly acknowledged as synced. Persist a
    // newly-created ID first, so that retrying the edit can only PATCH.
    if (!afterPush.googleCalendarId) {
      const mappingOutcome = await updateItem(source.id, { googleCalendarId, calendarSynced: false });
      if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
      if (mappingOutcome !== 'committed') return 'mapped-for-retry';
    }
    return afterPush.googleCalendarId || journalManaged ? 'mapped-for-retry' : 'deferred';
  }

  // Persist the Google ID before acknowledging the queue entry. If the final
  // acknowledgement fails, the next run updates this mapped event instead of
  // creating a duplicate.
  if (!afterPush.googleCalendarId) {
    const mappingOutcome = await updateItem(source.id, { googleCalendarId, calendarSynced: false });
    if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
    if (mappingOutcome !== 'committed') return 'mapped-for-retry';
    latest = useOrbitStore.getState().items.find((item) => item.id === source.id);
    if (!latest || latest.userId !== source.userId || !isPendingGoogleCalendarPush(latest)) {
      if (latest?.userId === source.userId && latest.googleCalendarId === googleCalendarId) {
        return 'mapped-for-retry';
      }
      return discardUnmappedCreate();
    }
    if (!sameOutboundEventPayload(latest, afterPush)) return 'mapped-for-retry';
  }
  if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
  const acknowledgementOutcome = await updateItem(source.id, {
    googleCalendarId,
    calendarSynced: true,
  });
  if (!isOutboundContextCurrent(source.userId, generation)) return 'deferred';
  return acknowledgementOutcome === 'committed' ? 'synced' : 'mapped-for-retry';
}

function sameOutboundEventPayload(left: OrbitItem, right: OrbitItem): boolean {
  return left.type === right.type
    && left.title === right.title
    && (left.content || '') === (right.content || '')
    && left.startDate === right.startDate
    && left.endDate === right.endDate
    && left.startTime === right.startTime
    && left.endTime === right.endTime;
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

export async function googleCalendarImportItemId(
  userId: string,
  googleCalendarId: string,
): Promise<string> {
  if (!userId || !googleCalendarId) throw new Error('Calendar import identity is incomplete.');
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure hashing is unavailable; Calendar import was deferred.');
  }
  const input = new TextEncoder().encode(`${userId}\u0000${googleCalendarId}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `gcal_${hex}`;
}

function threadmapSourceItemId(gcalEvent: GCalEvent, userId: string): string | null {
  const sourceItemId = gcalEvent.extendedProperties?.private?.threadmapItemId?.trim();
  if (!sourceItemId || !/^[A-Za-z0-9_-]{1,200}$/.test(sourceItemId) || !gcalEvent.id) {
    return null;
  }
  try {
    return googleEventIdForOrbitItem({ id: sourceItemId, userId }) === gcalEvent.id
      ? sourceItemId
      : null;
  } catch {
    return null;
  }
}

async function importGoogleEvent(gcalEvent: GCalEvent, userId: string): Promise<void> {
  const convertedEvent = googleToOrbitEvent(gcalEvent, userId);

  const newEvent: Omit<OrbitItem, 'id'> = {
    type: 'event',
    title: convertedEvent.title || 'Untitled Event',
    status: 'active',
    googleCalendarId: gcalEvent.id,
    calendarSynced: true,
    userId,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...(convertedEvent.content && { content: convertedEvent.content }),
    ...(convertedEvent.startDate && { startDate: convertedEvent.startDate }),
    ...(convertedEvent.endDate && { endDate: convertedEvent.endDate }),
    ...(convertedEvent.startTime && { startTime: convertedEvent.startTime }),
    ...(convertedEvent.endTime && { endTime: convertedEvent.endTime }),
  };

  await createItem(newEvent, {
    id: threadmapSourceItemId(gcalEvent, userId)
      || await googleCalendarImportItemId(userId, gcalEvent.id || ''),
  });
}

async function updateFromGoogleEvent(orbitItemId: string, gcalEvent: GCalEvent, userId: string): Promise<void> {
  const convertedEvent = googleToOrbitEvent(gcalEvent, userId);

  const updates: Partial<OrbitItem> = {
    title: convertedEvent.title || 'Untitled Event',
    content: convertedEvent.content,
    startDate: convertedEvent.startDate,
    endDate: convertedEvent.endDate,
    startTime: convertedEvent.startTime,
    endTime: convertedEvent.endTime,
    calendarSynced: true,
    updatedAt: Date.now(),
  };

  await updateItem(orbitItemId, updates);
}

function eventHasChanges(orbitItem: OrbitItem, gcalEvent: GCalEvent): boolean {
  // Use the same conversion logic to compare consistently
  const converted = googleToOrbitEvent(gcalEvent, orbitItem.userId);

  if ((converted.title || 'Untitled Event') !== orbitItem.title) return true;
  if ((converted.content || '') !== (orbitItem.content || '')) return true;
  if (converted.startDate !== orbitItem.startDate) return true;
  if (converted.endDate !== orbitItem.endDate) return true;
  if (converted.startTime !== orbitItem.startTime) return true;
  if (converted.endTime !== orbitItem.endTime) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════
// Auto-Sync Service
// ═══════════════════════════════════════════════════════════

export function startGoogleCalendarSync(userId: string): void {
  if (!useSettingsStore.getState().settings.calendar.googleCalendarSync) return;
  if (syncOwnerId === userId && syncInterval) return;
  stopGoogleCalendarSync();
  syncOwnerId = userId;
  if (!lastSyncByOwner.has(userId)) lastSyncByOwner.set(userId, 0);
  syncGeneration += 1;

  // Initial sync
  syncGoogleCalendar(userId);

  const wakeSync = () => {
    if (syncOwnerId !== userId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    void syncGoogleCalendar(userId);
  };
  syncWakeHandler = wakeSync;

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', wakeSync);
    window.addEventListener('online', wakeSync);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', wakeSync);
  }

  // A visibility-gated safety refresh. Focus and online events wake it sooner.
  syncInterval = setInterval(() => {
    wakeSync();
  }, SYNC_INTERVAL_MS);
}

export function stopGoogleCalendarSync(): void {
  syncGeneration += 1;
  syncOwnerId = null;
  cancelPendingGoogleCalendarRequests();
  outboundFlushByOwner.clear();
  syncInFlight = null;
  if (syncWakeHandler) {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', syncWakeHandler);
      window.removeEventListener('online', syncWakeHandler);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', syncWakeHandler);
    }
    syncWakeHandler = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function getLastSyncTime(userId: string | null = syncOwnerId): number {
  return userId ? lastSyncByOwner.get(userId) || 0 : 0;
}

export function isSyncRunning(): boolean {
  return syncInterval !== null;
}
