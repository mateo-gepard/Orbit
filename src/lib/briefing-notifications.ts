// ═══════════════════════════════════════════════════════════
// ORBIT — Briefing Notifications
// Real browser push notifications with smart, human briefings.
// Morning: what's ahead. Evening: what you accomplished.
// Hockey Mode: sports commentary + medical vibes (German).
// ═══════════════════════════════════════════════════════════

import { format, isToday, parseISO, isTomorrow, isPast, differenceInDays } from 'date-fns';
import type { OrbitItem } from './types';
import { isHabitScheduledForDate, isHabitCompletedForDate, calculateStreak } from './habits';
import { useSettingsStore } from './settings-store';

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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── The day's weather report ──────────────────────────────

function getDayOfWeekVibe(): string {
  const day = new Date().getDay();
  const vibes: Record<number, string[]> = {
    0: ['Sunday mode — recharge.', 'A quiet Sunday ahead.'],
    1: ['Monday. Set the tone.', 'Fresh week — fresh momentum.'],
    2: ['Tuesday — build on yesterday.', 'Keep the rhythm going.'],
    3: ['Midweek checkpoint.', 'Wednesday — halfway there.'],
    4: ['Thursday — the home stretch starts.', 'Push through Thursday.'],
    5: ['Friday energy. Finish strong.', 'TGIF — close strong.'],
    6: ['Saturday. Your rules.', 'Weekend mode — but make it count.'],
  };
  return pickRandom(vibes[day] || ['Let\'s go.']);
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

function getDayOfWeekVibeHockey(): string {
  const day = new Date().getDay();
  const vibes: Record<number, string[]> = {
    0: ['Sonntag — Regeneration. Die beste Medizin.', 'Ruhetag. Der Körper muss heilen. 🩺'],
    1: ['Montag. Erster Anpfiff der Woche!', 'Neue Woche, neues Spiel. 🏒'],
    2: ['Dienstag — zweites Drittel der Woche.', 'Weiter trainieren, Dr.'],
    3: ['Mittwoch — Halbzeit! Wie steht\'s?', 'Drittelpause. Nachschub holen.'],
    4: ['Donnerstag — Endspurt Richtung Wochenende.', 'Power Play, Dr.!'],
    5: ['Freitag! Letztes Drittel. Vollgas! 🚨', 'TGIF — Schluss-Sirene naht!'],
    6: ['Samstag. Freies Training auf dem Platz.', 'Wochenende — aber Sieger ruhen nie.'],
  };
  return pickRandom(vibes[day] || ['Anpfiff! 🏒']);
}

function generateHockeyMorningBriefing(items: OrbitItem[]): BriefingData {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const tasksDueToday = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === todayStr
  );
  const overdue = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate && i.dueDate < todayStr
  );
  const eventsToday = items.filter(
    (i) => i.type === 'event' && i.status === 'active' && i.startDate === todayStr
  );
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

  return { title, body, tag: 'orbit-morning-briefing' };
}

function generateHockeyEveningBriefing(items: OrbitItem[]): BriefingData {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEnd = todayStart + 86400000;

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

  const tomorrowStr = format(new Date(todayStart + 86400000), 'yyyy-MM-dd');
  const dueTomorrow = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === tomorrowStr
  );

  const title = pickRandom(HOCKEY_EVENING_GREETINGS);
  const totalScheduled = completedToday.length + unfinished.length;
  const habitRate = habitsToday.length > 0 ? habitsDone.length / habitsToday.length : 0;

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

  return { title, body, tag: 'orbit-evening-briefing' };
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
  const eventsToday = items.filter(
    (i) => i.type === 'event' && i.status === 'active' && i.startDate === todayStr
  );

  // Habits due today
  const habitsToday = items.filter(
    (i) => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)
  );

  // Active goals
  const activeGoals = items.filter(
    (i) => i.type === 'goal' && i.status === 'active'
  );

  // All active tasks (inbox size)
  const activeTasks = items.filter(
    (i) => i.type === 'task' && i.status === 'active'
  );

  // Build title — short, punchy
  const greeting = pickRandom(MORNING_GREETINGS);
  const title = greeting;

  // Build a concise single-line body that won't get cut off
  const counts: string[] = [];
  if (tasksDueToday.length > 0) counts.push(`${tasksDueToday.length} task${tasksDueToday.length > 1 ? 's' : ''}`);
  if (eventsToday.length > 0) counts.push(`${eventsToday.length} event${eventsToday.length > 1 ? 's' : ''}`);
  if (habitsToday.length > 0) counts.push(`${habitsToday.length} habit${habitsToday.length > 1 ? 's' : ''}`);
  if (overdue.length > 0) counts.push(`${overdue.length} overdue ⚠️`);

  let body: string;
  if (counts.length > 0) {
    body = counts.join(' · ');
    const topTask = tasksDueToday.find((t) => t.priority === 'high') || tasksDueToday[0];
    if (topTask) body += ` → ${topTask.title}`;
  } else {
    body = 'Clear runway ahead — plan your day.';
  }

  return {
    title,
    body,
    tag: 'orbit-morning-briefing',
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
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEnd = todayStart + 86400000;

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
  const tomorrowStr = format(new Date(todayStart + 86400000), 'yyyy-MM-dd');
  const dueTomorrow = items.filter(
    (i) => i.type === 'task' && i.status === 'active' && i.dueDate === tomorrowStr
  );

  // Events tomorrow
  const eventsTomorrow = items.filter(
    (i) => i.type === 'event' && i.status === 'active' && i.startDate === tomorrowStr
  );

  // Best streak
  const bestStreak = habitsToday.reduce((max, h) => {
    const s = calculateStreak(h);
    return s > max ? s : max;
  }, 0);

  const greeting = pickRandom(EVENING_GREETINGS);

  // Build concise single-line body for notification
  const parts: string[] = [];

  if (completedToday.length > 0) {
    parts.push(`${completedToday.length} done ✓`);
  }
  if (unfinished.length > 0) {
    parts.push(`${unfinished.length} open`);
  }
  if (habitsToday.length > 0) {
    parts.push(`Habits ${habitsDone.length}/${habitsToday.length}`);
  }
  if (bestStreak > 1) {
    parts.push(`${bestStreak}d streak 🔥`);
  }

  let body: string;
  if (parts.length > 0) {
    body = parts.join(' · ');
  } else {
    body = 'Quiet day — nothing was scheduled.';
  }

  if (dueTomorrow.length > 0) {
    body += ` → Tomorrow: ${dueTomorrow.length} task${dueTomorrow.length > 1 ? 's' : ''}`;
  }

  return {
    title: greeting,
    body,
    tag: 'orbit-evening-briefing',
  };
}

// ── Send the actual notification ──────────────────────────

async function sendNotification(data: BriefingData) {
  if (!hasNotificationPermission()) {
    console.warn('[ORBIT] sendNotification: no permission');
    return;
  }

  console.log('[ORBIT] sendNotification:', data.title, '|', data.body?.slice(0, 80));

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
        renotify: true,
      } as NotificationOptions);
      console.log('[ORBIT] Notification shown via SW registration');
      return;
    }
  } catch (err) {
    console.warn('[ORBIT] SW showNotification failed:', err);
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
      notification.close();
    };
    console.log('[ORBIT] Notification shown via Notification API');
  } catch (err) {
    console.error('[ORBIT] All notification strategies failed:', err);
  }
}

// ── Push schedule to Service Worker ───────────────────────
// The SW stores this in IndexedDB and checks every 30s,
// firing notifications even when the page is closed.

export function syncBriefingScheduleToSW() {
  const { settings } = useSettingsStore.getState();
  
  if (!('serviceWorker' in navigator)) return;

  const config = {
    morningEnabled: settings.notifications.enabled && settings.notifications.dailyBriefing,
    morningTime: settings.notifications.dailyBriefingTime,
    eveningEnabled: settings.notifications.enabled && settings.notifications.eveningBriefing,
    eveningTime: settings.notifications.eveningBriefingTime,
  };

  // Send to SW controller
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'UPDATE_BRIEFING_SCHEDULE',
      config,
    });
    console.log('[ORBIT] Briefing schedule synced to SW:', config);
  } else {
    // SW not yet controlling — wait for it
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.active) {
        reg.active.postMessage({
          type: 'UPDATE_BRIEFING_SCHEDULE',
          config,
        });
        console.log('[ORBIT] Briefing schedule synced to SW (via ready):', config);
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
        .periodicSync.register('orbit-briefing-check', {
          minInterval: 60 * 60 * 1000, // Check at least every hour
        });
      console.log('[ORBIT] Periodic background sync registered');
    }
  } catch {
    // Not supported or permission denied — that's fine, SW timer handles it
  }
}

// ── Scheduler ─────────────────────────────────────────────
// Dual strategy:
// 1. Service Worker checks schedule in IndexedDB every 30s (works in background)
// 2. In-app setInterval as a backup when SW can't fire (e.g. iOS Safari)
// The SW also listens for Periodic Background Sync events.

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let swMessageListenerRegistered = false;

// Persist last-fired dates in localStorage to survive page reloads
// but allow re-firing on a new day
function getLastFired(): { morning: string | null; evening: string | null } {
  try {
    const raw = localStorage.getItem('orbit-briefing-lastFired');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { morning: null, evening: null };
}

function setLastFired(type: 'morning' | 'evening') {
  const today = getDateStr();
  const current = getLastFired();
  current[type] = today;
  try {
    localStorage.setItem('orbit-briefing-lastFired', JSON.stringify(current));
  } catch { /* ignore */ }
}

function getTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getDateStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function startBriefingScheduler(getItems: () => OrbitItem[]) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  // 1. Sync schedule to service worker for background notifications
  syncBriefingScheduleToSW();

  // 2. Listen for SW messages (e.g. when SW fires a briefing and wants the app to generate content)
  if (!swMessageListenerRegistered && 'serviceWorker' in navigator) {
    swMessageListenerRegistered = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'BRIEFING_FIRE') {
        const items = getItems();
        if (event.data.briefing === 'morning') {
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

  // 3. In-app backup timer — catches cases where SW can't fire
  schedulerInterval = setInterval(() => {
    const { settings } = useSettingsStore.getState();
    if (!settings.notifications.enabled) return;
    if (!hasNotificationPermission()) return;

    const now = getTimeStr();
    const today = getDateStr();
    const lastFired = getLastFired();

    // Morning briefing
    if (
      settings.notifications.dailyBriefing &&
      now === settings.notifications.dailyBriefingTime &&
      lastFired.morning !== today
    ) {
      setLastFired('morning');
      const items = getItems();
      const briefing = generateMorningBriefing(items);
      sendNotification(briefing);
      console.log('[ORBIT] Morning briefing sent (in-app timer)');
    }

    // Evening briefing
    if (
      settings.notifications.eveningBriefing &&
      now === settings.notifications.eveningBriefingTime &&
      lastFired.evening !== today
    ) {
      setLastFired('evening');
      const items = getItems();
      const briefing = generateEveningBriefing(items);
      sendNotification(briefing);
      console.log('[ORBIT] Evening briefing sent (in-app timer)');
    }
  }, 15_000); // every 15 seconds

  console.log('[ORBIT] Briefing scheduler started (SW + in-app timer)');
}

export function stopBriefingScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
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
