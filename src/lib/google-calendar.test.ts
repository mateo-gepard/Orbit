import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCalendarAccess } from './calendar-access';
import type { OrbitItem } from './types';

vi.mock('./settings-store', () => ({
  detectDeviceTimeZone: () => 'UTC',
  normalizeIanaTimeZone: (value: unknown) => typeof value === 'string' && value ? value : null,
  useSettingsStore: {
    getState: () => ({
      settings: {
        timezone: 'Europe/Berlin',
        calendar: { googleCalendarSync: true },
      },
    }),
  },
}));

import {
  createGoogleEvent,
  findGoogleEventByThreadmapItemId,
  getGoogleAccessToken,
  GOOGLE_CALENDAR_SCOPES,
  googleEventIdForOrbitItem,
  orbitToGoogleEvent,
  requestCalendarPermission,
  revokeGoogleCalendarAccess,
  setGoogleAccessToken,
  setGoogleCalendarOwner,
} from './google-calendar';

function event(overrides: Partial<OrbitItem> = {}): OrbitItem {
  return {
    id: 'event-1',
    type: 'event',
    title: 'Planning',
    status: 'active',
    startDate: '2026-08-06',
    startTime: '09:00',
    endTime: '10:00',
    tags: [],
    userId: 'calendar-user',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

afterEach(() => {
  setGoogleCalendarOwner(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Google Calendar consent', () => {
  it('requests only owner-calendar event access', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toEqual([
      'https://www.googleapis.com/auth/calendar.events.owned',
    ]);
  });

  it('allows an authenticated owner to start first-time consent while sync is disabled', async () => {
    expect(() => assertCalendarAccess('calendar-user', false, false)).not.toThrow();
  });

  it('still rejects consent for demo mode', () => {
    expect(() => assertCalendarAccess('demo-user', false, false)).toThrow(
      'Sign in to use Google Calendar sync.'
    );
  });

  it('requires the enabled setting for Calendar API calls after consent', () => {
    expect(() => assertCalendarAccess('calendar-user', false, true)).toThrow(
      'Enable Google Calendar sync in Settings first.'
    );
  });

  it('keeps a tab-memory token when session storage is blocked', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
      removeItem: vi.fn(() => { throw new Error('blocked'); }),
    });
    setGoogleCalendarOwner('calendar-user');

    expect(() => setGoogleAccessToken('memory-token')).not.toThrow();
    expect(getGoogleAccessToken()).toBe('memory-token');
  });

  it('rejects a delayed OAuth callback after the signed-in account changes', async () => {
    let callback: ((response: { access_token: string; expires_in?: number }) => void) | undefined;
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn((config: {
      callback: typeof callback;
      include_granted_scopes: boolean;
      scope: string;
    }) => {
      callback = config.callback;
      return { requestAccessToken };
    });
    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient,
          },
        },
      },
    });
    vi.stubGlobal('document', {});
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID', 'calendar-client');

    setGoogleCalendarOwner('account-a');
    const permission = requestCalendarPermission();
    await vi.waitFor(() => expect(requestAccessToken).toHaveBeenCalledOnce());
    expect(initTokenClient).toHaveBeenCalledWith(expect.objectContaining({
      include_granted_scopes: false,
      scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    }));

    setGoogleCalendarOwner('account-b');
    callback?.({ access_token: 'account-a-token', expires_in: 3600 });

    await expect(permission).rejects.toThrow('signed-in account changed');
    expect(getGoogleAccessToken()).toBeNull();
  });

  it('revokes provider consent before clearing the local Calendar credential', async () => {
    const revoke = vi.fn((token: string, callback: (result: { successful: boolean }) => void) => {
      callback({ successful: true });
    });
    vi.stubGlobal('window', {
      google: { accounts: { oauth2: { initTokenClient: vi.fn(), revoke } } },
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal('document', {});
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    setGoogleCalendarOwner('calendar-user');
    setGoogleAccessToken('calendar-token', 3600);

    await expect(revokeGoogleCalendarAccess()).resolves.toBe('revoked');
    expect(revoke).toHaveBeenCalledWith('calendar-token', expect.any(Function));
    expect(getGoogleAccessToken()).toBeNull();
  });

  it('reports a local-only disconnect when Google cannot confirm revocation', async () => {
    const revoke = vi.fn((_token: string, callback: (result: { successful: boolean }) => void) => {
      callback({ successful: false });
    });
    vi.stubGlobal('window', {
      google: { accounts: { oauth2: { initTokenClient: vi.fn(), revoke } } },
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal('document', {});
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    setGoogleCalendarOwner('calendar-user');
    setGoogleAccessToken('calendar-token', 3600);

    await expect(revokeGoogleCalendarAccess()).resolves.toBe('local-only');
    expect(getGoogleAccessToken()).toBeNull();
  });
});

describe('Google Calendar event serialization', () => {
  it('derives a stable, owner-scoped Google-safe event ID', () => {
    const first = googleEventIdForOrbitItem(event());
    const repeated = googleEventIdForOrbitItem(event());
    const otherItem = googleEventIdForOrbitItem(event({ id: 'event-2' }));
    const otherOwner = googleEventIdForOrbitItem(event({ userId: 'other-owner' }));

    expect(first).toBe(repeated);
    expect(first).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(otherItem).not.toBe(first);
    expect(otherOwner).not.toBe(first);
  });

  it('uses the configured account timezone for a valid timed range', () => {
    expect(orbitToGoogleEvent(event())).toMatchObject({
      start: { dateTime: '2026-08-06T09:00:00', timeZone: 'Europe/Berlin' },
      end: { dateTime: '2026-08-06T10:00:00', timeZone: 'Europe/Berlin' },
    });
  });

  it('adds the Threadmap item ID as a private extended property', () => {
    expect(orbitToGoogleEvent(event())).toMatchObject({
      extendedProperties: {
        private: { threadmapItemId: 'event-1' },
      },
    });
  });

  it('serializes all-day end dates as exclusive', () => {
    expect(orbitToGoogleEvent(event({
      startTime: undefined,
      endTime: undefined,
      endDate: '2026-08-08',
    }))).toMatchObject({
      start: { date: '2026-08-06' },
      end: { date: '2026-08-09' },
    });
  });

  it('never substitutes today for a cleared or invalid schedule', () => {
    expect(() => orbitToGoogleEvent(event({ startDate: undefined }))).toThrow(
      'Invalid calendar event schedule: missing-start-date',
    );
    expect(() => orbitToGoogleEvent(event({ endTime: '08:59' }))).toThrow(
      'Invalid calendar event schedule: end-before-start',
    );
  });
});

describe('Google Calendar idempotent creation', () => {
  it('inserts with the deterministic ID and preserves the private item mapping', async () => {
    setGoogleCalendarOwner('calendar-user');
    setGoogleAccessToken('calendar-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: googleEventIdForOrbitItem(event()),
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const createdId = await createGoogleEvent(event());
    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request[1].body));

    expect(createdId).toBe(googleEventIdForOrbitItem(event()));
    expect(request[1].method).toBe('POST');
    expect(body).toMatchObject({
      id: createdId,
      extendedProperties: {
        private: { threadmapItemId: 'event-1' },
      },
    });
  });

  it('treats a 409 insert conflict as a retry and patches the same event', async () => {
    setGoogleCalendarOwner('calendar-user');
    setGoogleAccessToken('calendar-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Already exists', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const createdId = await createGoogleEvent(event());
    const requests = fetchMock.mock.calls as [string, RequestInit][];

    expect(createdId).toBe(googleEventIdForOrbitItem(event()));
    expect(requests).toHaveLength(2);
    expect(requests[0][1].method).toBe('POST');
    expect(requests[1][0]).toContain(`/events/${createdId}`);
    expect(requests[1][1].method).toBe('PATCH');
  });

  it('finds a previously created event through its private item mapping', async () => {
    setGoogleCalendarOwner('calendar-user');
    setGoogleAccessToken('calendar-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 'mapped-event', status: 'confirmed' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(findGoogleEventByThreadmapItemId('event/with spaces')).resolves.toMatchObject({
      id: 'mapped-event',
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.searchParams.get('privateExtendedProperty')).toBe(
      'threadmapItemId=event/with spaces',
    );
  });
});
