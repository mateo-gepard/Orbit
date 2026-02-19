import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// ORBIT — Personal Settings Store (cloud-synced)
// ═══════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────

export type ThemeMode = 'system' | 'light' | 'dark';
export type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormat = '24h' | '12h';
export type WeekStart = 'monday' | 'sunday';
export type Language = 'en' | 'de';
export type DefaultView = 'dashboard' | 'today' | 'tasks' | 'inbox';
export type CompactMode = 'comfortable' | 'compact';

export interface NotificationSettings {
  enabled: boolean;
  dailyBriefing: boolean;
  dailyBriefingTime: string; // HH:mm
  eveningBriefing: boolean;
  eveningBriefingTime: string; // HH:mm
  taskReminders: boolean;
  reminderMinutes: number;   // minutes before due
  habitReminders: boolean;
  weeklyReview: boolean;
  weeklyReviewDay: number;   // 0=Sun,1=Mon,...
  sound: boolean;
}

export interface PrivacySettings {
  analyticsEnabled: boolean;
  crashReportsEnabled: boolean;
  showProfilePhoto: boolean;
}

export interface AccessibilitySettings {
  reduceMotion: boolean;
  highContrast: boolean;
  fontSize: 'small' | 'default' | 'large';
}

export interface FocusSettings {
  defaultFlightDuration: number; // minutes
  autoStartBreaks: boolean;
  breakDuration: number;         // minutes
  blockNotifications: boolean;
  turbulenceShakeScreen: boolean;
}

export interface CalendarSettings {
  googleCalendarSync: boolean;
  defaultEventDuration: number;  // minutes
  showWeekNumbers: boolean;
  showDeclinedEvents: boolean;
}

export interface DataSettings {
  autoBackup: boolean;
  lastBackupAt: number | null;
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
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

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
    enabled: true,
    dailyBriefing: false,
    dailyBriefingTime: '08:00',
    eveningBriefing: false,
    eveningBriefingTime: '21:00',
    taskReminders: true,
    reminderMinutes: 30,
    habitReminders: true,
    weeklyReview: false,
    weeklyReviewDay: 0,
    sound: true,
  },

  focus: {
    defaultFlightDuration: 50,
    autoStartBreaks: false,
    breakDuration: 10,
    blockNotifications: true,
    turbulenceShakeScreen: true,
  },

  calendar: {
    googleCalendarSync: false,
    defaultEventDuration: 60,
    showWeekNumbers: false,
    showDeclinedEvents: false,
  },

  privacy: {
    analyticsEnabled: true,
    crashReportsEnabled: true,
    showProfilePhoto: true,
  },

  accessibility: {
    reduceMotion: false,
    highContrast: false,
    fontSize: 'default',
  },

  data: {
    autoBackup: false,
    lastBackupAt: null,
    lastExportAt: null,
  },

  hockeyMode: false,

  updatedAt: Date.now(),
};

// ── Cloud sync ─────────────────────────────────────────────

let _syncUserId: string | null = null;
let _saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(settings: UserSettings) {
  if (!_syncUserId) return;
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    saveToolData(_syncUserId!, 'settings', { settings }).catch((err) => {
      console.error('[ORBIT] Failed to save settings:', err);
    });
  }, 500);
}

// ── Store ──────────────────────────────────────────────────

interface SettingsStore {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  updateNested: <K extends keyof UserSettings>(
    section: K,
    patch: Partial<UserSettings[K] & Record<string, unknown>>
  ) => void;
  reset: () => void;
  _setFromCloud: (settings: UserSettings) => void;
  _setSyncUserId: (userId: string | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },

      update: (patch) => {
        const next = { ...get().settings, ...patch, updatedAt: Date.now() };
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

      _setFromCloud: (settings) => {
        set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
      },

      _setSyncUserId: (userId) => {
        _syncUserId = userId;
      },
    }),
    {
      name: 'orbit-settings',
      partialize: (state) => ({ settings: state.settings }),
      skipHydration: true,
    }
  )
);
