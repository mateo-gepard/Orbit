import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ saveToolData: vi.fn() }));

vi.mock('./firestore', () => ({
  saveToolData: firestore.saveToolData,
  ToolDataConflictError: class ToolDataConflictError extends Error {},
}));
vi.mock('./verified-storage', () => ({
  verifiedLocalStateStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import {
  DEVICE_SCOPE,
  SYNC_RECOVERED_EVENT,
  SYNC_WARNING_EVENT,
  reportSyncRecovered,
  reportSyncWarning,
  syncScopeMatches,
} from './sync-warning';
import { useWishlistStore } from './wishlist-store';

let dispatchEvent: ReturnType<typeof vi.fn>;

/** Every sync event dispatched so far, in order. */
function events(): Array<{ type: string; detail: Record<string, unknown> }> {
  return dispatchEvent.mock.calls
    .map(([event]) => event as CustomEvent)
    .filter((event) => event.type === SYNC_WARNING_EVENT || event.type === SYNC_RECOVERED_EVENT)
    .map((event) => ({ type: event.type, detail: event.detail }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  firestore.saveToolData.mockResolvedValue(undefined);
  dispatchEvent = vi.fn(() => true);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dispatchEvent },
  });
});

afterEach(() => {
  useWishlistStore.getState()._setSyncUserId(null);
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('sync warning scope', () => {
  it('matches only the account a warning was raised for', () => {
    expect(syncScopeMatches('owner-a', 'owner-a')).toBe(true);
    expect(syncScopeMatches('owner-a', 'owner-b')).toBe(false);
    expect(syncScopeMatches('owner-a', null)).toBe(false);
  });

  it('applies device-scoped warnings to every account, including signed out', () => {
    expect(syncScopeMatches(DEVICE_SCOPE, 'owner-a')).toBe(true);
    expect(syncScopeMatches(DEVICE_SCOPE, null)).toBe(true);
  });

  it('carries the key and account through the event bus', () => {
    reportSyncWarning({ key: 'tool:wishlist', userId: 'owner-a', message: 'nope' });
    reportSyncRecovered({ key: 'tool:wishlist', userId: 'owner-a' });

    expect(events()).toEqual([
      {
        type: SYNC_WARNING_EVENT,
        detail: { key: 'tool:wishlist', userId: 'owner-a', message: 'nope' },
      },
      {
        type: SYNC_RECOVERED_EVENT,
        detail: { key: 'tool:wishlist', userId: 'owner-a' },
      },
    ]);
  });
});

describe('tool sync retry lifecycle', () => {
  it('announces recovery under the same key once a retry finally succeeds', async () => {
    useWishlistStore.getState()._setSyncUserId('owner-a');
    firestore.saveToolData.mockRejectedValueOnce(new Error('offline'));

    useWishlistStore.getState().addItem({ name: 'Camera', currency: 'EUR', category: 'other' });

    // The first attempt fails and schedules the 5s retry.
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{
      type: SYNC_WARNING_EVENT,
      detail: {
        key: 'tool:wishlist',
        userId: 'owner-a',
        toolId: 'wishlist',
        message: 'Wishlist changes are saved on this device, but cloud sync will retry.',
      },
    }]);

    // The retry succeeds, which must clear the banner it raised. Before this
    // contract existed the success was silent and the banner never went away.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(events().at(-1)).toEqual({
      type: SYNC_RECOVERED_EVENT,
      detail: { key: 'tool:wishlist', userId: 'owner-a' },
    });
    expect(useWishlistStore.getState().cloudDirty).toBe(false);
  });

  it('attributes the warning to the account that owned the failing save', async () => {
    useWishlistStore.getState()._setSyncUserId('owner-a');
    firestore.saveToolData.mockRejectedValue(new Error('offline'));

    useWishlistStore.getState().addItem({ name: 'Lens', currency: 'EUR', category: 'other' });
    await vi.advanceTimersByTimeAsync(600);

    const warnings = events().filter((event) => event.type === SYNC_WARNING_EVENT);
    expect(warnings).toHaveLength(1);
    // An unattributed warning survives an account switch and shows to the
    // next signed-in user, so the account is required rather than optional.
    expect(warnings[0].detail.userId).toBe('owner-a');
  });
});
