// ═══════════════════════════════════════════════════════════
// Threadmap — Briefing Notifications
// Real browser push notifications with smart, human briefings.
// Morning: what's ahead. Evening: what you accomplished.
// Hockey Mode: sports commentary + medical vibes (German).
// ═══════════════════════════════════════════════════════════

import { addDays, format } from 'date-fns';
import type { OrbitItem } from './types';
import { isHabitScheduledForDate, isHabitCompletedForDate, calculateStreak } from './habits';
import { getDueHabitReminders } from './habit-reminders';
import { useSettingsStore } from './settings-store';
import { scopedStorageKey } from './account-storage';
import {
  briefingUpdateIsCurrent,
  nextBriefingScheduleGeneration,
} from './briefing-schedule-generation';

// ── Permission ─────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function hasNotificationPermission(): boolean {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

// ── Greeting ───────────────────────────────────────────────

const MORNING_GREETINGS = [
  'Good morning.',
  'Rise and shine.',
  'A new day awaits.',
  'Let\'s make it count.',
  'Fresh start.',
  'Time to move.',
];

const EVENING_GREETINGS = [
  'Day\'s winding down.',
  'Almost there.',
  'Evening check-in.',
  'Time to reflect.',
  'Wrapping up.',
  'How did it go?',
];

const MORNING_GREETINGS_DE = [
  'Guten Morgen.',
  'Ein neuer Tag wartet.',
  'Zeit, den Tag zu gestalten.',
  'Frischer Start.',
];

const EVENING_GREETINGS_DE = [
  'Der Tag klingt aus.',
  'Abendlicher Rückblick.',
  'Zeit zum Reflektieren.',
  'Fast geschafft.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function eventOccursOnDate(item: OrbitItem, date: string): boolean {
  if (item.type !== 'event' || item.status !== 'active' || !item.startDate) return false;
  const endDate = item.endDate || item.startDate;
  return item.startDate <= date && endDate >= date;
}

function localDayBounds(date: Date): { start: number; end: number } {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime(),
  };
}

// ── Hockey mode: German sports commentary ─────────────────

const HOCKEY_MORNING_GREETINGS = [
  'Aufwärmen, Dr.! 🏒',
  'Spielfeld frei! Los geht\'s.',
  'Anpfiff in 3... 2... 1... 🚨',
  'Die Kabine ist bereit, Dr.',
  'Schienbeinschoner an, geht los!',
  'Guten Morgen, Dr. — Spieltag!',
  'Der Kunstrasen ruft, Dr.! 🏟️',
  'Schläger in die Hand — Visite beginnt! 🩺',
  'Mannschaftsbesprechung: Dein Tag.',
  'Aufstellung steht — du bist dran!',
  'Guten Morgen! Diagnose: Produktiv. 💪',
  'Short Corner für den Tag — mach was draus!',
];

const HOCKEY_EVENING_GREETINGS = [
  'Schlusspfiff! 🏒',
  'Das Spiel ist aus, Dr.',
  'Abpfiff — ab in die Kabine.',
  'Der Platz wird gesperrt.',
  'Schichtende, Dr. — Feierabend!',
  'Visite beendet. 🩺',
  'Trikot aus, Dusche an. 🚿',
  'Ergebnis steht, Dr.',
  'Post-Match-Analyse:',
  'Kabine auf — Analyse läuft.',
  'Strafbank-Report des Tages:',
];

function generateHockeyMorningBriefing(items: OrbitItem[]): BriefingData {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const tasksDueToday = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === todayStr
  );
  const overdue = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate && i.dueDate < todayStr
  );
  const eventsToday = items.filter((item) => eventOccursOnDate(item, todayStr));
  const habitsToday = items.filter(
    (i) => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)
  );

  const title = pickRandom(HOCKEY_MORNING_GREETINGS);

  // Build a single-line summary that won't get cut off on mobile
  const counts: string[] = [];
  if (tasksDueToday.length > 0) counts.push(`${tasksDueToday.length} Spielzüge`);
  if (eventsToday.length > 0) counts.push(`${eventsToday.length} ${eventsToday.length > 1 ? 'Anpfiffe' : 'Anpfiff'}`);
  if (habitsToday.length > 0) counts.push(`${habitsToday.length}× Training`);
  if (overdue.length > 0) counts.push(`${overdue.length} überfällig ⏱️`);

  let body: string;
  if (counts.length > 0) {
    body = counts.join(' · ');
    const topTask = tasksDueToday.find((t) => t.priority === 'high') || tasksDueToday[0];
    if (topTask) body += ` → ${topTask.title}`;
  } else {
    body = 'Spielfrei — plane deine Züge, Dr.';
  }

  return { title, body, tag: 'threadmap-morning-briefing' };
}

function generateHockeyEveningBriefing(items: OrbitItem[]): BriefingData {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const { start: todayStart, end: todayEnd } = localDayBounds(today);

  const completedToday = items.filter(
    (i) => i.type === 'task' && i.status === 'done' && i.completedAt && i.completedAt >= todayStart && i.completedAt < todayEnd
  );
  const unfinished = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === todayStr
  );
  const habitsToday = items.filter(
    (i) => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)
  );
  const habitsDone = habitsToday.filter((h) => isHabitCompletedForDate(h, today));
  const bestStreak = habitsToday.reduce((max, h) => {
    const s = calculateStreak(h);
    return s > max ? s : max;
  }, 0);

  const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');
  const dueTomorrow = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === tomorrowStr
  );

  const title = pickRandom(HOCKEY_EVENING_GREETINGS);
  // Build concise single-line body for notification
  const parts: string[] = [];

  if (completedToday.length > 0) {
    parts.push(`${completedToday.length} Tor${completedToday.length > 1 ? 'e' : ''} ✓`);
  }
  if (unfinished.length > 0) {
    parts.push(`${unfinished.length} offen`);
  }
  if (habitsToday.length > 0) {
    parts.push(`Training ${habitsDone.length}/${habitsToday.length}`);
  }
  if (bestStreak > 1) {
    parts.push(`${bestStreak}d Serie 🏒`);
  }

  let body: string;
  if (parts.length > 0) {
    body = parts.join(' · ');
  } else {
    body = 'Spielfrei heute — Ruhetag, Dr.';
  }

  if (dueTomorrow.length > 0) {
    body += ` → Morgen: ${dueTomorrow.length} Spielzüge`;
  }

  return { title, body, tag: 'threadmap-evening-briefing' };
}

// ── Morning briefing content ──────────────────────────────

interface BriefingData {
  title: string;
  body: string;
  tag: string;
  url?: string;
  type?: 'briefing' | 'habit-reminder';
  briefingType?: 'morning' | 'evening';
}

export function generateMorningBriefing(items: OrbitItem[]): BriefingData {
  // Hockey mode: use themed German briefing
  const { settings } = useSettingsStore.getState();
  if (settings.hockeyMode && settings.language === 'de') {
    return generateHockeyMorningBriefing(items);
  }

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Tasks due today
  const tasksDueToday = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === todayStr
  );

  // Tasks overdue
  const overdue = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate && i.dueDate < todayStr
  );

  // Events today  
  const eventsToday = items.filter((item) => eventOccursOnDate(item, todayStr));

  // Habits due today
  const habitsToday = items.filter(
    (i) => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)
  );

  // Build title — short, punchy
  const german = settings.language === 'de';
  const greeting = pickRandom(german ? MORNING_GREETINGS_DE : MORNING_GREETINGS);
  const title = greeting;

  // Build a concise single-line body that won't get cut off
  const counts: string[] = [];
  if (tasksDueToday.length > 0) counts.push(german
    ? `${tasksDueToday.length} Aufgabe${tasksDueToday.length === 1 ? '' : 'n'}`
    : `${tasksDueToday.length} task${tasksDueToday.length === 1 ? '' : 's'}`);
  if (eventsToday.length > 0) counts.push(german
    ? `${eventsToday.length} Termin${eventsToday.length === 1 ? '' : 'e'}`
    : `${eventsToday.length} event${eventsToday.length === 1 ? '' : 's'}`);
  if (habitsToday.length > 0) counts.push(german
    ? `${habitsToday.length} Gewohnheit${habitsToday.length === 1 ? '' : 'en'}`
    : `${habitsToday.length} habit${habitsToday.length === 1 ? '' : 's'}`);
  if (overdue.length > 0) counts.push(german ? `${overdue.length} überfällig ⚠️` : `${overdue.length} overdue ⚠️`);

  let body: string;
  if (counts.length > 0) {
    body = counts.join(' · ');
    const topTask = tasksDueToday.find((t) => t.priority === 'high') || tasksDueToday[0];
    if (topTask) body += ` → ${topTask.title}`;
  } else {
    body = german ? 'Freie Bahn — plane deinen Tag.' : 'Clear runway ahead — plan your day.';
  }

  return {
    title,
    body,
    tag: 'threadmap-morning-briefing',
  };
}

// ── Evening briefing content ──────────────────────────────

export function generateEveningBriefing(items: OrbitItem[]): BriefingData {
  // Hockey mode: use themed German briefing
  const { settings } = useSettingsStore.getState();
  if (settings.hockeyMode && settings.language === 'de') {
    return generateHockeyEveningBriefing(items);
  }

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const { start: todayStart, end: todayEnd } = localDayBounds(today);

  // Tasks completed today
  const completedToday = items.filter(
    (i) => i.type === 'task' && i.status === 'done' && i.completedAt && i.completedAt >= todayStart && i.completedAt < todayEnd
  );

  // Tasks still due today (unfinished)
  const unfinished = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === todayStr
  );

  // Habits completed today
  const habitsToday = items.filter(
    (i) => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)
  );
  const habitsDone = habitsToday.filter((h) => isHabitCompletedForDate(h, today));

  // Tasks due tomorrow
  const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');
  const dueTomorrow = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === tomorrowStr
  );

  // Best streak
  const bestStreak = habitsToday.reduce((max, h) => {
    const s = calculateStreak(h);
    return s > max ? s : max;
  }, 0);

  const german = settings.language === 'de';
  const greeting = pickRandom(german ? EVENING_GREETINGS_DE : EVENING_GREETINGS);

  // Build concise single-line body for notification
  const parts: string[] = [];

  if (completedToday.length > 0) {
    parts.push(german ? `${completedToday.length} erledigt ✓` : `${completedToday.length} done ✓`);
  }
  if (unfinished.length > 0) {
    parts.push(german ? `${unfinished.length} offen` : `${unfinished.length} open`);
  }
  if (habitsToday.length > 0) {
    parts.push(`${german ? 'Gewohnheiten' : 'Habits'} ${habitsDone.length}/${habitsToday.length}`);
  }
  if (bestStreak > 1) {
    parts.push(german ? `${bestStreak} Tage Serie 🔥` : `${bestStreak}d streak 🔥`);
  }

  let body: string;
  if (parts.length > 0) {
    body = parts.join(' · ');
  } else {
    body = german ? 'Ruhiger Tag — nichts war geplant.' : 'Quiet day — nothing was scheduled.';
  }

  if (dueTomorrow.length > 0) {
    body += german
      ? ` → Morgen: ${dueTomorrow.length} Aufgabe${dueTomorrow.length === 1 ? '' : 'n'}`
      : ` → Tomorrow: ${dueTomorrow.length} task${dueTomorrow.length === 1 ? '' : 's'}`;
  }

  return {
    title: greeting,
    body,
    tag: 'threadmap-evening-briefing',
  };
}

// ── Send the actual notification ──────────────────────────

interface NotificationDeliveryContext {
  ownerId: string;
  /** Re-checked after every async boundary to prevent cross-account delivery. */
  isCurrent: () => boolean;
  /** Opaque, per-runtime marker used only to compensate a stale displayed notification. */
  marker: number;
}

async function closeStaleNotification(
  registration: ServiceWorkerRegistration,
  tag: string,
  ownerId: string,
  marker: number,
): Promise<void> {
  try {
    const notifications = await registration.getNotifications({ tag });
    for (const notification of notifications) {
      if (notification.data?.[LOCAL_NOTIFICATION_OWNER_FIELD] === ownerId
          && notification.data?.deliveryMarker === marker) notification.close();
    }
  } catch {
    // Best effort. The owner/generation guard still prevents scoped writes.
  }
}

async function sendNotification(
  data: BriefingData,
  context?: NotificationDeliveryContext,
): Promise<boolean> {
  const deliveryContext = context ?? localNotificationContext();
  // Item-derived local notifications must never be displayed without an owner
  // marker; generic server pushes use a separate service-worker path.
  if (!deliveryContext) return false;
  const isCurrent = deliveryContext.isCurrent;
  if (!isCurrent()) return false;
  if (!hasNotificationPermission()) {
    console.warn('[THREADMAP] sendNotification: no permission');
    return false;
  }

  briefingLog('[THREADMAP] sendNotification:', data.title, '|', data.body?.slice(0, 80));

  const briefingType = data.briefingType
    ?? (data.tag.includes('morning') ? 'morning' : 'evening');
  const url = data.url ?? `/briefing?type=${briefingType}`;
  const type = data.type ?? 'briefing';
  const notificationData = {
    url,
    type,
    ...(type === 'briefing' ? { briefingType } : {}),
    [LOCAL_NOTIFICATION_OWNER_FIELD]: deliveryContext.ownerId,
    deliveryMarker: deliveryContext.marker,
  };

  // Strategy 1: Show via SW registration directly (most reliable)
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (!isCurrent()) return false;
      await reg.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag,
        data: notificationData,
        renotify: false,
      } as NotificationOptions);
      if (!isCurrent()) {
        void closeStaleNotification(
          reg,
          data.tag,
          deliveryContext.ownerId,
          deliveryContext.marker,
        );
        return false;
      }
      briefingLog('[THREADMAP] Notification shown via SW registration');
      return true;
    }
  } catch (err) {
    console.warn('[THREADMAP] SW showNotification failed:', err);
  }
  // Do not fall back to `new Notification` for owner-derived content: those
  // handles are not enumerable after account teardown and could outlive their
  // owner. Generic server push does not pass through this function.
  return false;
}

// ── Push schedule to Service Worker ───────────────────────
// The SW stores this in IndexedDB for periodic checks and push delivery.

const DEBUG_BRIEFINGS = process.env.NODE_ENV !== 'production';
const briefingLog = (...args: unknown[]) => {
  if (DEBUG_BRIEFINGS) console.log(...args);
};

let lastSyncedScheduleJson: string | null = null;
let currentBriefingOwnerId: string | null = null;
let briefingScheduleGeneration = 0;
let currentLocalNotificationOwnerId: string | null = null;
let localNotificationGeneration = 0;

const LOCAL_NOTIFICATION_OWNER_FIELD = 'threadmapLocalOwnerId';

function advanceBriefingScheduleGeneration(): number {
  briefingScheduleGeneration = nextBriefingScheduleGeneration(briefingScheduleGeneration);
  return briefingScheduleGeneration;
}

function advanceLocalNotificationGeneration(): number {
  localNotificationGeneration = nextBriefingScheduleGeneration(localNotificationGeneration);
  return localNotificationGeneration;
}

/**
 * Bind locally generated, item-derived notifications to one account. Rebinding
 * invalidates every pre-await delivery immediately and closes only the old
 * owner's already-displayed notifications in the background.
 */
export function setLocalNotificationOwner(ownerId: string | null): Promise<boolean> {
  const previousOwnerId = currentLocalNotificationOwnerId;
  if (previousOwnerId === ownerId) return Promise.resolve(true);
  advanceLocalNotificationGeneration();
  currentLocalNotificationOwnerId = ownerId;
  return previousOwnerId
    ? closeOwnerDerivedNotifications(previousOwnerId)
    : Promise.resolve(true);
}

export function quiesceLocalNotificationOwner(ownerId: string | null): Promise<boolean> {
  if (ownerId && ownerId === currentLocalNotificationOwnerId) {
    return setLocalNotificationOwner(null);
  }
  return closeOwnerDerivedNotifications(ownerId);
}

function localNotificationContext(
  expectedOwnerId = currentLocalNotificationOwnerId,
  additionalGuard: () => boolean = () => true,
): NotificationDeliveryContext | null {
  if (!expectedOwnerId || expectedOwnerId !== currentLocalNotificationOwnerId) return null;
  const generation = localNotificationGeneration;
  return {
    ownerId: expectedOwnerId,
    marker: generation,
    isCurrent: () => additionalGuard()
      && generation === localNotificationGeneration
      && expectedOwnerId === currentLocalNotificationOwnerId,
  };
}

export function syncBriefingScheduleToSW() {
  const { settings } = useSettingsStore.getState();
  
  if (!('serviceWorker' in navigator)) return;

  const config = {
    ownerId: currentBriefingOwnerId,
    morningEnabled: Boolean(currentBriefingOwnerId) && settings.notifications.enabled && settings.notifications.dailyBriefing,
    morningTime: settings.notifications.dailyBriefingTime,
    eveningEnabled: Boolean(currentBriefingOwnerId) && settings.notifications.enabled && settings.notifications.eveningBriefing,
    eveningTime: settings.notifications.eveningBriefingTime,
  };
  const scheduleJson = JSON.stringify(config);
  if (scheduleJson === lastSyncedScheduleJson) return;
  lastSyncedScheduleJson = scheduleJson;
  const ownerId = config.ownerId;
  if (!ownerId) return;
  const generation = advanceBriefingScheduleGeneration();

  // Send to SW controller
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'UPDATE_BRIEFING_SCHEDULE',
      generation,
      config,
    });
    briefingLog('[THREADMAP] Briefing schedule synced to SW:', config);
  } else {
    // SW not yet controlling — wait for it
    void navigator.serviceWorker.ready.then((reg) => {
      if (reg.active && briefingUpdateIsCurrent(
        generation,
        briefingScheduleGeneration,
        ownerId,
        currentBriefingOwnerId,
      )) {
        reg.active.postMessage({
          type: 'UPDATE_BRIEFING_SCHEDULE',
          generation,
          config,
        });
        briefingLog('[THREADMAP] Briefing schedule synced to SW (via ready):', config);
      }
    }).catch(() => undefined);
  }

  // Also register Periodic Background Sync if available (Chrome 80+)
  registerPeriodicSync();
}

async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      await (reg as unknown as { periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> } })
        .periodicSync.register('threadmap-briefing-check', {
          minInterval: 60 * 60 * 1000, // Check at least every hour
        });
      briefingLog('[THREADMAP] Periodic background sync registered');
    }
  } catch {
    // Not supported or permission denied — server push and the in-app fallback remain available.
  }
}

// ── Scheduler ─────────────────────────────────────────────
// Dual strategy:
// 1. Server push and Periodic Background Sync can wake the Service Worker.
// 2. An in-app interval is the fallback while Threadmap is open.

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let swMessageListenerRegistered = false;
let currentGetItems: () => OrbitItem[] = () => [];

function lastFiredKey(): string | null {
  return currentBriefingOwnerId
    ? scopedStorageKey('orbit-briefing-lastFired', currentBriefingOwnerId)
    : null;
}

// Persist last-fired dates in localStorage to survive page reloads
// but allow re-firing on a new day
function getLastFired(): { morning: string | null; evening: string | null } {
  try {
    const key = lastFiredKey();
    const raw = key ? localStorage.getItem(key) : null;
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { morning: null, evening: null };
}

function setLastFired(type: 'morning' | 'evening') {
  const today = getDateStr();
  const current = getLastFired();
  current[type] = today;
  try {
    const key = lastFiredKey();
    if (key) localStorage.setItem(key, JSON.stringify(current));
  } catch { /* ignore */ }
}

function getDateStr(date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

// ── Habit reminders ────────────────────────────────────────

const HABIT_REMINDER_INTERVAL_MS = 60_000;
const MAX_REMINDER_RECEIPTS_PER_DAY = 10_000;

let habitReminderInterval: ReturnType<typeof setInterval> | null = null;
let currentHabitReminderOwnerId: string | null = null;
let currentGetHabitItems: () => OrbitItem[] = () => [];
let habitReminderGeneration = 0;
let habitReminderDispatchInFlight: number | null = null;

function advanceHabitReminderGeneration(): number {
  habitReminderGeneration = nextBriefingScheduleGeneration(habitReminderGeneration);
  return habitReminderGeneration;
}

function habitRemindersFiredKey(ownerId: string): string {
  return scopedStorageKey('orbit-habit-reminders-fired', ownerId);
}

/** Habit ids already reminded about today, so a reminder fires once. */
function getRemindedHabitIds(ownerId: string, dateKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(habitRemindersFiredKey(ownerId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date?: string; ids?: string[] };
    if (parsed.date !== dateKey || !Array.isArray(parsed.ids)) return new Set();
    return new Set(parsed.ids
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256)
      .slice(0, MAX_REMINDER_RECEIPTS_PER_DAY));
  } catch {
    return new Set();
  }
}

function rememberRemindedHabit(ownerId: string, dateKey: string, habitId: string): void {
  try {
    // Re-read immediately before writing so another open tab's receipt is not
    // routinely overwritten by the set captured at the start of this tick.
    const ids = getRemindedHabitIds(ownerId, dateKey);
    ids.add(habitId);
    localStorage.setItem(habitRemindersFiredKey(ownerId), JSON.stringify({
      date: dateKey,
      ids: [...ids].slice(0, MAX_REMINDER_RECEIPTS_PER_DAY),
    }));
  } catch { /* ignore */ }
}

/**
 * Fire foreground reminders for one owner. Habit data never enters the server
 * push registry or the service-worker schedule.
 */
async function fireDueHabitReminders(
  ownerId: string,
  generation: number,
  getItems: () => OrbitItem[],
): Promise<void> {
  if (habitReminderDispatchInFlight === generation) return;
  habitReminderDispatchInFlight = generation;
  const now = new Date();
  const dateKey = getDateStr(now);
  const isCurrent = () => briefingUpdateIsCurrent(
    generation,
    habitReminderGeneration,
    ownerId,
    currentHabitReminderOwnerId,
  ) && getDateStr() === dateKey;

  try {
    if (!isCurrent()) return;
    const { settings } = useSettingsStore.getState();
    if (!settings.notifications.enabled || !settings.notifications.habitReminders) return;
    if (!hasNotificationPermission()) return;

    const due = getDueHabitReminders(getItems(), now);
    if (due.length === 0) return;
    const deliveryContext = localNotificationContext(ownerId, isCurrent);
    if (!deliveryContext) return;

    const german = settings.language === 'de';
    for (const habit of due) {
      if (!isCurrent()) return;
      // Refresh per item for cross-tab receipts written during this dispatch.
      if (getRemindedHabitIds(ownerId, dateKey).has(habit.id)) continue;
      const streak = calculateStreak(habit);
      const delivered = await sendNotification({
        title: german ? `Zeit für: ${habit.title}` : `Time for: ${habit.title}`,
        body: streak > 0
          ? (german ? `${streak} Tage in Folge — halte die Serie.` : `${streak} day streak — keep it going.`)
          : (german ? 'Heute fällig.' : 'Due today.'),
        // A stable daily tag lets the browser coalesce simultaneous tabs.
        tag: `habit-reminder-${habit.id}-${dateKey}`,
        url: '/habits',
        type: 'habit-reminder',
      }, deliveryContext);
      if (delivered && isCurrent()) {
        rememberRemindedHabit(ownerId, dateKey, habit.id);
      }
    }
  } finally {
    if (habitReminderDispatchInFlight === generation) {
      habitReminderDispatchInFlight = null;
    }
  }
}

export function startHabitReminderScheduler(
  userId: string,
  getItems: () => OrbitItem[],
): void {
  void setLocalNotificationOwner(userId);
  if (currentHabitReminderOwnerId !== userId || !habitReminderInterval) {
    stopHabitReminderScheduler();
    currentHabitReminderOwnerId = userId;
    const generation = advanceHabitReminderGeneration();
    currentGetHabitItems = getItems;
    const tick = () => {
      void fireDueHabitReminders(userId, generation, currentGetHabitItems);
    };
    // Do not make a freshly opened app wait a full minute and miss the edge of
    // the five-minute delivery window.
    tick();
    habitReminderInterval = setInterval(tick, HABIT_REMINDER_INTERVAL_MS);
    briefingLog('[THREADMAP] Foreground habit reminder scheduler started');
    return;
  }
  currentGetHabitItems = getItems;
}

export function stopHabitReminderScheduler(): void {
  advanceHabitReminderGeneration();
  if (habitReminderInterval) clearInterval(habitReminderInterval);
  habitReminderInterval = null;
  currentHabitReminderOwnerId = null;
  currentGetHabitItems = () => [];
  habitReminderDispatchInFlight = null;
}

// Background scheduling is browser-controlled and may wake late. Deliver a
// once-per-day briefing within a useful grace period instead of requiring a
// fragile five-minute wake-up window.
function isBriefingDueToday(targetHHMM: string, type: 'morning' | 'evening'): boolean {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(targetHHMM)) return false;
  const [h, m] = targetHHMM.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  const diff = now.getTime() - target.getTime();
  const graceMinutes = type === 'morning' ? 4 * 60 : 6 * 60;
  return diff >= 0 && diff <= graceMinutes * 60_000;
}

export function startBriefingScheduler(userId: string, getItems: () => OrbitItem[]) {
  if (currentBriefingOwnerId !== userId) {
    stopBriefingScheduler();
    currentBriefingOwnerId = userId;
  }
  currentGetItems = getItems;

  if (schedulerInterval) {
    syncBriefingScheduleToSW();
    return;
  }

  // 1. Sync schedule to service worker for background notifications
  syncBriefingScheduleToSW();

  // 2. Listen for SW messages (e.g. when SW fires a briefing and wants the app to generate content)
  if (!swMessageListenerRegistered && 'serviceWorker' in navigator) {
    swMessageListenerRegistered = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'BRIEFING_FIRE'
          && event.data.ownerId === currentBriefingOwnerId
          && event.data.generation === briefingScheduleGeneration) {
        const items = currentGetItems();
        if (event.data.briefing === 'morning') {
          // Mark as fired so in-app timer doesn't double-fire
          setLastFired('morning');
          const briefing = generateMorningBriefing(items);
          void sendNotification({ ...briefing, briefingType: 'morning' });
        } else if (event.data.briefing === 'evening') {
          setLastFired('evening');
          const briefing = generateEveningBriefing(items);
          void sendNotification({ ...briefing, briefingType: 'evening' });
        }
      }
    });
  }

  // 3. In-app backup timer — only fires if SW didn't handle it
  //    Runs every 60s with a 10s offset to give SW priority
  schedulerInterval = setInterval(() => {
    const { settings } = useSettingsStore.getState();
    if (!settings.notifications.enabled) return;
    if (!hasNotificationPermission()) return;

    const today = getDateStr();
    const lastFired = getLastFired();

    // Morning briefing — only if SW/BRIEFING_FIRE didn't already handle it
    // Use 5-minute window so timer drift doesn't cause misses
    if (
      settings.notifications.dailyBriefing &&
      isBriefingDueToday(settings.notifications.dailyBriefingTime, 'morning') &&
      lastFired.morning !== today
    ) {
      setLastFired('morning');
      const items = currentGetItems();
      const briefing = generateMorningBriefing(items);
      sendNotification(briefing);
      briefingLog('[THREADMAP] Morning briefing sent (in-app fallback timer)');
    }

    // Evening briefing — use 5-minute window
    if (
      settings.notifications.eveningBriefing &&
      isBriefingDueToday(settings.notifications.eveningBriefingTime, 'evening') &&
      lastFired.evening !== today
    ) {
      setLastFired('evening');
      const items = currentGetItems();
      const briefing = generateEveningBriefing(items);
      sendNotification(briefing);
      briefingLog('[THREADMAP] Evening briefing sent (in-app fallback timer)');
    }
  }, 60_000); // every 60 seconds while the app is open

  briefingLog('[THREADMAP] Briefing scheduler started (SW + in-app fallback)');
}

function resetBriefingSchedulerRuntime() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  currentBriefingOwnerId = null;
  lastSyncedScheduleJson = null;
  currentGetItems = () => [];
}

export function stopBriefingScheduler() {
  const ownerId = currentBriefingOwnerId;
  const generation = advanceBriefingScheduleGeneration();
  resetBriefingSchedulerRuntime();
  if (ownerId && 'serviceWorker' in navigator) {
    const message = { type: 'CLEAR_BRIEFING_SCHEDULE', generation, ownerId };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    } else {
      void navigator.serviceWorker.ready
        .then((registration) => registration.active?.postMessage(message))
        .catch(() => undefined);
    }
  }
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<{
  complete: boolean;
  value?: T;
}> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then((value) => ({ complete: true, value })),
      new Promise<{ complete: false }>((resolve) => {
        timeout = setTimeout(() => resolve({ complete: false }), Math.max(1, timeoutMs));
      }),
    ]);
  } catch {
    return { complete: false };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Close only locally generated notifications for one owner. Generic server
 * push has no owner marker and another account has a different marker, so both
 * remain untouched. A second enumeration acknowledges that closure completed.
 */
export async function closeOwnerDerivedNotifications(
  ownerId: string | null,
  timeoutMs = 2_000,
): Promise<boolean> {
  if (!ownerId || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return true;
  }
  const serviceWorker = navigator.serviceWorker;
  const lookup = typeof serviceWorker.getRegistration === 'function'
    ? serviceWorker.getRegistration()
    : serviceWorker.ready;
  const registrationResult = await settleWithin(lookup, timeoutMs);
  if (!registrationResult.complete) return false;
  const registration = registrationResult.value;
  if (!registration) return true;

  const firstRead = await settleWithin(registration.getNotifications(), timeoutMs);
  if (!firstRead.complete || !firstRead.value) return false;
  for (const notification of firstRead.value) {
    if (notification.data?.[LOCAL_NOTIFICATION_OWNER_FIELD] === ownerId) {
      notification.close();
    }
  }

  const verification = await settleWithin(registration.getNotifications(), timeoutMs);
  return Boolean(verification.complete && verification.value?.every(
    (notification) => notification.data?.[LOCAL_NOTIFICATION_OWNER_FIELD] !== ownerId,
  ));
}

async function waitForBriefingWorker(timeoutMs: number): Promise<ServiceWorker | null> {
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  return new Promise<ServiceWorker | null>((resolve) => {
    let settled = false;
    const finish = (worker: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(worker);
    };
    const timeout = window.setTimeout(() => finish(null), Math.max(1, timeoutMs));
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const immediate = registration?.active || registration?.waiting || registration?.installing;
        if (immediate) {
          finish(immediate);
          return;
        }
        // `ready` covers a registration that is currently being installed.
        // The outer timeout prevents a browser with no eventual worker from
        // blocking secure sign-out indefinitely.
        const ready = await navigator.serviceWorker.ready;
        finish(ready.active || ready.waiting || ready.installing || null);
      } catch {
        finish(null);
      }
    })();
  });
}

/**
 * Clear an account's persisted service-worker briefing schedule and wait for
 * the worker to confirm the IndexedDB transaction before a secure sign-out
 * reloads the page. A timeout returns false so callers can warn that on-device
 * cleanup was incomplete; push transport teardown remains a separate barrier.
 */
export async function clearBriefingScheduleForSignOut(
  ownerId: string | null,
  timeoutMs = 2_000,
): Promise<boolean> {
  const requestedOwnerId = ownerId || currentBriefingOwnerId || currentLocalNotificationOwnerId;
  // This must happen before any async service-worker cleanup so an in-flight
  // habit delivery cannot repopulate the owner's daily receipt after forget.
  stopHabitReminderScheduler();
  const notificationCleanup = quiesceLocalNotificationOwner(requestedOwnerId);
  const generation = advanceBriefingScheduleGeneration();
  resetBriefingSchedulerRuntime();
  if (!requestedOwnerId || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return notificationCleanup;
  }

  let scheduleCleared = false;
  try {
    const deadline = Date.now() + Math.max(250, timeoutMs);
    const worker = await waitForBriefingWorker(Math.max(250, timeoutMs));
    if (worker) {
      scheduleCleared = await new Promise<boolean>((resolve) => {
        const channel = new MessageChannel();
        let settled = false;
        const finish = (cleared: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          channel.port1.close();
          resolve(cleared);
        };
        const timeout = window.setTimeout(
          () => finish(false),
          Math.max(1, deadline - Date.now()),
        );
        channel.port1.onmessage = (event) => {
          finish(event.data?.type === 'BRIEFING_SCHEDULE_CLEARED'
            && event.data?.generation === generation
            && event.data?.ownerId === requestedOwnerId
            && event.data?.success === true);
        };
        worker.postMessage(
          {
            type: 'CLEAR_BRIEFING_SCHEDULE',
            generation,
            ownerId: requestedOwnerId,
            acknowledge: true,
          },
          [channel.port2],
        );
      });
    }
  } catch (error) {
    console.warn('[THREADMAP] Service-worker briefing schedule cleanup failed:', error);
  }
  const notificationsClosed = await notificationCleanup;
  return scheduleCleared && notificationsClosed;
}

// ── Manual triggers (for testing / on-demand) ─────────────

export function sendMorningBriefingNow(items: OrbitItem[]) {
  const briefing = generateMorningBriefing(items);
  sendNotification(briefing);
  return briefing;
}

export function sendEveningBriefingNow(items: OrbitItem[]) {
  const briefing = generateEveningBriefing(items);
  sendNotification(briefing);
  return briefing;
}
