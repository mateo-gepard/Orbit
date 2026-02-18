'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Palette,
  Globe,
  Bell,
  Shield,
  Accessibility,
  Database,
  Keyboard,
  Monitor,
  Brain,
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { useSettingsStore } from '@/lib/settings-store';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useTheme } from 'next-themes';
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
  label: string;
  icon: LucideIcon;
}

const SECTIONS: SettingSection[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'regional', label: 'Language & Region', icon: Globe },
  { id: 'behavior', label: 'General', icon: Monitor },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'focus', label: 'Focus & Flight', icon: Brain },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'data', label: 'Data & Storage', icon: Database },
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
    <div className={cn('flex items-center justify-between gap-4 py-3.5', border && 'border-b border-border/30')}>
      <div className="min-w-0 flex-1">
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
      className="appearance-none rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 outline-none focus:ring-1 focus:ring-foreground/20 cursor-pointer pr-7 min-w-[120px]"
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
const SHORTCUTS = [
  { keys: ['⌘', 'K'], action: 'Open command bar' },
  { keys: ['⌘', 'B'], action: 'Toggle sidebar' },
  { keys: ['Esc'], action: 'Close panel / dialog' },
  { keys: ['Enter'], action: 'Submit / confirm' },
  { keys: ['↑', '↓'], action: 'Navigate list items' },
  { keys: ['⌘', '⇧', 'D'], action: 'Toggle dark mode' },
];

// ═══════════════════════════════════════════════════════════
// Main settings page
// ═══════════════════════════════════════════════════════════

export default function SettingsPage() {
  const { user, isDemo, signOut } = useAuth();
  const { settings, update, updateNested, reset } = useSettingsStore();
  const { setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState('profile');
  const [mounted, setMounted] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
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
        <h1 className="text-[13px] font-semibold tracking-tight px-3 mb-5 text-muted-foreground/70 uppercase">Settings</h1>
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
                <span>{s.label}</span>
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
            Sign out
          </button>
        </div>
      </nav>

      {/* ─── Mobile section pills ─── */}
      <div className="lg:hidden fixed top-[57px] left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30">
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
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Content area ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-6 lg:py-8 mt-12 lg:mt-0">
          {/* Saved indicator */}
          <div
            className={cn(
              'fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-[11px] font-medium shadow-lg transition-all duration-300',
              saved ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
            )}
          >
            <Check className="h-3 w-3" />
            Saved
          </div>

          {/* ═════ PROFILE ═════ */}
          {activeSection === 'profile' && (
            <div>
              <SectionHeader icon={User} label="Profile" />

              {/* Avatar + name card */}
              <div className="flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card mb-6">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user?.photoURL || undefined} />
                  <AvatarFallback className="text-lg bg-foreground/10">
                    {user?.displayName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate">
                    {user?.displayName || 'User'}
                  </p>
                  <p className="text-[12px] text-muted-foreground/60 truncate">
                    {user?.email || ''}
                  </p>
                  {isDemo && (
                    <span className="inline-block mt-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                      Demo Mode
                    </span>
                  )}
                </div>
              </div>

              <SettingRow label="Display Name" description="How you appear in the app">
                <input
                  value={settings.displayName || user?.displayName || ''}
                  onChange={(e) => set('displayName', e.target.value)}
                  placeholder={user?.displayName || 'Your name'}
                  className="w-[180px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </SettingRow>

              <SettingRow label="Email" description="Linked to your Google account">
                <span className="text-[12px] text-muted-foreground/60 font-mono">
                  {user?.email || 'demo@orbit.local'}
                </span>
              </SettingRow>

              <SettingRow label="Bio" description="Short description about yourself">
                <input
                  value={settings.bio}
                  onChange={(e) => set('bio', e.target.value)}
                  placeholder="A few words..."
                  className="w-[180px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </SettingRow>

              <SettingRow label="Timezone" description="Used for scheduling and due dates" border={false}>
                <span className="text-[12px] text-muted-foreground/60 font-mono">
                  {settings.timezone}
                </span>
              </SettingRow>
            </div>
          )}

          {/* ═════ APPEARANCE ═════ */}
          {activeSection === 'appearance' && (
            <div>
              <SectionHeader icon={Palette} label="Appearance" />

              <SettingRow label="Theme" description="Choose how Orbit looks">
                <div className="flex gap-1 rounded-lg border border-border/40 p-0.5">
                  {([
                    { value: 'light' as ThemeMode, icon: Sun, label: 'Light' },
                    { value: 'dark' as ThemeMode, icon: Moon, label: 'Dark' },
                    { value: 'system' as ThemeMode, icon: SunMoon, label: 'System' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleThemeChange(opt.value)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
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

              <SettingRow label="Accent Color" description="Primary tint throughout the UI">
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

              <SettingRow label="Density" description="Comfortable shows more whitespace">
                <SelectDropdown<CompactMode>
                  value={settings.compactMode}
                  options={[
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'compact', label: 'Compact' },
                  ]}
                  onChange={(v) => set('compactMode', v)}
                />
              </SettingRow>

              <SettingRow label="Sidebar Badges" description="Show count badges on navigation items">
                <Toggle checked={settings.showSidebarBadges} onChange={(v) => set('showSidebarBadges', v)} />
              </SettingRow>

              <SettingRow label="Animations" description="Enable UI transitions and motion effects" border={false}>
                <Toggle checked={settings.animationsEnabled} onChange={(v) => set('animationsEnabled', v)} />
              </SettingRow>
            </div>
          )}

          {/* ═════ LANGUAGE & REGION ═════ */}
          {activeSection === 'regional' && (
            <div>
              <SectionHeader icon={Globe} label="Language & Region" />

              <SettingRow label="Language">
                <SelectDropdown<Language>
                  value={settings.language}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'de', label: 'Deutsch' },
                  ]}
                  onChange={(v) => set('language', v)}
                />
              </SettingRow>

              <SettingRow label="Date Format">
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

              <SettingRow label="Time Format">
                <SelectDropdown<TimeFormat>
                  value={settings.timeFormat}
                  options={[
                    { value: '24h', label: '14:30' },
                    { value: '12h', label: '2:30 PM' },
                  ]}
                  onChange={(v) => set('timeFormat', v)}
                />
              </SettingRow>

              <SettingRow label="Week Starts On" border={false}>
                <SelectDropdown<WeekStart>
                  value={settings.weekStart}
                  options={[
                    { value: 'monday', label: 'Monday' },
                    { value: 'sunday', label: 'Sunday' },
                  ]}
                  onChange={(v) => set('weekStart', v)}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ GENERAL / BEHAVIOR ═════ */}
          {activeSection === 'behavior' && (
            <div>
              <SectionHeader icon={Monitor} label="General" />

              <SettingRow label="Start Page" description="Which page to show when you open Orbit">
                <SelectDropdown<DefaultView>
                  value={settings.defaultView}
                  options={[
                    { value: 'dashboard', label: 'Dashboard' },
                    { value: 'today', label: 'Today' },
                    { value: 'tasks', label: 'Tasks' },
                    { value: 'inbox', label: 'Inbox' },
                  ]}
                  onChange={(v) => set('defaultView', v)}
                />
              </SettingRow>

              <SettingRow label="Confirm Before Delete" description="Show a warning before deleting items">
                <Toggle checked={settings.confirmBeforeDelete} onChange={(v) => set('confirmBeforeDelete', v)} />
              </SettingRow>

              <SettingRow label="Archive Instead of Delete" description="Move items to archive rather than permanently deleting">
                <Toggle checked={settings.archiveInsteadOfDelete} onChange={(v) => set('archiveInsteadOfDelete', v)} />
              </SettingRow>

              <SettingRow label="Auto-Archive Completed" description="Archive tasks after a set number of days" border={false}>
                <NumberInput
                  value={settings.autoArchiveDays}
                  onChange={(v) => set('autoArchiveDays', v)}
                  min={0}
                  max={365}
                  suffix="days"
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ NOTIFICATIONS ═════ */}
          {activeSection === 'notifications' && (
            <div>
              <SectionHeader icon={Bell} label="Notifications" />

              <SettingRow label="Enable Notifications" description="Allow Orbit to send push notifications">
                <Toggle
                  checked={settings.notifications.enabled}
                  onChange={(v) => setNested('notifications', { enabled: v })}
                />
              </SettingRow>

              <SettingRow label="Notification Sound">
                <button
                  onClick={() => setNested('notifications', { sound: !settings.notifications.sound })}
                  className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60"
                >
                  {settings.notifications.sound ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                  {settings.notifications.sound ? 'On' : 'Off'}
                </button>
              </SettingRow>

              <div className="mt-4 mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
                Scheduled
              </div>

              <SettingRow label="Daily Briefing" description="Get a summary every morning">
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

              <SettingRow label="Task Reminders" description="Remind before tasks are due">
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
                      suffix="min before"
                    />
                  )}
                </div>
              </SettingRow>

              <SettingRow label="Habit Reminders" description="Daily reminders for active habits">
                <Toggle
                  checked={settings.notifications.habitReminders}
                  onChange={(v) => setNested('notifications', { habitReminders: v })}
                />
              </SettingRow>

              <SettingRow label="Weekly Review" description="Scheduled weekly summary" border={false}>
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={settings.notifications.weeklyReview}
                    onChange={(v) => setNested('notifications', { weeklyReview: v })}
                  />
                  {settings.notifications.weeklyReview && (
                    <SelectDropdown
                      value={String(settings.notifications.weeklyReviewDay)}
                      options={[
                        { value: '0', label: 'Sunday' },
                        { value: '1', label: 'Monday' },
                        { value: '5', label: 'Friday' },
                        { value: '6', label: 'Saturday' },
                      ]}
                      onChange={(v) => setNested('notifications', { weeklyReviewDay: Number(v) })}
                    />
                  )}
                </div>
              </SettingRow>
            </div>
          )}

          {/* ═════ FOCUS & FLIGHT ═════ */}
          {activeSection === 'focus' && (
            <div>
              <SectionHeader icon={Brain} label="Focus & Flight" />

              <SettingRow label="Default Flight Duration" description="Session length when starting a new flight">
                <NumberInput
                  value={settings.focus.defaultFlightDuration}
                  onChange={(v) => setNested('focus', { defaultFlightDuration: v })}
                  min={10}
                  max={240}
                  step={5}
                  suffix="min"
                />
              </SettingRow>

              <SettingRow label="Auto-Start Breaks" description="Automatically start a break after landing">
                <Toggle
                  checked={settings.focus.autoStartBreaks}
                  onChange={(v) => setNested('focus', { autoStartBreaks: v })}
                />
              </SettingRow>

              <SettingRow label="Break Duration" description="Length of breaks between flights">
                <NumberInput
                  value={settings.focus.breakDuration}
                  onChange={(v) => setNested('focus', { breakDuration: v })}
                  min={1}
                  max={60}
                  suffix="min"
                />
              </SettingRow>

              <SettingRow label="Block Notifications During Flight" description="Suppress all notifications while in-flight">
                <Toggle
                  checked={settings.focus.blockNotifications}
                  onChange={(v) => setNested('focus', { blockNotifications: v })}
                />
              </SettingRow>

              <SettingRow label="Turbulence Screen Shake" description="Shake the screen when logging turbulence" border={false}>
                <Toggle
                  checked={settings.focus.turbulenceShakeScreen}
                  onChange={(v) => setNested('focus', { turbulenceShakeScreen: v })}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ CALENDAR ═════ */}
          {activeSection === 'calendar' && (
            <div>
              <SectionHeader icon={Calendar} label="Calendar" />

              <SettingRow label="Google Calendar Sync" description="Sync events with your Google Calendar">
                <Toggle
                  checked={settings.calendar.googleCalendarSync}
                  onChange={(v) => setNested('calendar', { googleCalendarSync: v })}
                />
              </SettingRow>

              <SettingRow label="Default Event Duration" description="When creating events without specifying length">
                <NumberInput
                  value={settings.calendar.defaultEventDuration}
                  onChange={(v) => setNested('calendar', { defaultEventDuration: v })}
                  min={15}
                  max={480}
                  step={15}
                  suffix="min"
                />
              </SettingRow>

              <SettingRow label="Show Week Numbers" description="Display ISO week numbers in calendar views">
                <Toggle
                  checked={settings.calendar.showWeekNumbers}
                  onChange={(v) => setNested('calendar', { showWeekNumbers: v })}
                />
              </SettingRow>

              <SettingRow label="Show Declined Events" description="Display events you've declined" border={false}>
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
              <SectionHeader icon={Keyboard} label="Keyboard Shortcuts" />
              <div className="rounded-2xl border border-border/40 overflow-hidden">
                {SHORTCUTS.map((shortcut, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between px-4 py-3',
                      i < SHORTCUTS.length - 1 && 'border-b border-border/20'
                    )}
                  >
                    <span className="text-[13px] text-foreground/80">{shortcut.action}</span>
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
                Custom shortcut configuration coming soon.
              </p>
            </div>
          )}

          {/* ═════ PRIVACY & SECURITY ═════ */}
          {activeSection === 'privacy' && (
            <div>
              <SectionHeader icon={Shield} label="Privacy & Security" />

              <SettingRow label="Usage Analytics" description="Help improve Orbit by sharing anonymous usage data">
                <Toggle
                  checked={settings.privacy.analyticsEnabled}
                  onChange={(v) => setNested('privacy', { analyticsEnabled: v })}
                />
              </SettingRow>

              <SettingRow label="Crash Reports" description="Automatically send crash logs for debugging">
                <Toggle
                  checked={settings.privacy.crashReportsEnabled}
                  onChange={(v) => setNested('privacy', { crashReportsEnabled: v })}
                />
              </SettingRow>

              <SettingRow label="Show Profile Photo" description="Display your Google profile picture in the sidebar" border={false}>
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
                  Your data is stored securely in Firebase with end-to-end authentication.
                  Only you can access your items. Orbit never sells or shares personal data.
                </p>
              </div>
            </div>
          )}

          {/* ═════ ACCESSIBILITY ═════ */}
          {activeSection === 'accessibility' && (
            <div>
              <SectionHeader icon={Accessibility} label="Accessibility" />

              <SettingRow label="Reduce Motion" description="Minimize animations and transitions">
                <Toggle
                  checked={settings.accessibility.reduceMotion}
                  onChange={(v) => setNested('accessibility', { reduceMotion: v })}
                />
              </SettingRow>

              <SettingRow label="High Contrast" description="Increase contrast for better readability">
                <Toggle
                  checked={settings.accessibility.highContrast}
                  onChange={(v) => setNested('accessibility', { highContrast: v })}
                />
              </SettingRow>

              <SettingRow label="Font Size" description="Adjust base text size throughout the app" border={false}>
                <SelectDropdown
                  value={settings.accessibility.fontSize}
                  options={[
                    { value: 'small', label: 'Small' },
                    { value: 'default', label: 'Default' },
                    { value: 'large', label: 'Large' },
                  ]}
                  onChange={(v) => setNested('accessibility', { fontSize: v })}
                />
              </SettingRow>
            </div>
          )}

          {/* ═════ DATA & STORAGE ═════ */}
          {activeSection === 'data' && (
            <div>
              <SectionHeader icon={Database} label="Data & Storage" />

              <SettingRow label="Auto Backup" description="Periodically back up your data to cloud storage">
                <Toggle
                  checked={settings.data.autoBackup}
                  onChange={(v) => setNested('data', { autoBackup: v })}
                />
              </SettingRow>

              <SettingRow label="Export Settings" description="Download all settings as a JSON file">
                <button
                  onClick={handleExportData}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-foreground/[0.03] transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Export
                </button>
              </SettingRow>

              <SettingRow label="Import Settings" description="Restore settings from a JSON backup">
                <button
                  onClick={handleImportData}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-foreground/[0.03] transition-colors"
                >
                  <Upload className="h-3 w-3" />
                  Import
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
                  Danger Zone
                </p>

                <div className="rounded-2xl border border-destructive/20 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-foreground/90">Reset All Settings</p>
                      <p className="text-[11px] text-muted-foreground/50">Restore every setting to its default value</p>
                    </div>
                    {showResetConfirm ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { reset(); setShowResetConfirm(false); flashSaved(); }}
                          className="rounded-lg bg-destructive px-3 py-1.5 text-[11px] font-medium text-white hover:bg-destructive/90 transition-colors"
                        >
                          Confirm Reset
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
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive/80 hover:bg-destructive/5 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* App info */}
              <div className="mt-8 pt-4 border-t border-border/20 text-center">
                <p className="text-[11px] text-muted-foreground/30">
                  ORBIT v1.0.0 · Made with focus
                </p>
                <p className="text-[10px] text-muted-foreground/20 mt-0.5">
                  Settings synced {isDemo ? 'locally' : 'with Firebase'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
