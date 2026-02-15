'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileBarChart,
  Sun,
  Moon,
  Calendar,
  Target,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import {
  format,
  isToday,
  isTomorrow,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from 'date-fns';
import type { OrbitItem } from '@/lib/types';

type BriefType = null | 'day' | 'week';
type DayPhase = 'morning' | 'evening';

export default function BriefingPage() {
  const { items } = useOrbitStore();
  const [briefType, setBriefType] = useState<BriefType>(null);
  const [dayPhase, setDayPhase] = useState<DayPhase>('morning');
  const [priorities, setPriorities] = useState<string[]>([]);
  const [reflection, setReflection] = useState('');
  const [weekFocus, setWeekFocus] = useState('');

  // Stable date references (won't change between renders)
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const todayDate = useMemo(() => new Date(), []);

  // ── Computed data ──

  const activeTasks = useMemo(
    () => items.filter((i) => i.type === 'task' && i.status === 'active'),
    [items]
  );

  const todayDue = useMemo(
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

  const tomorrowDue = useMemo(
    () =>
      activeTasks.filter((i) => {
        if (!i.dueDate) return false;
        try {
          return isTomorrow(parseISO(i.dueDate));
        } catch {
          return false;
        }
      }),
    [activeTasks]
  );

  const overdue = useMemo(
    () =>
      activeTasks.filter((i) => {
        if (!i.dueDate) return false;
        try {
          const dueDate = parseISO(i.dueDate);
          return dueDate < todayDate && !isToday(dueDate);
        } catch {
          return false;
        }
      }),
    [activeTasks, todayDate]
  );

  const completedToday = useMemo(
    () =>
      items.filter(
        (i) =>
          i.status === 'done' &&
          i.completedAt &&
          isToday(new Date(i.completedAt))
      ),
    [items]
  );

  const weekInterval = useMemo(
    () => ({
      start: startOfWeek(todayDate, { weekStartsOn: 1 }),
      end: endOfWeek(todayDate, { weekStartsOn: 1 }),
    }),
    [todayDate]
  );

  const thisWeekDue = useMemo(
    () =>
      activeTasks.filter((i) => {
        if (!i.dueDate) return false;
        try {
          return isWithinInterval(parseISO(i.dueDate), weekInterval);
        } catch {
          return false;
        }
      }),
    [activeTasks, weekInterval]
  );

  const completedThisWeek = useMemo(
    () =>
      items.filter(
        (i) =>
          i.status === 'done' &&
          i.completedAt &&
          isWithinInterval(new Date(i.completedAt), weekInterval)
      ),
    [items, weekInterval]
  );

  const activeGoals = useMemo(
    () => items.filter((i) => i.type === 'goal' && i.status === 'active'),
    [items]
  );

  const todayEvents = useMemo(
    () =>
      items.filter((i) => {
        if (i.type !== 'event' || i.status === 'archived') return false;
        if (i.startDate) {
          try {
            return isToday(parseISO(i.startDate));
          } catch {
            return false;
          }
        }
        return false;
      }),
    [items]
  );

  const habits = useMemo(
    () => items.filter((i) => i.type === 'habit' && i.status === 'active'),
    [items]
  );

  const habitsCompletedToday = useMemo(
    () => habits.filter((h) => h.completions?.[todayStr]),
    [habits, todayStr]
  );

  const handleTogglePriority = (taskId: string) => {
    setPriorities((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : prev.length < 3
          ? [...prev, taskId]
          : prev
    );
  };

  // ── Entry screen ──

  if (!briefType) {
    const hour = todayDate.getHours();
    const greeting =
      hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <FileBarChart className="h-5 w-5 text-amber-500" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Briefing</h1>
        </div>

        <p className="text-[13px] text-muted-foreground/50">
          {greeting}. Start your day with clarity or wrap it up with reflection.
        </p>

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground/40">
          <span>{activeTasks.length} active tasks</span>
          <span className="text-muted-foreground/20">·</span>
          <span>{todayDue.length} due today</span>
          {overdue.length > 0 && (
            <>
              <span className="text-muted-foreground/20">·</span>
              <span className="text-red-400/70">{overdue.length} overdue</span>
            </>
          )}
          <span className="text-muted-foreground/20">·</span>
          <span>{completedToday.length} done today</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setBriefType('day')}
            className="text-left rounded-2xl border border-border/50 p-5 hover:border-amber-500/30 hover:bg-amber-500/[0.03] transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sun className="h-4 w-4 text-amber-500" />
              <p className="text-[14px] font-semibold">Day Brief</p>
            </div>
            <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
              Review your schedule, pick priorities, and set your intention for
              today.
            </p>
            <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-amber-500 transition-colors mt-3" />
          </button>

          <button
            onClick={() => setBriefType('week')}
            className="text-left rounded-2xl border border-border/50 p-5 hover:border-amber-500/30 hover:bg-amber-500/[0.03] transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-amber-500" />
              <p className="text-[14px] font-semibold">Week Brief</p>
            </div>
            <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
              See your week at a glance, review progress, and plan what matters
              next.
            </p>
            <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-amber-500 transition-colors mt-3" />
          </button>
        </div>
      </div>
    );
  }

  // ── Week Brief ──

  if (briefType === 'week') {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBriefType(null)}
            className="text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Calendar className="h-4 w-4 text-amber-500" />
          <h1 className="text-lg font-semibold tracking-tight">Week Brief</h1>
          <span className="text-[11px] text-muted-foreground/40 ml-auto">
            {format(weekInterval.start, 'MMM d')} —{' '}
            {format(weekInterval.end, 'MMM d')}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <BriefStat
            label="Completed"
            value={completedThisWeek.length}
            icon={
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            }
          />
          <BriefStat
            label="Due This Week"
            value={thisWeekDue.length}
            icon={<Timer className="h-3.5 w-3.5 text-amber-500" />}
          />
          <BriefStat
            label="Overdue"
            value={overdue.length}
            icon={
              <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            }
          />
        </div>

        {/* Active Goals */}
        {activeGoals.length > 0 && (
          <Section title="Active Goals">
            {activeGoals.map((goal) => (
              <div
                key={goal.id}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]"
              >
                <Target className="h-3 w-3 text-amber-500/50 shrink-0" />
                <span className="truncate">{goal.title}</span>
                {goal.metric && (
                  <span className="text-[10px] text-muted-foreground/30 ml-auto">
                    {goal.metric}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Due This Week */}
        <Section title={`Due This Week (${thisWeekDue.length})`}>
          {thisWeekDue.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/30 py-2 px-2.5">
              Nothing due this week.
            </p>
          ) : (
            thisWeekDue.slice(0, 12).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]"
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    task.priority === 'high'
                      ? 'bg-red-400'
                      : task.priority === 'medium'
                        ? 'bg-amber-400'
                        : 'bg-muted-foreground/20'
                  )}
                />
                <span className="truncate flex-1">{task.title}</span>
                <span className="text-[10px] text-muted-foreground/30">
                  {task.dueDate
                    ? format(parseISO(task.dueDate), 'EEE')
                    : ''}
                </span>
              </div>
            ))
          )}
        </Section>

        {/* What matters */}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
            What matters most next week?
          </label>
          <textarea
            value={weekFocus}
            onChange={(e) => setWeekFocus(e.target.value)}
            placeholder="Write your anchor intentions..."
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-amber-500/40 transition-colors resize-none"
          />
        </div>

        <button
          onClick={() => setBriefType(null)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    );
  }

  // ── Day Brief ──

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setBriefType(null)}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Sun className="h-4 w-4 text-amber-500" />
        <h1 className="text-lg font-semibold tracking-tight">Day Brief</h1>
        <span className="text-[11px] text-muted-foreground/40 ml-auto">
          {format(todayDate, 'EEEE, MMM d')}
        </span>
      </div>

      {/* Phase toggle */}
      <div className="flex rounded-xl bg-foreground/[0.03] p-0.5">
        {(['morning', 'evening'] as const).map((phase) => (
          <button
            key={phase}
            onClick={() => setDayPhase(phase)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium transition-all',
              dayPhase === phase
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            {phase === 'morning' ? (
              <Sun className="h-3 w-3" />
            ) : (
              <Moon className="h-3 w-3" />
            )}
            {phase === 'morning' ? 'Morning' : 'Evening'}
          </button>
        ))}
      </div>

      {dayPhase === 'morning' ? (
        <>
          {/* Calendar / Events */}
          <Section title={`Today's Schedule (${todayEvents.length})`}>
            {todayEvents.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30 py-2 px-2.5">
                No events today.
              </p>
            ) : (
              todayEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]"
                >
                  <span className="text-[11px] text-muted-foreground/40 font-mono w-12">
                    {event.startTime || '—'}
                  </span>
                  <span className="truncate">{event.title}</span>
                </div>
              ))
            )}
          </Section>

          {/* Deadlines */}
          {(todayDue.length > 0 || overdue.length > 0) && (
            <Section title="Deadlines">
              {overdue.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-red-400"
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate flex-1">{task.title}</span>
                  <span className="text-[10px] opacity-50">
                    {task.dueDate}
                  </span>
                </div>
              ))}
              {todayDue.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-amber-500"
                >
                  <Timer className="h-3 w-3 shrink-0" />
                  <span className="truncate flex-1">{task.title}</span>
                </div>
              ))}
            </Section>
          )}

          {/* Pick 3 priorities */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2">
              Pick up to 3 priorities
            </p>
            <div className="space-y-0.5">
              {activeTasks.slice(0, 12).map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTogglePriority(task.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-left transition-all',
                    priorities.includes(task.id)
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium'
                      : 'text-muted-foreground/50 hover:bg-foreground/[0.03]'
                  )}
                >
                  <div
                    className={cn(
                      'h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                      priorities.includes(task.id)
                        ? 'bg-amber-500 border-amber-500'
                        : 'border-border/60'
                    )}
                  >
                    {priorities.includes(task.id) && (
                      <span className="text-[8px] text-white font-bold">
                        {priorities.indexOf(task.id) + 1}
                      </span>
                    )}
                  </div>
                  <span className="truncate">{task.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Habits */}
          {habits.length > 0 && (
            <Section
              title={`Habits (${habitsCompletedToday.length}/${habits.length})`}
            >
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]"
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      habit.completions?.[todayStr]
                        ? 'bg-emerald-500'
                        : 'bg-muted-foreground/15'
                    )}
                  />
                  <span
                    className={cn(
                      'truncate',
                      habit.completions?.[todayStr]
                        ? 'text-muted-foreground/40 line-through'
                        : ''
                    )}
                  >
                    {habit.title}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* Action: Go to Dispatch */}
          <Link
            href="/tools/dispatch"
            className="flex items-center justify-center gap-2 w-full rounded-2xl border border-emerald-500/20 py-3 text-[13px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5 transition-all"
          >
            Generate Today&apos;s Route →
          </Link>
        </>
      ) : (
        /* ── Evening Phase ── */
        <>
          {/* Wins */}
          <Section title={`Today's Wins (${completedToday.length})`}>
            {completedToday.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30 py-2 px-2.5">
                Nothing completed today yet.
              </p>
            ) : (
              completedToday.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-emerald-500/70"
                >
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </div>
              ))
            )}
          </Section>

          {/* Slipped */}
          {todayDue.length > 0 && (
            <Section title="Slipped (still due today)">
              {todayDue.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted-foreground/40"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400/50 shrink-0" />
                  <span className="truncate">{task.title}</span>
                </div>
              ))}
            </Section>
          )}

          {/* Habits recap */}
          {habits.length > 0 && (
            <Section
              title={`Habits Today (${habitsCompletedToday.length}/${habits.length})`}
            >
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]"
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      habit.completions?.[todayStr]
                        ? 'bg-emerald-500'
                        : 'bg-red-400/40'
                    )}
                  />
                  <span
                    className={cn(
                      'truncate',
                      !habit.completions?.[todayStr] ? 'text-red-400/50' : ''
                    )}
                  >
                    {habit.title}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* Reflection */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              Reflection
            </label>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="How did today go?"
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-amber-500/40 transition-colors resize-none"
            />
          </div>

          {/* Tomorrow Preview */}
          {tomorrowDue.length > 0 && (
            <Section title={`Tomorrow (${tomorrowDue.length})`}>
              {tomorrowDue.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted-foreground/40"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20 shrink-0" />
                  <span className="truncate">{task.title}</span>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {/* Done button for Day Brief */}
      <button
        onClick={() => setBriefType(null)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1.5">
        {title}
      </p>
      <div className="rounded-xl border border-border/30 divide-y divide-border/20 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function BriefStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 p-3 text-center">
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground/40 mt-0.5">{label}</p>
    </div>
  );
}
