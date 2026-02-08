// ═══════════════════════════════════════════════════════════
// ORBIT — Real-time Google Calendar Sync Service
// ═══════════════════════════════════════════════════════════

import {
  fetchGoogleEvents,
  hasCalendarPermission,
  googleToOrbitEvent,
  type GCalEvent
} from './google-calendar';
import { createItem, updateItem, deleteItem } from './firestore';
import { useOrbitStore } from './store';
import type { OrbitItem } from './types';

// ═══════════════════════════════════════════════════════════
// Sync State
// ═══════════════════════════════════════════════════════════

let syncInterval: NodeJS.Timeout | null = null;
let lastSyncTime: number = 0;
const SYNC_INTERVAL_MS = 30000; // 30 seconds

// ═══════════════════════════════════════════════════════════
// Bidirectional Sync Logic
// ═══════════════════════════════════════════════════════════

export async function syncGoogleCalendar(userId: string): Promise<void> {
  if (!hasCalendarPermission()) {
    return;
  }

  try {
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(now.getFullYear() + 2);

    const timeMin = oneYearAgo.toISOString();
    const timeMax = twoYearsLater.toISOString();

    const googleEvents = await fetchGoogleEvents(timeMin, timeMax);
    const orbitItems = useOrbitStore.getState().items;
    const syncedItems = orbitItems.filter(i => i.googleCalendarId);

    // Map Google Calendar events by ID
    const googleEventMap = new Map<string, GCalEvent>();
    for (const gcalEvent of googleEvents) {
      if (gcalEvent.id) {
        googleEventMap.set(gcalEvent.id, gcalEvent);
      }
    }

    // CLEANUP: Remove duplicate events (keep only the most recent one per googleCalendarId)
    const seenGoogleIds = new Map<string, string>();
    for (const item of syncedItems) {
      if (!item.googleCalendarId) continue;

      const existing = seenGoogleIds.get(item.googleCalendarId);
      if (existing) {
        const existingItem = orbitItems.find(i => i.id === existing);
        if (existingItem && item.createdAt > existingItem.createdAt) {
          await deleteItem(existing);
          seenGoogleIds.set(item.googleCalendarId, item.id);
        } else {
          await deleteItem(item.id);
        }
      } else {
        seenGoogleIds.set(item.googleCalendarId, item.id);
      }
    }

    // Refresh syncedItems after cleanup
    const cleanedOrbitItems = useOrbitStore.getState().items;
    const cleanedSyncedItems = cleanedOrbitItems.filter(i => i.googleCalendarId);

    // Track imported IDs in this sync run to prevent duplicates
    const importedInThisRun = new Set<string>();

    // 1. IMPORT: Create new events from Google Calendar
    for (const [gcalId, gcalEvent] of googleEventMap) {
      const alreadyExists = cleanedOrbitItems.some(i => i.googleCalendarId === gcalId);
      if (!alreadyExists && !importedInThisRun.has(gcalId)) {
        await importGoogleEvent(gcalEvent, userId);
        importedInThisRun.add(gcalId);
      }
    }

    // 2. UPDATE: Check for changes in existing events
    for (const orbitItem of cleanedSyncedItems) {
      if (!orbitItem.googleCalendarId) continue;

      const gcalEvent = googleEventMap.get(orbitItem.googleCalendarId);
      if (gcalEvent) {
        if (eventHasChanges(orbitItem, gcalEvent)) {
          await updateFromGoogleEvent(orbitItem.id, gcalEvent, userId);
        }
      }
    }

    // 3. DELETE: Remove events deleted from Google Calendar
    for (const orbitItem of cleanedSyncedItems) {
      if (!orbitItem.googleCalendarId) continue;

      const stillExistsInGoogle = googleEventMap.has(orbitItem.googleCalendarId);
      if (!stillExistsInGoogle && orbitItem.calendarSynced) {
        await deleteItem(orbitItem.id);
      }
    }

    lastSyncTime = Date.now();
  } catch (err) {
    console.error('[ORBIT Sync] Sync failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

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

  await createItem(newEvent);
}

async function updateFromGoogleEvent(orbitItemId: string, gcalEvent: GCalEvent, userId: string): Promise<void> {
  const convertedEvent = googleToOrbitEvent(gcalEvent, userId);

  const updates: Partial<OrbitItem> = {
    title: convertedEvent.title || 'Untitled Event',
    updatedAt: Date.now(),
    ...(convertedEvent.content !== undefined && { content: convertedEvent.content }),
    ...(convertedEvent.startDate && { startDate: convertedEvent.startDate }),
    ...(convertedEvent.endDate && { endDate: convertedEvent.endDate }),
    ...(convertedEvent.startTime && { startTime: convertedEvent.startTime }),
    ...(convertedEvent.endTime && { endTime: convertedEvent.endTime }),
  };

  await updateItem(orbitItemId, updates);
}

function eventHasChanges(orbitItem: OrbitItem, gcalEvent: GCalEvent): boolean {
  // Use the same conversion logic to compare consistently
  const converted = googleToOrbitEvent(gcalEvent, orbitItem.userId);

  if ((converted.title || 'Untitled Event') !== orbitItem.title) return true;
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
  if (syncInterval) {
    return;
  }

  // Initial sync
  syncGoogleCalendar(userId);

  // Periodic sync every 30 seconds
  syncInterval = setInterval(() => {
    syncGoogleCalendar(userId);
  }, SYNC_INTERVAL_MS);
}

export function stopGoogleCalendarSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function getLastSyncTime(): number {
  return lastSyncTime;
}

export function isSyncRunning(): boolean {
  return syncInterval !== null;
}
