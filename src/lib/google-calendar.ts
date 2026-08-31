// ═══════════════════════════════════════════════════════════
// Threadmap — Google Calendar API Integration
// ═══════════════════════════════════════════════════════════

import type { OrbitItem } from './types';
import { scopedStorageKey } from './account-storage';
import {
  detectDeviceTimeZone,
  normalizeIanaTimeZone,
  useSettingsStore,
} from './settings-store';
import { assertCalendarAccess } from './calendar-access';
import {
  assertValidCalendarEventSchedule,
  calendarEventScheduleFromItem,
} from './calendar-event';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
/**
 * Every API operation below is intentionally limited to `calendars/primary`.
 * Keep consent aligned with that product contract: the broader
 * `calendar.events` scope also grants access to calendars the user can edit
 * but does not own.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
] as const;
const TOKEN_STORAGE_KEY = 'orbit-google-token';
const TOKEN_EXPIRY_KEY = 'orbit-google-token-expiry';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// ═══════════════════════════════════════════════════════════
// Google Calendar Types
// ═══════════════════════════════════════════════════════════

interface GCalDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GCalEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: GCalDateTime;
  end?: GCalDateTime;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  /** Present on every expanded instance of a recurring event: the series id. */
  recurringEventId?: string;
  /** RRULE/EXDATE lines, present on a series master. */
  recurrence?: string[];
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

interface GCalEventListResponse {
  items?: GCalEvent[];
  nextPageToken?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  include_granted_scopes: boolean;
  callback: (response: GoogleTokenResponse) => void;
}

interface GoogleRevocationResponse {
  successful?: boolean;
  error?: string;
  error_description?: string;
}

export type GoogleCalendarRevocationOutcome = 'revoked' | 'local-only';

class GoogleCalendarApiError extends Error {
  constructor(
    readonly status: number,
    responseBody: string,
  ) {
    super(`Google Calendar API error (${status}): ${responseBody}`);
    this.name = 'GoogleCalendarApiError';
  }
}

const BASE32HEX_ALPHABET = '0123456789abcdefghijklmnopqrstuv';

function base32Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let buffer = 0;
  let bits = 0;
  let result = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32HEX_ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= bits === 0 ? 0 : (1 << bits) - 1;
  }

  if (bits > 0) {
    result += BASE32HEX_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return result;
}

/**
 * Google accepts caller-supplied event IDs containing lowercase base32hex
 * characters. Encoding the owner/item tuple directly is collision-free and
 * makes a retried insert address the same Google event without another write
 * journal being required.
 */
export function googleEventIdForOrbitItem(
  item: Pick<OrbitItem, 'id' | 'userId'>,
): string {
  const eventId = `tm1${base32Hex(JSON.stringify([item.userId, item.id]))}`;
  if (eventId.length > 1024) {
    throw new Error('Threadmap item identity is too long for a Google Calendar event ID.');
  }
  return eventId;
}

function addCalendarDays(dateValue: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new Error('Invalid calendar date.');
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (base.toISOString().slice(0, 10) !== dateValue) {
    throw new Error('Invalid calendar date.');
  }
  const date = new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate() + days
  ));
  return date.toISOString().slice(0, 10);
}

function calendarTimezone(): string {
  const configured = useSettingsStore.getState().settings.timezone;
  return normalizeIanaTimeZone(configured) ?? detectDeviceTimeZone();
}

function dateTimeParts(value: string | undefined, timezone: string): {
  date?: string;
  time?: string;
} {
  if (!value) return {};
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return {};
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

// ═══════════════════════════════════════════════════════════
// Token Management (with expiration)
// ═══════════════════════════════════════════════════════════

let accessToken: string | null = null;
let calendarOwnerId: string | null = null;
let calendarOwnerGeneration = 0;
let googleIdentityScriptPromise: Promise<void> | null = null;
const activeCalendarRequests = new Set<AbortController>();
const CALENDAR_REQUEST_TIMEOUT_MS = 20_000;
const MAX_CALENDAR_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_CALENDAR_ERROR_BYTES = 64 * 1024;

export function cancelPendingGoogleCalendarRequests(): void {
  for (const controller of activeCalendarRequests) {
    controller.abort(new DOMException('Google Calendar request cancelled.', 'AbortError'));
  }
  activeCalendarRequests.clear();
}

function tokenStorageKey(): string | null {
  return calendarOwnerId ? scopedStorageKey(TOKEN_STORAGE_KEY, calendarOwnerId) : null;
}

function expiryStorageKey(): string | null {
  return calendarOwnerId ? scopedStorageKey(TOKEN_EXPIRY_KEY, calendarOwnerId) : null;
}

export function setGoogleCalendarOwner(userId: string | null): void {
  if (calendarOwnerId === userId) return;
  cancelPendingGoogleCalendarRequests();
  if (calendarOwnerId) clearGoogleAccessToken();
  calendarOwnerId = userId;
  calendarOwnerGeneration += 1;
  accessToken = null;
}

function assertCalendarOwnerContext(ownerId: string, generation: number): void {
  if (calendarOwnerId !== ownerId || calendarOwnerGeneration !== generation) {
    throw new Error('Google Calendar authorization was cancelled because the signed-in account changed.');
  }
}

function assertCalendarEnabled(): void {
  assertCalendarAccess(
    calendarOwnerId,
    useSettingsStore.getState().settings.calendar.googleCalendarSync,
    true
  );
}

function assertCalendarOwner(): void {
  assertCalendarAccess(
    calendarOwnerId,
    useSettingsStore.getState().settings.calendar.googleCalendarSync,
    false
  );
}

export function setGoogleAccessToken(
  token: string,
  expiresInSeconds?: number,
  expectedOwnerId = calendarOwnerId,
  expectedGeneration = calendarOwnerGeneration,
) {
  // OAuth consent necessarily completes before the sync preference is enabled.
  // Binding the token to an authenticated account is the only precondition here;
  // Calendar API calls continue to require the enabled preference.
  assertCalendarOwner();
  if (!expectedOwnerId) throw new Error('Sign in to use Google Calendar sync.');
  assertCalendarOwnerContext(expectedOwnerId, expectedGeneration);
  // Keep an in-memory credential even when privacy settings block tab storage.
  accessToken = token;
  if (typeof window !== 'undefined') {
    try {
      const tokenKey = tokenStorageKey();
      const expiryKey = expiryStorageKey();
      if (!tokenKey || !expiryKey) return;
      sessionStorage.setItem(tokenKey, token);
      if (expiresInSeconds) {
        const expiryTime = Date.now() + expiresInSeconds * 1000;
        sessionStorage.setItem(expiryKey, String(expiryTime));
      } else {
        sessionStorage.removeItem(expiryKey);
      }
    } catch {
      // The token remains usable for this tab even when storage is unavailable.
    }
  }
}

export function getGoogleAccessToken(): string | null {
  if (!calendarOwnerId || !useSettingsStore.getState().settings.calendar.googleCalendarSync) {
    return null;
  }
  return getStoredGoogleAccessToken();
}

function getStoredGoogleAccessToken(): string | null {
  if (!calendarOwnerId) return null;
  if (typeof window !== 'undefined') {
    try {
      // Check expiration
      const expiryKey = expiryStorageKey();
      const expiry = expiryKey ? sessionStorage.getItem(expiryKey) : null;
      if (expiry && Date.now() > Number(expiry)) {
        clearGoogleAccessToken();
        return null;
      }
    } catch {
      // An in-memory token remains usable if session storage becomes blocked.
      return accessToken;
    }
  }
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    try {
      const tokenKey = tokenStorageKey();
      accessToken = tokenKey ? sessionStorage.getItem(tokenKey) : null;
    } catch {
      accessToken = null;
    }
  }
  return accessToken;
}

export function clearGoogleAccessToken() {
  accessToken = null;
  if (typeof window !== 'undefined') {
    try {
      const tokenKey = tokenStorageKey();
      const expiryKey = expiryStorageKey();
      if (tokenKey) sessionStorage.removeItem(tokenKey);
      if (expiryKey) sessionStorage.removeItem(expiryKey);
    } catch {
      // Memory was still cleared; inaccessible tab storage expires naturally.
    }
  }
}

/**
 * Disconnect Calendar from an explicit user action. Google records consent by
 * user and OAuth client beyond the lifetime of an individual access token, so
 * removing our session copy alone is not a true disconnect. Revoke the grant
 * while a valid token is available, then clear local credentials regardless of
 * provider/network outcome. Callers can surface `local-only` with a link to the
 * user's Google Account permissions instead of claiming revocation succeeded.
 */
export async function revokeGoogleCalendarAccess(): Promise<GoogleCalendarRevocationOutcome> {
  const token = getStoredGoogleAccessToken();
  cancelPendingGoogleCalendarRequests();

  if (!token) {
    clearGoogleAccessToken();
    return 'local-only';
  }

  try {
    await loadGoogleIdentityServices();
    const revoke = window.google?.accounts?.oauth2?.revoke;
    if (typeof revoke !== 'function') return 'local-only';

    const successful = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(value);
      };
      const timeoutId = window.setTimeout(() => finish(false), 10_000);
      revoke(token, (response) => finish(response.successful === true));
    });
    return successful ? 'revoked' : 'local-only';
  } catch {
    return 'local-only';
  } finally {
    clearGoogleAccessToken();
  }
}

// ═══════════════════════════════════════════════════════════
// OAuth Flow (Client-Side)
// ═══════════════════════════════════════════════════════════

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Calendar permission must be requested in a browser.'));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`,
    );
    const script = existing || document.createElement('script');
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', fail);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Google Identity Services could not be loaded.'));
    };
    const finish = () => {
      if (!window.google?.accounts?.oauth2) {
        fail();
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const timeoutId = window.setTimeout(fail, 15_000);

    script.addEventListener('load', finish);
    script.addEventListener('error', fail);
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleIdentityScriptPromise = null;
    throw error;
  });

  return googleIdentityScriptPromise;
}

/**
 * Preload Google Identity Services after the user opens a Calendar surface.
 * The later permission request can then open its popup synchronously from the
 * actual Connect click, as required by popup blockers.
 */
export function prepareGoogleCalendarPermission(): Promise<void> {
  assertCalendarOwner();
  return loadGoogleIdentityServices();
}

export async function requestCalendarPermission(): Promise<string> {
  // A first-time consent request happens while the setting is still disabled.
  assertCalendarOwner();
  const requestedOwnerId = calendarOwnerId;
  const requestedGeneration = calendarOwnerGeneration;
  if (!requestedOwnerId) throw new Error('Sign in to use Google Calendar sync.');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) {
    throw new Error('Google Calendar Client ID not configured');
  }

  // Do not await script loading here. `requestAccessToken` must run in the
  // direct call stack of the user's click or strict popup blockers reject it.
  // Calendar surfaces call `prepareGoogleCalendarPermission` when opened.
  assertCalendarOwnerContext(requestedOwnerId, requestedGeneration);
  const google = typeof window !== 'undefined' ? window.google : undefined;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Calendar authorization is still loading. Try again in a moment.');
  }

  return new Promise((resolve, reject) => {
    const client: GoogleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      // Google defaults this to true, which would fold an older broad Calendar
      // grant into the new token. Keep each token limited to the current,
      // owner-calendar-only product contract even for returning users.
      include_granted_scopes: false,
      callback: (response: GoogleTokenResponse) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        try {
          assertCalendarOwnerContext(requestedOwnerId, requestedGeneration);
          setGoogleAccessToken(
            response.access_token,
            response.expires_in,
            requestedOwnerId,
            requestedGeneration,
          );
          resolve(response.access_token);
        } catch (error) {
          reject(error);
        }
      },
    });

    client.requestAccessToken();
  });
}

// ═══════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════

async function readCalendarResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Google Calendar returned an oversized response.');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Google Calendar returned an oversized response.');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function calendarFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  behavior: { allowNotFound?: boolean } = {}
): Promise<T | undefined> {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('No Google Calendar access token');
  }

  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Google Calendar request timed out.', 'TimeoutError'));
  }, CALENDAR_REQUEST_TIMEOUT_MS);
  activeCalendarRequests.add(controller);

  try {
    const response = await fetch(`${CALENDAR_API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      clearGoogleAccessToken();
      throw new Error('Google Calendar token expired');
    }
    if (response.status === 404 && behavior.allowNotFound) {
      await response.body?.cancel().catch(() => {});
      return undefined;
    }
    if (!response.ok) {
      const error = await readCalendarResponseText(response, MAX_CALENDAR_ERROR_BYTES);
      throw new GoogleCalendarApiError(response.status, error);
    }
    if (response.status === 204) {
      await response.body?.cancel().catch(() => {});
      return undefined;
    }
    const body = await readCalendarResponseText(response, MAX_CALENDAR_RESPONSE_BYTES);
    return JSON.parse(body) as T;
  } finally {
    clearTimeout(timeoutId);
    activeCalendarRequests.delete(controller);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

// ═══════════════════════════════════════════════════════════
// Convert Threadmap Event ↔ Google Calendar Event
// ═══════════════════════════════════════════════════════════

export function orbitToGoogleEvent(item: OrbitItem): GCalEvent {
  if (item.type !== 'event') {
    throw new Error('Only event items can be synced to Google Calendar');
  }
  const { schedule } = assertValidCalendarEventSchedule(calendarEventScheduleFromItem(item));

  const event: GCalEvent = {
    summary: item.title,
    description: item.content || '',
    extendedProperties: {
      private: {
        threadmapItemId: item.id,
      },
    },
  };

  // Determine if this is an all-day event (no start/end times)
  const isAllDay = !schedule.startTime;

  if (isAllDay) {
    event.start = { date: schedule.startDate };
    // Google Calendar expects an exclusive all-day end date.
    event.end = { date: addCalendarDays(schedule.endDate || schedule.startDate, 1) };
  } else {
    const timezone = calendarTimezone();
    const endDate = schedule.endDate || schedule.startDate;
    event.start = {
      dateTime: `${schedule.startDate}T${schedule.startTime}:00`,
      timeZone: timezone,
    };
    event.end = {
      dateTime: `${endDate}T${schedule.endTime}:00`,
      timeZone: timezone,
    };
  }

  return event;
}

export function googleToOrbitEvent(gcalEvent: GCalEvent, userId: string): Partial<OrbitItem> {
  // Google Calendar uses different formats for all-day vs timed events
  const isAllDay = !!gcalEvent.start?.date;

  let startDate: string | undefined;
  let endDate: string | undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;

  if (isAllDay) {
    // All-day event: uses 'date' field (YYYY-MM-DD)
    startDate = gcalEvent.start!.date;

    // Google Calendar's end.date is EXCLUSIVE (next day after event ends)
    if (gcalEvent.end?.date) {
      endDate = addCalendarDays(gcalEvent.end.date, -1);

      if (endDate === startDate) {
        endDate = undefined;
      }
    }
  } else {
    // Convert offset/Z timestamps into the account's configured timezone.
    const timezone = calendarTimezone();
    const start = dateTimeParts(gcalEvent.start?.dateTime, timezone);
    const end = dateTimeParts(gcalEvent.end?.dateTime, timezone);
    startDate = start.date;
    endDate = end.date;
    startTime = start.time;
    endTime = end.time;

    if (endDate === startDate) {
      endDate = undefined;
    }
  }

  const { schedule } = assertValidCalendarEventSchedule({
    startDate,
    endDate,
    startTime,
    endTime,
  });

  return {
    type: 'event',
    title: gcalEvent.summary || (useSettingsStore.getState().settings.language === 'de'
      ? 'Termin ohne Titel'
      : 'Untitled event'),
    content: gcalEvent.description || '',
    status: 'active',
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    googleCalendarId: gcalEvent.id,
    googleCalendarOrigin: true,
    calendarSynced: true,
    userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════
// CRUD Operations
// ═══════════════════════════════════════════════════════════

export async function createGoogleEvent(item: OrbitItem): Promise<string> {
  assertCalendarEnabled();
  const eventId = googleEventIdForOrbitItem(item);
  const gcalEvent = { ...orbitToGoogleEvent(item), id: eventId };
  try {
    const result = await calendarFetch<GCalEvent>('/calendars/primary/events', {
      method: 'POST',
      body: JSON.stringify(gcalEvent),
    });
    if (!result?.id) throw new Error('Google Calendar did not return an event ID.');
    return result.id;
  } catch (error) {
    if (!(error instanceof GoogleCalendarApiError) || error.status !== 409) throw error;
    await updateGoogleEvent(eventId, item);
    return eventId;
  }
}

export async function updateGoogleEvent(
  googleCalendarId: string,
  item: OrbitItem
): Promise<void> {
  assertCalendarEnabled();
  const gcalEvent = orbitToGoogleEvent(item);
  await calendarFetch(`/calendars/primary/events/${encodeURIComponent(googleCalendarId)}`, {
    method: 'PATCH',
    body: JSON.stringify(gcalEvent),
  });
}

export async function deleteGoogleEvent(googleCalendarId: string): Promise<void> {
  assertCalendarEnabled();
  await calendarFetch(`/calendars/primary/events/${encodeURIComponent(googleCalendarId)}`, {
    method: 'DELETE',
  }, { allowNotFound: true });
}

export async function getGoogleEvent(googleCalendarId: string): Promise<GCalEvent | null> {
  assertCalendarEnabled();
  const event = await calendarFetch<GCalEvent>(
    `/calendars/primary/events/${encodeURIComponent(googleCalendarId)}`,
    {},
    { allowNotFound: true },
  );
  return event || null;
}

export async function fetchGoogleEvents(
  timeMin: string,
  timeMax: string
): Promise<GCalEvent[]> {
  assertCalendarEnabled();
  const events: GCalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      showDeleted: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await calendarFetch<GCalEventListResponse>(
      `/calendars/primary/events?${params}`
    );
    events.push(...(result?.items || []));
    pageToken = result?.nextPageToken;
  } while (pageToken);
  return events;
}

/** Finds a non-cancelled event created for a specific Threadmap item. */
export async function findGoogleEventByThreadmapItemId(
  threadmapItemId: string,
): Promise<GCalEvent | null> {
  assertCalendarEnabled();
  const normalizedItemId = threadmapItemId.trim();
  if (!normalizedItemId) return null;

  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `threadmapItemId=${normalizedItemId}`,
      showDeleted: 'false',
      maxResults: '2500',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await calendarFetch<GCalEventListResponse>(
      `/calendars/primary/events?${params}`,
    );
    const match = result?.items?.find((event) => event.status !== 'cancelled' && Boolean(event.id));
    if (match) return match;
    pageToken = result?.nextPageToken;
  } while (pageToken);

  return null;
}

export async function importGoogleEvent(
  gcalEventId: string,
  userId: string
): Promise<Partial<OrbitItem>> {
  const gcalEvent = await calendarFetch<GCalEvent>(
    `/calendars/primary/events/${encodeURIComponent(gcalEventId)}`,
  );
  if (!gcalEvent) throw new Error('Google Calendar event was not found.');
  return googleToOrbitEvent(gcalEvent, userId);
}

// ═══════════════════════════════════════════════════════════
// Sync Utilities
// ═══════════════════════════════════════════════════════════

export function hasCalendarPermission(): boolean {
  return getStoredGoogleAccessToken() !== null;
}

export async function syncEventToGoogle(item: OrbitItem): Promise<string> {
  assertCalendarEnabled();
  if (calendarOwnerId !== item.userId) {
    throw new Error('Calendar credentials do not belong to this item owner.');
  }
  if (item.type !== 'event') {
    throw new Error('Only events can be synced');
  }

  if (item.googleCalendarId) {
    await updateGoogleEvent(item.googleCalendarId, item);
    return item.googleCalendarId;
  } else {
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
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
          revoke: (
            accessToken: string,
            callback: (response: GoogleRevocationResponse) => void,
          ) => void;
        };
      };
    };
  }
}
