import { beforeEach, describe, expect, it, vi } from 'vitest';

const messagingMocks = vi.hoisted(() => ({
  deleteToken: vi.fn(async () => true),
  getMessaging: vi.fn(() => ({ kind: 'messaging' })),
  getToken: vi.fn(),
  onMessage: vi.fn(() => vi.fn()),
}));

const functionMocks = vi.hoisted(() => ({
  callable: vi.fn(async () => ({ data: { success: true, docId: 'owner-user_fingerprint' } })),
}));

vi.mock('firebase/messaging', () => messagingMocks);
vi.mock('firebase/functions', () => ({
  httpsCallable: () => functionMocks.callable,
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
}));
vi.mock('./firebase', () => ({
  app: { name: 'test' },
  cloudFunctions: { region: 'test' },
  db: { project: 'test' },
}));
vi.mock('./settings-store', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        notifications: {
          enabled: true,
          dailyBriefing: false,
          dailyBriefingTime: '08:00',
          eveningBriefing: false,
          eveningBriefingTime: '21:00',
        },
      },
    }),
  },
}));

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const registration = {
  pushManager: {
    getSubscription: vi.fn(async () => null),
    subscribe: vi.fn(),
  },
  showNotification: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 Chrome/140 Safari/537.36',
    serviceWorker: {
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
    },
  },
});
Object.defineProperty(globalThis, 'Notification', {
  configurable: true,
  value: {
    permission: 'granted',
    requestPermission: vi.fn(async () => 'granted'),
  },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    localStorage: globalThis.localStorage,
    PushManager: function PushManager() {},
    Notification: globalThis.Notification,
  }),
});
process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY = 'test-vapid-key';

const {
  isFCMRegistrationContextCurrent,
  registerFCMToken,
  setFCMRegistrationOwner,
} = await import('./fcm');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setFCMRegistrationOwner(null);
});

describe('push registration lifecycle', () => {
  it('uses a monotonic generation even when the same owner is rebound', () => {
    const first = setFCMRegistrationOwner('owner-user');
    const second = setFCMRegistrationOwner('owner-user');

    expect(second).toBeGreaterThan(first);
    expect(isFCMRegistrationContextCurrent('owner-user', first)).toBe(false);
    expect(isFCMRegistrationContextCurrent('owner-user', second)).toBe(true);
  });

  it('compensates a token that resolves after secure forget without recreating UID storage', async () => {
    let releaseToken!: (token: string) => void;
    let markTokenStarted!: () => void;
    const tokenGate = new Promise<string>((resolve) => { releaseToken = resolve; });
    const tokenStarted = new Promise<void>((resolve) => { markTokenStarted = resolve; });
    messagingMocks.getToken.mockImplementationOnce(async () => {
      markTokenStarted();
      return tokenGate;
    });
    setFCMRegistrationOwner('owner-user');

    const pending = registerFCMToken('owner-user');
    await tokenStarted;
    setFCMRegistrationOwner(null);
    localStorage.removeItem('orbit-fcm-token:owner-user');
    localStorage.removeItem('orbit-push-subscription:owner-user');
    releaseToken('late-token');

    await expect(pending).rejects.toThrow('active account changed');
    expect(messagingMocks.deleteToken).toHaveBeenCalledTimes(1);
    expect(functionMocks.callable).not.toHaveBeenCalled();
    expect(localStorage.getItem('orbit-fcm-token:owner-user')).toBeNull();
    expect(localStorage.getItem('orbit-push-subscription:owner-user')).toBeNull();
  });
});
