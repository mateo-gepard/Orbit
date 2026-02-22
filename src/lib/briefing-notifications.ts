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
  const lines: string[] = [];

  lines.push(getDayOfWeekVibeHockey());

  const parts: string[] = [];
  if (tasksDueToday.length > 0) {
    parts.push(`${tasksDueToday.length} Spielzüge auf dem Platz`);
  }
  if (eventsToday.length > 0) {
    parts.push(`${eventsToday.length} ${eventsToday.length > 1 ? 'Anpfiffe' : 'Anpfiff'}`);
  }
  if (habitsToday.length > 0) {
    parts.push(`${habitsToday.length}× Training`);
  }

  if (parts.length > 0) {
    lines.push(parts.join(' · '));
  } else {
    lines.push('Leeres Spielfeld — plane deine Spielzüge, Dr.');
  }

  if (overdue.length > 0) {
    lines.push(`⏱️ ${overdue.length}× Nachspielzeit!`);
  }

  const topTask = tasksDueToday.find((t) => t.priority === 'high') || tasksDueToday[0];
  if (topTask) {
    lines.push(`→ Notfall-Spielzug: ${topTask.title}`);
  }

  if (eventsToday.length > 0 && eventsToday[0].startTime) {
    lines.push(`🏟️ ${eventsToday[0].title} um ${eventsToday[0].startTime}`);
  }

  return { title, body: lines.join('\n'), tag: 'orbit-morning-briefing' };
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

  let verdict: string;
  if (totalScheduled === 0 && habitsToday.length === 0) {
    verdict = 'Spielfrei heute — kein Einsatz, Dr.';
  } else if (unfinished.length === 0 && habitRate >= 1) {
    verdict = pickRandom([
      'Sauberes Spiel! Alle Tore geschossen. 🏆',
      'Shutout! Alles erledigt, Dr. — Diagnose: perfekt. 🩺',
      'Hat-Trick! Training & Spielzüge — alles drin.',
    ]);
  } else if (unfinished.length === 0 && completedToday.length > 0) {
    verdict = `${completedToday.length} Tor${completedToday.length > 1 ? 'e' : ''} geschossen. Sauberes Spielfeld!`;
  } else if (completedToday.length > unfinished.length) {
    verdict = `Endstand: ${completedToday.length} Tore, ${unfinished.length} noch offen.`;
  } else if (completedToday.length > 0) {
    verdict = `${completedToday.length} Tor${completedToday.length > 1 ? 'e' : ''} — ${unfinished.length} noch auf dem Platz.`;
  } else {
    verdict = `${unfinished.length} Spielzüge nicht abgeschlossen. Morgen neuer Anpfiff!`;
  }

  const lines: string[] = [];
  lines.push(verdict);

  if (habitsToday.length > 0) {
    lines.push(`Training: ${habitsDone.length}/${habitsToday.length}${bestStreak > 1 ? ` · ${bestStreak} Tage Siegesserie 🏒` : ''}`);
  }

  if (dueTomorrow.length > 0) {
    lines.push(`Morgen: ${dueTomorrow.length} Spielzüge warten`);
  }

  if (unfinished.length === 0 && completedToday.length > 0) {
    lines.push(pickRandom(['Gute Nacht, Dr. 🌙', 'Ab in die Kabine. Ruh dich aus.', 'Feierabend — du hast es dir verdient.']));
  } else if (unfinished.length > 0) {
    lines.push(pickRandom(['Morgen ist ein neues Spiel.', 'Schlaf gut — morgen wird aufgeholt.']));
  }

  return { title, body: lines.join('\n'), tag: 'orbit-evening-briefing' };
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

  // Build body — the actual brief, max ~100 chars for notification readability
  const lines: string[] = [];

  // Day vibe
  lines.push(getDayOfWeekVibe());

  // Core stats
  const parts: string[] = [];
  if (tasksDueToday.length > 0) {
    parts.push(`${tasksDueToday.length} task${tasksDueToday.length > 1 ? 's' : ''} due`);
  }
  if (eventsToday.length > 0) {
    const firstEvent = eventsToday[0];
    parts.push(`${eventsToday.length} event${eventsToday.length > 1 ? 's' : ''} (${firstEvent.startTime || 'today'})`);
  }
  if (habitsToday.length > 0) {
    parts.push(`${habitsToday.length} habit${habitsToday.length > 1 ? 's' : ''}`);
  }

  if (parts.length > 0) {
    lines.push(parts.join(' · '));
  } else {
    lines.push('Clear runway ahead — define your priorities.');
  }

  // Overdue warning
  if (overdue.length > 0) {
    lines.push(`⚠️ ${overdue.length} overdue`);
  }

  // Top task (most important)
  const topTask = tasksDueToday.find((t) => t.priority === 'high') || tasksDueToday[0];
  if (topTask) {
    lines.push(`→ ${topTask.title}`);
  }

  // First event time
  if (eventsToday.length > 0 && eventsToday[0].startTime) {
    lines.push(`📍 ${eventsToday[0].title} at ${eventsToday[0].startTime}`);
  }

  return {
    title,
    body: lines.join('\n'),
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

  // Verdict on the day
  const completionRate = completedToday.length;
  const totalScheduled = completedToday.length + unfinished.length;
  const habitRate = habitsToday.length > 0 ? habitsDone.length / habitsToday.length : 0;

  let verdict: string;
  if (totalScheduled === 0 && habitsToday.length === 0) {
    verdict = 'Quiet day — nothing scheduled.';
  } else if (unfinished.length === 0 && habitRate >= 1) {
    verdict = pickRandom([
      'Clean sweep. Everything done. 🏆',
      'Perfect day — all tasks and habits checked off.',
      'Full marks. You showed up.',
    ]);
  } else if (unfinished.length === 0 && completionRate > 0) {
    verdict = pickRandom([
      'All tasks done.',
      `${completionRate} task${completionRate > 1 ? 's' : ''} completed. Nice.`,
    ]);
  } else if (completionRate > unfinished.length) {
    verdict = `${completionRate} done, ${unfinished.length} carried over.`;
  } else if (completionRate > 0) {
    verdict = `${completionRate} done — ${unfinished.length} still open.`;
  } else {
    verdict = `${unfinished.length} task${unfinished.length > 1 ? 's' : ''} left unfinished.`;
  }

  const lines: string[] = [];
  lines.push(verdict);

  // Habits summary
  if (habitsToday.length > 0) {
    lines.push(`Habits: ${habitsDone.length}/${habitsToday.length}${bestStreak > 1 ? ` · ${bestStreak}d streak 🔥` : ''}`);
  }

  // Tomorrow preview
  const tomorrowParts: string[] = [];
  if (dueTomorrow.length > 0) {
    tomorrowParts.push(`${dueTomorrow.length} task${dueTomorrow.length > 1 ? 's' : ''}`);
  }
  if (eventsTomorrow.length > 0) {
    tomorrowParts.push(`${eventsTomorrow.length} event${eventsTomorrow.length > 1 ? 's' : ''}`);
  }
  if (tomorrowParts.length > 0) {
    lines.push(`Tomorrow: ${tomorrowParts.join(', ')}`);
  }

  // Motivational closer
  if (unfinished.length === 0 && completionRate > 0) {
    lines.push(pickRandom(['Rest well.', 'You earned it.', 'Good night. 🌙']));
  } else if (unfinished.length > 0) {
    lines.push(pickRandom(['Tomorrow\'s a fresh start.', 'Get some rest — regroup tomorrow.']));
  }

  return {
    title: greeting,
    body: lines.join('\n'),
    tag: 'orbit-evening-briefing',
  };
}

// ── Send the actual notification ──────────────────────────

function sendNotification(data: BriefingData) {
  if (!hasNotificationPermission()) return;

  // Prefer service worker — works even when tab is in background / phone sleeping
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_BRIEFING_NOW',
      title: data.title,
      body: data.body,
      tag: data.tag,
    });
    return;
  }

  // Fallback: try via SW registration directly
  navigator.serviceWorker?.ready.then((reg) => {
    reg.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: '/today' },
    });
  }).catch(() => {
    // Last resort: in-page notification (only works while tab is open)
    try {
      const notification = new Notification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag,
        silent: !useSettingsStore.getState().settings.notifications.sound,
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Nothing else we can do
    }
  });
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
let lastMorningFired: string | null = null;
let lastEveningFired: string | null = null;
let swMessageListenerRegistered = false;

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
          // Update the notification with actual content
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(briefing.title, {
              body: briefing.body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: briefing.tag,
              data: { url: '/today' },
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
              data: { url: '/today' },
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

    // Morning briefing
    if (
      settings.notifications.dailyBriefing &&
      now === settings.notifications.dailyBriefingTime &&
      lastMorningFired !== today
    ) {
      lastMorningFired = today;
      const items = getItems();
      const briefing = generateMorningBriefing(items);
      sendNotification(briefing);
      console.log('[ORBIT] Morning briefing sent (in-app timer)');
    }

    // Evening briefing
    if (
      settings.notifications.eveningBriefing &&
      now === settings.notifications.eveningBriefingTime &&
      lastEveningFired !== today
    ) {
      lastEveningFired = today;
      const items = getItems();
      const briefing = generateEveningBriefing(items);
      sendNotification(briefing);
      console.log('[ORBIT] Evening briefing sent (in-app timer)');
    }
  }, 30_000); // every 30 seconds

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
