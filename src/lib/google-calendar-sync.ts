// ═══════════════════════════════════════════════════════════
// ORBIT — Real-time Google Calendar Sync Service
// ═══════════════════════════════════════════════════════════

import { 
  fetchGoogleEvents, 
  hasCalendarPermission,
  googleToOrbitEvent
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
    console.log('[ORBIT Sync] No calendar permission, skipping sync');
    return;
  }

  try {
    // Fetch events for next 3 months
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(now.getMonth() + 3);

    const timeMin = now.toISOString();
    const timeMax = threeMonthsLater.toISOString();

    const googleEvents = await fetchGoogleEvents(timeMin, timeMax);
    const orbitItems = useOrbitStore.getState().items;
    const syncedItems = orbitItems.filter(i => i.googleCalendarId);

    // Map Google Calendar events by ID
    const googleEventMap = new Map();
    for (const gcalEvent of googleEvents) {
      const eventData: any = gcalEvent;
      if (eventData.id) {
        googleEventMap.set(eventData.id, eventData);
      }
    }

    // 1. IMPORT: Create new events from Google Calendar
    for (const [gcalId, gcalEvent] of googleEventMap) {
      const alreadyExists = orbitItems.some(i => i.googleCalendarId === gcalId);
      if (!alreadyExists) {
        console.log(`[ORBIT Sync] New event from Google: ${gcalEvent.summary}`);
        await importGoogleEvent(gcalEvent, userId);
      }
    }

    // 2. UPDATE: Check for changes in existing events
    for (const orbitItem of syncedItems) {
      if (!orbitItem.googleCalendarId) continue;

      const gcalEvent = googleEventMap.get(orbitItem.googleCalendarId);
      if (gcalEvent) {
        // Event still exists in Google Calendar — check if updated
        const hasChanges = eventHasChanges(orbitItem, gcalEvent);
        if (hasChanges) {
          console.log(`[ORBIT Sync] Updating event from Google: ${gcalEvent.summary}`);
          await updateFromGoogleEvent(orbitItem.id, gcalEvent, userId);
        }
      }
    }

    // 3. DELETE: Remove events deleted from Google Calendar
    for (const orbitItem of syncedItems) {
      if (!orbitItem.googleCalendarId) continue;

      const stillExistsInGoogle = googleEventMap.has(orbitItem.googleCalendarId);
      if (!stillExistsInGoogle && orbitItem.calendarSynced) {
        console.log(`[ORBIT Sync] Event deleted from Google: ${orbitItem.title}`);
        await deleteItem(orbitItem.id);
      }
    }

    lastSyncTime = Date.now();
    console.log('[ORBIT Sync] Sync completed successfully');
  } catch (err) {
    console.error('[ORBIT Sync] Sync failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

async function importGoogleEvent(gcalEvent: any, userId: string): Promise<void> {
  // Use the proper conversion function that handles multi-day events correctly
  const convertedEvent = googleToOrbitEvent(gcalEvent, userId);
  
  const newEvent: any = {
    type: 'event',
    title: convertedEvent.title || 'Untitled Event',
    status: 'active',
    googleCalendarId: gcalEvent.id,
    calendarSynced: true,
    userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Only add fields if they have values
  if (convertedEvent.content) newEvent.content = convertedEvent.content;
  if (convertedEvent.startDate) newEvent.startDate = convertedEvent.startDate;
  if (convertedEvent.endDate) newEvent.endDate = convertedEvent.endDate;
  if (convertedEvent.startTime) newEvent.startTime = convertedEvent.startTime;
  if (convertedEvent.endTime) newEvent.endTime = convertedEvent.endTime;

  await createItem(newEvent);
}

async function updateFromGoogleEvent(orbitItemId: string, gcalEvent: any, userId: string): Promise<void> {
  // Use the proper conversion function that handles multi-day events correctly
  const convertedEvent = googleToOrbitEvent(gcalEvent, userId);

  const updates: any = {
    title: convertedEvent.title || 'Untitled Event',
    updatedAt: Date.now(),
  };

  if (convertedEvent.content !== undefined) updates.content = convertedEvent.content;
  if (convertedEvent.startDate) updates.startDate = convertedEvent.startDate;
  if (convertedEvent.endDate) updates.endDate = convertedEvent.endDate;
  if (convertedEvent.startTime) updates.startTime = convertedEvent.startTime;
  if (convertedEvent.endTime) updates.endTime = convertedEvent.endTime;

  await updateItem(orbitItemId, updates);
}

function eventHasChanges(orbitItem: OrbitItem, gcalEvent: any): boolean {
  // Check title
  if ((gcalEvent.summary || 'Untitled Event') !== orbitItem.title) return true;

  // For proper comparison, we need to convert the Google event using the same logic
  const isAllDay = !!gcalEvent.start?.date;
  
  if (isAllDay) {
    // All-day event comparison
    const gcalStartDate = gcalEvent.start?.date;
    if (gcalStartDate !== orbitItem.startDate) return true;
    
    // For end date, we need to account for Google's exclusive end date
    if (gcalEvent.end?.date) {
      const [year, month, day] = gcalEvent.end.date.split('-').map(Number);
      const endDateObj = new Date(Date.UTC(year, month - 1, day));
      endDateObj.setUTCDate(endDateObj.getUTCDate() - 1);
      
      const endYear = endDateObj.getUTCFullYear();
      const endMonth = String(endDateObj.getUTCMonth() + 1).padStart(2, '0');
      const endDay = String(endDateObj.getUTCDate()).padStart(2, '0');
      const gcalEndDate = `${endYear}-${endMonth}-${endDay}`;
      
      // Compare to orbit's endDate (undefined if single-day)
      const orbitEndDate = gcalEndDate === gcalStartDate ? undefined : gcalEndDate;
      if (orbitEndDate !== orbitItem.endDate) return true;
    }
  } else {
    // Timed event comparison
    const gcalStartDate = gcalEvent.start?.dateTime?.split('T')[0];
    const gcalEndDate = gcalEvent.end?.dateTime?.split('T')[0];
    const gcalStartTime = gcalEvent.start?.dateTime?.split('T')[1]?.substring(0, 5);
    const gcalEndTime = gcalEvent.end?.dateTime?.split('T')[1]?.substring(0, 5);
    
    if (gcalStartDate !== orbitItem.startDate) return true;
    if (gcalStartTime !== orbitItem.startTime) return true;
    if (gcalEndTime !== orbitItem.endTime) return true;
    
    // For timed events, only set endDate if different from startDate
    const orbitEndDate = gcalEndDate === gcalStartDate ? undefined : gcalEndDate;
    if (orbitEndDate !== orbitItem.endDate) return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════
// Auto-Sync Service
// ═══════════════════════════════════════════════════════════

export function startGoogleCalendarSync(userId: string): void {
  if (syncInterval) {
    console.log('[ORBIT Sync] Already running');
    return;
  }

  console.log('[ORBIT Sync] Starting real-time sync service');

  // Initial sync
  syncGoogleCalendar(userId);

  // Periodic sync every 30 seconds
  syncInterval = setInterval(() => {
    syncGoogleCalendar(userId);
  }, SYNC_INTERVAL_MS);
}

export function stopGoogleCalendarSync(): void {
  if (syncInterval) {
    console.log('[ORBIT Sync] Stopping sync service');
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
