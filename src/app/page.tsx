'use client';

import { useMemo } from 'react';
import {
  Inbox,
  CheckSquare,
  CalendarDays,
  Target,
  FolderKanban,
  Repeat,
  Flame,
  ArrowRight,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { ItemRow } from '@/components/items/item-row';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  format,
  isToday,
  isPast,
  parseISO,
  startOfWeek,
  addDays,
} from 'date-fns';
import {
  calculateStreak,
  isHabitScheduledForDate,
  isHabitCompletedForDate,
} from '@/lib/habits';
import { updateItem } from '@/lib/firestore';
import Link from 'next/link';

/* ── Login ── */
function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background font-bold text-lg">
            O
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-4">Welcome to ORBIT</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your personal system for tasks, habits, goals, and ideas — all in one place.
          </p>
        </div>
        <div className="space-y-2.5">
          <button
            onClick={onSignIn}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
          <button
            onClick={onSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.03]"
          >
            Try without account
          </button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground/60">
          Local mode stores everything in your browser. No account needed.
        </p>
      </div>
    </div>
  );
}

/* ── Onboarding (empty dashboard) ── */
function OnboardingState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.05]">
        <Sparkles className="h-6 w-6 text-foreground/40" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">Start your orbit</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground leading-relaxed">
        Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">⌘K</kbd> to
        create your first task, habit, or project.
      </p>
      <button
        onClick={onOpen}
        className="mt-5 flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" />
        Create something
      </button>
    </div>
  );
}

/* ── Section wrapper ── */
function Section({
  title,
  icon: Icon,
  count,
  href,
  children,
  action,
}: {
  title: string;
  icon: typeof CheckSquare;
  count?: number;
  href?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold">{title}</span>
          {count !== undefined && (
            <span className="text-[11px] text-muted-foreground/50 tabular-nums">{count}</span>
          )}
        </div>
        {href && (
          <Link href={href} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            View all
          </Link>
        )}
        {action}
      </div>
      <div className="rounded-xl border border-border/60 bg-card">
        {children}
      </div>
    </div>
  );
}

/* ── Dashboard ── */
export default function DashboardPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const { items, setSelectedItemId, setCommandBarOpen } = useOrbitStore();

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const {
    todayTasks,
    overdueItems,
    todayEvents,
    habits,
    activeProjects,
    goals,
    principles,
    inboxCount,
    totalActive,
  } = useMemo(() => {
    const todayTasks = items.filter(
      (i) => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate === todayStr
    );
    const overdueItems = items.filter(
      (i) => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate && isPast(parseISO(i.dueDate)) && !isToday(parseISO(i.dueDate))
    );
    const todayEvents = items.filter(
      (i) => i.type === 'event' && i.status !== 'archived' && (i.startDate === todayStr || (!i.startDate && i.dueDate === todayStr))
    );
    const habits = items.filter((i) => i.type === 'habit' && i.status === 'active');
    const activeProjects = items.filter((i) => i.type === 'project' && i.status === 'active');
    const goals = items.filter((i) => i.type === 'goal' && i.status === 'active');
    const principles = items.filter(
      (i) => i.type === 'note' && (i.noteSubtype === 'principle' || i.tags?.includes('principle')) && i.status !== 'archived'
    );
    const inboxCount = items.filter((i) => i.status === 'inbox').length;
    const totalActive = items.filter((i) => i.status !== 'archived').length;
    return { todayTasks, overdueItems, todayEvents, habits, activeProjects, goals, principles, inboxCount, totalActive };
  }, [items, todayStr]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSignIn={signInWithGoogle} />;
  }

  // Show onboarding if empty
  if (totalActive === 0) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {format(today, 'EEEE, d MMMM')}
          </h1>
        </div>
        <OnboardingState onOpen={() => setCommandBarOpen(true)} />
      </div>
    );
  }

  const getProjectProgress = (projectId: string) => {
    const children = items.filter((i) => i.parentId === projectId);
    if (children.length === 0) return 0;
    const done = children.filter((i) => i.status === 'done').length;
    return Math.round((done / children.length) * 100);
  };

  const todayHabits = habits.filter((h) => isHabitScheduledForDate(h, today));
  const completedHabitsToday = todayHabits.filter((h) => isHabitCompletedForDate(h, today)).length;

  const toggleHabit = async (habit: typeof items[0]) => {
    const completions = { ...(habit.completions || {}) };
    completions[todayStr] = !completions[todayStr];
    await updateItem(habit.id, { completions });
  };

  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">
            {format(today, 'EEEE, d MMMM yyyy')}
          </p>
          <h1 className="text-xl font-semibold tracking-tight mt-0.5">
            {new Date().getHours() < 12
              ? 'Good morning'
              : new Date().getHours() < 18
              ? 'Good afternoon'
              : 'Good evening'}
            {user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
          </h1>
        </div>
      </div>

      {/* ── Principles ── */}
      {principles.length > 0 && (
        <div className="rounded-lg bg-foreground/[0.02] border border-border/40 px-4 py-3">
          <p className="text-[13px] italic text-foreground/70 leading-relaxed">
            &ldquo;{principles[Math.floor(Math.random() * principles.length)]?.title}&rdquo;
          </p>
        </div>
      )}

      {/* ── Stats strip ── */}
      <div className="flex items-center gap-6 text-[13px]">
        {inboxCount > 0 && (
          <Link href="/inbox" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="tabular-nums font-medium">{inboxCount}</span>
            <span className="text-muted-foreground/60">inbox</span>
          </Link>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="tabular-nums font-medium">{todayTasks.length + overdueItems.length}</span>
          <span className="text-muted-foreground/60">tasks</span>
        </div>
        {todayHabits.length > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Repeat className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="tabular-nums font-medium">{completedHabitsToday}/{todayHabits.length}</span>
            <span className="text-muted-foreground/60">habits</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FolderKanban className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="tabular-nums font-medium">{activeProjects.length}</span>
          <span className="text-muted-foreground/60">projects</span>
        </div>
      </div>

      {/* ── Week strip ── */}
      <div className="flex items-center gap-1">
        {weekDays.map((day) => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayItems = items.filter(
            (i) =>
              i.status !== 'archived' &&
              ((i.type === 'task' && i.dueDate === dayStr) ||
               (i.type === 'event' && i.startDate === dayStr))
          );
          const isCurrentDay = isToday(day);
          return (
            <div
              key={dayStr}
              className={cn(
                'flex flex-1 flex-col items-center rounded-lg py-2 transition-colors',
                isCurrentDay ? 'bg-foreground text-background' : 'hover:bg-foreground/[0.03]'
              )}
            >
              <span className={cn('text-[10px] font-medium uppercase', !isCurrentDay && 'text-muted-foreground/50')}>
                {format(day, 'EEE')}
              </span>
              <span className={cn('text-sm font-semibold mt-0.5 tabular-nums', !isCurrentDay && 'text-foreground')}>
                {format(day, 'd')}
              </span>
              {dayItems.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dayItems.slice(0, 3).map((_, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'h-1 w-1 rounded-full',
                        isCurrentDay ? 'bg-background/50' : 'bg-foreground/20'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Content grid ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tasks */}
        <Section
          title="Today"
          icon={CheckSquare}
          count={todayTasks.length + overdueItems.length}
          href="/today"
        >
          <div className="py-1">
            {overdueItems.map((item) => (
              <ItemRow key={item.id} item={item} showProject compact />
            ))}
            {todayTasks.map((item) => (
              <ItemRow key={item.id} item={item} showProject compact />
            ))}
            {overdueItems.length === 0 && todayTasks.length === 0 && (
              <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/50">
                Nothing scheduled for today
              </p>
            )}
          </div>
        </Section>

        {/* Habits */}
        <Section title="Habits" icon={Repeat} count={todayHabits.length} href="/habits">
          <div className="py-2 px-3 space-y-1">
            {todayHabits.map((habit) => {
              const completed = isHabitCompletedForDate(habit, today);
              const streak = calculateStreak(habit);
              return (
                <div key={habit.id} className="flex items-center gap-2.5 py-1">
                  <button
                    onClick={() => toggleHabit(habit)}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md border transition-all shrink-0',
                      completed
                        ? 'border-foreground/20 bg-foreground/10'
                        : 'border-foreground/15 hover:border-foreground/30'
                    )}
                  >
                    {completed && <CheckSquare className="h-3 w-3 text-foreground/50" />}
                  </button>
                  <span
                    className={cn(
                      'flex-1 text-[13px] cursor-pointer transition-colors hover:text-foreground',
                      completed ? 'line-through text-muted-foreground/50' : 'text-foreground'
                    )}
                    onClick={() => setSelectedItemId(habit.id)}
                  >
                    {habit.title}
                  </span>
                  {streak > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums">
                      <Flame className="h-3 w-3" />
                      {streak}
                    </span>
                  )}
                </div>
              );
            })}
            {todayHabits.length === 0 && (
              <p className="py-4 text-center text-[12px] text-muted-foreground/50">No habits scheduled</p>
            )}
          </div>
        </Section>

        {/* Events */}
        {todayEvents.length > 0 && (
          <Section title="Events" icon={CalendarDays} count={todayEvents.length} href="/calendar">
            <div className="py-1">
              {todayEvents.map((item) => (
                <ItemRow key={item.id} item={item} compact />
              ))}
            </div>
          </Section>
        )}

        {/* Projects */}
        {activeProjects.length > 0 && (
          <Section
            title="Projects"
            icon={FolderKanban}
            count={activeProjects.length}
            href="/projects"
          >
            <div className="p-3 space-y-2.5">
              {activeProjects.slice(0, 4).map((project) => {
                const progress = getProjectProgress(project.id);
                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedItemId(project.id)}
                    className="flex w-full items-center gap-3 text-left group transition-colors"
                  >
                    <span className="text-sm">{project.emoji || '📁'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium truncate block group-hover:text-foreground transition-colors">
                        {project.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground/20 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{progress}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
