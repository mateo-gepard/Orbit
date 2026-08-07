import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { saveToolData, ToolDataConflictError, ToolDataRejectedError } from './firestore';
import { prepareScopedStorage } from './account-storage';
import { verifiedLocalStateStorage } from './verified-storage';
import { reportSyncRecovered, reportSyncWarning } from './sync-warning';

// ═══════════════════════════════════════════════════════════
// Threadmap — Personal Settings Store (cloud-synced)
// ═══════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────

export type ThemeMode = 'system' | 'light' | 'dark';
export type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormat = '24h' | '12h';
export type WeekStart = 'monday' | 'sunday';
export type Language = 'en' | 'de';
export type DefaultView = 'dashboard' | 'tasks';
export type CompactMode = 'comfortable' | 'compact';
export type SettingsSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const IANA_TIME_ZONE_PATTERN = /^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/;

/**
 * Returns the canonical IANA identifier accepted by the current runtime.
 * Offset identifiers such as "+02:00" are deliberately rejected because
 * Google Calendar expects a named IANA zone for daylight-saving behavior.
 */
export function normalizeIanaTimeZone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 100 || !IANA_TIME_ZONE_PATTERN.test(candidate)) {
    return null;
  }

  try {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: candidate })
      .resolvedOptions()
      .timeZone;
    return canonical && IANA_TIME_ZONE_PATTERN.test(canonical) ? canonical : null;
  } catch {
    return null;
  }
}

export function isValidIanaTimeZone(value: string): boolean {
  return normalizeIanaTimeZone(value) !== null;
}

export function detectDeviceTimeZone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeIanaTimeZone(detected) ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface NotificationSettings {
  enabled: boolean;
  dailyBriefing: boolean;
  dailyBriefingTime: string; // HH:mm
  eveningBriefing: boolean;
  eveningBriefingTime: string; // HH:mm
  sound: boolean;
}

export interface PrivacySettings {
  showProfilePhoto: boolean;
}

export interface AccessibilitySettings {
  reduceMotion: boolean;
  highContrast: boolean;
  fontSize: 'small' | 'default' | 'large';
}

export interface FocusSettings {
  defaultFlightDuration: number; // minutes
  turbulenceShakeScreen: boolean;
}

export interface CalendarSettings {
  googleCalendarSync: boolean;
  defaultEventDuration: number;  // minutes
  showWeekNumbers: boolean;
}

export interface DataSettings {
  lastExportAt: number | null;
}

export interface UserSettings {
  // Profile
  displayName: string;
  email: string;
  bio: string;
  timezone: string;

  // Appearance
  theme: ThemeMode;
  accentColor: string;
  compactMode: CompactMode;
  showSidebarBadges: boolean;
  animationsEnabled: boolean;

  // Regional
  language: Language;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  weekStart: WeekStart;

  // Behavior
  defaultView: DefaultView;
  confirmBeforeDelete: boolean;
  archiveInsteadOfDelete: boolean;
  autoArchiveDays: number;       // 0 = disabled

  // Notifications
  notifications: NotificationSettings;

  // Focus / Flight
  focus: FocusSettings;

  // Calendar
  calendar: CalendarSettings;

  // Privacy
  privacy: PrivacySettings;

  // Accessibility
  accessibility: AccessibilitySettings;

  // Data
  data: DataSettings;

  // Easter Eggs
  hockeyMode: boolean;

  // Metadata
  updatedAt: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: '',
  email: '',
  bio: '',
  timezone: detectDeviceTimeZone(),

  theme: 'system',
  accentColor: '#6366f1',
  compactMode: 'comfortable',
  showSidebarBadges: true,
  animationsEnabled: true,

  language: 'en',
  dateFormat: 'DD.MM.YYYY',
  timeFormat: '24h',
  weekStart: 'monday',

  defaultView: 'dashboard',
  confirmBeforeDelete: true,
  archiveInsteadOfDelete: false,
  autoArchiveDays: 0,

  notifications: {
    enabled: false,
    dailyBriefing: false,
    dailyBriefingTime: '08:00',
    eveningBriefing: false,
    eveningBriefingTime: '21:00',
    sound: true,
  },

  focus: {
    defaultFlightDuration: 50,
    turbulenceShakeScreen: true,
  },

  calendar: {
    googleCalendarSync: false,
    defaultEventDuration: 60,
    showWeekNumbers: false,
  },

  privacy: {
    showProfilePhoto: true,
  },

  accessibility: {
    reduceMotion: false,
    highContrast: false,
    fontSize: 'default',
  },

  data: {
    lastExportAt: null,
  },

  hockeyMode: false,

  updatedAt: 0,
};

// ── Cloud sync ─────────────────────────────────────────────

let _syncUserId: string | null = null;
let _saveTimeout: ReturnType<typeof setTimeout> | null = null;
let _localRevision = 0;
let _cloudSnapshotReceived = false;
let _scopeGeneration = 0;

function reportSettingsSyncFailure(userId: string): void {
  const german = useSettingsStore.getState().settings.language === 'de';
  reportSyncWarning({
    key: 'tool:settings',
    userId,
    toolId: 'settings',
    message: german
      ? 'Die Einstellungen sind auf diesem Gerät gespeichert, aber die Cloud-Synchronisierung ist noch nicht abgeschlossen. Threadmap versucht es erneut.'
      : 'Settings are saved on this device, but cloud sync has not finished. Threadmap will retry.',
  });
}

function scheduleSave(settings: UserSettings) {
  if (!_syncUserId) {
    useSettingsStore.setState({ cloudDirty: false, cloudSaveState: 'saved' });
    return;
  }
  if (_saveTimeout) clearTimeout(_saveTimeout);
  const scheduledUserId = _syncUserId;
  const scheduledGeneration = _scopeGeneration;
  const revision = ++_localRevision;
  useSettingsStore.setState({ cloudDirty: true, cloudSaveState: 'pending' });
  const persist = async () => {
    if (_syncUserId !== scheduledUserId
        || _scopeGeneration !== scheduledGeneration
        || revision !== _localRevision) return;
    useSettingsStore.setState({ cloudSaveState: 'saving' });
    try {
      await saveToolData(scheduledUserId, 'settings', { settings });
      if (_syncUserId === scheduledUserId
          && _scopeGeneration === scheduledGeneration
          && revision === _localRevision) {
        useSettingsStore.setState({ cloudDirty: false, cloudSaveState: 'saved' });
        reportSyncRecovered({ key: 'tool:settings', userId: scheduledUserId });
      }
    } catch (error) {
      console.error('[THREADMAP] Failed to save settings:', error);
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration
          || revision !== _localRevision) return;
      if (error instanceof ToolDataConflictError) {
        useSettingsStore.setState({ cloudDirty: true, cloudSaveState: 'error' });
        return;
      }
      useSettingsStore.setState({ cloudSaveState: 'error' });
      if (error instanceof ToolDataRejectedError) {
        // Retrying resends the identical document, so it would fail forever.
        useSettingsStore.setState({ cloudDirty: true });
        reportSyncWarning({
          key: 'tool:settings',
          userId: scheduledUserId,
          toolId: 'settings',
          message: 'Settings are saved on this device, but the server refused the cloud copy. Export your data and contact support.',
        });
        return;
      }
      reportSettingsSyncFailure(scheduledUserId);
      _saveTimeout = setTimeout(() => void persist(), 5_000);
    }
  };
  _saveTimeout = setTimeout(() => void persist(), 500);
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function timeValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : fallback;
}

function nullableTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeSettings(settings: unknown = {}): UserSettings {
  const source = asRecord(settings);
  const notifications = asRecord(source.notifications);
  const focus = asRecord(source.focus);
  const calendar = asRecord(source.calendar);
  const privacy = asRecord(source.privacy);
  const accessibility = asRecord(source.accessibility);
  const data = asRecord(source.data);
  const legacyDefaultView = source.defaultView === 'today' || source.defaultView === 'inbox'
    ? 'dashboard'
    : source.defaultView;

  return {
    displayName: stringValue(source.displayName, DEFAULT_SETTINGS.displayName, 120),
    email: stringValue(source.email, DEFAULT_SETTINGS.email, 320),
    bio: stringValue(source.bio, DEFAULT_SETTINGS.bio, 2_000),
    timezone: normalizeIanaTimeZone(source.timezone) ?? DEFAULT_SETTINGS.timezone,
    theme: enumValue(source.theme, ['system', 'light', 'dark'] as const, DEFAULT_SETTINGS.theme),
    accentColor: typeof source.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.accentColor)
      ? source.accentColor
      : DEFAULT_SETTINGS.accentColor,
    compactMode: enumValue(source.compactMode, ['comfortable', 'compact'] as const, DEFAULT_SETTINGS.compactMode),
    showSidebarBadges: booleanValue(source.showSidebarBadges, DEFAULT_SETTINGS.showSidebarBadges),
    animationsEnabled: booleanValue(source.animationsEnabled, DEFAULT_SETTINGS.animationsEnabled),
    language: enumValue(source.language, ['en', 'de'] as const, DEFAULT_SETTINGS.language),
    dateFormat: enumValue(source.dateFormat, ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const, DEFAULT_SETTINGS.dateFormat),
    timeFormat: enumValue(source.timeFormat, ['24h', '12h'] as const, DEFAULT_SETTINGS.timeFormat),
    weekStart: enumValue(source.weekStart, ['monday', 'sunday'] as const, DEFAULT_SETTINGS.weekStart),
    defaultView: enumValue(legacyDefaultView, ['dashboard', 'tasks'] as const, DEFAULT_SETTINGS.defaultView),
    confirmBeforeDelete: booleanValue(source.confirmBeforeDelete, DEFAULT_SETTINGS.confirmBeforeDelete),
    archiveInsteadOfDelete: booleanValue(source.archiveInsteadOfDelete, DEFAULT_SETTINGS.archiveInsteadOfDelete),
    autoArchiveDays: numberValue(source.autoArchiveDays, DEFAULT_SETTINGS.autoArchiveDays, 0, 3_650),
    notifications: {
      enabled: booleanValue(notifications.enabled, DEFAULT_SETTINGS.notifications.enabled),
      dailyBriefing: booleanValue(notifications.dailyBriefing, DEFAULT_SETTINGS.notifications.dailyBriefing),
      dailyBriefingTime: timeValue(notifications.dailyBriefingTime, DEFAULT_SETTINGS.notifications.dailyBriefingTime),
      eveningBriefing: booleanValue(notifications.eveningBriefing, DEFAULT_SETTINGS.notifications.eveningBriefing),
      eveningBriefingTime: timeValue(notifications.eveningBriefingTime, DEFAULT_SETTINGS.notifications.eveningBriefingTime),
      sound: booleanValue(notifications.sound, DEFAULT_SETTINGS.notifications.sound),
    },
    focus: {
      defaultFlightDuration: numberValue(focus.defaultFlightDuration, DEFAULT_SETTINGS.focus.defaultFlightDuration, 5, 720),
      turbulenceShakeScreen: booleanValue(focus.turbulenceShakeScreen, DEFAULT_SETTINGS.focus.turbulenceShakeScreen),
    },
    calendar: {
      googleCalendarSync: booleanValue(calendar.googleCalendarSync, DEFAULT_SETTINGS.calendar.googleCalendarSync),
      defaultEventDuration: numberValue(calendar.defaultEventDuration, DEFAULT_SETTINGS.calendar.defaultEventDuration, 5, 1_440),
      showWeekNumbers: booleanValue(calendar.showWeekNumbers, DEFAULT_SETTINGS.calendar.showWeekNumbers),
    },
    privacy: {
      showProfilePhoto: booleanValue(privacy.showProfilePhoto, DEFAULT_SETTINGS.privacy.showProfilePhoto),
    },
    accessibility: {
      reduceMotion: booleanValue(accessibility.reduceMotion, DEFAULT_SETTINGS.accessibility.reduceMotion),
      highContrast: booleanValue(accessibility.highContrast, DEFAULT_SETTINGS.accessibility.highContrast),
      fontSize: enumValue(accessibility.fontSize, ['small', 'default', 'large'] as const, DEFAULT_SETTINGS.accessibility.fontSize),
    },
    data: {
      lastExportAt: nullableTimestamp(data.lastExportAt),
    },
    hockeyMode: booleanValue(source.hockeyMode, DEFAULT_SETTINGS.hockeyMode),
    updatedAt: numberValue(source.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export const SETTINGS_EXPORT_VERSION = 1;

export interface SettingsExportV1 {
  version: typeof SETTINGS_EXPORT_VERSION;
  exportedAt: string;
  settings: UserSettings;
}

export function createSettingsExport(settings: UserSettings): SettingsExportV1 {
  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: normalizeSettings(settings),
  };
}

export function parseSettingsImport(payload: unknown): UserSettings {
  const envelope = asRecord(payload);
  if (envelope.version !== SETTINGS_EXPORT_VERSION) {
    throw new Error('Unsupported settings export version.');
  }
  if (!envelope.settings || typeof envelope.settings !== 'object' || Array.isArray(envelope.settings)) {
    throw new Error('This file does not contain Threadmap settings.');
  }
  return normalizeSettings(envelope.settings);
}

// ── Store ──────────────────────────────────────────────────

interface SettingsStore {
  settings: UserSettings;
  cloudDirty: boolean;
  cloudSaveState: SettingsSaveState;
  update: (patch: Partial<UserSettings>) => void;
  updateNested: <K extends keyof UserSettings>(
    section: K,
    patch: Partial<UserSettings[K] & Record<string, unknown>>
  ) => void;
  reset: () => void;
  importSettings: (payload: unknown) => void;
  _setFromCloud: (settings: UserSettings) => void;
  _setSyncUserId: (userId: string | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },
      cloudDirty: false,
      cloudSaveState: 'idle',

      update: (patch) => {
        const timezone = Object.prototype.hasOwnProperty.call(patch, 'timezone')
          ? normalizeIanaTimeZone(patch.timezone)
          : undefined;
        if (Object.prototype.hasOwnProperty.call(patch, 'timezone') && !timezone) return;
        const safePatch = timezone ? { ...patch, timezone } : patch;
        const next = { ...get().settings, ...safePatch, updatedAt: Date.now() };
        set({ settings: next });
        scheduleSave(next);
      },

      updateNested: (section, patch) => {
        const current = get().settings;
        const currentSection = current[section];
        if (typeof currentSection === 'object' && currentSection !== null) {
          const next = {
            ...current,
            [section]: { ...(currentSection as unknown as Record<string, unknown>), ...patch },
            updatedAt: Date.now(),
          };
          set({ settings: next });
          scheduleSave(next);
        }
      },

      reset: () => {
        const next = { ...DEFAULT_SETTINGS, updatedAt: Date.now() };
        set({ settings: next });
        scheduleSave(next);
      },

      importSettings: (payload) => {
        const next = { ...parseSettingsImport(payload), updatedAt: Date.now() };
        set({ settings: next });
        scheduleSave(next);
      },

      _setFromCloud: (settings) => {
        const firstSnapshot = !_cloudSnapshotReceived;
        _cloudSnapshotReceived = true;
        if (get().cloudDirty) {
          if (firstSnapshot) scheduleSave(get().settings);
          return;
        }
        set({ settings: normalizeSettings(settings), cloudSaveState: 'saved' });
      },

      _setSyncUserId: (userId) => {
        if (_syncUserId !== userId) {
          _scopeGeneration += 1;
          if (_saveTimeout) {
            clearTimeout(_saveTimeout);
            _saveTimeout = null;
          }
        }
        _syncUserId = userId;
        _localRevision = 0;
        _cloudSnapshotReceived = false;
      },
    }),
    {
      name: 'orbit-settings',
      partialize: (state) => ({ settings: state.settings, cloudDirty: state.cloudDirty }),
      merge: (persisted, current) => {
        const persistedState = persisted as { settings?: Partial<UserSettings>; cloudDirty?: unknown } | undefined;
        return {
          ...current,
          settings: normalizeSettings(persistedState?.settings),
          cloudDirty: persistedState?.cloudDirty === true,
        };
      },
      skipHydration: true,
      storage: createJSONStorage(() => verifiedLocalStateStorage),
    }
  )
);

const SETTINGS_STORAGE_KEY = 'orbit-settings';

export async function scopeSettingsStore(userId: string | null): Promise<void> {
  useSettingsStore.getState()._setSyncUserId(null);
  const target = prepareScopedStorage(SETTINGS_STORAGE_KEY, userId);
  useSettingsStore.persist.setOptions({ name: target.key });
  if (!target.hasPersistedState) {
    useSettingsStore.setState({ settings: normalizeSettings(), cloudDirty: false, cloudSaveState: 'idle' });
  }
  await useSettingsStore.persist.rehydrate();
  if (target.hasPersistedState) useSettingsStore.setState({ cloudSaveState: 'idle' });
}
