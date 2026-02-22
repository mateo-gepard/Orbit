'use client';

import { Suspense, useMemo, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Flame,
  ChevronRight,
  CalendarDays,
  Target,
  Sparkles,
  ArrowRight,
  Trophy,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import {
  format,
  isToday,
  isTomorrow,
  parseISO,
  isPast,
} from 'date-fns';
import { getLocale } from '@/lib/utils';
import { isHabitScheduledForDate, isHabitCompletedForDate, calculateStreak } from '@/lib/habits';
import { updateItem } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';
import { useTranslation } from '@/lib/i18n';
import type { OrbitItem } from '@/lib/types';

type Phase = 'morning' | 'evening';

export default function BriefingPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-background" />}>
      <BriefingContent />
    </Suspense>
  );
}

function BriefingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { items, setSelectedItemId } = useOrbitStore();
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const { settings } = useSettingsStore();
  const hockeyMode = settings.hockeyMode && settings.language === 'de';

  // Auto-detect phase from URL or time of day
  const phase: Phase = useMemo(() => {
    const param = searchParams.get('type');
    if (param === 'morning' || param === 'evening') return param;
    return new Date().getHours() < 16 ? 'morning' : 'evening';
  }, [searchParams]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEnd = todayStart + 86400000;
  const tomorrowStr = format(new Date(todayStart + 86400000), 'yyyy-MM-dd');

  // ── Computed data ──
  const tasksDueToday = useMemo(() =>
    items.filter(i => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate === todayStr),
    [items, todayStr]
  );

  const myDayTasks = useMemo(() =>
    items.filter(i => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.myDay === todayStr),
    [items, todayStr]
  );

  const overdue = useMemo(() =>
    items.filter(i => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate && i.dueDate < todayStr),
    [items, todayStr]
  );

  const eventsToday = useMemo(() =>
    items.filter(i => i.type === 'event' && i.status !== 'archived' && i.startDate === todayStr)
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
    items.filter(i => i.status === 'done' && i.completedAt && i.completedAt >= todayStart && i.completedAt < todayEnd),
    [items, todayStart, todayEnd]
  );

  const dueTomorrow = useMemo(() =>
    items.filter(i => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate === tomorrowStr),
    [items, tomorrowStr]
  );

  const eventsTomorrow = useMemo(() =>
    items.filter(i => i.type === 'event' && i.status !== 'archived' && i.startDate === tomorrowStr),
    [items, tomorrowStr]
  );

  const activeGoals = useMemo(() =>
    items.filter(i => i.type === 'goal' && i.status === 'active'),
    [items]
  );

  const bestStreak = useMemo(() =>
    habitsToday.reduce((max, h) => Math.max(max, calculateStreak(h)), 0),
    [habitsToday]
  );

  const topTask = tasksDueToday.find(t => t.priority === 'high') || myDayTasks.find(t => t.priority === 'high') || tasksDueToday[0] || myDayTasks[0];

  // ── Greeting ──
  const greeting = useMemo(() => {
    if (hockeyMode) {
      return phase === 'morning'
        ? ['Aufwärmen, Dr.! 🏒', 'Anpfiff!', 'Spieltag, Dr.!', 'Los geht\'s!'][Math.floor(Math.random() * 4)]
        : ['Schlusspfiff! 🏒', 'Abpfiff.', 'Das Spiel ist aus.', 'Feierabend, Dr.'][Math.floor(Math.random() * 4)];
    }
    const hour = today.getHours();
    if (phase === 'morning') {
      if (hour < 6) return 'Early bird.';
      if (hour < 9) return 'Good morning.';
      if (hour < 12) return 'Let\'s get to it.';
      return 'Good afternoon.';
    }
    if (hour < 18) return 'Afternoon check-in.';
    if (hour < 21) return 'Evening reflection.';
    return 'Day\'s end.';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hockeyMode]);

  const dayLabel = format(today, 'EEEE, d MMMM', { locale });

  // ── Score calculation (evening) ──
  const totalScheduled = completedToday.length + tasksDueToday.length + myDayTasks.length;
  const completionScore = totalScheduled > 0 ? Math.round((completedToday.length / totalScheduled) * 100) : null;
  const habitScore = habitsToday.length > 0 ? Math.round((habitsCompleted.length / habitsToday.length) * 100) : null;

  const toggleHabit = async (habit: OrbitItem) => {
    const completions = { ...(habit.completions || {}) };
    completions[todayStr] = !completions[todayStr];
    await updateItem(habit.id, { completions });
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className={cn(
      'min-h-[100dvh] flex flex-col transition-all duration-700',
      mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      phase === 'morning'
        ? 'bg-gradient-to-b from-amber-50/50 via-background to-background dark:from-amber-950/20 dark:via-background dark:to-background'
        : 'bg-gradient-to-b from-indigo-50/50 via-background to-background dark:from-indigo-950/20 dark:via-background dark:to-background',
    )}>
      <div className="flex-1 p-5 lg:p-10 max-w-xl mx-auto w-full space-y-6 lg:space-y-8 pb-10">

        {/* ── Hero Section ── */}
        <div className={cn(
          'pt-8 lg:pt-12 space-y-2 transition-all duration-1000 delay-100',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        )}>
          <div className="flex items-center gap-2 text-muted-foreground/40">
            {phase === 'morning' ? (
              <Sun className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
            ) : (
              <Moon className="h-4 w-4 text-indigo-400" strokeWidth={1.5} />
            )}
            <span className="text-[11px] uppercase tracking-[0.2em] font-medium">
              {phase === 'morning' ? (hockeyMode ? 'Morgenbriefing' : 'Morning Briefing') : (hockeyMode ? 'Abendbriefing' : 'Evening Briefing')}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-[13px] text-muted-foreground/50">{dayLabel}</p>
        </div>

        {phase === 'morning' ? (
          // ═══════════════════════════════════════════════════
          // MORNING BRIEFING
          // ═══════════════════════════════════════════════════
          <div className={cn(
            'space-y-5 transition-all duration-1000 delay-200',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
          )}>

            {/* Quick Stats Bar */}
            <div className="flex items-center gap-3">
              {[
                { n: tasksDueToday.length + myDayTasks.length, label: hockeyMode ? 'Spielzüge' : 'Tasks', color: 'text-foreground' },
                { n: eventsToday.length, label: hockeyMode ? 'Anpfiffe' : 'Events', color: 'text-foreground' },
                { n: habitsToday.length, label: hockeyMode ? 'Training' : 'Habits', color: 'text-foreground' },
                ...(overdue.length > 0 ? [{ n: overdue.length, label: hockeyMode ? 'Überfällig' : 'Overdue', color: 'text-red-500' }] : []),
              ].map(({ n, label, color }) => (
                <div key={label} className="flex-1 rounded-xl border border-border/40 bg-card/50 p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', color)}>{n}</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Top Priority */}
            {topTask && (
              <div
                onClick={() => setSelectedItemId(topTask.id)}
                className={cn(
                  'rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-sm',
                  phase === 'morning'
                    ? 'border-amber-200/50 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/10'
                    : 'border-border/40 bg-card/50',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] uppercase tracking-[0.15em] font-medium text-amber-600 dark:text-amber-400">
                    {hockeyMode ? 'Notfall-Spielzug' : 'Top Priority'}
                  </span>
                </div>
                <p className="text-[14px] font-medium">{topTask.title}</p>
                {topTask.dueDate && (
                  <p className="text-[11px] text-muted-foreground/40 mt-1">
                    {hockeyMode ? 'Fällig' : 'Due'}: {format(parseISO(topTask.dueDate), 'd MMM', { locale })}
                  </p>
                )}
              </div>
            )}

            {/* Schedule Timeline */}
            {eventsToday.length > 0 && (
              <BriefingCard
                icon={<CalendarDays className="h-3.5 w-3.5 text-blue-400" />}
                title={hockeyMode ? 'Spielplan' : 'Today\'s Schedule'}
              >
                <div className="space-y-0">
                  {eventsToday.map(event => (
                    <div
                      key={event.id}
                      onClick={() => setSelectedItemId(event.id)}
                      className="flex items-center gap-3 py-2 px-1 cursor-pointer rounded-lg hover:bg-foreground/[0.02] transition-colors"
                    >
                      <span className="text-[12px] text-muted-foreground/50 font-mono w-12 shrink-0 tabular-nums">
                        {event.startTime || '—'}
                      </span>
                      <div className="h-6 w-px bg-blue-400/20 shrink-0" />
                      <span className="text-[13px] truncate">{event.title}</span>
                    </div>
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Deadlines */}
            {(tasksDueToday.length > 0 || overdue.length > 0) && (
              <BriefingCard
                icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
                title={hockeyMode ? 'Deadlines' : 'Deadlines'}
              >
                <div className="space-y-0">
                  {overdue.slice(0, 5).map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="overdue" />
                  ))}
                  {tasksDueToday.map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="due" />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* My Day Tasks */}
            {myDayTasks.length > 0 && (
              <BriefingCard
                icon={<Sun className="h-3.5 w-3.5 text-amber-500" />}
                title={hockeyMode ? 'Mein Spieltag' : 'My Day'}
              >
                <div className="space-y-0">
                  {myDayTasks.map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Habits */}
            {habitsToday.length > 0 && (
              <BriefingCard
                icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
                title={`${hockeyMode ? 'Training' : 'Habits'} · ${habitsCompleted.length}/${habitsToday.length}`}
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
                          onClick={() => toggleHabit(habit)}
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
                            <Flame className="h-3 w-3 text-orange-400/60" />
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
                icon={<Target className="h-3.5 w-3.5 text-purple-400" />}
                title={hockeyMode ? 'Saisonziele' : 'Active Goals'}
              >
                <div className="space-y-0">
                  {activeGoals.slice(0, 4).map(goal => (
                    <div
                      key={goal.id}
                      onClick={() => setSelectedItemId(goal.id)}
                      className="flex items-center gap-3 py-2 px-1 cursor-pointer rounded-lg hover:bg-foreground/[0.02] transition-colors"
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-400/50 shrink-0" />
                      <span className="text-[13px] truncate flex-1">{goal.title}</span>
                      {goal.timeframe && (
                        <span className="text-[10px] text-muted-foreground/30">{goal.timeframe}</span>
                      )}
                    </div>
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Empty State */}
            {tasksDueToday.length === 0 && myDayTasks.length === 0 && eventsToday.length === 0 && overdue.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-[14px] font-medium text-muted-foreground/50">
                  {hockeyMode ? 'Spielfrei — plane deine Züge, Dr.' : 'Clear runway ahead.'}
                </p>
                <p className="text-[12px] text-muted-foreground/30 mt-1">
                  {hockeyMode ? 'Drücke ⌘K für einen neuen Spielzug.' : 'Press ⌘K to plan your day.'}
                </p>
              </div>
            )}
          </div>
        ) : (
          // ═══════════════════════════════════════════════════
          // EVENING BRIEFING
          // ═══════════════════════════════════════════════════
          <div className={cn(
            'space-y-5 transition-all duration-1000 delay-200',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
          )}>

            {/* Score Cards */}
            <div className="grid grid-cols-2 gap-3">
              <ScoreCard
                label={hockeyMode ? 'Tore' : 'Tasks Done'}
                value={completedToday.length}
                subtitle={totalScheduled > 0 ? `of ${totalScheduled}` : undefined}
                score={completionScore}
                icon={<Trophy className="h-4 w-4 text-amber-500" />}
              />
              <ScoreCard
                label={hockeyMode ? 'Training' : 'Habits'}
                value={habitsCompleted.length}
                subtitle={habitsToday.length > 0 ? `of ${habitsToday.length}` : undefined}
                score={habitScore}
                icon={<Flame className="h-4 w-4 text-orange-400" />}
              />
            </div>

            {/* Streak Highlight */}
            {bestStreak >= 3 && (
              <div className="flex items-center gap-3 rounded-2xl border border-orange-200/40 bg-orange-50/20 dark:border-orange-900/20 dark:bg-orange-950/10 p-4">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-500/10">
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold">{bestStreak} {hockeyMode ? 'Tage Siegesserie' : 'day streak'}</p>
                  <p className="text-[11px] text-muted-foreground/40">{hockeyMode ? 'Weiter so, Dr.!' : 'Keep the momentum going.'}</p>
                </div>
              </div>
            )}

            {/* Today's Wins */}
            {completedToday.length > 0 && (
              <BriefingCard
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                title={`${hockeyMode ? 'Geschossene Tore' : 'Completed'} · ${completedToday.length}`}
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
                icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                title={`${hockeyMode ? 'Noch auf dem Platz' : 'Carried Over'} · ${tasksDueToday.length + myDayTasks.length}`}
              >
                <div className="space-y-0">
                  {[...tasksDueToday, ...myDayTasks].slice(0, 6).map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Habits Recap */}
            {habitsToday.length > 0 && (
              <BriefingCard
                icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
                title={`${hockeyMode ? 'Training' : 'Habits'} · ${habitsCompleted.length}/${habitsToday.length}`}
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
                icon={<TrendingUp className="h-3.5 w-3.5 text-blue-400" />}
                title={hockeyMode ? 'Nächstes Spiel' : 'Tomorrow'}
              >
                <div className="space-y-0">
                  {eventsTomorrow.slice(0, 3).map(event => (
                    <div key={event.id} className="flex items-center gap-3 py-1.5 px-1">
                      <CalendarDays className="h-3 w-3 text-blue-400/50 shrink-0" />
                      <span className="text-[13px] truncate">{event.title}</span>
                      {event.startTime && (
                        <span className="text-[11px] text-muted-foreground/30 ml-auto shrink-0">{event.startTime}</span>
                      )}
                    </div>
                  ))}
                  {dueTomorrow.slice(0, 4).map(task => (
                    <TaskItem key={task.id} task={task} onClick={() => setSelectedItemId(task.id)} variant="normal" />
                  ))}
                </div>
              </BriefingCard>
            )}

            {/* Evening Verdict */}
            <div className={cn(
              'text-center py-6 transition-all duration-1000 delay-500',
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
            )}>
              {completionScore !== null && completionScore >= 80 ? (
                <>
                  <Trophy className="h-8 w-8 mx-auto text-amber-500/40 mb-3" />
                  <p className="text-[15px] font-semibold text-foreground/80">
                    {hockeyMode ? 'Starkes Spiel, Dr. 🏆' : 'Outstanding day.'}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {hockeyMode ? 'Du hast es verdient — Feierabend!' : 'You\'ve earned your rest.'}
                  </p>
                </>
              ) : completionScore !== null && completionScore >= 50 ? (
                <>
                  <TrendingUp className="h-8 w-8 mx-auto text-blue-400/40 mb-3" />
                  <p className="text-[15px] font-semibold text-foreground/80">
                    {hockeyMode ? 'Solide Leistung.' : 'Solid progress.'}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {hockeyMode ? 'Morgen geht\'s weiter.' : 'Tomorrow\'s another chance.'}
                  </p>
                </>
              ) : (
                <>
                  <Moon className="h-8 w-8 mx-auto text-indigo-400/30 mb-3" />
                  <p className="text-[15px] font-semibold text-foreground/80">
                    {hockeyMode ? 'Ruh dich aus, Dr.' : 'Rest well.'}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {hockeyMode ? 'Morgen ist ein neues Spiel.' : 'Fresh start tomorrow.'}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Action Bar ── */}
        <div className={cn(
          'space-y-3 transition-all duration-1000 delay-300',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
        )}>
          <button
            onClick={() => router.push('/today')}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
          >
            {phase === 'morning' ? (hockeyMode ? 'Ab aufs Spielfeld' : 'Start My Day') : (hockeyMode ? 'Gute Nacht, Dr.' : 'Good Night')}
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

function TaskItem({ task, onClick, variant }: { task: OrbitItem; onClick: () => void; variant: 'overdue' | 'due' | 'normal' }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 py-2 px-1 cursor-pointer rounded-lg hover:bg-foreground/[0.02] transition-colors"
    >
      <div className={cn(
        'h-1.5 w-1.5 rounded-full shrink-0',
        variant === 'overdue' ? 'bg-red-500' :
        variant === 'due' ? 'bg-amber-500' :
        task.priority === 'high' ? 'bg-red-400' :
        task.priority === 'medium' ? 'bg-amber-400' : 'bg-foreground/15'
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
          {format(parseISO(task.dueDate), 'd MMM')}
        </span>
      )}
    </div>
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
                score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-400'
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
