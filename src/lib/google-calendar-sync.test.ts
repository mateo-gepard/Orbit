import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GCalEvent } from './google-calendar';
import type { OrbitItem } from './types';

const testState = vi.hoisted(() => ({ items: [] as OrbitItem[] }));
const calendarMocks = vi.hoisted(() => ({
  cancelPendingGoogleCalendarRequests: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  fetchGoogleEvents: vi.fn(async (): Promise<GCalEvent[]> => []),
  findGoogleEventByThreadmapItemId: vi.fn(),
  getGoogleEvent: vi.fn(),
  googleEventIdForOrbitItem: vi.fn((item: Pick<OrbitItem, 'id' | 'userId'>) =>
    `google-${item.userId}-${item.id}`),
  hasCalendarPermission: vi.fn(() => true),
  googleToOrbitEvent: vi.fn(),
  syncEventToGoogle: vi.fn(),
}));
const firestoreMocks = vi.hoisted(() => ({
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock('./firestore', () => ({
  createItem: firestoreMocks.createItem,
  deleteItem: firestoreMocks.deleteItem,
  updateItem: firestoreMocks.updateItem,
}));
vi.mock('./store', () => ({
  useOrbitStore: { getState: vi.fn(() => ({ items: testState.items })) },
}));
vi.mock('./settings-store', () => ({
  useSettingsStore: { getState: vi.fn(() => ({ settings: { language: 'en', calendar: { googleCalendarSync: true } } })) },
}));
vi.mock('./google-calendar', () => ({
  cancelPendingGoogleCalendarRequests: calendarMocks.cancelPendingGoogleCalendarRequests,
  deleteGoogleEvent: calendarMocks.deleteGoogleEvent,
  fetchGoogleEvents: calendarMocks.fetchGoogleEvents,
  findGoogleEventByThreadmapItemId: calendarMocks.findGoogleEventByThreadmapItemId,
  getGoogleEvent: calendarMocks.getGoogleEvent,
  googleEventIdForOrbitItem: calendarMocks.googleEventIdForOrbitItem,
  hasCalendarPermission: calendarMocks.hasCalendarPermission,
  googleToOrbitEvent: calendarMocks.googleToOrbitEvent,
  syncEventToGoogle: calendarMocks.syncEventToGoogle,
}));

import {
  canAcceptInboundGoogleCalendarUpdate,
  clearGoogleCalendarOutboundJournal,
  googleCalendarImportItemId,
  isPendingGoogleCalendarPush,
  pendingGoogleCalendarPushes,
  startGoogleCalendarSync,
  stopGoogleCalendarSync,
  syncGoogleCalendar,
} from './google-calendar-sync';

function event(overrides: Partial<OrbitItem> = {}): OrbitItem {
  return {
    id: overrides.id || 'event-1',
    type: 'event',
    title: 'Calendar event',
    status: 'active',
    userId: 'user-1',
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  testState.items = [];
  vi.clearAllMocks();
  firestoreMocks.updateItem.mockResolvedValue('committed');
  calendarMocks.fetchGoogleEvents.mockResolvedValue([]);
  calendarMocks.findGoogleEventByThreadmapItemId.mockResolvedValue(null);
  calendarMocks.getGoogleEvent.mockResolvedValue(null);
  calendarMocks.hasCalendarPermission.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  stopGoogleCalendarSync();
});

describe('Google Calendar outbound queue', () => {
  it('does not create a remote event when its recovery journal cannot be verified', async () => {
    const userId = 'blocked-journal-owner';
    testState.items = [event({
      id: 'blocked-journal-event',
      userId,
      startDate: '2026-08-06',
      calendarSynced: false,
    })];
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('storage blocked'); }),
      removeItem: vi.fn(),
    });

    startGoogleCalendarSync(userId);
    const result = await syncGoogleCalendar(userId);

    expect(result.success).toBe(false);
    expect(calendarMocks.syncEventToGoogle).not.toHaveBeenCalled();
    expect(testState.items[0].calendarSynced).toBe(false);
  });

  it('uses a deterministic owner-scoped ID for concurrent Google imports', async () => {
    const first = await googleCalendarImportItemId('owner-a', 'google-event');
    const repeated = await googleCalendarImportItemId('owner-a', 'google-event');
    const otherOwner = await googleCalendarImportItemId('owner-b', 'google-event');
    const otherEvent = await googleCalendarImportItemId('owner-a', 'other-event');

    expect(first).toBe(repeated);
    expect(first).toMatch(/^gcal_[a-f0-9]{64}$/);
    expect(otherOwner).not.toBe(first);
    expect(otherEvent).not.toBe(first);
  });

  it('creates imported Google events at their deterministic mapping ID', async () => {
    const userId = 'import-owner';
    calendarMocks.fetchGoogleEvents.mockResolvedValueOnce([{
      id: 'google-import',
      summary: 'Imported event',
      start: { date: '2026-08-06' },
      end: { date: '2026-08-07' },
      status: 'confirmed',
    }]);
    calendarMocks.googleToOrbitEvent.mockReturnValue({
      title: 'Imported event',
      content: '',
      startDate: '2026-08-06',
    });

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);

    expect(firestoreMocks.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarId: 'google-import',
        googleCalendarOrigin: true,
        userId,
      }),
      { id: await googleCalendarImportItemId(userId, 'google-import') },
    );
  });

  it('reuses a verified Threadmap source ID from Google private metadata', async () => {
    const userId = 'source-owner';
    calendarMocks.fetchGoogleEvents.mockResolvedValueOnce([{
      id: 'google-source-owner-source-event',
      summary: 'Cross-device event',
      start: { date: '2026-08-06' },
      end: { date: '2026-08-07' },
      status: 'confirmed',
      extendedProperties: { private: { threadmapItemId: 'source-event' } },
    }]);
    calendarMocks.googleToOrbitEvent.mockReturnValue({
      title: 'Cross-device event',
      startDate: '2026-08-06',
    });

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);

    expect(firestoreMocks.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarId: 'google-source-owner-source-event',
        googleCalendarOrigin: true,
      }),
      { id: 'source-event' },
    );
  });

  it('only queues active event changes explicitly marked as unsynced', () => {
    expect(isPendingGoogleCalendarPush(event({ calendarSynced: false }))).toBe(true);
    expect(isPendingGoogleCalendarPush(event({ calendarSynced: true }))).toBe(false);
    expect(isPendingGoogleCalendarPush(event({ status: 'archived', calendarSynced: false }))).toBe(false);
    expect(isPendingGoogleCalendarPush(event({ type: 'task', calendarSynced: false }))).toBe(false);
  });

  it('flushes pending events in stable creation order', () => {
    const ordered = pendingGoogleCalendarPushes([
      event({ id: 'later', createdAt: 20, calendarSynced: false }),
      event({ id: 'synced', createdAt: 0, calendarSynced: true }),
      event({ id: 'first-b', createdAt: 10, calendarSynced: false }),
      event({ id: 'first-a', createdAt: 10, calendarSynced: false }),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['first-a', 'first-b', 'later']);
  });

  it('does not permit inbound Calendar data to overwrite a pending local edit', () => {
    expect(canAcceptInboundGoogleCalendarUpdate(event({
      googleCalendarId: 'google-event',
      calendarSynced: false,
    }))).toBe(false);
    expect(canAcceptInboundGoogleCalendarUpdate(event({
      googleCalendarId: 'google-event',
      calendarSynced: true,
    }))).toBe(true);
    expect(canAcceptInboundGoogleCalendarUpdate(event({ calendarSynced: true }))).toBe(false);
  });

  it('persists a new Google ID before acknowledging the outbox and never repeats the POST', async () => {
    const userId = 'normal-owner';
    const source = event({
      id: 'normal-event',
      userId,
      startDate: '2026-08-06',
      startTime: '09:00',
      endTime: '10:00',
      calendarSynced: false,
    });
    testState.items = [source];
    calendarMocks.syncEventToGoogle.mockResolvedValue('google-normal');
    firestoreMocks.updateItem.mockImplementation(async (id, updates) => {
      testState.items = testState.items.map((item) => item.id === id
        ? { ...item, ...updates, updatedAt: item.updatedAt + 1 }
        : item);
      return 'committed';
    });

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);

    expect(calendarMocks.syncEventToGoogle).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.updateItem).toHaveBeenNthCalledWith(1, source.id, {
      googleCalendarId: 'google-normal',
      calendarSynced: false,
    });
    expect(firestoreMocks.updateItem).toHaveBeenNthCalledWith(2, source.id, {
      googleCalendarId: 'google-normal',
      calendarSynced: true,
    });
    expect(testState.items[0]).toMatchObject({
      googleCalendarId: 'google-normal',
      calendarSynced: true,
    });

    await syncGoogleCalendar(userId);
    expect(calendarMocks.syncEventToGoogle).toHaveBeenCalledTimes(1);
  });

  it('keeps the created-ID journal until the Firestore mapping is confirmed', async () => {
    const userId = 'pending-mapping-owner';
    const source = event({
      id: 'pending-mapping-event',
      userId,
      startDate: '2026-08-06',
      calendarSynced: false,
    });
    testState.items = [source];
    calendarMocks.syncEventToGoogle.mockResolvedValue('google-pending-mapping');
    firestoreMocks.updateItem.mockImplementationOnce(async (id, updates) => {
      testState.items = testState.items.map((item) => item.id === id
        ? { ...item, ...updates, updatedAt: item.updatedAt + 1 }
        : item);
      return 'pending';
    });

    startGoogleCalendarSync(userId);
    const first = await syncGoogleCalendar(userId);

    expect(first.success).toBe(false);
    expect(calendarMocks.syncEventToGoogle).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.updateItem).toHaveBeenCalledTimes(1);

    calendarMocks.getGoogleEvent.mockResolvedValueOnce({
      id: 'google-pending-mapping',
      status: 'confirmed',
      extendedProperties: { private: { threadmapItemId: source.id } },
    });
    firestoreMocks.updateItem.mockImplementation(async (id, updates) => {
      testState.items = testState.items.map((item) => item.id === id
        ? { ...item, ...updates, updatedAt: item.updatedAt + 1 }
        : item);
      return 'committed';
    });

    const second = await syncGoogleCalendar(userId);

    expect(second.success).toBe(true);
    expect(calendarMocks.syncEventToGoogle).toHaveBeenCalledTimes(1);
    expect(testState.items[0]).toMatchObject({
      googleCalendarId: 'google-pending-mapping',
      calendarSynced: true,
    });
  });

  it.each([
    ['deleted', undefined],
    ['archived', { status: 'archived' as const }],
    ['type-changed', { type: 'task' as const }],
  ])('reconciles a completed Google POST when the local item is %s before mapping', async (scenario, replacement) => {
    const userId = `race-${scenario}`;
    const source = event({
      id: `event-${scenario}`,
      userId,
      startDate: '2026-08-06',
      startTime: '09:00',
      endTime: '10:00',
      calendarSynced: false,
    });
    testState.items = [source];
    calendarMocks.syncEventToGoogle.mockImplementationOnce(async () => {
      testState.items = replacement ? [{ ...source, ...replacement }] : [];
      return `google-${scenario}`;
    });

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);

    expect(calendarMocks.deleteGoogleEvent).toHaveBeenCalledWith(`google-${scenario}`);
    expect(firestoreMocks.updateItem).not.toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({ calendarSynced: true }),
    );

    await syncGoogleCalendar(userId);
    expect(calendarMocks.deleteGoogleEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps a created-ID journal across an owner-generation change and reconciles it later', async () => {
    const userId = 'generation-owner';
    const source = event({
      id: 'generation-event',
      userId,
      startDate: '2026-08-06',
      startTime: '09:00',
      endTime: '10:00',
      calendarSynced: false,
    });
    testState.items = [source];
    calendarMocks.syncEventToGoogle.mockImplementationOnce(async () => {
      testState.items = [];
      stopGoogleCalendarSync();
      return 'google-generation';
    });

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);
    expect(calendarMocks.deleteGoogleEvent).not.toHaveBeenCalled();

    calendarMocks.findGoogleEventByThreadmapItemId.mockResolvedValueOnce({
      id: 'google-generation',
      status: 'confirmed',
    });
    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);
    expect(calendarMocks.deleteGoogleEvent).toHaveBeenCalledWith('google-generation');

    await syncGoogleCalendar(userId);
    expect(calendarMocks.deleteGoogleEvent).toHaveBeenCalledTimes(1);
  });

  it('does not recreate a securely cleared journal when a delayed create response arrives', async () => {
    const userId = 'forgotten-owner';
    const source = event({
      id: 'forgotten-event',
      userId,
      startDate: '2026-08-06',
      calendarSynced: false,
    });
    testState.items = [source];
    calendarMocks.syncEventToGoogle.mockImplementationOnce(async () => {
      testState.items = [];
      stopGoogleCalendarSync();
      expect(clearGoogleCalendarOutboundJournal(userId)).toBe(true);
      return 'google-forgotten';
    });

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);

    startGoogleCalendarSync(userId);
    await syncGoogleCalendar(userId);
    expect(calendarMocks.getGoogleEvent).not.toHaveBeenCalled();
    expect(calendarMocks.findGoogleEventByThreadmapItemId).not.toHaveBeenCalled();
    expect(calendarMocks.deleteGoogleEvent).not.toHaveBeenCalled();
  });
});
