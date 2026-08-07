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

async function sendNotification(data: BriefingData) {
  if (!hasNotificationPermission()) {
    console.warn('[THREADMAP] sendNotification: no permission');
    return;
  }

  briefingLog('[THREADMAP] sendNotification:', data.title, '|', data.body?.slice(0, 80));

  // Determine briefing page URL from tag
  const briefingType = data.tag.includes('morning') ? 'morning' : 'evening';
  const url = `/briefing?type=${briefingType}`;

  // Strategy 1: Show via SW registration directly (most reliable)
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag,
        data: { url, type: 'briefing', briefingType },
        renotify: false,
      } as NotificationOptions);
      briefingLog('[THREADMAP] Notification shown via SW registration');
      return;
    }
  } catch (err) {
    console.warn('[THREADMAP] SW showNotification failed:', err);
  }

  // Strategy 2: Plain Notification API (only works when tab is focused)
  try {
    const notification = new Notification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      tag: data.tag,
      silent: !useSettingsStore.getState().settings.notifications.sound,
    });

    notification.onclick = () => {
      window.focus();
      window.history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      notification.close();
    };
    briefingLog('[THREADMAP] Notification shown via Notification API');
  } catch (err) {
    console.error('[THREADMAP] All notification strategies failed:', err);
  }
}

// ── Push schedule to Service Worker ───────────────────────
// The SW stores this in IndexedDB for periodic checks and push delivery.

const DEBUG_BRIEFINGS = process.env.NODE_ENV !== 'production';
const briefingLog = (...args: unknown[]) => {
  if (DEBUG_BRIEFINGS) console.log(...args);
};

let lastSyncedScheduleJson: string | null = null;
let currentBriefingOwnerId: string | null = null;

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

  // Send to SW controller
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'UPDATE_BRIEFING_SCHEDULE',
      config,
    });
    briefingLog('[THREADMAP] Briefing schedule synced to SW:', config);
  } else {
    // SW not yet controlling — wait for it
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.active) {
        reg.active.postMessage({
          type: 'UPDATE_BRIEFING_SCHEDULE',
          config,
        });
        briefingLog('[THREADMAP] Briefing schedule synced to SW (via ready):', config);
      }
    });
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

function getDateStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ── Habit reminders ────────────────────────────────────────

function habitRemindersFiredKey(): string | null {
  return currentBriefingOwnerId
    ? scopedStorageKey('orbit-habit-reminders-fired', currentBriefingOwnerId)
    : null;
}

/** Habit ids already reminded about today, so a reminder fires once. */
function getRemindedHabitIds(): Set<string> {
  try {
    const key = habitRemindersFiredKey();
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date?: string; ids?: string[] };
    if (parsed.date !== getDateStr() || !Array.isArray(parsed.ids)) return new Set();
    return new Set(parsed.ids.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function rememberRemindedHabits(ids: Set<string>): void {
  try {
    const key = habitRemindersFiredKey();
    if (key) localStorage.setItem(key, JSON.stringify({ date: getDateStr(), ids: [...ids] }));
  } catch { /* ignore */ }
}

/**
 * Fire reminders for habits whose set time has arrived.
 *
 * `habitTime` was persisted by the detail panel and read by nothing at all —
 * no scheduling, no display, no sorting. This is the reader the input has
 * always implied it had.
 */
function fireDueHabitReminders(items: OrbitItem[]): void {
  const { settings } = useSettingsStore.getState();
  if (!settings.notifications.enabled || !settings.notifications.habitReminders) return;
  if (!hasNotificationPermission()) return;

  const due = getDueHabitReminders(items, new Date());
  if (due.length === 0) return;

  const reminded = getRemindedHabitIds();
  const pending = due.filter((habit) => !reminded.has(habit.id));
  if (pending.length === 0) return;

  const german = settings.language === 'de';
  for (const habit of pending) {
    reminded.add(habit.id);
    const streak = calculateStreak(habit);
    void sendNotification({
      title: german ? `Zeit für: ${habit.title}` : `Time for: ${habit.title}`,
      body: streak > 0
        ? (german ? `${streak} Tage in Folge — halte die Serie.` : `${streak} day streak — keep it going.`)
        : (german ? 'Heute fällig.' : 'Due today.'),
      tag: `habit-reminder-${habit.id}-${getDateStr()}`,
    });
  }
  rememberRemindedHabits(reminded);
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
      if (event.data?.type === 'BRIEFING_FIRE') {
        const items = currentGetItems();
        if (event.data.briefing === 'morning') {
          // Mark as fired so in-app timer doesn't double-fire
          setLastFired('morning');
          const briefing = generateMorningBriefing(items);
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(briefing.title, {
              body: briefing.body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: briefing.tag,
              data: { url: '/briefing?type=morning', type: 'briefing', briefingType: 'morning' },
            } as NotificationOptions);
          }).catch(() => { /* ignore */ });
        } else if (event.data.briefing === 'evening') {
          setLastFired('evening');
          const briefing = generateEveningBriefing(items);
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(briefing.title, {
              body: briefing.body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: briefing.tag,
              data: { url: '/briefing?type=evening', type: 'briefing', briefingType: 'evening' },
            } as NotificationOptions);
          }).catch(() => { /* ignore */ });
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

    // Habit reminders run on the same minute tick as the briefings.
    fireDueHabitReminders(currentGetItems());

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

export function stopBriefingScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (currentBriefingOwnerId && 'serviceWorker' in navigator) {
    const message = { type: 'CLEAR_BRIEFING_SCHEDULE', ownerId: currentBriefingOwnerId };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    } else {
      void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(message));
    }
  }
  currentBriefingOwnerId = null;
  lastSyncedScheduleJson = null;
  currentGetItems = () => [];
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
