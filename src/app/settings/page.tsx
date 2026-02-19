'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Palette,
  Globe,
  Bell,
  BellRing,
  Shield,
  Accessibility,
  Database,
  Keyboard,
  Monitor,
  Calendar,
  RotateCcw,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  Check,
  Sun,
  Moon,
  SunMoon,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Clock,
  Zap,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useSettingsStore } from '@/lib/settings-store';
import type { UserSettings } from '@/lib/settings-store';
import { useOrbitStore } from '@/lib/store';
import {
  requestNotificationPermission,
  hasNotificationPermission,
  sendMorningBriefingNow,
  sendEveningBriefingNow,
} from '@/lib/briefing-notifications';
import { startGoogleCalendarSync, stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import { hasCalendarPermission, requestCalendarPermission } from '@/lib/google-calendar';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useTheme } from 'next-themes';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import type {
  ThemeMode,
  DateFormat,
  TimeFormat,
  WeekStart,
  Language,
  DefaultView,
  CompactMode,
} from '@/lib/settings-store';

// ═══════════════════════════════════════════════════════════
// Setting section definitions
// ═══════════════════════════════════════════════════════════

interface SettingSection {
  id: string;
  label: TranslationKey;
  icon: LucideIcon;
}

const SECTIONS: SettingSection[] = [
  { id: 'profile', label: 'settings.profile', icon: User },
  { id: 'appearance', label: 'settings.appearance', icon: Palette },
  { id: 'regional', label: 'settings.languageRegion', icon: Globe },
  { id: 'behavior', label: 'settings.general', icon: Monitor },
  { id: 'notifications', label: 'settings.notifications', icon: Bell },
  { id: 'calendar', label: 'settings.calendar', icon: Calendar },
  { id: 'shortcuts', label: 'settings.shortcuts', icon: Keyboard },
  { id: 'privacy', label: 'settings.privacy', icon: Shield },
  { id: 'accessibility', label: 'settings.accessibility', icon: Accessibility },
  { id: 'eastereggs', label: 'settings.easterEggs', icon: Sparkles },
  { id: 'data', label: 'settings.dataStorage', icon: Database },
];

// ═══════════════════════════════════════════════════════════
// Shared UI elements
// ═══════════════════════════════════════════════════════════

function SectionHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground/[0.05]">
        <Icon className="h-4 w-4 text-foreground/70" strokeWidth={1.5} />
      </div>
      <h2 className="text-[15px] font-semibold tracking-tight">{label}</h2>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
  border = true,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div className={cn(
      'flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
      border && 'border-b border-border/30'
    )}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground/90">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[40px] rounded-full transition-colors duration-200',
        checked ? 'bg-foreground' : 'bg-foreground/15'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-background shadow-sm transition-transform duration-200',
          checked && 'translate-x-[18px]'
        )}
      />
    </button>
  );
}

function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="appearance-none rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 outline-none focus:ring-1 focus:ring-foreground/20 cursor-pointer pr-7 w-full sm:w-auto sm:min-w-[120px]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        min={min}
        max={max}
        step={step}
        className="w-[70px] rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 outline-none focus:ring-1 focus:ring-foreground/20 tabular-nums text-right"
      />
      {suffix && <span className="text-[11px] text-muted-foreground/50">{suffix}</span>}
    </div>
  );
}

// Shortcut data
const SHORTCUTS: { keys: string[]; action: TranslationKey }[] = [
  { keys: ['⌘', 'K'], action: 'settings.commandBar' },
  { keys: ['⌘', 'B'], action: 'settings.toggleSidebar' },
  { keys: ['Esc'], action: 'settings.closePanel' },
  { keys: ['Enter'], action: 'settings.submitConfirm' },
  { keys: ['↑', '↓'], action: 'settings.navigateList' },
  { keys: ['⌘', '⇧', 'D'], action: 'settings.toggleDarkMode' },
];

// ═══════════════════════════════════════════════════════════
// Notifications section (extracted for state management)
// ═══════════════════════════════════════════════════════════

function NotificationsSection({
  settings,
  setNested,
}: {
  settings: UserSettings;
  setNested: (section: string, updates: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const items = useOrbitStore((s) => s.items);
  const [permissionStatus, setPermissionStatus] = useState<string>('default');
  const [testSent, setTestSent] = useState<'morning' | 'evening' | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermissionStatus(granted ? 'granted' : 'denied');
  };

  const handleTestMorning = () => {
    sendMorningBriefingNow(items);
    setTestSent('morning');
    setTimeout(() => setTestSent(null), 3000);
  };

  const handleTestEvening = () => {
    sendEveningBriefingNow(items);
    setTestSent('evening');
    setTimeout(() => setTestSent(null), 3000);
  };

  return (
    <div>
      <SectionHeader icon={Bell} label={t('settings.notifications')} />

      {/* Permission status */}
      <div className="mb-4 rounded-xl border border-border/30 bg-muted/20 px-3 sm:px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BellRing className={cn(
              'h-4 w-4',
              permissionStatus === 'granted' ? 'text-green-500' : 'text-muted-foreground/40'
            )} />
            <span className="text-[12px] font-medium">
              {permissionStatus === 'granted'
                ? t('settings.enableNotif')
                : permissionStatus === 'denied'
                ? t('settings.enableNotif')
                : t('settings.enableNotif')}
            </span>
          </div>
          {permissionStatus !== 'granted' && (
            <button
              onClick={handleRequestPermission}
              className="rounded-lg bg-foreground px-3 py-1 text-[11px] font-semibold text-background transition-opacity hover:opacity-80"
            >
              {permissionStatus === 'denied' ? 'Blocked' : 'Enable'}
            </button>
          )}
        </div>
        {permissionStatus === 'denied' && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/50">
            Reset in browser settings: click the lock icon in the address bar.
          </p>
        )}
      </div>

      <SettingRow label={t('settings.enableNotif')} description={t('settings.enableNotifDesc')}>
        <Toggle
          checked={settings.notifications.enabled}
          onChange={(v) => setNested('notifications', { enabled: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.notifSound')}>
        <button
          onClick={() => setNested('notifications', { sound: !settings.notifications.sound })}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60"
        >
          {settings.notifications.sound ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
          {settings.notifications.sound ? t('common.on') : t('common.off')}
        </button>
      </SettingRow>

      <div className="mt-4 mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
        {t('settings.briefings')}
      </div>

      <SettingRow label={t('settings.morningBriefing')} description={t('settings.morningBriefingDesc')}>
        <div className="flex items-center gap-2">
          <Toggle
            checked={settings.notifications.dailyBriefing}
            onChange={(v) => setNested('notifications', { dailyBriefing: v })}
          />
          {settings.notifications.dailyBriefing && (
            <input
              type="time"
              value={settings.notifications.dailyBriefingTime}
              onChange={(e) => setNested('notifications', { dailyBriefingTime: e.target.value })}
              className="rounded-lg border border-border/50 bg-background px-2 py-1 text-[11px] font-mono outline-none"
            />
          )}
        </div>
      </SettingRow>

      <SettingRow label={t('settings.eveningBriefing')} description={t('settings.eveningBriefingDesc')}>
        <div className="flex items-center gap-2">
          <Toggle
            checked={settings.notifications.eveningBriefing}
            onChange={(v) => setNested('notifications', { eveningBriefing: v })}
          />
          {settings.notifications.eveningBriefing && (
            <input
              type="time"
              value={settings.notifications.eveningBriefingTime}
              onChange={(e) => setNested('notifications', { eveningBriefingTime: e.target.value })}
              className="rounded-lg border border-border/50 bg-background px-2 py-1 text-[11px] font-mono outline-none"
            />
          )}
        </div>
      </SettingRow>

      {/* Test buttons */}
      {permissionStatus === 'granted' && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleTestMorning}
            disabled={testSent === 'morning'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-[11px] font-medium transition-all',
              testSent === 'morning'
                ? 'border-green-500/30 bg-green-500/10 text-green-600'
                : 'hover:bg-muted/40 text-muted-foreground'
            )}
          >
            {testSent === 'morning' ? <Check className="h-3 w-3" /> : <Send className="h-3 w-3" />}
            {testSent === 'morning' ? t('common.sent') : t('settings.testMorning')}
          </button>
          <button
            onClick={handleTestEvening}
            disabled={testSent === 'evening'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-[11px] font-medium transition-all',
              testSent === 'evening'
                ? 'border-green-500/30 bg-green-500/10 text-green-600'
                : 'hover:bg-muted/40 text-muted-foreground'
            )}
          >
            {testSent === 'evening' ? <Check className="h-3 w-3" /> : <Send className="h-3 w-3" />}
            {testSent === 'evening' ? t('common.sent') : t('settings.testEvening')}
          </button>
        </div>
      )}

      <div className="mt-6 mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
        {t('settings.reminders')}
      </div>

      <SettingRow label={t('settings.taskReminders')} description={t('settings.taskRemindersDesc')}>
        <div className="flex items-center gap-2">
          <Toggle
            checked={settings.notifications.taskReminders}
            onChange={(v) => setNested('notifications', { taskReminders: v })}
          />
          {settings.notifications.taskReminders && (
            <NumberInput
              value={settings.notifications.reminderMinutes}
              onChange={(v) => setNested('notifications', { reminderMinutes: v })}
              min={5}
              max={1440}
              suffix={t('settings.minBefore')}
            />
          )}
        </div>
      </SettingRow>

      <SettingRow label={t('settings.habitReminders')} description={t('settings.habitRemindersDesc')}>
        <Toggle
          checked={settings.notifications.habitReminders}
          onChange={(v) => setNested('notifications', { habitReminders: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.weeklyReview')} description={t('settings.weeklyReviewDesc')} border={false}>
        <div className="flex items-center gap-2">
          <Toggle
            checked={settings.notifications.weeklyReview}
            onChange={(v) => setNested('notifications', { weeklyReview: v })}
          />
          {settings.notifications.weeklyReview && (
            <SelectDropdown
              value={String(settings.notifications.weeklyReviewDay)}
              options={[
                { value: '0', label: t('settings.sunday') },
                { value: '1', label: t('settings.monday') },
                { value: '5', label: 'Friday' },
                { value: '6', label: 'Saturday' },
              ]}
              onChange={(v) => setNested('notifications', { weeklyReviewDay: Number(v) })}
            />
          )}
        </div>
      </SettingRow>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main settings page
// ═══════════════════════════════════════════════════════════

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, isDemo, signOut, deleteAccount } = useAuth();
  const { settings, update, updateNested, reset } = useSettingsStore();
  const { setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState('profile');
  const [mounted, setMounted] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Flash "saved" indicator on any settings change
  const flashSaved = useCallback(() => {
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Sync theme setting to next-themes and settings store
  const handleThemeChange = (mode: ThemeMode) => {
    update({ theme: mode });
    setTheme(mode);
    flashSaved();
  };

  // Generic helpers so every control is one-liner
  const set = <K extends keyof typeof settings>(key: K, val: (typeof settings)[K]) => {
    update({ [key]: val } as Partial<typeof settings>);
    flashSaved();
  };

  const setNested = <K extends keyof typeof settings>(
    section: K,
    patch: Partial<(typeof settings)[K] & Record<string, unknown>>
  ) => {
    updateNested(section, patch);
    flashSaved();
  };

  const handleExportData = () => {
    const data = {
      settings,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbit-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    updateNested('data', { lastExportAt: Date.now() });
    flashSaved();
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data?.settings) {
          update(data.settings);
          flashSaved();
        }
      } catch {
        console.error('[ORBIT] Failed to import settings');
      }
    };
    input.click();
  };

  if (!mounted) return null;

  // Resolve active section config
  const section = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  return (
    <div className="flex h-full">
      {/* ─── Left sidebar nav ─── */}
      <nav className="hidden lg:flex flex-col w-[220px] border-r border-border/30 py-6 px-3 shrink-0">
        <h1 className="text-[13px] font-semibold tracking-tight px-3 mb-5 text-muted-foreground/70 uppercase">{t('settings.title')}</h1>
        <div className="space-y-0.5">
          {SECTIONS.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.03]'
                )}
              >
                <s.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
                <span>{t(s.label)}</span>
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <div className="mt-auto pt-4 border-t border-border/30 px-3">
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-[12px] text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            {t('settings.signOut')}
          </button>
        </div>
      </nav>

      {/* ─── Right column: pills + content ─── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* ─── Mobile section pills ─── */}
        <div className="lg:hidden shrink-0 bg-background/95 backdrop-blur-sm border-b border-border/30">
          <div className="flex overflow-x-auto gap-1 px-3 py-2 no-scrollbar">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors',
                  activeSection === s.id
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.05] text-muted-foreground/70'
                )}
              >
                <s.icon className="h-3 w-3" strokeWidth={1.5} />
                {t(s.label)}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Content area ─── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 pb-24 lg:pb-8">
            {/* Saved indicator */}
            <div
              className={cn(
                'fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-[11px] font-medium shadow-lg transition-all duration-300',
                saved ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
              )}
            >
              <Check className="h-3 w-3" />
              {t('common.saved')}
            </div>

            {/* ═════ PROFILE ═════ */}
            {activeSection === 'profile' && (
              <div>
              <SectionHeader icon={User} label={t('settings.profile')} />

              {/* Avatar + name card */}
              <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border border-border/40 bg-card mb-6">
                <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                  <AvatarImage src={user?.photoURL || undefined} />
                  <AvatarFallback className="text-lg bg-foreground/10">
                    {user?.displayName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate">
                    {user?.displayName || t('settings.user')}
                  </p>
                  <p className="text-[12px] text-muted-foreground/60 truncate">
                    {user?.email || ''}
                  </p>
                  {isDemo && (
                    <span className="inline-block mt-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                      {t('settings.demoMode')}
                    </span>
                  )}
                </div>
              </div>

              <SettingRow label={t('settings.displayName')} description={t('settings.displayNameDesc')}>
                <input
                  value={settings.displayName || user?.displayName || ''}
                  onChange={(e) => set('displayName', e.target.value)}
                  placeholder={user?.displayName || t('settings.yourNamePlaceholder')}
                  className="w-full sm:w-[180px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </SettingRow>

              <SettingRow label={t('settings.email')} description={t('settings.emailDesc')}>
                <span className="text-[12px] text-muted-foreground/60 font-mono">
                  {user?.email || 'demo@orbit.local'}
                </span>
              </SettingRow>

              <SettingRow label={t('settings.bio')} description={t('settings.bioDesc')}>
                <input
                  value={settings.bio}
                  onChange={(e) => set('bio', e.target.value)}
                  placeholder={t('settings.bioPlaceholder')}
                  className="w-full sm:w-[180px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </SettingRow>

              <SettingRow label={t('settings.timezone')} description={t('settings.timezoneDesc')} border={false}>
                <span className="text-[12px] text-muted-foreground/60 font-mono">
                  {settings.timezone}
                </span>
              </SettingRow>
            </div>
          )}

          {/* ═════ APPEARANCE ═════ */}
          {activeSection === 'appearance' && (
            <div>
              <SectionHeader icon={Palette} label={t('settings.appearance')} />

              <SettingRow label={t('settings.theme')} description={t('settings.themeDesc')}>
                <div className="flex gap-1 rounded-lg border border-border/40 p-0.5 w-full sm:w-auto">
                  {([
                    { value: 'light' as ThemeMode, icon: Sun, label: t('settings.light') },
                    { value: 'dark' as ThemeMode, icon: Moon, label: t('settings.dark') },
                    { value: 'system' as ThemeMode, icon: SunMoon, label: t('settings.system') },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleThemeChange(opt.value)}
                      className={cn(
                        'flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                        settings.theme === opt.value
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground/60 hover:text-foreground'
                      )}
                    >
                      <opt.icon className="h-3 w-3" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow label={t('settings.accentColor')} description={t('settings.accentColorDesc')}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => set('accentColor', e.target.value)}
                    className="h-7 w-7 rounded-lg border border-border/40 cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground/40">{settings.accentColor}</span>
                </div>
              </SettingRow>

              <SettingRow label={t('settings.density')} description={t('settings.densityDesc')}>
                <SelectDropdown<CompactMode>
                  value={settings.compactMode}
                  options={[
                    { value: 'comfortable', label: t('settings.comfortable') },
                    { value: 'compact', label: t('settings.compact') },
                  ]}
                  onChange={(v) => set('compactMode', v)}
                />
              </SettingRow>

              <SettingRow label={t('settings.sidebarBadges')} description={t('settings.sidebarBadgesDesc')}>
                <Toggle checked={settings.showSidebarBadges} onChange={(v) => set('showSidebarBadges', v)} />
              </SettingRow>

              <SettingRow label={t('settings.animations')} description={t('settings.animationsDesc')} border={false}>
                <Toggle checked={settings.animationsEnabled} onChange={(v) => set('animationsEnabled', v)} />
              </SettingRow>
            </div>
          )}

          {/* ═════ LANGUAGE & REGION ═════ */}
          {activeSection === 'regional' && (
            <div>
              <SectionHeader icon={Globe} label={t('settings.languageRegion')} />

              <SettingRow label={t('settings.language')}>
                <SelectDropdown<Language>
                  value={settings.language}
                  options={[
                    { value: 'en', label: t('settings.english') },
                    { value: 'de', label: t('settings.deutsch') },
                  ]}
                  onChange={(v) => set('language', v)}
                />
              </SettingRow>

              <SettingRow label={t('settings.dateFormat')}>
                <SelectDropdown<DateFormat>
                  value={settings.dateFormat}
                  options={[
                    { value: 'DD.MM.YYYY', label: '31.12.2025' },
                    { value: 'MM/DD/YYYY', label: '12/31/2025' },
                    { value: 'YYYY-MM-DD', label: '2025-12-31' },
                  ]}
                  onChange={(v) => set('dateFormat', v)}
                />
              </SettingRow>

              <SettingRow label={t('settings.timeFormat')}>
                <SelectDropdown<TimeFormat>
                  value={settings.timeFormat}
                  options={[
                    { value: '24h', label: '14:30' },
                    { value: '12h', label: '2:30 PM' },
                  ]}
                  onChange={(v) => set('timeFormat', v)}
                />
              </SettingRow>

              <SettingRow label={t('settings.weekStartsOn')} border={false}>
                <SelectDropdown<WeekStart>
                  value={settings.weekStart}
                  options={[
                    { value: 'monday', label: t('settings.monday') },
                    { value: 'sunday', label: t('settings.sunday') },
                  ]}
                  onChange={(v) => set('weekStart', v)}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ GENERAL / BEHAVIOR ═════ */}
          {activeSection === 'behavior' && (
            <div>
              <SectionHeader icon={Monitor} label={t('settings.general')} />

              <SettingRow label={t('settings.startPage')} description={t('settings.startPageDesc')}>
                <SelectDropdown<DefaultView>
                  value={settings.defaultView}
                  options={[
                    { value: 'dashboard', label: t('nav.dashboard') },
                    { value: 'today', label: t('nav.today') },
                    { value: 'tasks', label: t('nav.tasks') },
                    { value: 'inbox', label: t('nav.inbox') },
                  ]}
                  onChange={(v) => set('defaultView', v)}
                />
              </SettingRow>

              <SettingRow label={t('settings.confirmDelete')} description={t('settings.confirmDeleteDesc')}>
                <Toggle checked={settings.confirmBeforeDelete} onChange={(v) => set('confirmBeforeDelete', v)} />
              </SettingRow>

              <SettingRow label={t('settings.archiveInstead')} description={t('settings.archiveInsteadDesc')}>
                <Toggle checked={settings.archiveInsteadOfDelete} onChange={(v) => set('archiveInsteadOfDelete', v)} />
              </SettingRow>

              <SettingRow label={t('settings.autoArchive')} description={t('settings.autoArchiveDesc')} border={false}>
                <NumberInput
                  value={settings.autoArchiveDays}
                  onChange={(v) => set('autoArchiveDays', v)}
                  min={0}
                  max={365}
                  suffix={t('common.days')}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ NOTIFICATIONS ═════ */}
          {activeSection === 'notifications' && (
            <NotificationsSection settings={settings} setNested={setNested as unknown as (section: string, updates: Record<string, unknown>) => void} />
          )}

          {/* ═════ CALENDAR ═════ */}
          {activeSection === 'calendar' && (
            <div>
              <SectionHeader icon={Calendar} label={t('settings.calendar')} />

              <SettingRow label={t('settings.calendarSync')} description={t('settings.calendarSyncDesc')}>
                <Toggle
                  checked={settings.calendar.googleCalendarSync}
                  onChange={async (v) => {
                    setNested('calendar', { googleCalendarSync: v });
                    if (v && user && !isDemo) {
                      // Enable: request permission if needed, then start sync
                      if (!hasCalendarPermission()) {
                        try {
                          await requestCalendarPermission();
                        } catch { /* user declined */ }
                      }
                      if (hasCalendarPermission()) {
                        startGoogleCalendarSync(user.uid);
                      }
                    } else {
                      // Disable: stop sync
                      stopGoogleCalendarSync();
                    }
                  }}
                />
              </SettingRow>

              <SettingRow label={t('settings.defaultDuration')} description={t('settings.defaultDurationDesc')}>
                <NumberInput
                  value={settings.calendar.defaultEventDuration}
                  onChange={(v) => setNested('calendar', { defaultEventDuration: v })}
                  min={15}
                  max={480}
                  step={15}
                  suffix={t('common.min')}
                />
              </SettingRow>

              <SettingRow label={t('settings.showWeekNumbers')} description={t('settings.showWeekNumbersDesc')}>
                <Toggle
                  checked={settings.calendar.showWeekNumbers}
                  onChange={(v) => setNested('calendar', { showWeekNumbers: v })}
                />
              </SettingRow>

              <SettingRow label={t('settings.showDeclined')} description={t('settings.showDeclinedDesc')} border={false}>
                <Toggle
                  checked={settings.calendar.showDeclinedEvents}
                  onChange={(v) => setNested('calendar', { showDeclinedEvents: v })}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ KEYBOARD SHORTCUTS ═════ */}
          {activeSection === 'shortcuts' && (
            <div>
              <SectionHeader icon={Keyboard} label={t('settings.shortcuts')} />
              <div className="rounded-2xl border border-border/40 overflow-hidden">
                {SHORTCUTS.map((shortcut, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between px-4 py-3',
                      i < SHORTCUTS.length - 1 && 'border-b border-border/20'
                    )}
                  >
                    <span className="text-[13px] text-foreground/80">{t(shortcut.action)}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, j) => (
                        <kbd
                          key={j}
                          className="min-w-[24px] text-center rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground/70 shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/40 mt-3">
                {t('settings.shortcutsComingSoon')}
              </p>
            </div>
          )}

          {/* ═════ PRIVACY & SECURITY ═════ */}
          {activeSection === 'privacy' && (
            <div>
              <SectionHeader icon={Shield} label={t('settings.privacy')} />

              <SettingRow label={t('settings.analytics')} description={t('settings.analyticsDesc')}>
                <Toggle
                  checked={settings.privacy.analyticsEnabled}
                  onChange={(v) => setNested('privacy', { analyticsEnabled: v })}
                />
              </SettingRow>

              <SettingRow label={t('settings.crashReports')} description={t('settings.crashReportsDesc')}>
                <Toggle
                  checked={settings.privacy.crashReportsEnabled}
                  onChange={(v) => setNested('privacy', { crashReportsEnabled: v })}
                />
              </SettingRow>

              <SettingRow label={t('settings.showPhoto')} description={t('settings.showPhotoDesc')} border={false}>
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={settings.privacy.showProfilePhoto}
                    onChange={(v) => setNested('privacy', { showProfilePhoto: v })}
                  />
                  {settings.privacy.showProfilePhoto ? (
                    <Eye className="h-3.5 w-3.5 text-muted-foreground/40" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </div>
              </SettingRow>

              <div className="mt-6 p-4 rounded-2xl border border-border/40 bg-card">
                <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                  {t('settings.privacyNote')}
                </p>
              </div>
            </div>
          )}

          {/* ═════ ACCESSIBILITY ═════ */}
          {activeSection === 'accessibility' && (
            <div>
              <SectionHeader icon={Accessibility} label={t('settings.accessibility')} />

              <SettingRow label={t('settings.reduceMotion')} description={t('settings.reduceMotionDesc')}>
                <Toggle
                  checked={settings.accessibility.reduceMotion}
                  onChange={(v) => setNested('accessibility', { reduceMotion: v })}
                />
              </SettingRow>

              <SettingRow label={t('settings.highContrast')} description={t('settings.highContrastDesc')}>
                <Toggle
                  checked={settings.accessibility.highContrast}
                  onChange={(v) => setNested('accessibility', { highContrast: v })}
                />
              </SettingRow>

              <SettingRow label={t('settings.fontSize')} description={t('settings.fontSizeDesc')} border={false}>
                <SelectDropdown
                  value={settings.accessibility.fontSize}
                  options={[
                    { value: 'small', label: t('settings.small') },
                    { value: 'default', label: t('settings.default') },
                    { value: 'large', label: t('settings.large') },
                  ]}
                  onChange={(v) => setNested('accessibility', { fontSize: v })}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ EASTER EGGS ═════ */}
          {activeSection === 'eastereggs' && (
            <div>
              <SectionHeader icon={Sparkles} label={t('settings.easterEggs')} />

              {/* Hockey mode card */}
              <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                {/* Card header with fun visual */}
                <div className="relative px-4 sm:px-5 pt-5 pb-4 overflow-hidden">
                  {/* Background decoration */}
                  <div className="absolute top-0 right-0 text-[80px] opacity-[0.04] leading-none select-none pointer-events-none">
                    🏒
                  </div>
                  <div className="absolute bottom-0 left-1/2 text-[60px] opacity-[0.03] leading-none select-none pointer-events-none">
                    ⚕️
                  </div>

                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/10 to-red-500/10 border border-cyan-500/20 text-lg">
                      🏒
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] font-semibold">{t('settings.hockeyMode')}</h3>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                          Easter Egg
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">
                        {t('settings.hockeyModeDesc')}
                      </p>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      <Toggle checked={settings.hockeyMode} onChange={(v) => set('hockeyMode', v)} />
                    </div>
                  </div>
                </div>

                {/* Preview of what changes when hockey mode is on */}
                {settings.hockeyMode && (
                  <div className="border-t border-border/20 px-4 sm:px-5 py-3 bg-muted/20">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2">
                      {t('settings.hockeyPreview')}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { emoji: '🎯', from: t('type.task'), to: 'Spielzug' },
                        { emoji: '📋', from: settings.language === 'de' ? 'Projekt' : 'Project', to: 'Saison' },
                        { emoji: '🔄', from: settings.language === 'de' ? 'Gewohnheit' : 'Habit', to: 'Training' },
                        { emoji: '📅', from: settings.language === 'de' ? 'Termin' : 'Event', to: 'Anpfiff' },
                        { emoji: '🏆', from: settings.language === 'de' ? 'Ziel' : 'Goal', to: 'Meisterschaft' },
                        { emoji: '📝', from: settings.language === 'de' ? 'Notiz' : 'Note', to: 'Rezept' },
                      ].map((item) => (
                        <div key={item.from} className="flex items-center gap-1.5 text-[10px]">
                          <span>{item.emoji}</span>
                          <span className="text-muted-foreground/40 line-through">{item.from}</span>
                          <span className="text-foreground/70 font-medium">→ {item.to}</span>
                        </div>
                      ))}
                    </div>

                    {settings.language !== 'de' && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                        <span className="text-xs">🇩🇪</span>
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          Hockey Mode works best in German — switch language for the full experience!
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Fun features list */}
                <div className="border-t border-border/20 px-4 sm:px-5 py-3">
                  <div className="space-y-2">
                    {[
                      { icon: '🥅', text: t('settings.hockeyFeature1') },
                      { icon: '🩺', text: t('settings.hockeyFeature2') },
                      { icon: '🚨', text: t('settings.hockeyFeature3') },
                      { icon: '📋', text: t('settings.hockeyFeature4') },
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className="text-sm shrink-0">{feature.icon}</span>
                        <span className="text-[11px] text-muted-foreground/70">{feature.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═════ DATA & STORAGE ═════ */}
          {activeSection === 'data' && (
            <div>
              <SectionHeader icon={Database} label={t('settings.dataStorage')} />

              <SettingRow label={t('settings.autoBackup')} description={t('settings.autoBackupDesc')}>
                <Toggle
                  checked={settings.data.autoBackup}
                  onChange={(v) => setNested('data', { autoBackup: v })}
                />
              </SettingRow>

              <SettingRow label={t('settings.exportSettings')} description={t('settings.exportSettingsDesc')}>
                <button
                  onClick={handleExportData}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-foreground/[0.03] transition-colors"
                >
                  <Download className="h-3 w-3" />
                  {t('settings.exportSettings')}
                </button>
              </SettingRow>

              <SettingRow label={t('settings.importSettings')} description={t('settings.importSettingsDesc')}>
                <button
                  onClick={handleImportData}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-foreground/[0.03] transition-colors"
                >
                  <Upload className="h-3 w-3" />
                  {t('settings.importSettings')}
                </button>
              </SettingRow>

              {settings.data.lastExportAt && (
                <p className="text-[10px] text-muted-foreground/40 mt-1">
                  Last exported: {new Date(settings.data.lastExportAt).toLocaleString()}
                </p>
              )}

              {/* Danger zone */}
              <div className="mt-8 pt-6 border-t border-border/30">
                <p className="text-[10px] font-medium uppercase tracking-widest text-destructive/60 mb-3">
                  {t('settings.dangerZone')}
                </p>

                <div className="rounded-2xl border border-destructive/20 p-4 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-foreground/90">{t('settings.resetAll')}</p>
                      <p className="text-[11px] text-muted-foreground/50">{t('settings.resetAllDesc')}</p>
                    </div>
                    {showResetConfirm ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { reset(); setShowResetConfirm(false); flashSaved(); }}
                          className="rounded-lg bg-destructive px-3 py-1.5 text-[11px] font-medium text-white hover:bg-destructive/90 transition-colors"
                        >
                          {t('settings.confirmReset')}
                        </button>
                        <button
                          onClick={() => setShowResetConfirm(false)}
                          className="rounded-lg border border-border/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive/80 hover:bg-destructive/5 transition-colors w-fit"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t('settings.reset')}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-destructive/10">
                    <div>
                      <p className="text-[13px] font-medium text-foreground/90">{t('settings.deleteAccount')}</p>
                      <p className="text-[11px] text-muted-foreground/50">{t('settings.deleteAccountDesc')}</p>
                    </div>
                    {showDeleteConfirm ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={async () => {
                            setDeleteLoading(true);
                            try {
                              await deleteAccount();
                            } catch {
                              setDeleteLoading(false);
                              setShowDeleteConfirm(false);
                            }
                          }}
                          disabled={deleteLoading}
                          className="rounded-lg bg-destructive px-3 py-1.5 text-[11px] font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                        >
                          {deleteLoading ? t('settings.deleting') : t('settings.yesDeleteEverything')}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="rounded-lg border border-border/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive/80 hover:bg-destructive/5 transition-colors w-fit"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t('settings.deleteAccount')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* App info */}
              <div className="mt-8 pt-4 border-t border-border/20 text-center">
                <p className="text-[11px] text-muted-foreground/30">
                  {t('settings.version')}
                </p>
                <p className="text-[10px] text-muted-foreground/20 mt-0.5">
                  {isDemo ? t('settings.syncedLocally') : t('settings.syncedFirebase')}
                </p>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
