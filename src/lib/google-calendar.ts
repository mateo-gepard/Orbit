// ═══════════════════════════════════════════════════════════
// ORBIT — Google Calendar API Integration
// ═══════════════════════════════════════════════════════════

import type { OrbitItem } from './types';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

// ═══════════════════════════════════════════════════════════
// Token Management
// ═══════════════════════════════════════════════════════════

let accessToken: string | null = null;

export function setGoogleAccessToken(token: string) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('orbit-google-token', token);
  }
}

export function getGoogleAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    accessToken = localStorage.getItem('orbit-google-token');
  }
  return accessToken;
}

export function clearGoogleAccessToken() {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('orbit-google-token');
  }
}

// ═══════════════════════════════════════════════════════════
// OAuth Flow (Client-Side)
// ═══════════════════════════════════════════════════════════

export function requestCalendarPermission(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID;
    if (!clientId) {
      reject(new Error('Google Calendar Client ID not configured'));
      return;
    }

    // Use Google Identity Services (gis)
    if (typeof window === 'undefined' || !window.google) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        setGoogleAccessToken(response.access_token);
        resolve(response.access_token);
      },
    });

    client.requestAccessToken();
  });
}

// ═══════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════

async function calendarFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('No Google Calendar access token');
  }

  const response = await fetch(`${CALENDAR_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // Token expired
    clearGoogleAccessToken();
    throw new Error('Google Calendar token expired');
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Calendar API error: ${error}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════
// Convert ORBIT Event ↔ Google Calendar Event
// ═══════════════════════════════════════════════════════════

function orbitToGoogleEvent(item: OrbitItem): any {
  if (item.type !== 'event') {
    throw new Error('Only event items can be synced to Google Calendar');
  }

  const event: any = {
    summary: item.title,
    description: item.content || '',
  };

  // Determine if this is an all-day event (no start/end times)
  const isAllDay = !item.startTime && !item.endTime;

  if (item.startDate) {
    if (isAllDay) {
      // All-day event: use 'date' field (YYYY-MM-DD)
      event.start = { date: item.startDate };
      
      // Google Calendar expects end.date to be EXCLUSIVE (next day after event ends)
      if (item.endDate) {
        const endDateObj = new Date(item.endDate);
        endDateObj.setDate(endDateObj.getDate() + 1); // Add 1 day for exclusive end
        event.end = { date: endDateObj.toISOString().split('T')[0] };
      } else {
        // Single-day all-day event: end is next day
        const nextDay = new Date(item.startDate);
        nextDay.setDate(nextDay.getDate() + 1);
        event.end = { date: nextDay.toISOString().split('T')[0] };
      }
    } else {
      // Timed event: use 'dateTime' field with timezone
      const startDateTime = item.startTime
        ? `${item.startDate}T${item.startTime}:00`
        : `${item.startDate}T00:00:00`;

      const endDateTime = item.endDate
        ? item.endTime
          ? `${item.endDate}T${item.endTime}:00`
          : `${item.endDate}T23:59:59`
        : item.endTime
        ? `${item.startDate}T${item.endTime}:00`
        : `${item.startDate}T23:59:59`;

      event.start = {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      event.end = {
        dateTime: endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
  } else {
    // Fallback: all-day event today
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    event.start = { date: today };
    event.end = { date: tomorrow.toISOString().split('T')[0] };
  }

  return event;
}

export function googleToOrbitEvent(gcalEvent: any, userId: string): Partial<OrbitItem> {
  // Google Calendar uses different formats for all-day vs timed events
  const isAllDay = !!gcalEvent.start?.date;
  
  let startDate: string | undefined;
  let endDate: string | undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;

  if (isAllDay) {
    // All-day event: uses 'date' field (YYYY-MM-DD)
    startDate = gcalEvent.start.date;
    
    // Google Calendar's end.date is EXCLUSIVE (next day after event ends)
    // For multi-day events, we need to subtract 1 day to get the actual end date
    if (gcalEvent.end?.date) {
      // Parse as UTC to avoid timezone issues with date-only strings
      const [year, month, day] = gcalEvent.end.date.split('-').map(Number);
      const endDateObj = new Date(Date.UTC(year, month - 1, day));
      endDateObj.setUTCDate(endDateObj.getUTCDate() - 1); // Subtract 1 day
      
      const endYear = endDateObj.getUTCFullYear();
      const endMonth = String(endDateObj.getUTCMonth() + 1).padStart(2, '0');
      const endDay = String(endDateObj.getUTCDate()).padStart(2, '0');
      endDate = `${endYear}-${endMonth}-${endDay}`;
      
      // Only set endDate if it's different from startDate (multi-day event)
      if (endDate === startDate) {
        endDate = undefined;
      }
    }
  } else {
    // Timed event: uses 'dateTime' field (ISO 8601)
    startDate = gcalEvent.start?.dateTime?.split('T')[0];
    endDate = gcalEvent.end?.dateTime?.split('T')[0];
    startTime = gcalEvent.start?.dateTime?.split('T')[1]?.substring(0, 5);
    endTime = gcalEvent.end?.dateTime?.split('T')[1]?.substring(0, 5);
    
    // If end date is same as start date, don't store it (single-day event)
    if (endDate === startDate) {
      endDate = undefined;
    }
  }

  return {
    type: 'event',
    title: gcalEvent.summary || 'Untitled Event',
    content: gcalEvent.description || '',
    status: 'active',
    startDate,
    endDate,
    startTime,
    endTime,
    googleCalendarId: gcalEvent.id,
    calendarSynced: true,
    userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════
// CRUD Operations
// ═══════════════════════════════════════════════════════════

/**
 * Create event in Google Calendar
 */
export async function createGoogleEvent(item: OrbitItem): Promise<string> {
  const gcalEvent = orbitToGoogleEvent(item);
  const result = await calendarFetch('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(gcalEvent),
  });
  return result.id; // Google Calendar event ID
}

/**
 * Update event in Google Calendar
 */
export async function updateGoogleEvent(
  googleCalendarId: string,
  item: OrbitItem
): Promise<void> {
  const gcalEvent = orbitToGoogleEvent(item);
  await calendarFetch(`/calendars/primary/events/${googleCalendarId}`, {
    method: 'PUT',
    body: JSON.stringify(gcalEvent),
  });
}

/**
 * Delete event from Google Calendar
 */
export async function deleteGoogleEvent(googleCalendarId: string): Promise<void> {
  await calendarFetch(`/calendars/primary/events/${googleCalendarId}`, {
    method: 'DELETE',
  });
}

/**
 * Fetch events from Google Calendar (for a date range)
 */
export async function fetchGoogleEvents(
  timeMin: string, // ISO datetime
  timeMax: string  // ISO datetime
): Promise<Partial<OrbitItem>[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const result = await calendarFetch(`/calendars/primary/events?${params}`);
  
  // Convert to ORBIT items (need userId from context)
  return result.items || [];
}

/**
 * Import Google Calendar event into ORBIT
 */
export async function importGoogleEvent(
  gcalEventId: string,
  userId: string
): Promise<Partial<OrbitItem>> {
  const gcalEvent = await calendarFetch(`/calendars/primary/events/${gcalEventId}`);
  return googleToOrbitEvent(gcalEvent, userId);
}

// ═══════════════════════════════════════════════════════════
// Sync Utilities
// ═══════════════════════════════════════════════════════════

/**
 * Check if user has granted Calendar permission
 */
export function hasCalendarPermission(): boolean {
  return getGoogleAccessToken() !== null;
}

/**
 * Sync ORBIT event to Google Calendar (create or update)
 */
export async function syncEventToGoogle(item: OrbitItem): Promise<string> {
  if (item.type !== 'event') {
    throw new Error('Only events can be synced');
  }

  if (item.googleCalendarId) {
    // Update existing
    await updateGoogleEvent(item.googleCalendarId, item);
    return item.googleCalendarId;
  } else {
    // Create new
    return await createGoogleEvent(item);
  }
}

// ═══════════════════════════════════════════════════════════
// TypeScript Augmentation for Google Identity Services
// ═══════════════════════════════════════════════════════════

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => any;
        };
      };
    };
  }
}
