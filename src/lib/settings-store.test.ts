import { describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  saveToolData: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('./firestore', () => ({
  saveToolData: firestoreMocks.saveToolData,
}));

vi.mock('./verified-storage', () => ({
  verifiedLocalStateStorage: storageMocks,
}));

import {
  DEFAULT_SETTINGS,
  detectDeviceTimeZone,
  isValidIanaTimeZone,
  normalizeIanaTimeZone,
  parseSettingsImport,
  quiesceSettingsStore,
  scopeSettingsStore,
  SETTINGS_EXPORT_VERSION,
  useSettingsStore,
} from './settings-store';

describe('settings lifecycle cancellation', () => {
  it('does not persist a late cloud completion after synchronous quiesce', async () => {
    vi.useFakeTimers();
    let resolveSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { resolveSave = resolve; });
    firestoreMocks.saveToolData.mockReturnValueOnce(saveGate);

    useSettingsStore.getState()._setSyncUserId('owner-user');
    useSettingsStore.getState().update({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(500);
    expect(firestoreMocks.saveToolData).toHaveBeenCalledTimes(1);

    storageMocks.setItem.mockClear();
    quiesceSettingsStore();
    resolveSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(storageMocks.setItem).not.toHaveBeenCalled();
    await scopeSettingsStore(null);
    vi.useRealTimers();
  });
});

describe('IANA timezone settings', () => {
  it('trims and canonicalizes valid IANA identifiers', () => {
    expect(normalizeIanaTimeZone('  Europe/Berlin  ')).toBe('Europe/Berlin');
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
    expect(isValidIanaTimeZone('UTC')).toBe(true);
  });

  it.each([
    '',
    '   ',
    'Mars/Olympus_Mons',
    '+02:00',
    'Europe / Berlin',
    'a'.repeat(101),
  ])('rejects invalid or unsafe timezone input %j', (value) => {
    expect(normalizeIanaTimeZone(value)).toBeNull();
    expect(isValidIanaTimeZone(value)).toBe(false);
  });

  it('always detects a valid device timezone', () => {
    expect(isValidIanaTimeZone(detectDeviceTimeZone())).toBe(true);
  });

  it('normalizes imported zones and falls back safely for invalid imports', () => {
    const valid = parseSettingsImport({
      version: SETTINGS_EXPORT_VERSION,
      settings: { timezone: ' Europe/Berlin ' },
    });
    const invalid = parseSettingsImport({
      version: SETTINGS_EXPORT_VERSION,
      settings: { timezone: 'Not/A_Timezone' },
    });

    expect(valid.timezone).toBe('Europe/Berlin');
    expect(invalid.timezone).toBe(DEFAULT_SETTINGS.timezone);
  });

  it('rejects invalid direct updates without replacing the saved timezone', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, timezone: 'Europe/Berlin' },
    });

    const savedSettings = useSettingsStore.getState().settings;
    useSettingsStore.getState().update({ timezone: 'Not/A_Timezone' });
    expect(useSettingsStore.getState().settings).toEqual(savedSettings);

    useSettingsStore.getState().update({ timezone: ' America/New_York ' });
    expect(useSettingsStore.getState().settings.timezone).toBe('America/New_York');
  });
});

describe('parseSettingsImport', () => {
  it('drops retired settings while preserving supported preferences', () => {
    const settings = parseSettingsImport({
      version: SETTINGS_EXPORT_VERSION,
      settings: {
        theme: 'dark',
        analyticsEnabled: true,
        crashReportsEnabled: true,
        notifications: {
          enabled: true,
          dailyBriefing: true,
          dailyBriefingTime: '07:30',
          eveningBriefing: true,
          eveningBriefingTime: '20:45',
          sound: false,
          taskReminders: true,
          reminderMinutes: 15,
          habitReminders: true,
          weeklyReview: true,
          weeklyReviewDay: 1,
        },
        focus: {
          defaultFlightDuration: 75,
          turbulenceShakeScreen: false,
          autoStartBreaks: true,
          breakDuration: 15,
          blockNotifications: true,
        },
        calendar: {
          googleCalendarSync: true,
          defaultEventDuration: 45,
          showWeekNumbers: true,
          showDeclinedEvents: true,
        },
        data: {
          lastExportAt: 123,
          autoBackup: true,
          lastBackupAt: 456,
        },
      },
    });

    expect(settings.theme).toBe('dark');
    expect(settings.notifications).toEqual({
      enabled: true,
      dailyBriefing: true,
      dailyBriefingTime: '07:30',
      eveningBriefing: true,
      eveningBriefingTime: '20:45',
      // Absent from the stored payload, so it takes the default.
      habitReminders: true,
      sound: false,
    });
    expect(settings.focus).toEqual({
      defaultFlightDuration: 75,
      turbulenceShakeScreen: false,
    });
    expect(settings.calendar).toEqual({
      googleCalendarSync: true,
      defaultEventDuration: 45,
      showWeekNumbers: true,
    });
    expect(settings.data).toEqual({ lastExportAt: 123 });
    expect(settings).not.toHaveProperty('analyticsEnabled');
    expect(settings).not.toHaveProperty('crashReportsEnabled');
  });
});
