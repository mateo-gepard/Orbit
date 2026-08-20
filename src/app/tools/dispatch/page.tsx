'use client';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Route,
  Clock,
  Play,
  Plus,
  Shuffle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn, getLocale } from '@/lib/utils';
import { useThreadmapStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import {
  flushDispatchPlan,
  persistDispatchPlanDraft,
  saveDispatchFlightHandoff,
  subscribeToDispatchPlan,
  type DispatchBlockSnapshot,
} from '@/lib/dispatch';
import {
  DISPATCH_DAY_END_MINUTES,
  findDispatchSlot,
  getDispatchBusyIntervals,
  getDispatchStartMinutes,
  reflowDispatchBlocks,
  type DispatchBusyInterval,
} from '@/lib/dispatch-schedule';
import { format, isToday, parseISO } from 'date-fns';
import type { ThreadmapItem } from '@/lib/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useSettingsStore } from '@/lib/settings-store';

type TimeBlock = DispatchBlockSnapshot;

interface PendingDispatchSave {
  revision: number;
  userId: string;
  date: string;
  blocks: TimeBlock[];
}

const BLOCK_COLORS = [
  'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300',
  'bg-violet-500/10 border-violet-500/20 text-violet-700 dark:text-violet-300',
  'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/10 border-cyan-500/20 text-cyan-700 dark:text-cyan-300',
];

const BLOCK_LABELS = {
  en: ['Morning focus', 'Deep work', 'Afternoon sprint', 'Wrap-up', 'Late session', 'Overtime'],
  de: ['Morgenfokus', 'Tiefenarbeit', 'Nachmittagssprint', 'Tagesabschluss', 'Späte Einheit', 'Überzeit'],
} as const;

const COPY = {
  en: {
    loading: 'Loading Dispatch…',
    active: 'active', dueToday: 'due today', blocks: 'blocks', focus: 'focus',
    noRoute: 'No route planned', generateDescription: 'Generate a route to organize your tasks into focused time blocks for today.',
    generate: 'Generate route', todayRoute: "Today's route", reroute: 'Re-route', fly: 'Fly',
    task: 'task', tasks: 'tasks', taskUnavailable: 'Task no longer available',
    allTasksScheduled: 'All tasks scheduled', close: 'Close', addTask: 'Add task',
    unscheduled: 'Unscheduled', replaceTitle: "Replace today's route?",
    replaceDescription: 'Re-routing rebuilds all blocks from your current active tasks and discards manual ordering and task assignments.',
    replace: 'Replace route', noTime: 'Dispatch schedules today between 08:00 and 22:00. Start a Flight directly, or build tomorrow’s route in the morning.',
    noGap: 'Your calendar leaves no focus block that fits today. Free a slot, start a Flight directly, or plan again tomorrow.',
    allDay: 'An all-day calendar event reserves today, so Dispatch will not place focus blocks.',
    calendarProtected: 'Calendar time protected',
    calendarDescription: 'Dispatch keeps generated and reordered focus blocks out of these busy periods.',
    allDayEvent: 'All-day event', busy: 'Busy', routeConflict: 'This saved block overlaps a calendar event. Re-route it to move it into a free gap.',
    cannotReorder: 'That order no longer fits in today’s free calendar time, so the current route was kept.',
    moveEarlier: 'Move {label} earlier', moveLater: 'Move {label} later', startFlight: 'Start a Flight for {label}',
    removeBlock: 'Remove {label}', removeTask: 'Remove {task} from {label}', addTaskTo: 'Add a task to {label}',
    closeTaskPicker: 'Close task picker', routeForDate: 'Dispatch for {date}',
    searchTasks: 'Search unscheduled tasks…', noMatchingTasks: 'No matching tasks', clearSearch: 'Clear task search',
    handoffFailed: 'Flight could not be prepared because browser storage is unavailable. Restore storage access, then try Fly again.',
    retryFly: 'Retry Fly',
  },
  de: {
    loading: 'Dispatch wird geladen…',
    active: 'aktiv', dueToday: 'heute fällig', blocks: 'Blöcke', focus: 'Fokus',
    noRoute: 'Keine Route geplant', generateDescription: 'Erstelle eine Route, um deine Aufgaben heute in fokussierte Zeitblöcke zu organisieren.',
    generate: 'Route erstellen', todayRoute: 'Heutige Route', reroute: 'Neu planen', fly: 'Fliegen',
    task: 'Aufgabe', tasks: 'Aufgaben', taskUnavailable: 'Aufgabe nicht mehr verfügbar',
    allTasksScheduled: 'Alle Aufgaben geplant', close: 'Schließen', addTask: 'Aufgabe hinzufügen',
    unscheduled: 'Ungeplant', replaceTitle: 'Heutige Route ersetzen?',
    replaceDescription: 'Beim Neuplanen werden alle Blöcke aus deinen aktuellen aktiven Aufgaben erstellt. Manuelle Reihenfolge und Aufgabenzuordnungen gehen verloren.',
    replace: 'Route ersetzen', noTime: 'Dispatch plant heute zwischen 08:00 und 22:00. Starte Flight direkt oder plane morgen früh erneut.',
    noGap: 'Dein Kalender hat heute keinen passenden Fokusblock frei. Gib Zeit frei, starte Flight direkt oder plane morgen erneut.',
    allDay: 'Ein ganztägiger Kalendereintrag reserviert heute. Dispatch platziert deshalb keine Fokusblöcke.',
    calendarProtected: 'Kalenderzeit geschützt',
    calendarDescription: 'Dispatch hält generierte und neu sortierte Fokusblöcke aus diesen belegten Zeiträumen heraus.',
    allDayEvent: 'Ganztägiger Termin', busy: 'Belegt', routeConflict: 'Dieser gespeicherte Block überschneidet sich mit einem Kalendereintrag. Plane ihn neu, um ihn in eine freie Lücke zu verschieben.',
    cannotReorder: 'Diese Reihenfolge passt nicht mehr in die freie Kalenderzeit von heute. Die aktuelle Route wurde beibehalten.',
    moveEarlier: '{label} früher verschieben', moveLater: '{label} später verschieben', startFlight: 'Flight für {label} starten',
    removeBlock: '{label} entfernen', removeTask: '{task} aus {label} entfernen', addTaskTo: 'Aufgabe zu {label} hinzufügen',
    closeTaskPicker: 'Aufgabenauswahl schließen', routeForDate: 'Dispatch für {date}',
    searchTasks: 'Ungeplante Aufgaben suchen…', noMatchingTasks: 'Keine passenden Aufgaben', clearSearch: 'Aufgabensuche leeren',
    handoffFailed: 'Flight konnte nicht vorbereitet werden, weil der Browserspeicher nicht verfügbar ist. Stelle den Speicherzugriff wieder her und versuche „Fliegen“ erneut.',
    retryFly: 'Fliegen erneut versuchen',
  },
} as const;

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function formatTimeSlot(h: number, m: number, timeFormat: '12h' | '24h'): string {
  if (timeFormat === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mins = m > 0 ? `:${m.toString().padStart(2, '0')}` : '';
  return `${display}${mins} ${period}`;
}

function generateRoute(
  tasks: ThreadmapItem[],
  busyIntervals: DispatchBusyInterval[],
  language: 'en' | 'de',
  now = new Date(),
): TimeBlock[] {
  const active = tasks.filter(
    (i) => i.type === 'task' && i.status === 'active'
  );
  if (active.length === 0) return [];

  // Sort by priority → dueDate → updatedAt (deterministic)
  const sorted = [...active].sort((a, b) => {
    const pMap: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const pa = pMap[a.priority || 'low'];
    const pb = pMap[b.priority || 'low'];
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const blocks: TimeBlock[] = [];
  let idx = 0;
  let currentMinutes = getDispatchStartMinutes(now);

  while (idx < sorted.length && blocks.length < 6 && currentMinutes < DISPATCH_DAY_END_MINUTES) {
    const remaining = sorted.length - idx;
    // 2-3 tasks per block, prefer 2 when few tasks remain
    const batchSize = remaining <= 2 ? remaining : Math.min(3, remaining);
    const batch = sorted.slice(idx, idx + batchSize);
    const blockDuration = batchSize <= 2 ? 50 : 75;
    const slot = findDispatchSlot(currentMinutes, blockDuration, busyIntervals);
    if (slot === null || slot + blockDuration > DISPATCH_DAY_END_MINUTES) break;

    // Determine label from the first task's tag, or use positional label
    const tagLabel = batch[0].tags?.[0];
    const label = tagLabel
      ? tagLabel.charAt(0).toUpperCase() + tagLabel.slice(1)
      : BLOCK_LABELS[language][blocks.length] || `Block ${blocks.length + 1}`;

    blocks.push({
      id: `block-${Date.now()}-${blocks.length}`,
      label,
      startHour: Math.floor(slot / 60),
      startMin: slot % 60,
      durationMin: blockDuration,
      taskIds: batch.map((task) => task.id),
      colorIndex: blocks.length % BLOCK_COLORS.length,
    });

    // Advance time: block duration + 15 min break
    currentMinutes = slot + blockDuration + 15;
    idx += batchSize;
  }

  return blocks;
}

export default function DispatchPage() {
  const { items } = useThreadmapStore();
  const { user } = useAuth();
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const language = useSettingsStore((state) => state.settings.language);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [confirmReroute, setConfirmReroute] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const ownerScope = user?.uid || 'demo-user';
  const planDate = format(currentTime, 'yyyy-MM-dd');
  const planScope = `${ownerScope}:${planDate}`;
  const locale = getLocale(language);
  const copy = COPY[language];
  const blocksRef = useRef(blocks);
  const pendingSaveRef = useRef<PendingDispatchSave | null>(null);
  const saveRevisionRef = useRef(0);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const persistenceActiveRef = useRef(true);
  const flushPendingRef = useRef<() => Promise<void>>(async () => {});

  blocksRef.current = blocks;

  const flushPending = useCallback(async (): Promise<void> => {
    if (flushInFlightRef.current) {
      await flushInFlightRef.current;
      if (pendingSaveRef.current) await flushPendingRef.current();
      return;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;

    const operation = (async () => {
      try {
        const outcome = await flushDispatchPlan(pending.userId, {
          date: pending.date,
          blocks: pending.blocks,
        });
        if (
          pendingSaveRef.current?.revision === pending.revision
          && (outcome.localCommitted || outcome.cloudCommitted)
        ) {
          pendingSaveRef.current = null;
        }
      } catch {
        if (persistenceActiveRef.current && pendingSaveRef.current?.revision === pending.revision) {
          if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(() => { void flushPendingRef.current(); }, 5_000);
        }
      }
    })();

    flushInFlightRef.current = operation;
    try {
      await operation;
    } finally {
      if (flushInFlightRef.current === operation) flushInFlightRef.current = null;
      const latest = pendingSaveRef.current;
      if (persistenceActiveRef.current && latest && latest.revision !== pending.revision) {
        if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => { void flushPendingRef.current(); }, 0);
      }
    }
  }, []);

  flushPendingRef.current = flushPending;

  const queueDispatchSave = useCallback((nextBlocks: TimeBlock[]) => {
    const snapshot = nextBlocks.map((block) => ({ ...block, taskIds: [...block.taskIds] }));
    pendingSaveRef.current = {
      revision: ++saveRevisionRef.current,
      userId: ownerScope,
      date: planDate,
      blocks: snapshot,
    };
    try {
      persistDispatchPlanDraft(ownerScope, { date: planDate, blocks: snapshot });
    } catch {
      // The verified writer emitted the account-safe durability warning. Keep
      // the snapshot dirty so the cloud/local flush below can recover it.
    }
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => { void flushPendingRef.current(); }, 250);
  }, [ownerScope, planDate]);

  const commitBlocks = useCallback((next: TimeBlock[] | ((current: TimeBlock[]) => TimeBlock[])) => {
    if (loadedScope !== planScope) return;
    const nextBlocks = typeof next === 'function' ? next(blocksRef.current) : next;
    blocksRef.current = nextBlocks;
    queueDispatchSave(nextBlocks);
    setBlocks(nextBlocks);
  }, [loadedScope, planScope, queueDispatchSave]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    let unsubscribe = () => {};
    // DataProvider establishes the active account context in its effect first.
    const timer = setTimeout(() => {
      unsubscribe = subscribeToDispatchPlan(ownerScope, planDate, (stored) => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const nextBlocks = stored?.blocks ?? [];
          blocksRef.current = nextBlocks;
          setBlocks((current) => JSON.stringify(current) === JSON.stringify(nextBlocks) ? current : nextBlocks);
          setAddingToBlock(null);
          setLoadedScope(planScope);
        });
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
      void flushPendingRef.current();
    };
  }, [ownerScope, planDate, planScope]);

  useEffect(() => {
    persistenceActiveRef.current = true;
    const flushNow = () => { void flushPendingRef.current(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      flushNow();
      persistenceActiveRef.current = false;
    };
  }, []);

  const activeTasks = useMemo(
    () => items.filter((i) => i.type === 'task' && i.status === 'active'),
    [items]
  );

  const busyIntervals = useMemo(
    () => getDispatchBusyIntervals(items, planDate),
    [items, planDate],
  );
  const hasAllDayEvent = busyIntervals.some((interval) => interval.allDay);

  const tasksById = useMemo(() => new Map(activeTasks.map((task) => [task.id, task])), [activeTasks]);

  const todayTasks = useMemo(
    () =>
      activeTasks.filter((i) => {
        if (!i.dueDate) return false;
        try {
          return isToday(parseISO(i.dueDate));
        } catch {
          return false;
        }
      }),
    [activeTasks]
  );

  // Tasks already scheduled in some block
  const scheduledTaskIds = useMemo(
    () => new Set(blocks.flatMap((b) => b.taskIds)),
    [blocks]
  );

  // Unscheduled tasks
  const unscheduledTasks = useMemo(
    () => activeTasks.filter((t) => !scheduledTaskIds.has(t.id)),
    [activeTasks, scheduledTaskIds]
  );

  const totalFocusMin = blocks.reduce((sum, b) => sum + b.durationMin, 0);

  const conflictingBlockIds = useMemo(() => new Set(
    blocks
      .filter((block) => {
        const start = block.startHour * 60 + block.startMin;
        const end = start + block.durationMin;
        return busyIntervals.some((busy) => start < busy.endMinutes && end > busy.startMinutes);
      })
      .map((block) => block.id),
  ), [blocks, busyIntervals]);

  const applyGeneratedRoute = () => {
    const generated = generateRoute(items, busyIntervals, language, new Date());
    commitBlocks(generated);
    setGenerationMessage(
      generated.length === 0 && activeTasks.length > 0
        ? hasAllDayEvent ? copy.allDay : busyIntervals.length > 0 ? copy.noGap : copy.noTime
        : null
    );
  };

  const handleGenerateRoute = () => {
    applyGeneratedRoute();
  };

  const handleRemoveBlock = (blockId: string) => {
    commitBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const handleRemoveTaskFromBlock = (blockId: string, taskId: string) => {
    commitBlocks((prev) =>
      prev
        .map((b) => {
          if (b.id !== blockId) return b;
          return { ...b, taskIds: b.taskIds.filter((id) => id !== taskId) };
        })
        .filter((b) => b.taskIds.length > 0)
    );
  };

  const handleAddTaskToBlock = (blockId: string, task: ThreadmapItem) => {
    commitBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        if (b.taskIds.includes(task.id)) return b;
        return { ...b, taskIds: [...b.taskIds, task.id] };
      })
    );
    setAddingToBlock(null);
  };

  const handleMoveBlock = (blockId: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex((block) => block.id === blockId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= blocks.length) return;
    const reordered = [...blocks];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const reflowed = reflowDispatchBlocks(reordered, new Date(), busyIntervals);
    if (!reflowed) {
      setGenerationMessage(copy.cannotReorder);
      return;
    }
    setGenerationMessage(null);
    commitBlocks(reflowed.map((block, index) => ({ ...block, colorIndex: index % BLOCK_COLORS.length })));
  };

  if (loadedScope !== planScope) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
        {copy.loading}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6" role="region" aria-label={interpolate(copy.routeForDate, { date: format(currentTime, 'PPPP', { locale }) })}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-emerald-500" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Dispatch</h1>
        </div>
        <p className="text-[11px] text-muted-foreground/40">
          {format(currentTime, 'EEEE, d MMMM', { locale })}
        </p>
      </div>

      {/* Overview strip */}
      <div className="flex items-center gap-4 text-[12px] flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          <span>{activeTasks.length} {copy.active}</span>
        </div>
        <div className="text-muted-foreground/30">·</div>
        <div className="text-muted-foreground/50">
          {todayTasks.length} {copy.dueToday}
        </div>
        <div className="text-muted-foreground/30">·</div>
        <div className="text-muted-foreground/50">
          {blocks.length} {copy.blocks} · {totalFocusMin}m {copy.focus}
        </div>
      </div>

      {/* Empty state */}
      {blocks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/40 p-8 flex flex-col items-center justify-center text-center">
          <Route
            className="h-8 w-8 text-emerald-500/30 mb-3"
            strokeWidth={1.5}
          />
          <p className="text-[14px] font-medium">{copy.noRoute}</p>
          <p className="text-[12px] text-muted-foreground/40 mt-1 max-w-[260px]">
            {generationMessage || copy.generateDescription}
          </p>
          <button
            onClick={handleGenerateRoute}
            disabled={activeTasks.length === 0}
            className={cn(
              'mt-4 flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all active:scale-95',
              activeTasks.length > 0
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/15'
                : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
            )}
          >
            <Shuffle className="h-3.5 w-3.5" />
            {copy.generate}
          </button>
        </div>
      )}

      {busyIntervals.length > 0 && (
        <section className="rounded-2xl border border-border/55 bg-muted/20 p-4" aria-labelledby="dispatch-calendar-protected">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="dispatch-calendar-protected" className="text-[13px] font-semibold">{copy.calendarProtected}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{copy.calendarDescription}</p>
              <ul className="mt-2 space-y-1" aria-label={copy.busy}>
                {busyIntervals.map((interval) => (
                  <li key={`${interval.startMinutes}-${interval.endMinutes}-${interval.title}`} className="text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      {interval.allDay
                        ? copy.allDayEvent
                        : `${formatTimeSlot(Math.floor(interval.startMinutes / 60), interval.startMinutes % 60, timeFormat)}–${formatTimeSlot(Math.floor(interval.endMinutes / 60), interval.endMinutes % 60, timeFormat)}`}
                    </span>
                    <span className="px-1.5 text-muted-foreground/50">·</span>
                    <span>{interval.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {generationMessage && blocks.length > 0 && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200" role="status">
          {generationMessage}
        </p>
      )}

      {/* Route timeline */}
      {blocks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              {copy.todayRoute}
            </p>
            <button
              onClick={() => setConfirmReroute(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] text-muted-foreground/60 hover:bg-foreground/[0.04] hover:text-emerald-500 transition-colors"
            >
              <Shuffle className="h-3 w-3" />
              {copy.reroute}
            </button>
          </div>

          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className={cn(
                'group rounded-xl border p-4 transition-all',
                BLOCK_COLORS[block.colorIndex % BLOCK_COLORS.length]
              )}
            >
              <div className="flex items-start justify-between mb-2.5">
                <div>
                  <p className="text-[13px] font-semibold">{block.label}</p>
                  <p className="text-[11px] opacity-60">
                    {formatTimeSlot(block.startHour, block.startMin, timeFormat)} ·{' '}
                    {block.durationMin}m · {block.taskIds.length} {block.taskIds.length === 1 ? copy.task : copy.tasks}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Reorder */}
                  <div className="flex opacity-70 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                    {idx > 0 && (
                      <button
                        onClick={() => handleMoveBlock(block.id, 'up')}
                        aria-label={interpolate(copy.moveEarlier, { label: block.label })}
                        title={interpolate(copy.moveEarlier, { label: block.label })}
                        className="grid h-11 w-11 place-items-center rounded-lg opacity-70 transition-all hover:bg-background/50 hover:opacity-100 focus-visible:opacity-100 lg:h-8 lg:w-8"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                    )}
                    {idx < blocks.length - 1 && (
                      <button
                        onClick={() => handleMoveBlock(block.id, 'down')}
                        aria-label={interpolate(copy.moveLater, { label: block.label })}
                        title={interpolate(copy.moveLater, { label: block.label })}
                        className="grid h-11 w-11 place-items-center rounded-lg opacity-70 transition-all hover:bg-background/50 hover:opacity-100 focus-visible:opacity-100 lg:h-8 lg:w-8"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* Fly — link to flight tool */}
                  <Link
                    href="/tools/flight"
                    onClick={(event) => {
                      try {
                        saveDispatchFlightHandoff(ownerScope, {
                          label: block.label,
                          durationMin: block.durationMin,
                          taskIds: block.taskIds,
                        });
                      } catch {
                        // Do not navigate to an empty Flight after a failed handoff.
                        event.preventDefault();
                      }
                    }}
                    aria-label={interpolate(copy.startFlight, { label: block.label })}
                    title={interpolate(copy.startFlight, { label: block.label })}
                    className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] opacity-70 transition-all hover:bg-background/50 hover:opacity-100 focus-visible:opacity-100 lg:min-h-8"
                  >
                    <Play className="h-3 w-3" />
                    {copy.fly}
                  </Link>
                  <button
                    onClick={() => handleRemoveBlock(block.id)}
                    aria-label={interpolate(copy.removeBlock, { label: block.label })}
                    title={interpolate(copy.removeBlock, { label: block.label })}
                    className="ml-1 grid h-11 w-11 place-items-center rounded-lg opacity-70 transition-all hover:bg-background/50 hover:opacity-100 focus-visible:opacity-100 lg:h-8 lg:w-8 lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {conflictingBlockIds.has(block.id) && (
                <p className="mb-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300" role="status">
                  {copy.routeConflict}
                </p>
              )}

              <div className="space-y-0.5">
                {block.taskIds.map((taskId) => {
                  const task = tasksById.get(taskId);
                  return (
                  <div
                    key={taskId}
                    className="group/task flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] opacity-80"
                  >
                    <span className="h-1 w-1 rounded-full bg-current shrink-0 opacity-40" />
                    <span className={cn('flex-1 truncate', !task && 'italic opacity-50')}>
                      {task?.title || copy.taskUnavailable}
                    </span>
                    {task?.priority && (
                      <span
                        className={cn(
                          'text-[11px] font-medium uppercase',
                          task.priority === 'high' && 'text-red-700 dark:text-red-300',
                          task.priority === 'medium' && 'text-amber-700 dark:text-amber-300'
                        )}
                      >
                        {task.priority === 'high' ? '!' : task.priority === 'medium' ? '·' : ''}
                      </span>
                    )}
                    <button
                      onClick={() =>
                        handleRemoveTaskFromBlock(block.id, taskId)
                      }
                      aria-label={interpolate(copy.removeTask, { task: task?.title || copy.taskUnavailable, label: block.label })}
                      title={interpolate(copy.removeTask, { task: task?.title || copy.taskUnavailable, label: block.label })}
                      className="grid h-11 w-11 place-items-center rounded-lg opacity-70 transition-all hover:bg-background/50 focus-visible:opacity-100 lg:h-8 lg:w-8 lg:opacity-0 lg:group-hover/task:opacity-100"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  );
                })}
              </div>

              {/* Add task to this block */}
              {addingToBlock === block.id ? (
                <div className="mt-2 rounded-lg border border-border/30 bg-background/50 p-2 max-h-[150px] overflow-y-auto">
                  {unscheduledTasks.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/30 text-center py-2">
                      {copy.allTasksScheduled}
                    </p>
                  ) : (
                    unscheduledTasks.slice(0, 8).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleAddTaskToBlock(block.id, task)}
                        className="w-full min-h-11 flex items-center gap-2 rounded px-2 py-1 text-[11px] text-left hover:bg-foreground/[0.04] transition-colors"
                      >
                        <Plus className="h-2.5 w-2.5 shrink-0 opacity-50" />
                        <span className="truncate">{task.title}</span>
                      </button>
                    ))
                  )}
                  <button
                    onClick={() => setAddingToBlock(null)}
                    aria-label={copy.closeTaskPicker}
                    className="w-full min-h-11 text-[11px] text-muted-foreground/60 mt-1 hover:text-foreground transition-colors"
                  >
                    {copy.close}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingToBlock(block.id)}
                  aria-label={interpolate(copy.addTaskTo, { label: block.label })}
                  className="mt-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground/60 opacity-70 transition-opacity hover:bg-background/40 hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Plus className="h-2.5 w-2.5" />
                  {copy.addTask}
                </button>
              )}
            </div>
          ))}

          {/* Unscheduled tasks */}
          {unscheduledTasks.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-2">
                {copy.unscheduled} ({unscheduledTasks.length})
              </p>
              <div className="space-y-0.5">
                {unscheduledTasks.slice(0, 12).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-muted-foreground/40"
                  >
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/20 shrink-0" />
                    <span className="truncate flex-1">{task.title}</span>
                    {task.dueDate && (
                      <span className="text-[10px] text-muted-foreground/20 font-mono">
                        {task.dueDate.slice(5)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmReroute}
        onOpenChange={setConfirmReroute}
        title={copy.replaceTitle}
        description={copy.replaceDescription}
        confirmLabel={copy.replace}
        onConfirm={applyGeneratedRoute}
      />
    </div>
  );
}
