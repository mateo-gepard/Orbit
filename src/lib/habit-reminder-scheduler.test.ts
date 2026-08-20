import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrbitItem } from './types';

const settings = vi.hoisted(() => ({
  notifications: {
    enabled: true,
    habitReminders: true,
    sound: true,
  },
  language: 'en',
}));

vi.mock('./settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ settings }),
  },
}));

import {
  setLocalNotificationOwner,
  startHabitReminderScheduler,
  stopHabitReminderScheduler,
} from './briefing-notifications';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function habit(overrides: Partial<OrbitItem> = {}): OrbitItem {
  return {
    id: 'habit-one',
    title: 'Private habit title',
    type: 'habit',
    status: 'active',
    frequency: 'daily',
    habitTime: '07:30',
    completions: {},
    createdAt: 0,
    updatedAt: 0,
    userId: 'cloud-owner',
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  for (let count = 0; count < 6; count += 1) await Promise.resolve();
}

let storage: MemoryStorage;
let showNotification: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 7, 7, 32));
  storage = new MemoryStorage();
  showNotification = vi.fn(async () => undefined);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: { permission: 'granted' },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { Notification: globalThis.Notification },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        ready: Promise.resolve({
          showNotification,
          getNotifications: vi.fn(async () => []),
        }),
      },
    },
  });
  settings.notifications.enabled = true;
  settings.notifications.habitReminders = true;
  settings.language = 'en';
  stopHabitReminderScheduler();
  await setLocalNotificationOwner(null);
});

afterEach(async () => {
  stopHabitReminderScheduler();
  await setLocalNotificationOwner(null);
  vi.useRealTimers();
});

describe('foreground habit reminder scheduler', () => {
  it('delivers a cloud owner habit once per local day with truthful routing', async () => {
    startHabitReminderScheduler('cloud-owner', () => [habit()]);
    await flushPromises();

    expect(showNotification).toHaveBeenCalledOnce();
    expect(showNotification).toHaveBeenCalledWith(
      'Time for: Private habit title',
      expect.objectContaining({
        tag: 'habit-reminder-habit-one-2026-08-07',
        data: expect.objectContaining({
          url: '/habits',
          type: 'habit-reminder',
          threadmapLocalOwnerId: 'cloud-owner',
        }),
      }),
    );

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(showNotification).toHaveBeenCalledOnce();
    expect(storage.getItem('orbit-habit-reminders-fired:cloud-owner')).toContain('habit-one');
  });

  it('quiesces synchronously so a late service-worker readiness cannot notify or recreate receipts', async () => {
    let releaseReady!: (registration: ServiceWorkerRegistration) => void;
    const ready = new Promise<ServiceWorkerRegistration>((resolve) => { releaseReady = resolve; });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { serviceWorker: { ready } },
    });

    startHabitReminderScheduler('forgotten-owner', () => [habit({ userId: 'forgotten-owner' })]);
    await Promise.resolve();
    stopHabitReminderScheduler();
    storage.removeItem('orbit-habit-reminders-fired:forgotten-owner');
    releaseReady({
      showNotification,
      getNotifications: vi.fn(async () => []),
    } as unknown as ServiceWorkerRegistration);
    await flushPromises();

    expect(showNotification).not.toHaveBeenCalled();
    expect(storage.getItem('orbit-habit-reminders-fired:forgotten-owner')).toBeNull();
  });

  it('invalidates a pending old owner when a new account takes over', async () => {
    let releaseReady!: (registration: ServiceWorkerRegistration) => void;
    const ready = new Promise<ServiceWorkerRegistration>((resolve) => { releaseReady = resolve; });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { serviceWorker: { ready } },
    });

    startHabitReminderScheduler('owner-a', () => [habit({ userId: 'owner-a' })]);
    await Promise.resolve();
    startHabitReminderScheduler('owner-b', () => []);
    releaseReady({
      showNotification,
      getNotifications: vi.fn(async () => []),
    } as unknown as ServiceWorkerRegistration);
    await flushPromises();

    expect(showNotification).not.toHaveBeenCalled();
    expect(storage.getItem('orbit-habit-reminders-fired:owner-a')).toBeNull();
    expect(storage.getItem('orbit-habit-reminders-fired:owner-b')).toBeNull();
  });

  it('closes an already-delivered notification before sign-out or a new account binds', async () => {
    let displayed: { data: Record<string, unknown>; close: ReturnType<typeof vi.fn> } | null = null;
    const getNotifications = vi.fn(async () => displayed ? [displayed] : []);
    showNotification = vi.fn(async (_title: string, options: NotificationOptions) => {
      const close = vi.fn(() => { displayed = null; });
      displayed = { data: options.data as Record<string, unknown>, close };
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          ready: Promise.resolve({ showNotification, getNotifications }),
        },
      },
    });

    startHabitReminderScheduler('owner-a', () => [habit({ userId: 'owner-a' })]);
    await flushPromises();
    const delivered = displayed as {
      data: Record<string, unknown>;
      close: ReturnType<typeof vi.fn>;
    } | null;
    expect(delivered?.data.threadmapLocalOwnerId).toBe('owner-a');
    const close = delivered?.close;

    await setLocalNotificationOwner(null);
    await setLocalNotificationOwner('owner-b');

    expect(close).toHaveBeenCalledOnce();
    expect(displayed).toBeNull();
    expect(getNotifications).toHaveBeenCalledTimes(2);
  });

  it('never falls back to an unenumerable plain Notification for private content', async () => {
    const plainNotification = Object.assign(vi.fn(), { permission: 'granted' as const });
    showNotification = vi.fn(async () => { throw new Error('service worker unavailable'); });
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: plainNotification,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { Notification: plainNotification },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          ready: Promise.resolve({
            showNotification,
            getNotifications: vi.fn(async () => []),
          }),
        },
      },
    });

    startHabitReminderScheduler('owner-private', () => [habit({ userId: 'owner-private' })]);
    await flushPromises();

    expect(showNotification).toHaveBeenCalledOnce();
    expect(plainNotification).not.toHaveBeenCalled();
    expect(storage.getItem('orbit-habit-reminders-fired:owner-private')).toBeNull();
  });

  it('does not deliver when the master switch or habit preference is disabled', async () => {
    settings.notifications.enabled = false;
    startHabitReminderScheduler('cloud-owner', () => [habit()]);
    await flushPromises();
    expect(showNotification).not.toHaveBeenCalled();

    stopHabitReminderScheduler();
    settings.notifications.enabled = true;
    settings.notifications.habitReminders = false;
    startHabitReminderScheduler('cloud-owner', () => [habit()]);
    await flushPromises();
    expect(showNotification).not.toHaveBeenCalled();
  });
});
