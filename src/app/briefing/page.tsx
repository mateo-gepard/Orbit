'use client';

import { Suspense, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Flame,
  CalendarDays,
  CalendarRange,
  Target,
  Sparkles,
  ArrowRight,
  Trophy,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThreadmapStore } from '@/lib/store';
import {
  addDays,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { getLocale, getWeekStartsOn } from '@/lib/utils';
import { isHabitScheduledForDate, isHabitCompletedForDate, calculateStreak } from '@/lib/habits';
import { updateItem } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/components/providers/auth-provider';
import {
  createBriefingJournal,
  flushBriefingJournal,
  persistBriefingJournalDraft,
  saveBriefingJournal,
  subscribeToBriefingJournal,
  type BriefingJournal,
} from '@/lib/briefing';
import type { ThreadmapItem } from '@/lib/types';
import { toast } from 'sonner';
import { eventOccursOnDate } from '@/lib/dashboard';

type Phase = 'morning' | 'evening' | 'week';

interface PendingBriefingSave {
  revision: number;
  userId: string;
  journal: BriefingJournal;
}

function isOpenScheduledTask(item: ThreadmapItem) {
  return item.type === 'task' && item.status !== 'done' && item.status !== 'archived';
}

function useAlignedMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      const currentTime = Date.now();
      const delay = 60_000 - (currentTime % 60_000) + 25;
      timer = window.setTimeout(tick, delay);
    };
    const tick = () => {
      setNow(new Date());
      schedule();
    };
    const resync = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      tick();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resync();
    };

    schedule();
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', resync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return now;
}

export default function BriefingPage() {
  return (
    <Suspense fallback={<BriefingFallback />}>
      <BriefingContent />
    </Suspense>
  );
}

function BriefingFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground"
      aria-busy="true"
    >
      {t('briefing.loading')}
    </div>
  );
}

function BriefingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { items, setSelectedItemId } = useThreadmapStore();
  const { user } = useAuth();
  const { t, tp, lang } = useTranslation();
  const locale = getLocale(lang);
  const now = useAlignedMinuteClock();
  const weekStartSetting = useSettingsStore((state) => state.settings.weekStart);
  const weekStartsOn = getWeekStartsOn(weekStartSetting);

  // Auto-detect phase from URL or time of day
  const phase: Phase = useMemo(() => {
    const param = searchParams.get('type');
    if (param === 'morning' || param === 'evening' || param === 'week') return param;
    return now.getHours() < 16 ? 'morning' : 'evening';
  }, [now, searchParams]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const today = now;
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayStart = startOfDay(today).getTime();
  const todayEnd = startOfDay(addDays(today, 1)).getTime();
  const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn });
  const weekEnd = endOfWeek(today, { weekStartsOn });
  const weekKey = format(weekStart, 'yyyy-MM-dd');
  const ownerScope = user?.uid || 'demo-user';
  const activeJournalScope = `${ownerScope}:${todayStr}:${weekKey}`;
  const [journal, setJournal] = useState(() => createBriefingJournal(todayStr, weekKey));
  const [loadedJournalScope, setLoadedJournalScope] = useState<string | null>(null);
  const completePendingRef = useRef(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const journalRef = useRef(journal);
  const pendingSaveRef = useRef<PendingBriefingSave | null>(null);
  const saveRevisionRef = useRef(0);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const persistenceActiveRef = useRef(true);
  const flushPendingRef = useRef<() => Promise<void>>(async () => {});

  journalRef.current = journal;

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
        const outcome = await flushBriefingJournal(pending.userId, pending.journal);
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

  const queueBriefingSave = useCallback((nextJournal: BriefingJournal) => {
    const snapshot: BriefingJournal = {
      version: 2,
      daily: { ...nextJournal.daily, priorityIds: [...nextJournal.daily.priorityIds] },
      weekly: { ...nextJournal.weekly },
    };
    pendingSaveRef.current = {
      revision: ++saveRevisionRef.current,
      userId: ownerScope,
      journal: snapshot,
    };
    try {
      persistBriefingJournalDraft(ownerScope, snapshot);
    } catch {
      // Keep the draft dirty. The verified writer already raised the generic
      // durability warning and the scheduled flush can still commit to cloud.
    }
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => { void flushPendingRef.current(); }, 250);
  }, [ownerScope]);

  const commitJournal = useCallback((
    next: BriefingJournal | ((current: BriefingJournal) => BriefingJournal),
  ): BriefingJournal | null => {
    if (loadedJournalScope !== activeJournalScope) return null;
    const nextJournal = typeof next === 'function' ? next(journalRef.current) : next;
    journalRef.current = nextJournal;
    queueBriefingSave(nextJournal);
    setJournal(nextJournal);
    return nextJournal;
  }, [activeJournalScope, loadedJournalScope, queueBriefingSave]);

  useEffect(() => {
    let frame: number | null = null;
    let unsubscribe = () => {};
    // DataProvider establishes the active account context in its effect first.
    const timer = setTimeout(() => {
      unsubscribe = subscribeToBriefingJournal(ownerScope, todayStr, weekKey, (nextJournal) => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          journalRef.current = nextJournal;
          setJournal((current) => JSON.stringify(current) === JSON.stringify(nextJournal) ? current : nextJournal);
          setLoadedJournalScope(activeJournalScope);
        });
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
      void flushPendingRef.current();
    };
  }, [activeJournalScope, ownerScope, todayStr, weekKey]);

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

  const journalReady = loadedJournalScope === activeJournalScope
    && journal.daily.date === todayStr
    && journal.weekly.weekKey === weekKey;

  // ── Computed data ──
  const tasksDueToday = useMemo(() =>
    items.filter(i => isOpenScheduledTask(i) && i.dueDate === todayStr),
    [items, todayStr]
  );

  const tasksDueTodayIds = useMemo(() => new Set(tasksDueToday.map((task) => task.id)), [tasksDueToday]);

  const myDayTasks = useMemo(() =>
    items.filter(i => isOpenScheduledTask(i) && i.myDay === todayStr && !tasksDueTodayIds.has(i.id)),
    [items, todayStr, tasksDueTodayIds]
  );

  const overdue = useMemo(() =>
    items.filter(i => isOpenScheduledTask(i) && i.dueDate && i.dueDate < todayStr),
    [items, todayStr]
  );

  const eventsToday = useMemo(() =>
    items.filter(i => eventOccursOnDate(i, todayStr))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [items, todayStr]
  );

  const habitsToday = useMemo(() =>
    items.filter(i => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, todayStr]
  );

  const habitsCompleted = useMemo(() =>
    habitsToday.filter(h => isHabitCompletedForDate(h, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habitsToday, todayStr]
  );

  const completedToday = useMemo(() =>
    items.filter(i => i.type === 'task'
      && i.status === 'done'
      && i.completedAt
      && i.completedAt >= todayStart
      && i.completedAt < todayEnd),
    [items, todayStart, todayEnd]
  );

  const dueTomorrow = useMemo(() =>
    items.filter(i => isOpenScheduledTask(i) && i.dueDate === tomorrowStr),
    [items, tomorrowStr]
  );

  const eventsTomorrow = useMemo(() =>
    items.filter(i => eventOccursOnDate(i, tomorrowStr))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [items, tomorrowStr]
  );

  const activeGoals = useMemo(() =>
    items.filter(i => i.type === 'goal' && i.status === 'active'),
    [items]
  );

  const tasksDueThisWeek = useMemo(() =>
    items.filter((item) => {
      if (!isOpenScheduledTask(item) || !item.dueDate) return false;
      try {
        return isWithinInterval(parseISO(item.dueDate), { start: weekStart, end: weekEnd });
      } catch {
        return false;
      }
    }),
    [items, weekEnd, weekStart]
  );

  const completedThisWeek = useMemo(() =>
    items.filter((item) => item.status === 'done'
      && item.completedAt
      && item.completedAt >= weekStart.getTime()
      && item.completedAt <= weekEnd.getTime()),
    [items, weekEnd, weekStart]
  );

  const bestStreak = useMemo(() =>
    habitsToday.reduce((max, h) => Math.max(max, calculateStreak(h)), 0),
    [habitsToday]
  );

  const briefingCandidates = useMemo(() => {
    const unique = new Map<string, ThreadmapItem>();
    for (const task of [...overdue, ...tasksDueToday, ...myDayTasks, ...items.filter(isOpenScheduledTask)]) {
      if (!unique.has(task.id)) unique.set(task.id, task);
    }
    return [...unique.values()].slice(0, 12);
  }, [items, myDayTasks, overdue, tasksDueToday]);

  useEffect(() => {
    if (loadedJournalScope !== activeJournalScope) return;
    const activeIds = new Set(briefingCandidates.map((task) => task.id));
    const filteredIds = journal.daily.priorityIds.filter((id) => activeIds.has(id));
    if (filteredIds.length === journal.daily.priorityIds.length) return;
    const frame = requestAnimationFrame(() => {
      commitJournal((current) => ({
        ...current,
        daily: { ...current.daily, priorityIds: current.daily.priorityIds.filter((id) => activeIds.has(id)) },
      }));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeJournalScope, briefingCandidates, commitJournal, journal.daily.priorityIds, loadedJournalScope]);

  const focusedTasks = journal.daily.priorityIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is ThreadmapItem => Boolean(item));
  const topTask = focusedTasks[0]
    || tasksDueToday.find(t => t.priority === 'high')
    || myDayTasks.find(t => t.priority === 'high')
    || tasksDueToday[0]
    || myDayTasks[0];

  const togglePriority = (taskId: string) => {
    commitJournal((current) => {
      const activeIds = new Set(briefingCandidates.map((task) => task.id));
      const selected = current.daily.priorityIds.filter((id) => activeIds.has(id));
      const priorityIds = selected.includes(taskId)
        ? selected.filter((id) => id !== taskId)
        : selected.length < 3 ? [...selected, taskId] : selected;
      return { ...current, daily: { ...current.daily, priorityIds } };
    });
  };

  // ── Greeting ──
  const greeting = useMemo(() => {
    if (phase === 'week') {
      return t('briefing.greetingWeek');
    }
    const hour = now.getHours();
    if (phase === 'morning') {
      if (hour < 6) return t('briefing.greetingEarly');
      if (hour < 9) return t('briefing.greetingMorning');
      if (hour < 12) return t('briefing.greetingStart');
      return t('briefing.greetingAfternoon');
    }
    if (hour < 18) return t('briefing.greetingAfternoonCheck');
    if (hour < 21) return t('briefing.greetingEvening');
    return t('briefing.greetingDayEnd');
  }, [now, phase, t]);

  const dayLabel = format(today, 'EEEE, d MMMM', { locale });

  // ── Score calculation (evening) ──
  const totalScheduled = completedToday.length + tasksDueToday.length + myDayTasks.length;
  const completionScore = totalScheduled > 0 ? Math.round((completedToday.length / totalScheduled) * 100) : null;
  const habitScore = habitsToday.length > 0 ? Math.round((habitsCompleted.length / habitsToday.length) * 100) : null;

  const toggleHabit = async (habit: ThreadmapItem) => {
    const completions = { ...(habit.completions || {}) };
    completions[todayStr] = !completions[todayStr];
    try {
      await updateItem(habit.id, { completions });
    } catch {
      toast.error(t('briefing.habitUpdateError'));
    }
  };

  const completeBriefing = async () => {
    if (!journalReady || completePendingRef.current) return;
    completePendingRef.current = true;
    setIsCompleting(true);
    const completedAt = Date.now();
    const next = phase === 'morning'
      ? { ...journal, daily: { ...journal.daily, morningCompletedAt: completedAt } }
      : phase === 'evening'
        ? { ...journal, daily: { ...journal.daily, eveningCompletedAt: completedAt } }
        : { ...journal, weekly: { ...journal.weekly, completedAt } };
    try {
      commitJournal(next);
      await saveBriefingJournal(ownerScope, next);
      router.push('/');
    } catch {
      toast.error(t('briefing.saveError'));
    } finally {
      completePendingRef.current = false;
      setIsCompleting(false);
    }
  };

  // Never flash the previous date or account's journal while its replacement
  // subscription is loading.
  if (!journalReady) return <BriefingFallback />;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className={cn(
      'min-h-[100dvh] flex flex-col transition-transform duration-300 motion-reduce:transition-none',
      mounted ? 'translate-y-0' : 'translate-y-2',
      phase === 'morning'
        ? 'bg-gradient-to-b from-foreground/[0.045] via-background to-background dark:from-foreground/[0.045] dark:via-background dark:to-background'
        : phase === 'evening'
          ? 'bg-gradient-to-b from-foreground/[0.045] via-background to-background dark:from-foreground/[0.045] dark:via-background dark:to-background'
          : 'bg-gradient-to-b from-foreground/[0.045] via-background to-background dark:from-foreground/[0.045] dark:via-background dark:to-background',
    )}>
      <div className="flex-1 p-5 lg:p-10 max-w-xl mx-auto w-full space-y-6 lg:space-y-8 pb-10">

        {/* ── Hero Section ── */}
        <div className={cn(
          'pt-8 lg:pt-12 space-y-2 transition-transform duration-300 motion-reduce:transition-none',
          mounted ? 'translate-y-0' : 'translate-y-2',
        )}>
          <div className="flex items-center gap-2 text-muted-foreground/40">
            {phase === 'morning' ? (
              <Sun className="h-4 w-4 text-foreground/60" strokeWidth={1.5} />
            ) : phase === 'evening' ? (
              <Moon className="h-4 w-4 text-foreground/60" strokeWidth={1.5} />
            ) : (
              <CalendarRange className="h-4 w-4 text-foreground/60" strokeWidth={1.5} />
            )}
            <span className="text-[11px] uppercase tracking-[0.2em] font-medium">
              {phase === 'morning'
                ? t('briefing.morningTitle')
                : phase === 'evening'
                  ? t('briefing.eveningTitle')
                  : t('briefing.weekTitle')}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-[13px] text-muted-foreground/50">{dayLabel}</p>
        </div>

        <div className="grid grid-cols-3 rounded-xl bg-foreground/[0.035] p-1" role="group" aria-label={t('briefing.period')}>
          {([
            { id: 'morning' as const, label: t('briefing.morning'), icon: Sun },
            { id: 'evening' as const, label: t('briefing.evening'), icon: Moon },
            { id: 'week' as const, label: t('briefing.week'), icon: CalendarRange },
          ]).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => router.replace(`/briefing?type=${option.id}`)}
              aria-pressed={phase === option.id}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-medium transition-all',
                phase === option.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-foreground',
              )}
            >
              <option.icon className="h-3 w-3" />
              {option.label}
            </button>
          ))}
        </div>

        {phase === 'morning' ? (
          // ═══════════════════════════════════════════════════
          // MORNING BRIEFING
          // ═══════════════════════════════════════════════════
          <div className={cn(
            'space-y-5 transition-transform duration-300 motion-reduce:transition-none',
            mounted ? 'translate-y-0' : 'translate-y-2',
          )}>

            {/* Quick Stats Bar */}
            <div className="flex items-center gap-3">
              {[
                { n: tasksDueToday.length + myDayTasks.length, label: t('briefing.tasks'), color: 'text-foreground' },
                { n: eventsToday.length, label: t('briefing.events'), color: 'text-foreground' },
                { n: habitsToday.length, label: t('briefing.habits'), color: 'text-foreground' },
                ...(overdue.length > 0 ? [{ n: overdue.length, label: t('briefing.overdue'), color: 'text-red-500' }] : []),
              ].map(({ n, label, color }) => (
                <div key={label} className="flex-1 rounded-xl border border-border/40 bg-card/50 p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', color)}>{n}</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <BriefingCard
              icon={<Target className="h-3.5 w-3.5 text-foreground/60" />}
              title={t('briefing.todayFocus', { count: journal.daily.priorityIds.length })}
            >
              {briefingCandidates.length === 0 ? (
                <p className="px-1 py-2 text-[12px] text-muted-foreground/40">{t('briefing.noFocusTasks')}</p>
              ) : (
                <div className="space-y-0.5">
                  {briefingCandidates.map((task) => {
                    const selected = journal.daily.priorityIds.includes(task.id);
                    const disabled = !selected && journal.daily.priorityIds.length >= 3;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => togglePriority(task.id)}
                        disabled={disabled}
                        aria-pressed={selected}
                        className={cn(
                          'w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
                          selected ? 'bg-foreground/[0.055] text-foreground' : 'text-muted-foreground/55 hover:bg-foreground/[0.03]',
                          disabled && 'opacity-35 cursor-not-allowed',
                        )}
                      >
                        <span className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold',
                          selected ? 'border-foreground/10 bg-foreground/[0.055] text-white' : 'border-border/70',
                        )}>
                          {selected ? journal.daily.priorityIds.indexOf(task.id) + 1 : ''}
                        </span>
                        <span className="truncate">{task.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <textarea
                value={journal.daily.morningIntention}
                onChange={(event) => commitJournal((current) => ({
                  ...current,
                  daily: { ...current.daily, morningIntention: event.target.value },
                }))}
                maxLength={4000}
                rows={2}
                placeholder={t('briefing.intentionPlaceholder')}
                aria-label={t('briefing.intentionLabel')}
                className="mt-2 w-full resize-none rounded-lg border border-border/40 bg-transparent px-3 py-2 text-[12px] placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground/10"
              />
            </BriefingCard>

            {/* Top Priority */}
            {topTask && (
              <button
                type="button"
                onClick={() => setSelectedItemId(topTask.id)}
                className={cn(
                  'w-full rounded-2xl border p-4 text-left transition-all hover:shadow-sm',
                  phase === 'morning'
                    ? 'border-foreground/10 bg-foreground/[0.055] dark:border-foreground/10 dark:bg-foreground/[0.055]'
                    : 'border-border/40 bg-card/50',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap className="h-3.5 w-3.5 text-foreground/60" />
                  <span className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground/60 dark:text-foreground/60">
                    {t('briefing.topPriority')}
                  </span>
                </div>
                <p className="text-[14px] font-medium">{topTask.title}</p>
                {topTask.dueDate && (
                  <p className="text-[11px] text-muted-foreground/40 mt-1">
                    {t('briefing.due')}: {format(parseISO(topTask.dueDate), 'PP', { locale })}
                  </p>
                )}
              </button>
            )}

            {/* Schedule Timeline */}
            {eventsToday.length > 0 && (
              <BriefingCard
                icon={<CalendarDays className="h-3.5 w-3.5 text-foreground/60" />}
                title={t('briefing.todaySchedule')}
              >
                <div className="space-y-0">
                  {eventsToday.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedItemId(event.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-foreground/[0.02]"
                    >
                      <span className="text-[12px] text-muted-foreground/50 font-mono w-12 shrink-0 tabular-nums">
                        {event.startTime || '—'}
                      </span>
                      <div className="h-6 w-px bg-foreground/[0.055] shrink-0" />
                      <span className="text-[13px] truncate">{event.title}</span>
                    </button>
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Deadlines */}
            {(tasksDueToday.length > 0 || overdue.length > 0) && (
              <BriefingCard
                icon={<Clock className="h-3.5 w-3.5 text-foreground/60" />}
                title={t('briefing.deadlines')}
              >
                <div className="space-y-0">
                  {overdue.slice(0, 5).map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="overdue" locale={locale} />
                  ))}
                  {tasksDueToday.map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="due" locale={locale} />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* My Day Tasks */}
            {myDayTasks.length > 0 && (
              <BriefingCard
                icon={<Sun className="h-3.5 w-3.5 text-foreground/60" />}
                title={t('briefing.myDay')}
              >
                <div className="space-y-0">
                  {myDayTasks.map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" locale={locale} />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Habits */}
            {habitsToday.length > 0 && (
              <BriefingCard
                icon={<Flame className="h-3.5 w-3.5 text-foreground/60" />}
                title={`${t('briefing.habits')} · ${habitsCompleted.length}/${habitsToday.length}`}
              >
                <div className="space-y-0">
                  {habitsToday.map(habit => {
                    const done = isHabitCompletedForDate(habit, today);
                    const streak = calculateStreak(habit);
                    return (
                      <div
                        key={habit.id}
                        className="flex items-center gap-3 py-2 px-1"
                      >
                        <button
                          type="button"
                          onClick={() => toggleHabit(habit)}
                          aria-pressed={done}
                          aria-label={t(done ? 'briefing.markHabitIncomplete' : 'briefing.markHabitComplete', { title: habit.title })}
                          className={cn(
                            'h-5 w-5 rounded-md border-[1.5px] flex items-center justify-center shrink-0 transition-all',
                            'before:absolute before:inset-[-6px] relative',
                            done ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-foreground/15 hover:border-foreground/30'
                          )}
                        >
                          {done && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                        </button>
                        <span className={cn('text-[13px] flex-1', done && 'line-through text-muted-foreground/40')}>
                          {habit.title}
                        </span>
                        {streak > 0 && (
                          <span className="text-[11px] text-muted-foreground/40 tabular-nums flex items-center gap-0.5">
                            <Flame className="h-3 w-3 text-foreground/60" />
                            {streak}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </BriefingCard>
            )}

            {/* Goals */}
            {activeGoals.length > 0 && (
              <BriefingCard
                icon={<Target className="h-3.5 w-3.5 text-foreground/60" />}
                title={t('briefing.activeGoals')}
              >
                <div className="space-y-0">
                  {activeGoals.slice(0, 4).map(goal => (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setSelectedItemId(goal.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-foreground/[0.02]"
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/[0.055] shrink-0" />
                      <span className="text-[13px] truncate flex-1">{goal.title}</span>
                      {goal.timeframe && (
                        <span className="text-[10px] text-muted-foreground/30">{t(`timeframe.${goal.timeframe}`)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Empty State */}
            {tasksDueToday.length === 0 && myDayTasks.length === 0 && eventsToday.length === 0 && overdue.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-[14px] font-medium text-muted-foreground/50">
                  {t('briefing.emptyTitle')}
                </p>
                <p className="text-[12px] text-muted-foreground/30 mt-1">
                  {t('briefing.emptyDescription')}
                </p>
              </div>
            )}
          </div>
        ) : phase === 'evening' ? (
          // ═══════════════════════════════════════════════════
          // EVENING BRIEFING
          // ═══════════════════════════════════════════════════
          <div className={cn(
            'space-y-5 transition-transform duration-300 motion-reduce:transition-none',
            mounted ? 'translate-y-0' : 'translate-y-2',
          )}>

            {/* Score Cards */}
            <div className="grid grid-cols-2 gap-3">
              <ScoreCard
                label={t('briefing.tasksDone')}
                value={completedToday.length}
                subtitle={totalScheduled > 0 ? t('briefing.ofCount', { count: totalScheduled }) : undefined}
                score={completionScore}
                icon={<Trophy className="h-4 w-4 text-foreground/60" />}
              />
              <ScoreCard
                label={t('briefing.habits')}
                value={habitsCompleted.length}
                subtitle={habitsToday.length > 0 ? t('briefing.ofCount', { count: habitsToday.length }) : undefined}
                score={habitScore}
                icon={<Flame className="h-4 w-4 text-foreground/60" />}
              />
            </div>

            {/* Streak Highlight */}
            {bestStreak >= 3 && (
              <div className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.055] dark:border-foreground/10 dark:bg-foreground/[0.055] p-4">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-foreground/[0.055]">
                  <Flame className="h-5 w-5 text-foreground/60" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold">
                    {tp('briefing.streak.one', 'briefing.streak.other', bestStreak)}
                  </p>
                  <p className="text-[11px] text-muted-foreground/40">{t('briefing.keepMomentum')}</p>
                </div>
              </div>
            )}

            {/* Today's Wins */}
            {completedToday.length > 0 && (
              <BriefingCard
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                title={t('briefing.completedTitle', { count: completedToday.length })}
              >
                <div className="space-y-0">
                  {completedToday.slice(0, 8).map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-1.5 px-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/50 shrink-0" />
                      <span className="text-[13px] text-muted-foreground/60 line-through truncate">{item.title}</span>
                    </div>
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Unfinished */}
            {(tasksDueToday.length > 0 || myDayTasks.length > 0) && (
              <BriefingCard
                icon={<AlertTriangle className="h-3.5 w-3.5 text-foreground/60" />}
                title={t('briefing.carriedOverTitle', { count: tasksDueToday.length + myDayTasks.length })}
              >
                <div className="space-y-0">
                  {[...tasksDueToday, ...myDayTasks].slice(0, 6).map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" locale={locale} />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Habits Recap */}
            {habitsToday.length > 0 && (
              <BriefingCard
                icon={<Flame className="h-3.5 w-3.5 text-foreground/60" />}
                title={`${t('briefing.habits')} · ${habitsCompleted.length}/${habitsToday.length}`}
              >
                <div className="space-y-0">
                  {habitsToday.map(habit => {
                    const done = isHabitCompletedForDate(habit, today);
                    return (
                      <div key={habit.id} className="flex items-center gap-3 py-1.5 px-1">
                        <div className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          done ? 'bg-emerald-500' : 'bg-red-400/40'
                        )} />
                        <span className={cn('text-[13px] truncate', done ? 'text-muted-foreground/50 line-through' : 'text-red-400/70')}>
                          {habit.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </BriefingCard>
            )}

            {/* Tomorrow Preview */}
            {(dueTomorrow.length > 0 || eventsTomorrow.length > 0) && (
              <BriefingCard
                icon={<TrendingUp className="h-3.5 w-3.5 text-foreground/60" />}
                title={t('briefing.tomorrow')}
              >
                <div className="space-y-0">
                  {eventsTomorrow.slice(0, 3).map(event => (
                    <div key={event.id} className="flex items-center gap-3 py-1.5 px-1">
                      <CalendarDays className="h-3 w-3 text-foreground/60 shrink-0" />
                      <span className="text-[13px] truncate">{event.title}</span>
                      {event.startTime && (
                        <span className="text-[11px] text-muted-foreground/30 ml-auto shrink-0">{event.startTime}</span>
                      )}
                    </div>
                  ))}
                  {dueTomorrow.slice(0, 4).map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" locale={locale} />
                  ))}
                </div>
              </BriefingCard>
            )}

            <div>
              <label htmlFor="evening-reflection" className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                {t('briefing.reflection')}
              </label>
              <textarea
                id="evening-reflection"
                value={journal.daily.eveningReflection}
                onChange={(event) => commitJournal((current) => ({
                  ...current,
                  daily: { ...current.daily, eveningReflection: event.target.value },
                }))}
                maxLength={4000}
                rows={3}
                placeholder={t('briefing.reflectionPlaceholder')}
                className="mt-1.5 w-full resize-none rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-foreground/10"
              />
              {journal.daily.eveningCompletedAt && (
                <p className="mt-1 text-[10px] text-emerald-600/70">{t('briefing.savedToday')}</p>
              )}
            </div>

            {/* Evening Verdict */}
            <div className={cn(
              'text-center py-6 transition-transform duration-300 motion-reduce:transition-none',
              mounted ? 'translate-y-0' : 'translate-y-2',
            )}>
              {completionScore !== null && completionScore >= 80 ? (
                <>
                  <Trophy className="h-8 w-8 mx-auto text-foreground/60 mb-3" />
                  <p className="text-[15px] font-semibold text-foreground/80">
                    {t('briefing.outstandingTitle')}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {t('briefing.outstandingDescription')}
                  </p>
                </>
              ) : completionScore !== null && completionScore >= 50 ? (
                <>
                  <TrendingUp className="h-8 w-8 mx-auto text-foreground/60 mb-3" />
                  <p className="text-[15px] font-semibold text-foreground/80">
                    {t('briefing.solidTitle')}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {t('briefing.solidDescription')}
                  </p>
                </>
              ) : (
                <>
                  <Moon className="h-8 w-8 mx-auto text-foreground/60 mb-3" />
                  <p className="text-[15px] font-semibold text-foreground/80">
                    {t('briefing.restTitle')}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {t('briefing.restDescription')}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={cn(
            'space-y-5 transition-transform duration-300 motion-reduce:transition-none',
            mounted ? 'translate-y-0' : 'translate-y-2',
          )}>
            <div className="grid grid-cols-3 gap-3">
              <ScoreCard
                label={t('briefing.completedThisWeek')}
                value={completedThisWeek.length}
                score={null}
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              />
              <ScoreCard
                label={t('briefing.dueThisWeek')}
                value={tasksDueThisWeek.length}
                score={null}
                icon={<Clock className="h-4 w-4 text-foreground/60" />}
              />
              <ScoreCard
                label={t('briefing.activeGoals')}
                value={activeGoals.length}
                score={null}
                icon={<Target className="h-4 w-4 text-foreground/60" />}
              />
            </div>

            <BriefingCard
              icon={<CalendarRange className="h-3.5 w-3.5 text-foreground/60" />}
              title={`${format(weekStart, 'd MMM', { locale })} – ${format(weekEnd, 'd MMM', { locale })}`}
            >
              {tasksDueThisWeek.length === 0 ? (
                <p className="px-1 py-2 text-[12px] text-muted-foreground/40">{t('briefing.nothingDueThisWeek')}</p>
              ) : tasksDueThisWeek.slice(0, 12).map((task) => (
                <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" locale={locale} />
              ))}
            </BriefingCard>

            {activeGoals.length > 0 && (
              <BriefingCard icon={<Target className="h-3.5 w-3.5 text-foreground/60" />} title={t('briefing.goalsInView')}>
                {activeGoals.slice(0, 6).map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => setSelectedItemId(goal.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-[13px] hover:bg-foreground/[0.02]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/[0.055]" />
                    <span className="truncate">{goal.title}</span>
                  </button>
                ))}
              </BriefingCard>
            )}

            <div>
              <label htmlFor="week-focus" className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                {t('briefing.weeklyAnchor')}
              </label>
              <textarea
                id="week-focus"
                value={journal.weekly.focus}
                onChange={(event) => commitJournal((current) => ({
                  ...current,
                  weekly: { ...current.weekly, focus: event.target.value },
                }))}
                maxLength={4000}
                rows={3}
                placeholder={t('briefing.weeklyAnchorPlaceholder')}
                className="mt-1.5 w-full resize-none rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-foreground/10"
              />
              {journal.weekly.completedAt && (
                <p className="mt-1 text-[10px] text-emerald-600/70">{t('briefing.savedWeek')}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Action Bar ── */}
        <div className={cn(
          'space-y-3 transition-transform duration-300 motion-reduce:transition-none',
          mounted ? 'translate-y-0' : 'translate-y-2',
        )}>
          <button
            type="button"
            onClick={completeBriefing}
            disabled={!journalReady || isCompleting}
            aria-busy={isCompleting}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-transparent bg-foreground py-3.5 text-[14px] font-semibold text-background transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-foreground"
          >
            {phase === 'morning'
              ? t('briefing.saveStartDay')
              : phase === 'evening'
                ? t('briefing.saveCloseDay')
                : t('briefing.saveWeekPlan')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════

function BriefingCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground/50">{title}</span>
      </div>
      <div className="px-3 pb-3">
        {children}
      </div>
    </div>
  );
}

function TaskItem({ task, onClick, variant, locale }: {
  task: ThreadmapItem;
  onClick: () => void;
  variant: 'overdue' | 'due' | 'normal';
  locale: Locale;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-foreground/[0.02]"
    >
      <div className={cn(
        'h-1.5 w-1.5 rounded-full shrink-0',
        variant === 'overdue' ? 'bg-red-500' :
        variant === 'due' ? 'bg-foreground/[0.055]' :
        task.priority === 'high' ? 'bg-red-400' :
        task.priority === 'medium' ? 'bg-foreground/[0.055]' : 'bg-foreground/15'
      )} />
      <span className={cn(
        'text-[13px] truncate flex-1',
        variant === 'overdue' && 'text-red-500/80'
      )}>{task.title}</span>
      {task.dueDate && variant !== 'due' && (
        <span className={cn(
          'text-[10px] shrink-0',
          variant === 'overdue' ? 'text-red-400/50' : 'text-muted-foreground/30'
        )}>
          {format(parseISO(task.dueDate), 'PP', { locale })}
        </span>
      )}
    </button>
  );
}

function ScoreCard({ label, value, subtitle, score, icon }: {
  label: string;
  value: number;
  subtitle?: string;
  score: number | null;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4 text-center">
      <div className="flex items-center justify-center mb-2">{icon}</div>
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground/30">{subtitle}</span>}
      </div>
      <p className="text-[10px] text-muted-foreground/40 mt-0.5">{label}</p>
      {score !== null && (
        <div className="mt-2 mx-auto w-full max-w-[80px]">
          <div className="h-1 rounded-full bg-foreground/5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-1000',
                score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-foreground/[0.055]' : 'bg-red-400'
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
