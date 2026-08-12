'use client';

import { McpSettings } from '@/components/settings/mcp-settings';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  Send,
  Sparkles,
  Smartphone,
  MonitorSmartphone,
  AlertTriangle,
  Info,
  X,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, fullTimestampPattern, getLocale } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import {
  createSettingsExport,
  detectDeviceTimeZone,
  normalizeIanaTimeZone,
  useSettingsStore,
} from '@/lib/settings-store';
import type { UserSettings } from '@/lib/settings-store';
import { useOrbitStore } from '@/lib/store';
import {
  requestNotificationPermission,
  sendMorningBriefingNow,
  sendEveningBriefingNow,
  syncBriefingScheduleToSW,
} from '@/lib/briefing-notifications';
import { updateFCMSchedule, isFCMAvailable, hasFCMToken, registerFCMToken, getRegisteredDevices, removeDevice, getDeviceLabel, type RegisteredDevice } from '@/lib/fcm';
import { startGoogleCalendarSync, stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import {
  clearGoogleAccessToken,
  hasCalendarPermission,
  prepareGoogleCalendarPermission,
  requestCalendarPermission,
} from '@/lib/google-calendar';
import {
  createDurableAccountExport,
  type AccountExportProgress,
} from '@/lib/account-export-archive';
import { auth, googleProvider } from '@/lib/firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { t as translate, useTranslation, type TranslationKey } from '@/lib/i18n';
import type {
  ThemeMode,
  DateFormat,
  TimeFormat,
  WeekStart,
  Language,
  DefaultView,
  CompactMode,
} from '@/lib/settings-store';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { canInstall, triggerInstall } from '@/lib/pwa';
import { isIOS as detectIOS } from '@/lib/mobile';
import {
  chooseAccountReauthMethod,
  isRecentLoginRequiredError,
} from '@/lib/auth-reauth';
import { clearScopedBrowserData } from '@/lib/account-storage';
import { CAPTURE_SYNTAX } from '@/components/shell/command-bar';
import { GLOBAL_SHORTCUTS } from '@/components/shell/keyboard-shortcuts';
import { ConflictRecoveryPanel } from '@/components/settings/conflict-recovery';

// ═══════════════════════════════════════════════════════════
// Setting section definitions
// ═══════════════════════════════════════════════════════════

interface SettingSection {
  id: string;
  label: TranslationKey;
  icon: LucideIcon;
  displayLabel?: string;
}

const SECTIONS: SettingSection[] = [
  { id: 'profile', label: 'settings.profile', icon: User },
  { id: 'appearance', label: 'settings.appearance', icon: Palette },
  { id: 'regional', label: 'settings.languageRegion', icon: Globe },
  { id: 'behavior', label: 'settings.general', icon: Monitor },
  { id: 'notifications', label: 'settings.notifications', icon: Bell },
  { id: 'calendar', label: 'settings.calendar', icon: Calendar },
  { id: 'mcp', label: 'settings.dataStorage', displayLabel: 'MCP', icon: Database },
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

const SettingLabelContext = createContext<string | undefined>(undefined);

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
    <SettingLabelContext.Provider value={label}>
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
    </SettingLabelContext.Provider>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const rowLabel = useContext(SettingLabelContext);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? rowLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[40px] rounded-full transition-colors duration-200',
        checked ? 'bg-foreground' : 'bg-foreground/15',
        disabled && 'cursor-wait opacity-60'
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
  const label = useContext(SettingLabelContext);
  return (
    <select
      aria-label={label}
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
  const label = useContext(SettingLabelContext);
  return (
    <div className="flex items-center gap-1.5">
      <input
        aria-label={label}
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

// Sourced from the handler itself, so the list cannot drift from what the
// app actually binds.
const SHORTCUTS = GLOBAL_SHORTCUTS;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Some browsers resolve downloads asynchronously. Revoking immediately can
  // cancel an otherwise valid export, so retain the object URL briefly.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function downloadJson(data: unknown, filename: string) {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    filename,
  );
}

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
  const { t, lang } = useTranslation();
  const items = useOrbitStore((s) => s.items);
  const { user } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | 'unsupported'>('default');
  const [testSent, setTestSent] = useState<'morning' | 'evening' | null>(null);
  const [fcmStatus, setFcmStatus] = useState<'unavailable' | 'unregistered' | 'registered'>('unavailable');
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [removingDevice, setRemovingDevice] = useState<string | null>(null);
  const [permissionPending, setPermissionPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  // Detect platform capabilities
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const frame = requestAnimationFrame(() => {
      if (!('Notification' in window)) {
        setPermissionStatus('unsupported');
      } else {
        setPermissionStatus(Notification.permission);
      }
      if (isFCMAvailable() && user && user.uid !== 'demo-user') {
        setFcmStatus(hasFCMToken(user.uid) ? 'registered' : 'unregistered');
      }
      const ua = navigator.userAgent;
      setIsIOS(/iPad|iPhone|iPod/.test(ua));
      setIsPWA(window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone));
    });

    return () => cancelAnimationFrame(frame);
  }, [user]);

  // Load registered devices
  useEffect(() => {
    if (!user || user.uid === 'demo-user') {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (cancelled) return;
        setDevices([]);
        setLoadingDevices(false);
        setFcmStatus('unavailable');
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    Promise.resolve().then(async () => {
      setLoadingDevices(true);
      try {
        const registeredDevices = await getRegisteredDevices(user.uid);
        if (!cancelled) setDevices(registeredDevices);
      } catch {
        if (!cancelled) toast.error(translate('settings.devicesLoadError', lang));
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user, fcmStatus, lang]);

  // Sync briefing schedule to SW + Firestore whenever settings change
  useEffect(() => {
    syncBriefingScheduleToSW();
    if (user && user.uid !== 'demo-user' && hasFCMToken(user.uid)) {
      updateFCMSchedule(user.uid).catch(() => {});
    }
  }, [
    user,
    settings.notifications.enabled,
    settings.notifications.dailyBriefing,
    settings.notifications.dailyBriefingTime,
    settings.notifications.eveningBriefing,
    settings.notifications.eveningBriefingTime,
  ]);

  const handleRequestPermission = async () => {
    if (permissionStatus === 'unsupported' || permissionPending) return;
    setPermissionPending(true);
    try {
      const granted = await requestNotificationPermission();
      setPermissionStatus(granted ? 'granted' : 'denied');
      if (granted) {
        setNested('notifications', { enabled: true });
      } else {
        toast.error(t('settings.notificationPermissionDenied'));
      }
    } catch {
      toast.error(t('settings.notificationPermissionError'));
    } finally {
      setPermissionPending(false);
    }
  };

  const handleEnableBackgroundPush = async () => {
    if (!user || user.uid === 'demo-user' || pushPending) return;
    setPushPending(true);
    try {
      const token = await registerFCMToken(user.uid);
      if (!token) {
        setFcmStatus('unregistered');
        toast.error(t('settings.pushEnableError'));
        return;
      }
      if (!settings.notifications.enabled) {
        setNested('notifications', { enabled: true });
      }
      setFcmStatus('registered');
      toast.success(t('settings.pushEnabled'));
    } catch {
      setFcmStatus('unregistered');
      toast.error(t('settings.pushEnableError'));
    } finally {
      setPushPending(false);
    }
  };

  const handleRemoveDevice = async (docId: string) => {
    if (!user || user.uid === 'demo-user') return;
    setRemovingDevice(docId);
    try {
      await removeDevice(user.uid, docId);
      setDevices((prev) => prev.filter((device) => device.docId !== docId));
      if (devices.find((device) => device.docId === docId)?.isCurrentDevice) {
        setFcmStatus('unregistered');
      }
      toast.success(t('settings.deviceRemoved'));
    } catch {
      toast.error(t('settings.deviceRemoveError'));
    } finally {
      setRemovingDevice(null);
    }
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

  const permGranted = permissionStatus === 'granted';
  const permDenied = permissionStatus === 'denied';
  const permUnsupported = permissionStatus === 'unsupported';

  return (
    <div>
      <SectionHeader icon={Bell} label={t('settings.notifications')} />

      {/* ─── Permission Status Card ─── */}
      <div className={cn(
        'mb-5 rounded-xl border px-4 py-3.5',
        permGranted
          ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
          : permDenied
            ? 'border-red-500/20 bg-red-500/[0.04]'
            : permUnsupported
              ? 'border-amber-500/20 bg-amber-500/[0.04]'
              : 'border-blue-500/20 bg-blue-500/[0.04]',
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            permGranted ? 'bg-emerald-500/10' : permDenied ? 'bg-red-500/10' : permUnsupported ? 'bg-amber-500/10' : 'bg-blue-500/10',
          )}>
            {permGranted ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : permDenied ? (
              <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
            ) : permUnsupported ? (
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <BellRing className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">
              {permGranted
                ? t('settings.notificationsEnabled')
                : permDenied
                  ? t('settings.notificationsBlocked')
                  : permUnsupported
                    ? t('settings.notificationsUnsupported')
                    : t('settings.enableNotificationsPrompt')
              }
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
              {permGranted
                ? t('settings.notificationsEnabledDesc')
                : permDenied
                  ? isIOS
                    ? t('settings.notificationsBlockedIosDesc')
                    : t('settings.notificationsBlockedDesc')
                  : permUnsupported
                    ? isIOS && !isPWA
                      ? t('settings.notificationsIosInstallDesc')
                      : t('settings.notificationsUnsupportedDesc')
                    : isIOS && !isPWA
                      ? t('settings.notificationsIosEnableDesc')
                      : t('settings.enableNotificationsPromptDesc')
              }
            </p>
          </div>
          {!permGranted && !permUnsupported && !(isIOS && !isPWA) && (
            <button
              onClick={handleRequestPermission}
              className={cn(
                'shrink-0 rounded-lg px-3.5 py-1.5 text-[11px] font-semibold transition-all mt-0.5',
                permDenied
                  ? 'bg-muted/60 text-muted-foreground/40 cursor-not-allowed'
                  : 'bg-foreground text-background hover:opacity-80 active:scale-95',
              )}
              disabled={permDenied || permissionPending}
            >
              {permDenied
                ? t('settings.blocked')
                : permissionPending
                  ? t('settings.requesting')
                  : t('settings.allow')}
            </button>
          )}
        </div>
      </div>

      {/* ─── Master Toggle ─── */}
      <SettingRow label={t('settings.enableNotif')} description={t('settings.enableNotifDesc')}>
        <Toggle
          checked={settings.notifications.enabled}
          onChange={(v) => setNested('notifications', { enabled: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.notifSound')}>
        <button
          type="button"
          onClick={() => setNested('notifications', { sound: !settings.notifications.sound })}
          aria-pressed={settings.notifications.sound}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60"
        >
          {settings.notifications.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {settings.notifications.sound ? t('common.on') : t('common.off')}
        </button>
      </SettingRow>

      {/* ─── Briefings ─── */}
      <div className="mt-5 mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
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
              aria-label={t('settings.morningBriefing')}
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
              aria-label={t('settings.eveningBriefing')}
              type="time"
              value={settings.notifications.eveningBriefingTime}
              onChange={(e) => setNested('notifications', { eveningBriefingTime: e.target.value })}
              className="rounded-lg border border-border/50 bg-background px-2 py-1 text-[11px] font-mono outline-none"
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

      {/* Test buttons */}
      {permGranted && (
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

      {/* ─── Background Push / Devices ─── */}
      {permGranted && (
        <div className="mt-5">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
            {t('settings.devicesAndPush')}
          </div>

          <div className="rounded-xl border border-border/30 bg-muted/10 overflow-hidden">
            {/* This device status */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
              <div className="flex items-center gap-2.5">
                <MonitorSmartphone className="h-4 w-4 text-muted-foreground/40" />
                <div>
                  <p className="text-[12px] font-medium">{t('settings.thisDevice')}</p>
                  <p className="text-[10px] text-muted-foreground/40">
                    {fcmStatus === 'registered'
                      ? t('settings.receivingPush')
                      : t('settings.notRegisteredForPush')}
                  </p>
                </div>
              </div>
              {fcmStatus === 'registered' ? (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{t('settings.active')}</span>
                </div>
              ) : fcmStatus === 'unregistered' && user ? (
                <button
                  onClick={handleEnableBackgroundPush}
                  disabled={pushPending}
                  className="rounded-lg bg-foreground px-3 py-1.5 text-[10px] font-semibold text-background transition-opacity hover:opacity-80 active:scale-95 disabled:cursor-wait disabled:opacity-50"
                >
                  {pushPending ? t('settings.enablingPush') : t('settings.enablePush')}
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground/30">{t('settings.notAvailable')}</span>
              )}
            </div>

            {/* Registered devices list */}
            {devices.length > 0 && (
              <div>
                <div className="px-4 py-2 border-b border-border/15">
                  <p className="text-[10px] font-medium text-muted-foreground/35 uppercase tracking-wider">
                    {devices.length} {devices.length === 1
                      ? t('settings.registeredDevice')
                      : t('settings.registeredDevices')}
                  </p>
                </div>
                {devices.map((device) => (
                  <div key={device.docId} className={cn(
                    'flex items-center justify-between px-4 py-2.5 border-b border-border/10 last:border-b-0',
                    device.isCurrentDevice && 'bg-foreground/[0.02]',
                  )}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-medium truncate">
                            {device.userAgent ? getDeviceLabel(device.userAgent) : t('settings.unknownDevice')}
                          </p>
                          {device.isCurrentDevice && (
                            <span className="text-[8px] font-bold uppercase tracking-wider bg-foreground/10 text-foreground/50 px-1.5 py-0.5 rounded">{t('settings.currentDevice')}</span>
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground/30">
                          {device.type === 'webpush' ? t('settings.webPush') : 'FCM'} · {t('settings.lastActive')}{' '}
                          {device.updatedAt
                            ? format(
                              new Date(device.updatedAt),
                              fullTimestampPattern(settings.dateFormat, settings.timeFormat),
                              { locale: getLocale(lang) },
                            )
                            : t('settings.unknown')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDevice(device.docId)}
                      disabled={removingDevice === device.docId}
                      className={cn(
                        'shrink-0 ml-2 rounded-lg p-1.5 text-muted-foreground/25 hover:text-red-500 hover:bg-red-500/10 transition-all',
                        removingDevice === device.docId && 'opacity-30 pointer-events-none',
                      )}
                      title={t('settings.removeDevice')}
                      aria-label={t('settings.removeDevice')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {loadingDevices && devices.length === 0 && (
              <div role="status" className="px-4 py-3 text-[11px] text-muted-foreground/30">{t('settings.loadingDevices')}</div>
            )}

            {/* Help text */}
            <div className="px-4 py-2.5 bg-muted/10">
              <p className="text-[10px] text-muted-foreground/35 leading-relaxed">
                {fcmStatus === 'registered'
                  ? t('settings.pushRegisteredDesc')
                  : t('settings.pushUnregisteredDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main settings page
// ═══════════════════════════════════════════════════════════

export default function SettingsPage() {
  const { t, lang } = useTranslation();
  const { user, isDemo, signOut, deleteAccount } = useAuth();
  const { settings, update, updateNested, reset, importSettings, cloudSaveState } = useSettingsStore();
  const [activeSection, setActiveSection] = useState('profile');
  const [mounted, setMounted] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [calendarConnecting, setCalendarConnecting] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarAuthorizationState, setCalendarAuthorizationState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [installStatus, setInstallStatus] = useState<'installed' | 'available' | 'unavailable'>('unavailable');
  const [installing, setInstalling] = useState(false);
  const [exportingAllData, setExportingAllData] = useState(false);
  const [accountExportProgress, setAccountExportProgress] = useState<AccountExportProgress | null>(null);
  const [accountExportError, setAccountExportError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletionReauth, setDeletionReauth] = useState<{
    expectedUid: string;
    method: 'google' | 'password' | 'unsupported';
    providerLabel?: string;
  } | null>(null);
  const [deletionPassword, setDeletionPassword] = useState('');
  const [deletionReauthError, setDeletionReauthError] = useState<string | null>(null);
  const [reauthenticatingDeletion, setReauthenticatingDeletion] = useState(false);
  const [timezoneEditor, setTimezoneEditor] = useState<{
    savedValue: string;
    draft: string;
    feedback: 'invalid' | 'saved' | 'detected' | null;
  }>(() => ({
    savedValue: settings.timezone,
    draft: settings.timezone,
    feedback: null,
  }));
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountExportAbortRef = useRef<AbortController | null>(null);
  const deletionInFlightRef = useRef(false);

  const timezoneDraft = timezoneEditor.savedValue === settings.timezone
    ? timezoneEditor.draft
    : settings.timezone;
  const timezoneFeedback = timezoneEditor.savedValue === settings.timezone
    ? timezoneEditor.feedback
    : null;

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get('section');
    if (requestedSection && SECTIONS.some((section) => section.id === requestedSection)) {
      setActiveSection(requestedSection);
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(frame);
      accountExportAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const syncCalendarConnection = () => setCalendarConnected(hasCalendarPermission());
    syncCalendarConnection();
    const timer = window.setInterval(syncCalendarConnection, 30_000);
    window.addEventListener('focus', syncCalendarConnection);
    document.addEventListener('visibilitychange', syncCalendarConnection);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncCalendarConnection);
      document.removeEventListener('visibilitychange', syncCalendarConnection);
    };
  }, []);

  useEffect(() => {
    if (
      activeSection !== 'calendar'
      || !user
      || isDemo
      || user.uid === 'demo-user'
      || hasCalendarPermission()
    ) return;
    let cancelled = false;
    setCalendarAuthorizationState('loading');
    void prepareGoogleCalendarPermission()
      .then(() => {
        if (!cancelled) setCalendarAuthorizationState('ready');
      })
      .catch(() => {
        if (!cancelled) setCalendarAuthorizationState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection, isDemo, user]);

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const syncInstallStatus = () => {
      const installed = displayMode.matches
        || ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone === true);
      setInstallStatus(installed ? 'installed' : canInstall() ? 'available' : 'unavailable');
    };
    syncInstallStatus();
    displayMode.addEventListener('change', syncInstallStatus);
    window.addEventListener('threadmap:install-available', syncInstallStatus);
    window.addEventListener('threadmap:app-installed', syncInstallStatus);
    return () => {
      displayMode.removeEventListener('change', syncInstallStatus);
      window.removeEventListener('threadmap:install-available', syncInstallStatus);
      window.removeEventListener('threadmap:app-installed', syncInstallStatus);
    };
  }, []);

  useEffect(() => {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    if (cloudSaveState === 'idle') {
      setShowSaveStatus(false);
      return;
    }
    setShowSaveStatus(true);
    if (cloudSaveState === 'saved') {
      saveStatusTimerRef.current = setTimeout(() => setShowSaveStatus(false), 1500);
    }
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, [cloudSaveState]);

  // SettingsEffects applies this account-scoped preference to next-themes.
  const handleThemeChange = (mode: ThemeMode) => {
    update({ theme: mode });
  };

  // Generic helpers so every control is one-liner
  const set = <K extends keyof typeof settings>(key: K, val: (typeof settings)[K]) => {
    update({ [key]: val } as Partial<typeof settings>);
  };

  const setNested = <K extends keyof typeof settings>(
    section: K,
    patch: Partial<(typeof settings)[K] & Record<string, unknown>>
  ) => {
    updateNested(section, patch);
  };

  const handleTimezoneSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeIanaTimeZone(timezoneDraft);
    if (!normalized) {
      setTimezoneEditor({
        savedValue: settings.timezone,
        draft: timezoneDraft,
        feedback: 'invalid',
      });
      return;
    }

    if (normalized !== settings.timezone) update({ timezone: normalized });
    setTimezoneEditor({ savedValue: normalized, draft: normalized, feedback: 'saved' });
  };

  const handleTimezoneDetection = () => {
    const detected = detectDeviceTimeZone();
    if (detected !== settings.timezone) update({ timezone: detected });
    setTimezoneEditor({ savedValue: detected, draft: detected, feedback: 'detected' });
  };

  const handleExportData = () => {
    try {
      const data = createSettingsExport(settings);
      downloadJson(data, `threadmap-settings-${new Date().toISOString().slice(0, 10)}.json`);
      updateNested('data', { lastExportAt: Date.now() });
      toast.success(t('settings.settingsExportDownloaded'));
    } catch {
      toast.error(t('settings.settingsExportError'));
    }
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
        importSettings(data);
        toast.success(t('settings.settingsImported'));
      } catch {
        toast.error(t('settings.settingsImportError'));
      }
    };
    input.click();
  };

  const handleExportAllData = async () => {
    if (!user || exportingAllData) return;
    const expectedUid = user.uid;
    const localOnly = isDemo || expectedUid === 'demo-user';
    const controller = new AbortController();
    accountExportAbortRef.current = controller;
    setExportingAllData(true);
    setAccountExportError(null);
    setAccountExportProgress({ phase: 'fetching', completed: 0, total: 0 });
    try {
      const result = await createDurableAccountExport(expectedUid, localOnly, {
        signal: controller.signal,
        onProgress: setAccountExportProgress,
      });
      if (!localOnly && auth?.currentUser?.uid !== expectedUid) {
        throw new Error('The signed-in account changed while the backup was being prepared.');
      }
      downloadBlob(
        result.blob,
        `threadmap-full-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      updateNested('data', { lastExportAt: Date.now() });
      toast.success(lang === 'de'
        ? `Vollständiges Backup mit ${result.attachmentCount} Anhang/Anhängen erstellt. Der Download wurde gestartet.`
        : `Complete backup with ${result.attachmentCount} attachment(s) created. Download started.`);
    } catch (error) {
      if ((error as { name?: unknown })?.name === 'AbortError') {
        toast.info(t('settings.accountExportCancelled'));
      } else {
        setAccountExportError(error instanceof Error
          ? error.message
          : (t('settings.theCompleteBackupCouldNot')));
        toast.error(t('settings.accountExportError'));
      }
    } finally {
      if (accountExportAbortRef.current === controller) accountExportAbortRef.current = null;
      setAccountExportProgress(null);
      setExportingAllData(false);
    }
  };

  const handleResetSettings = () => {
    reset();
    toast.success(t('settings.resetSuccess'));
    return true;
  };

  const handleDeleteAccount = async (): Promise<boolean> => {
    if (deletionInFlightRef.current) return false;
    deletionInFlightRef.current = true;
    setDeletingAccount(true);
    try {
      await deleteAccount();
      return true;
    } catch (error) {
      const currentUser = auth?.currentUser;
      if (
        !isDemo
        && isRecentLoginRequiredError(error)
        && user
        && currentUser
        && currentUser.uid === user.uid
      ) {
        const providerIds = currentUser.providerData
          .map((provider) => provider.providerId)
          .filter(Boolean);
        const selectedMethod = chooseAccountReauthMethod(providerIds);
        setShowDeleteConfirm(false);
        setDeletionPassword('');
        setDeletionReauthError(null);
        setDeletionReauth({
          expectedUid: currentUser.uid,
          method: selectedMethod === 'google' || selectedMethod === 'password'
            ? selectedMethod
            : 'unsupported',
          providerLabel: providerIds.join(', ') || undefined,
        });
        return false;
      }
      toast.error(t('settings.accountDeleteError'));
      return false;
    } finally {
      setDeletingAccount(false);
      deletionInFlightRef.current = false;
    }
  };

  const closeDeletionReauth = () => {
    if (reauthenticatingDeletion) return;
    setDeletionPassword('');
    setDeletionReauthError(null);
    setDeletionReauth(null);
  };

  const deletionReauthErrorMessage = (error: unknown): string => {
    const code = String((error as { code?: unknown })?.code || '').toLowerCase();
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return t('settings.verificationWasCancelledYourAccount');
    }
    if (code === 'auth/popup-blocked') {
      return t('settings.theGoogleWindowWasBlocked');
    }
    if (code === 'auth/user-mismatch' || code === 'auth/credential-mismatch') {
      return t('settings.thatIsADifferentAccount');
    }
    if (
      code === 'auth/invalid-credential'
      || code === 'auth/wrong-password'
      || code === 'auth/invalid-login-credentials'
    ) {
      return t('settings.thatPasswordWasNotAccepted');
    }
    if (code === 'auth/too-many-requests') {
      return t('settings.tooManyAttemptsWaitA');
    }
    if (isRecentLoginRequiredError(error)) {
      return t('settings.theFreshSignInCould');
    }
    return t('settings.weCouldNotVerifyYour');
  };

  const reauthenticateAndDeleteAccount = async (): Promise<void> => {
    const prompt = deletionReauth;
    if (!prompt || deletionInFlightRef.current) return;
    const currentUser = auth?.currentUser;
    if (!currentUser || currentUser.uid !== prompt.expectedUid || user?.uid !== prompt.expectedUid) {
      setDeletionReauthError(t('settings.theSignedInAccountChanged'));
      return;
    }
    if (prompt.method === 'password' && !deletionPassword) {
      setDeletionReauthError(t('settings.enterYourCurrentPassword'));
      return;
    }

    deletionInFlightRef.current = true;
    setReauthenticatingDeletion(true);
    setDeletionReauthError(null);
    let deletionRetryStarted = false;
    try {
      if (prompt.method === 'google') {
        if (!googleProvider) throw new Error('google-reauth-unavailable');
        await reauthenticateWithPopup(currentUser, googleProvider);
      } else if (prompt.method === 'password') {
        if (!currentUser.email) throw new Error('password-reauth-unavailable');
        const credential = EmailAuthProvider.credential(currentUser.email, deletionPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } else {
        return;
      }

      const refreshedUser = auth?.currentUser;
      if (!refreshedUser || refreshedUser.uid !== prompt.expectedUid || user?.uid !== prompt.expectedUid) {
        throw Object.assign(new Error('account-changed'), { code: 'auth/user-mismatch' });
      }
      await refreshedUser.getIdToken(true);
      if (auth?.currentUser?.uid !== prompt.expectedUid) {
        throw Object.assign(new Error('account-changed'), { code: 'auth/user-mismatch' });
      }

      // One retry only. A second recent-login failure becomes an actionable
      // error instead of a loop that could open repeated auth prompts.
      deletionRetryStarted = true;
      await deleteAccount();
      setDeletionReauth(null);
    } catch (error) {
      if (deletionRetryStarted && !isRecentLoginRequiredError(error)) {
        if (!auth?.currentUser || auth.currentUser.uid !== prompt.expectedUid) {
          // The server may have completed deletion while the response was
          // interrupted. The user explicitly confirmed this deletion, so do
          // not leave the deleted account's private caches on the device.
          clearScopedBrowserData(prompt.expectedUid);
        }
        setDeletionReauthError(t('settings.deletionMayAlreadyBeProcessing'));
      } else {
        setDeletionReauthError(deletionReauthErrorMessage(error));
      }
    } finally {
      setDeletionPassword('');
      setReauthenticatingDeletion(false);
      deletionInFlightRef.current = false;
    }
  };

  const handleCalendarSyncChange = async (enabled: boolean) => {
    if (calendarConnecting) return;
    if (!enabled) {
      stopGoogleCalendarSync();
      clearGoogleAccessToken();
      setCalendarConnected(false);
      setNested('calendar', { googleCalendarSync: false });
      return;
    }
    if (!user || isDemo || user.uid === 'demo-user') {
      toast.error(t('settings.calendarSignInRequired'));
      return;
    }

    setCalendarConnecting(true);
    try {
      if (!hasCalendarPermission()) {
        if (calendarAuthorizationState !== 'ready') {
          await prepareGoogleCalendarPermission();
          setCalendarAuthorizationState('ready');
          toast.info(t('settings.googleIsReadyTurnThe'));
          return;
        }
        await requestCalendarPermission();
      }
      if (!hasCalendarPermission()) {
        throw new Error('calendar-permission-denied');
      }
      setNested('calendar', { googleCalendarSync: true });
      setCalendarConnected(true);
      startGoogleCalendarSync(user.uid);
      toast.success(t('settings.calendarSyncEnabled'));
    } catch {
      stopGoogleCalendarSync();
      clearGoogleAccessToken();
      setCalendarConnected(false);
      toast.error(t('settings.calendarConnectError'));
    } finally {
      setCalendarConnecting(false);
    }
  };

  const handleInstallApp = async () => {
    if (installing || installStatus === 'installed') return;
    if (detectIOS()) {
      toast.info(t('settings.inSafariTapShareAnd'));
      return;
    }
    setInstalling(true);
    try {
      const accepted = await triggerInstall();
      if (accepted) {
        setInstallStatus('installed');
        toast.success(t('settings.threadmapWasInstalled'));
      } else {
        toast.info(t('settings.installationWasNotCompletedYou'));
      }
    } finally {
      setInstalling(false);
    }
  };

  if (!mounted) return null;

  const shortcutModifier = /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl';

  return (
    <div className="flex h-full" data-slot="settings-page">
      {/* ─── Left sidebar nav ─── */}
      <nav className="hidden lg:flex flex-col w-[220px] border-r border-border/30 py-6 px-3 shrink-0">
        <h1 className="text-[13px] font-semibold tracking-tight px-3 mb-5 text-muted-foreground/70 uppercase">{t('settings.title')}</h1>
        <div className="space-y-0.5">
          {SECTIONS.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.03]'
                )}
              >
                <s.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
                <span>{s.displayLabel ?? t(s.label)}</span>
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <div className="mt-auto pt-4 border-t border-border/30 px-3">
          <button
            type="button"
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
          <div className="flex overflow-x-auto gap-1 px-3 py-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                aria-pressed={activeSection === s.id}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors',
                  activeSection === s.id
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.05] text-muted-foreground/70'
                )}
              >
                <s.icon className="h-3 w-3" strokeWidth={1.5} />
                {s.displayLabel ?? t(s.label)}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Content area ─── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 pb-24 lg:pb-8">
            {/* Verified local/cloud save indicator */}
            <div
              role="status"
              aria-live="polite"
              className={cn(
                'fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-[11px] font-medium shadow-lg transition-all duration-300',
                showSaveStatus ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
              )}
            >
              {cloudSaveState === 'saving' || cloudSaveState === 'pending'
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                : cloudSaveState === 'error'
                  ? <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  : <Check className="h-3 w-3" aria-hidden="true" />}
              {cloudSaveState === 'pending'
                ? (t('settings.changesPending'))
                : cloudSaveState === 'saving'
                  ? (t('settings.syncing'))
                  : cloudSaveState === 'error'
                    ? (t('settings.savedLocallyCloudRetrying'))
                    : t('settings.updated')}
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
                  aria-label={t('settings.displayName')}
                  value={settings.displayName || user?.displayName || ''}
                  onChange={(e) => set('displayName', e.target.value)}
                  placeholder={user?.displayName || t('settings.yourNamePlaceholder')}
                  className="w-full sm:w-[180px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </SettingRow>

              <SettingRow label={t('settings.email')} description={t('settings.emailDesc')}>
                <span className="text-[12px] text-muted-foreground/60 font-mono">
                  {user?.email || 'demo@threadmap.local'}
                </span>
              </SettingRow>

              <SettingRow label={t('settings.bio')} description={t('settings.bioDesc')}>
                <input
                  aria-label={t('settings.bio')}
                  value={settings.bio}
                  onChange={(e) => set('bio', e.target.value)}
                  placeholder={t('settings.bioPlaceholder')}
                  className="w-full sm:w-[180px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </SettingRow>

              <SettingRow label={t('settings.timezone')} description={t('settings.timezoneDesc')}>
                <form
                  onSubmit={handleTimezoneSubmit}
                  className="w-full space-y-2 sm:w-[360px]"
                  noValidate
                >
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="settings-timezone"
                      aria-label={t('settings.timezone')}
                      aria-describedby="settings-timezone-feedback"
                      aria-invalid={timezoneFeedback === 'invalid'}
                      autoComplete="off"
                      maxLength={100}
                      spellCheck={false}
                      value={timezoneDraft}
                      onChange={(event) => setTimezoneEditor({
                        savedValue: settings.timezone,
                        draft: event.target.value,
                        feedback: null,
                      })}
                      placeholder="Europe/Berlin"
                      className={cn(
                        'min-h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 py-1.5 font-mono text-[12px] font-medium outline-none focus:ring-1',
                        timezoneFeedback === 'invalid'
                          ? 'border-destructive/60 focus:ring-destructive/30'
                          : 'border-border/50 focus:ring-foreground/20'
                      )}
                    />
                    <button
                      type="submit"
                      className="min-h-9 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background transition-opacity hover:opacity-85"
                    >
                      {t('settings.save')}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      id="settings-timezone-feedback"
                      role={timezoneFeedback === 'invalid' ? 'alert' : undefined}
                      aria-live="polite"
                      className={cn(
                        'text-[11px] leading-relaxed',
                        timezoneFeedback === 'invalid'
                          ? 'text-destructive'
                          : timezoneFeedback
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground/60'
                      )}
                    >
                      {timezoneFeedback === 'invalid'
                        ? (t('settings.enterAValidIanaTimezone'))
                        : timezoneFeedback === 'saved'
                          ? (t('settings.timezoneSaved'))
                          : timezoneFeedback === 'detected'
                            ? (lang === 'de'
                                ? `Gerätezeitzone erkannt und gespeichert: ${timezoneDraft}`
                                : `Device timezone detected and saved: ${timezoneDraft}`)
                            : (t('settings.useAnIanaNameSuch'))}
                    </p>
                    <button
                      type="button"
                      onClick={handleTimezoneDetection}
                      className="min-h-9 shrink-0 rounded-lg border border-border/50 px-3 text-[11px] font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.04]"
                    >
                      {t('settings.detectFromDevice')}
                    </button>
                  </div>
                </form>
              </SettingRow>

              <SettingRow label={t('settings.helpFeedback')} description={t('settings.helpFeedbackDesc')} border={false}>
                <a
                  href="https://github.com/mateo-gepard/Orbit/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-foreground/[0.04]"
                >
                  {t('settings.openIssue')} <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
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
                      type="button"
                      onClick={() => handleThemeChange(opt.value)}
                      aria-pressed={settings.theme === opt.value}
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
                    aria-label={t('settings.accentColor')}
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
                    { value: 'tasks', label: t('nav.tasks') },
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

              <SettingRow label={t('settings.autoArchive')} description={t('settings.autoArchiveDesc')}>
                <NumberInput
                  value={settings.autoArchiveDays}
                  onChange={(v) => set('autoArchiveDays', v)}
                  min={0}
                  max={365}
                  suffix={t('common.days')}
                />
              </SettingRow>

              <SettingRow
                label={t('settings.installApp')}
                description={installStatus === 'installed'
                  ? (t('settings.threadmapIsAlreadyRunningAs'))
                  : installStatus === 'available'
                    ? (t('settings.installThreadmapForFasterAccess'))
                    : (t('settings.useYourBrowserMenuTo'))}
                border={false}
              >
                {installStatus === 'installed' ? (
                  <span className="flex min-h-11 items-center gap-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('settings.installed')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleInstallApp}
                    disabled={installing}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.03] disabled:cursor-wait disabled:opacity-50"
                  >
                    {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
                    {installing
                      ? (t('settings.installing'))
                      : (t('settings.install'))}
                  </button>
                )}
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {calendarConnecting && (
                    <span role="status" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      {t('settings.connecting')}
                    </span>
                  )}
                  {!calendarConnecting && calendarAuthorizationState === 'loading' && !hasCalendarPermission() && (
                    <span role="status" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      {t('detail.preparingGoogle')}
                    </span>
                  )}
                  {!calendarConnecting && settings.calendar.googleCalendarSync && (
                    <span
                      role="status"
                      className={cn(
                        'rounded-full px-2 py-1 text-[10px] font-medium',
                        calendarConnected
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                      )}
                    >
                      {calendarConnected
                        ? (t('settings.connected'))
                        : (t('settings.reconnectRequired'))}
                    </span>
                  )}
                  <Toggle
                    checked={settings.calendar.googleCalendarSync && calendarConnected}
                    disabled={calendarConnecting || calendarAuthorizationState === 'loading'}
                    onChange={handleCalendarSyncChange}
                    ariaLabel={settings.calendar.googleCalendarSync && !calendarConnected
                      ? (t('settings.reconnectGoogleCalendar'))
                      : t('settings.calendarSync')}
                  />
                </div>
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

              <SettingRow label={t('settings.showWeekNumbers')} description={t('settings.showWeekNumbersDesc')} border={false}>
                <Toggle
                  checked={settings.calendar.showWeekNumbers}
                  onChange={(v) => setNested('calendar', { showWeekNumbers: v })}
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
                          {key === 'MOD' ? shortcutModifier : key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* The capture language, which nothing else in the app documents. */}
              <h3 className="mt-6 mb-2 text-[13px] font-semibold tracking-tight text-foreground/80">
                {t('settings.captureSyntax')}
              </h3>
              <p className="mb-3 text-[12px] text-muted-foreground/70">
                {t('settings.captureSyntaxDesc')}
              </p>
              <dl className="rounded-2xl border border-border/40 overflow-hidden">
                {CAPTURE_SYNTAX.map(({ labelKey, hintKey }, i) => (
                  <div
                    key={labelKey}
                    className={cn(
                      'flex items-baseline justify-between gap-4 px-4 py-3',
                      i < CAPTURE_SYNTAX.length - 1 && 'border-b border-border/20'
                    )}
                  >
                    <dt className="shrink-0 text-[13px] text-foreground/80">{t(labelKey)}</dt>
                    <dd className="min-w-0 text-right font-mono text-[11px] text-muted-foreground/70">
                      {t(hintKey)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground/50">
                {t('commandBar.syntaxDateNote')}
              </p>
            </div>
          )}

          {/* ═════ PRIVACY & SECURITY ═════ */}
          {activeSection === 'privacy' && (
            <div>
              <SectionHeader icon={Shield} label={t('settings.privacy')} />

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
                          {t('settings.easterEggLabel')}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">
                        {t('settings.hockeyModeDesc')}
                      </p>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      <Toggle
                        checked={settings.hockeyMode}
                        onChange={(v) => set('hockeyMode', v)}
                        ariaLabel={t('settings.hockeyMode')}
                      />
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
                        { emoji: '🎯', from: t('settings.previewTask'), to: 'Spielzug' },
                        { emoji: '📋', from: t('settings.previewProject'), to: 'Saison' },
                        { emoji: '🔄', from: t('settings.previewHabit'), to: 'Training' },
                        { emoji: '📅', from: t('settings.previewEvent'), to: 'Anpfiff' },
                        { emoji: '🏆', from: t('settings.previewGoal'), to: 'Meisterschaft' },
                        { emoji: '📝', from: t('settings.previewNote'), to: 'Rezept' },
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
                          {t('settings.hockeyGermanHint')}
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

          {/* ═════ MCP ═════ */}
          {activeSection === 'mcp' && <McpSettings />}

          {/* ═════ DATA & STORAGE ═════ */}
          {activeSection === 'data' && (
            <div>
              <SectionHeader icon={Database} label={t('settings.dataStorage')} />

              <ConflictRecoveryPanel userId={user?.uid ?? null} onDownload={downloadJson} />

              <SettingRow label={t('settings.exportAllData')} description={t('settings.exportAllDataDesc')}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportAllData}
                    disabled={exportingAllData}
                    aria-busy={exportingAllData}
                    className="flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-1.5 text-[12px] font-medium hover:bg-foreground/90 transition-colors disabled:cursor-wait disabled:opacity-50"
                  >
                    {exportingAllData ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {exportingAllData ? t('settings.exporting') : t('settings.exportAllData')}
                  </button>
                  {exportingAllData && (
                    <button
                      type="button"
                      onClick={() => accountExportAbortRef.current?.abort()}
                      className="rounded-lg border border-border/60 px-3 py-1.5 text-[12px] font-medium hover:bg-muted/50"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              </SettingRow>
              <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground/55">
                {t('settings.theFullBackupAlsoIncludes')}
              </p>

              {accountExportProgress && (
                <div
                  className="mb-3 rounded-xl border border-border/40 bg-muted/15 p-3"
                  aria-live="polite"
                  aria-busy={accountExportProgress.phase !== 'complete'}
                >
                  <p className="text-[11px] font-medium text-foreground/80">
                    {accountExportProgress.phase === 'fetching'
                      ? (t('settings.fetchingAccountRecords'))
                      : accountExportProgress.phase === 'attachments'
                        ? (lang === 'de'
                          ? `Anhang ${accountExportProgress.completed} von ${accountExportProgress.total} wird gesichert${accountExportProgress.currentFile ? `: ${accountExportProgress.currentFile}` : '…'}`
                          : `Backing up attachment ${accountExportProgress.completed} of ${accountExportProgress.total}${accountExportProgress.currentFile ? `: ${accountExportProgress.currentFile}` : '…'}`)
                        : accountExportProgress.phase === 'packaging'
                          ? (t('settings.verifyingAndPackagingTheBackup'))
                          : (t('settings.backupIsReady'))}
                  </p>
                  <div
                    role="progressbar"
                    aria-label={t('settings.accountExportProgress')}
                    aria-valuemin={0}
                    aria-valuemax={accountExportProgress.total || undefined}
                    aria-valuenow={accountExportProgress.total ? accountExportProgress.completed : undefined}
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full bg-foreground transition-[width] duration-200',
                        !accountExportProgress.total && 'w-1/3 animate-pulse',
                      )}
                      style={accountExportProgress.total
                        ? { width: `${Math.min(100, (accountExportProgress.completed / accountExportProgress.total) * 100)}%` }
                        : undefined}
                    />
                  </div>
                </div>
              )}

              {accountExportError && (
                <div role="alert" className="mb-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-[11px] leading-relaxed text-destructive">
                  <p className="font-medium">
                    {t('settings.noIncompleteBackupWasDownloaded')}
                  </p>
                  <p className="mt-1">{accountExportError}</p>
                </div>
              )}

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
                  {t('settings.lastExported')}:{' '}
                  {format(
                    new Date(settings.data.lastExportAt),
                    fullTimestampPattern(settings.dateFormat, settings.timeFormat),
                    { locale: getLocale(lang) },
                  )}
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
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive/80 hover:bg-destructive/5 transition-colors w-fit"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t('settings.reset')}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-destructive/10">
                    <div>
                      <p className="text-[13px] font-medium text-foreground/90">{t('settings.deleteAccount')}</p>
                      <p className="text-[11px] text-muted-foreground/50">{t('settings.deleteAccountDesc')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={deletingAccount}
                      className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive/80 hover:bg-destructive/5 transition-colors w-fit disabled:cursor-wait disabled:opacity-50"
                    >
                      {deletingAccount ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      {deletingAccount ? t('settings.deleting') : t('settings.deleteAccount')}
                    </button>
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
      <Dialog
        open={Boolean(deletionReauth)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDeletionReauth();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!reauthenticatingDeletion}
          onInteractOutside={(event) => {
            if (reauthenticatingDeletion) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (reauthenticatingDeletion) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('settings.verifyYourIdentityFirst')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.thisSensitiveActionNeedsA')}
            </DialogDescription>
          </DialogHeader>

          {deletionReauth?.method === 'password' && (
            <form
              id="account-deletion-reauth-form"
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void reauthenticateAndDeleteAccount();
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="account-deletion-password">
                {t('settings.currentPassword')}
                <Input
                  id="account-deletion-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletionPassword}
                  onChange={(event) => setDeletionPassword(event.target.value)}
                  disabled={reauthenticatingDeletion}
                  required
                  autoFocus
                />
              </label>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground/80">
                  {t('settings.useAnEmailSignIn')}
                </p>
                <p className="mt-1">
                  {t('settings.signOutSignBackIn')}
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0"
                  disabled={reauthenticatingDeletion}
                  onClick={() => {
                    closeDeletionReauth();
                    void signOut().catch(() => {
                      toast.error(t('settings.couldNotSignOut'));
                    });
                  }}
                >
                  {t('settings.signOutNow')}
                </Button>
              </div>
            </form>
          )}

          {deletionReauth?.method === 'google' && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm leading-relaxed text-muted-foreground">
              {t('settings.openGoogleWithTheButton')}
            </div>
          )}

          {deletionReauth?.method === 'unsupported' && (
            <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm leading-relaxed">
              <p className="font-medium">
                {t('settings.thisSignInMethodCannot')}
              </p>
              <p className="mt-1 text-muted-foreground">
                {lang === 'de'
                  ? `Melde dich ab, mit ${deletionReauth.providerLabel || 'deinem ursprünglichen Anbieter'} wieder an und starte die Löschung innerhalb von 10 Minuten erneut. Es wurde nichts gelöscht.`
                  : `Sign out, sign back in with ${deletionReauth.providerLabel || 'your original provider'}, and start deletion again within 10 minutes. Nothing was deleted.`}
              </p>
            </div>
          )}

          {deletionReauthError && (
            <p role="alert" aria-live="assertive" className="text-sm leading-relaxed text-destructive">
              {deletionReauthError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={reauthenticatingDeletion}
              onClick={closeDeletionReauth}
            >
              {t('common.cancel')}
            </Button>
            {deletionReauth?.method === 'google' && (
              <Button
                type="button"
                variant="destructive"
                disabled={reauthenticatingDeletion}
                onClick={() => void reauthenticateAndDeleteAccount()}
              >
                {reauthenticatingDeletion && <Loader2 aria-hidden="true" className="animate-spin" />}
                {t('settings.verifyWithGoogleDelete')}
              </Button>
            )}
            {deletionReauth?.method === 'password' && (
              <Button
                type="submit"
                form="account-deletion-reauth-form"
                variant="destructive"
                disabled={reauthenticatingDeletion || !deletionPassword}
              >
                {reauthenticatingDeletion && <Loader2 aria-hidden="true" className="animate-spin" />}
                {t('settings.verifyDelete')}
              </Button>
            )}
            {deletionReauth?.method === 'unsupported' && (
              <Button
                type="button"
                disabled={reauthenticatingDeletion}
                onClick={() => {
                  closeDeletionReauth();
                  void signOut().catch(() => {
                    toast.error(t('settings.couldNotSignOut'));
                  });
                }}
              >
                {t('settings.signOutNow')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={t('settings.resetConfirmTitle')}
        description={t('settings.resetConfirmDesc')}
        confirmLabel={t('settings.confirmReset')}
        onConfirm={handleResetSettings}
      />
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('settings.deleteConfirmTitle')}
        description={t('settings.deleteConfirmDesc')}
        confirmLabel={t('settings.yesDeleteEverything')}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
