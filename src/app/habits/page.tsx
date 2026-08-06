'use client';

import { useMemo, useRef, useState } from 'react';
import { Repeat, Flame, Plus, CheckSquare, CalendarDays, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem, updateItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import { format, startOfWeek, addDays, isToday, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDay } from 'date-fns';
import { calculateStreak, isHabitScheduledForDate, isHabitCompletedForDate, getWeekCompletionRate } from '@/lib/habits';
import { useTranslation } from '@/lib/i18n';
import { getLocale, getWeekStartsOn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';

type ViewMode = 'week' | 'month';

interface HabitToggleRetry {
  habitId: string;
  date: Date;
  desired: boolean;
}

export default function HabitsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const weekStartSetting = useSettingsStore((s) => s.settings.weekStart);
  const weekStartsOnNum = getWeekStartsOn(weekStartSetting);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const createInFlightRef = useRef(false);
  const toggleInFlightRef = useRef(new Set<string>());
  const [creatingHabit, setCreatingHabit] = useState(false);
  const [pendingHabitIds, setPendingHabitIds] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<HabitToggleRetry | null>(null);
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: weekStartsOnNum });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Calculate padding days to align first day with correct weekday (Monday = 0)
  const firstDayOfMonth = getDay(monthStart);
  const paddingDays = (firstDayOfMonth - weekStartsOnNum + 7) % 7;
  const calendarHeaderDays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(monthStart, { weekStartsOn: weekStartsOnNum }), index)
  );

  const habits = useMemo(
    () => items.filter((i) => i.type === 'habit' && i.status === 'active'),
    [items]
  );

  const completionRate = getWeekCompletionRate(habits, weekStart);

  const toggleDay = async (habitId: string, date: Date, requestedDesired?: boolean) => {
    if (toggleInFlightRef.current.has(habitId)) return;
    toggleInFlightRef.current.add(habitId);
    setPendingHabitIds((previous) => new Set(previous).add(habitId));
    setToggleError(null);

    const dateKey = format(date, 'yyyy-MM-dd');
    let desired = requestedDesired;
    try {
      const latestHabit = useOrbitStore.getState().items.find(
        (item) => item.id === habitId && item.type === 'habit'
      );
      if (!latestHabit) throw new Error('Habit is no longer available.');

      desired ??= !Boolean(latestHabit.completions?.[dateKey]);
      const completions = {
        ...(latestHabit.completions || {}),
        [dateKey]: desired,
      };
      const outcome = await updateItem(habitId, { completions });
      if (outcome === 'rejected') {
        setToggleError({ habitId, date, desired });
      }
    } catch (cause) {
      console.error('[THREADMAP] Habit completion update failed:', cause);
      if (desired !== undefined) setToggleError({ habitId, date, desired });
    } finally {
      toggleInFlightRef.current.delete(habitId);
      setPendingHabitIds((previous) => {
        const next = new Set(previous);
        next.delete(habitId);
        return next;
      });
    }
  };

  const handleNewHabit = async () => {
    if (createInFlightRef.current) return;
    if (!user) {
      setCreateError(lang === 'de'
        ? 'Deine Sitzung ist nicht mehr aktiv. Melde dich erneut an und versuche es noch einmal.'
        : 'Your session is no longer active. Sign in again and retry.');
      return;
    }

    createInFlightRef.current = true;
    setCreatingHabit(true);
    setCreateError(null);
    try {
      const id = await createItem({
        type: 'habit',
        status: 'active',
        title: t('habits.newHabitTitle'),
        frequency: 'daily',
        completions: {},
        tags: [],
        userId: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setSelectedItemId(id);
    } catch (cause) {
      console.error('[THREADMAP] Habit creation failed:', cause);
      setCreateError(lang === 'de'
        ? 'Die Gewohnheit konnte nicht erstellt werden. Versuche es erneut.'
        : 'The habit could not be created. Please retry.');
    } finally {
      createInFlightRef.current = false;
      setCreatingHabit(false);
    }
  };

  const habitToggleLabel = (title: string, date: Date, completed: boolean) => t(
    completed ? 'habits.markIncomplete' : 'habits.markComplete',
    { title, date: format(date, 'PPPP', { locale }) }
  );

  return (
    <div className="mobile-page-gutter mx-auto max-w-4xl space-y-5 py-4 lg:space-y-6 lg:p-8" data-slot="page-content">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('nav.habits')}</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {completionRate === null
              ? t('habits.futureWeekRate')
              : t('habits.weekRate', { rate: completionRate })}
          </p>
        </div>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
          {/* Month navigation - only show in month view */}
          {viewMode === 'month' && (
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="mobile-touch-target flex items-center justify-center rounded-md p-1.5 text-muted-foreground/60 transition-all hover:bg-background hover:text-foreground lg:min-h-0"
                aria-label={t('habits.previousMonth')}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date())}
                aria-label={`${t('common.today')}: ${format(currentMonth, 'MMMM yyyy', { locale })}`}
                className="mobile-touch-target px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:text-foreground lg:min-h-0"
              >
                {t('common.today')} · {format(currentMonth, 'MMM yyyy', { locale })}
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="mobile-touch-target flex items-center justify-center rounded-md p-1.5 text-muted-foreground/60 transition-all hover:bg-background hover:text-foreground lg:min-h-0"
                aria-label={t('habits.nextMonth')}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5" role="group" aria-label={t('habits.calendarView')}>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              aria-pressed={viewMode === 'week'}
              className={cn(
                'mobile-touch-target flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all lg:min-h-0',
                viewMode === 'week'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground/60 hover:text-foreground'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {t('habits.week')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              aria-pressed={viewMode === 'month'}
              className={cn(
                'mobile-touch-target flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all lg:min-h-0',
                viewMode === 'month'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground/60 hover:text-foreground'
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              {t('habits.month')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleNewHabit()}
            disabled={creatingHabit}
            aria-busy={creatingHabit}
            className="mobile-touch-target flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition-transform transition-opacity hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-70 lg:min-h-0 lg:rounded-lg lg:py-1.5 lg:text-[12px]"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {creatingHabit
              ? (lang === 'de' ? 'Wird erstellt …' : 'Creating…')
              : t('common.new')}
          </button>
        </div>
      </div>

      {(createError || toggleError) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.05] px-3 py-2.5 text-[12px] text-destructive">
          <p>
            {createError || (lang === 'de'
              ? 'Die Änderung konnte nicht synchronisiert werden. Versuche es erneut.'
              : 'The completion change could not be synced. Please retry.')}
          </p>
          <button
            type="button"
            onClick={() => {
              if (createError) void handleNewHabit();
              else if (toggleError) void toggleDay(toggleError.habitId, toggleError.date, toggleError.desired);
            }}
            disabled={creatingHabit || Boolean(toggleError && pendingHabitIds.has(toggleError.habitId))}
            aria-busy={creatingHabit || Boolean(toggleError && pendingHabitIds.has(toggleError.habitId))}
            className="min-h-9 rounded-lg bg-destructive/10 px-3 font-medium transition-colors hover:bg-destructive/20 disabled:cursor-wait disabled:opacity-60"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* ── Mobile Views ── */}
      <div className="lg:hidden space-y-3">
        {viewMode === 'week' ? (
          // Week View - Mobile
          <>
            {habits.map((habit) => {
              const streak = calculateStreak(habit);
              const completed = isHabitCompletedForDate(habit, today);
              const habitBusy = pendingHabitIds.has(habit.id);
              return (
                <div
                  key={habit.id}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  {/* Habit header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleDay(habit.id, today)}
                      disabled={habitBusy}
                      aria-busy={habitBusy}
                      aria-label={habitToggleLabel(habit.title, today, completed)}
                      aria-pressed={completed}
                      className={cn(
                        'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-[1.5px] transition-all',
                        'before:absolute before:inset-[-8px]',
                        completed
                          ? 'border-foreground/20 bg-foreground/10'
                          : 'border-foreground/20 hover:border-foreground/40'
                      )}
                    >
                      {completed && <CheckSquare className="h-3.5 w-3.5 text-foreground/50" />}
                    </button>
                    <button
                      onClick={() => setSelectedItemId(habit.id)}
                      className={cn(
                        'flex-1 text-[14px] font-medium text-left truncate transition-colors',
                        completed ? 'text-muted-foreground/50 line-through' : 'text-foreground'
                      )}
                    >
                      {habit.title}
                    </button>
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 tabular-nums font-medium shrink-0">
                        <Flame className="h-3.5 w-3.5" />
                        {streak}
                      </span>
                    )}
                  </div>
                  {/* Week dots */}
                  <div className="flex items-center justify-around px-4 pb-3">
                    {weekDays.map((day) => {
                      const scheduled = isHabitScheduledForDate(habit, day);
                      const dayCompleted = isHabitCompletedForDate(habit, day);
                      const isFuture = day > today && !isToday(day);
                      const isCurrentDay = isToday(day);
                      return (
                        <div key={day.toISOString()} className="flex flex-col items-center gap-1">
                          <span className={cn(
                            'text-[9px] font-medium uppercase',
                            isCurrentDay ? 'text-foreground' : 'text-muted-foreground/40'
                          )}>
                            {format(day, 'EEEEE', { locale })}
                          </span>
                          {scheduled ? (
                            <button
                              type="button"
                              onClick={() => !isFuture && void toggleDay(habit.id, day)}
                              disabled={isFuture || habitBusy}
                              aria-busy={habitBusy}
                              aria-label={habitToggleLabel(habit.title, day, dayCompleted)}
                              aria-pressed={dayCompleted}
                              className={cn(
                                'h-8 w-8 rounded-lg flex items-center justify-center transition-all active:scale-90',
                                dayCompleted
                                  ? 'bg-foreground/10'
                                  : isCurrentDay
                                  ? 'border-[1.5px] border-foreground/25'
                                  : isFuture
                                  ? 'border border-border/30 opacity-30'
                                  : 'border border-foreground/10'
                              )}
                            >
                              {dayCompleted && <CheckSquare className="h-3.5 w-3.5 text-foreground/40" />}
                            </button>
                          ) : (
                            <div className="h-8 w-8 flex items-center justify-center">
                              <div className="h-1 w-1 rounded-full bg-foreground/10" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          // Month View - Mobile
          <>
            {habits.map((habit) => {
              const streak = calculateStreak(habit);
              const habitBusy = pendingHabitIds.has(habit.id);
              return (
                <div
                  key={habit.id}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  {/* Habit header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                    <button
                      onClick={() => setSelectedItemId(habit.id)}
                      className="flex-1 text-[14px] font-medium text-left truncate"
                    >
                      {habit.title}
                    </button>
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 tabular-nums font-medium shrink-0">
                        <Flame className="h-3.5 w-3.5" />
                        {streak}
                      </span>
                    )}
                  </div>
                  {/* Month calendar grid */}
                  <div className="p-3">
                    <div className="grid grid-cols-7 gap-1">
                      {calendarHeaderDays.map((day) => (
                        <div
                          key={`mobile-header-${day.toISOString()}`}
                          aria-label={format(day, 'EEEE', { locale })}
                          className="pb-1 text-center text-[9px] font-medium uppercase text-muted-foreground/45"
                        >
                          {format(day, 'EEE', { locale })}
                        </div>
                      ))}
                      {/* Padding days before month starts */}
                      {Array.from({ length: paddingDays }).map((_, i) => (
                        <div key={`padding-${i}`} className="aspect-square" />
                      ))}
                      {monthDays.map((day) => {
                        const scheduled = isHabitScheduledForDate(habit, day);
                        const dayCompleted = isHabitCompletedForDate(habit, day);
                        const isFuture = day > today && !isToday(day);
                        const isCurrentDay = isToday(day);
                        return (
                          <div key={day.toISOString()} className="aspect-square">
                            {scheduled ? (
                              <button
                                type="button"
                                onClick={() => !isFuture && void toggleDay(habit.id, day)}
                                disabled={isFuture || habitBusy}
                                aria-busy={habitBusy}
                                aria-label={habitToggleLabel(habit.title, day, dayCompleted)}
                                aria-pressed={dayCompleted}
                                className={cn(
                                  'w-full h-full rounded-md flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90',
                                  dayCompleted
                                    ? 'bg-foreground/10'
                                    : isCurrentDay
                                    ? 'border-[1.5px] border-foreground/25'
                                    : isFuture
                                    ? 'border border-border/30 opacity-30'
                                    : 'border border-foreground/10'
                                )}
                              >
                                <span className={cn(
                                  'text-[10px] tabular-nums font-medium',
                                  dayCompleted ? 'text-foreground/40' : 'text-foreground/60'
                                )}>
                                  {format(day, 'd')}
                                </span>
                                {dayCompleted && <CheckSquare className="h-2.5 w-2.5 text-foreground/30" />}
                              </button>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-[10px] text-muted-foreground/20 tabular-nums">
                                  {format(day, 'd')}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {habits.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
              <Repeat className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <p className="text-[13px] text-muted-foreground/50">{t('habits.noHabits')}</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">{t('habits.noHabitsDesc')}</p>
          </div>
        )}
      </div>

      {/* ── Desktop Views ── */}
      {viewMode === 'week' ? (
        // Week View - Desktop
        <div className="hidden lg:block rounded-xl border border-border/60 bg-card overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_repeat(7,40px)_56px] gap-px border-b border-border/40 px-4 py-2.5">
            <div />
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="flex flex-col items-center"
              >
                <span className={cn(
                  'text-[10px] font-medium uppercase',
                  isToday(day) ? 'text-foreground' : 'text-muted-foreground/40'
                )}>
                  {format(day, 'EEE', { locale })}
                </span>
                <span className={cn(
                  'text-[11px] tabular-nums mt-0.5',
                  isToday(day)
                    ? 'flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-semibold'
                    : 'text-muted-foreground/50'
                )}>
                  {format(day, 'd')}
                </span>
              </div>
            ))}
            <div className="text-center text-[10px] font-medium text-muted-foreground/40 uppercase">
              {t('habits.streakLabel')}
            </div>
          </div>

          {/* Habit rows */}
          {habits.map((habit) => {
            const streak = calculateStreak(habit);
            const habitBusy = pendingHabitIds.has(habit.id);
            return (
              <div
                key={habit.id}
                className="grid grid-cols-[1fr_repeat(7,40px)_56px] gap-px items-center px-4 py-2 border-b border-border/30 last:border-0 hover:bg-foreground/[0.02] transition-colors"
                data-slot="habit-row"
              >
                <button
                  onClick={() => setSelectedItemId(habit.id)}
                  className="text-[13px] font-medium text-left truncate hover:text-foreground transition-colors pr-2"
                >
                  {habit.title}
                </button>
                {weekDays.map((day) => {
                  const scheduled = isHabitScheduledForDate(habit, day);
                  const completed = isHabitCompletedForDate(habit, day);
                  const isFuture = day > today && !isToday(day);
                  return (
                    <div key={day.toISOString()} className="flex justify-center">
                      {scheduled ? (
                        <button
                          type="button"
                          onClick={() => !isFuture && void toggleDay(habit.id, day)}
                          disabled={isFuture || habitBusy}
                          aria-busy={habitBusy}
                          aria-label={habitToggleLabel(habit.title, day, completed)}
                          aria-pressed={completed}
                          className={cn(
                            'relative h-7 w-7 rounded-lg flex items-center justify-center transition-all',
                            'before:absolute before:inset-[-2px]',
                            completed
                              ? 'bg-foreground/10'
                              : isToday(day)
                              ? 'border-[1.5px] border-foreground/20 hover:border-foreground/40'
                              : isFuture
                              ? 'border border-border/30 opacity-30'
                              : 'border border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.03]'
                          )}
                        >
                          {completed && <CheckSquare className="h-3 w-3 text-foreground/40" />}
                        </button>
                      ) : (
                        <div className="h-7 w-7 flex items-center justify-center">
                          <div className="h-0.5 w-0.5 rounded-full bg-foreground/10" />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-center">
                  {streak > 0 ? (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums font-medium">
                      <Flame className="h-3 w-3" />
                      {streak}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/20">—</span>
                  )}
                </div>
              </div>
            );
          })}

          {habits.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                <Repeat className="h-4 w-4 text-muted-foreground/30" />
              </div>
              <p className="text-[12px] text-muted-foreground/50">{t('habits.noHabits')}</p>
            </div>
          )}
        </div>
      ) : (
        // Month View - Desktop
        <div className="hidden lg:block space-y-4">
          {habits.map((habit) => {
            const streak = calculateStreak(habit);
            const habitBusy = pendingHabitIds.has(habit.id);
            return (
              <div
                key={habit.id}
                className="rounded-xl border border-border/60 bg-card overflow-hidden"
              >
                {/* Habit header */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40">
                  <button
                    onClick={() => setSelectedItemId(habit.id)}
                    className="flex-1 text-[13px] font-medium text-left truncate hover:text-foreground transition-colors"
                  >
                    {habit.title}
                  </button>
                  {streak > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums font-medium">
                      <Flame className="h-3 w-3" />
                      {streak}
                    </span>
                  )}
                </div>
                {/* Month calendar */}
                <div className="p-4">
                  <div className="grid grid-cols-7 gap-2">
                    {/* Day headers */}
                    {calendarHeaderDays.map((day) => (
                      <div key={day.toISOString()} className="text-center text-[10px] font-medium text-muted-foreground/40 uppercase pb-1">
                        {format(day, 'EEE', { locale })}
                      </div>
                    ))}
                    {/* Padding days before month starts */}
                    {Array.from({ length: paddingDays }).map((_, i) => (
                      <div key={`padding-${i}`} className="aspect-square" />
                    ))}
                    {/* Days */}
                    {monthDays.map((day) => {
                      const scheduled = isHabitScheduledForDate(habit, day);
                      const dayCompleted = isHabitCompletedForDate(habit, day);
                      const isFuture = day > today && !isToday(day);
                      const isCurrentDay = isToday(day);
                      return (
                        <div key={day.toISOString()} className="aspect-square">
                          {scheduled ? (
                            <button
                              type="button"
                              onClick={() => !isFuture && void toggleDay(habit.id, day)}
                              disabled={isFuture || habitBusy}
                              aria-busy={habitBusy}
                              aria-label={habitToggleLabel(habit.title, day, dayCompleted)}
                              aria-pressed={dayCompleted}
                              className={cn(
                                'w-full h-full rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all',
                                dayCompleted
                                  ? 'bg-foreground/10'
                                  : isCurrentDay
                                  ? 'border-[1.5px] border-foreground/20 hover:border-foreground/40'
                                  : isFuture
                                  ? 'border border-border/30 opacity-30'
                                  : 'border border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.03]'
                              )}
                            >
                              <span className={cn(
                                'text-[11px] tabular-nums font-medium',
                                dayCompleted ? 'text-foreground/40' : 'text-foreground/60'
                              )}>
                                {format(day, 'd')}
                              </span>
                              {dayCompleted && <CheckSquare className="h-2.5 w-2.5 text-foreground/30" />}
                            </button>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[11px] text-muted-foreground/15 tabular-nums">
                                {format(day, 'd')}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {habits.length === 0 && (
            <div className="py-16 text-center rounded-xl border border-border/60 bg-card">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                <Repeat className="h-4 w-4 text-muted-foreground/30" />
              </div>
              <p className="text-[12px] text-muted-foreground/50">{t('habits.noHabits')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
