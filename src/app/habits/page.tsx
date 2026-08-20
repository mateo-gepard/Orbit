'use client';

import { useMemo, useRef, useState } from 'react';
import { Repeat, Flame, Plus, CheckSquare, CalendarDays, Calendar, ChevronLeft, ChevronRight, Pause, Play, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem, updateItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import { format, startOfWeek, addDays, isToday, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, addWeeks, isSameMonth, getDay } from 'date-fns';
import { calculateStreak, isHabitScheduledForDate, isHabitCompletedForDate, getWeekCompletionRate } from '@/lib/habits';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatHabitTime } from '@/lib/habit-reminders';
import type { HabitFrequency, OrbitItem } from '@/lib/types';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { getLocale, getWeekStartsOn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';

type ViewMode = 'week' | 'month';

/**
 * Habits use `waiting` as "paused". It is already a first-class status with a
 * badge, and a paused habit is precisely one that is deliberately not being
 * played right now — so this gives `waiting` a meaning here instead of making
 * the habit disappear from the page entirely.
 */
type HabitFilter = 'active' | 'paused' | 'all';

const PAUSED_STATUS = 'waiting' as const;
const HABIT_CREATE_FREQUENCY_OPTIONS: HabitFrequency[] = ['daily', 'weekly', 'custom'];

interface HabitToggleRetry {
  habitId: string;
  date: Date;
  desired: boolean;
}

/** One in-flight toggle per habit *and day*, not per habit. */
function toggleKey(habitId: string, dateKey: string): string {
  return `${habitId}|${dateKey}`;
}

export default function HabitsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const weekStartSetting = useSettingsStore((s) => s.settings.weekStart);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat);
  const weekStartsOnNum = getWeekStartsOn(weekStartSetting);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState<HabitFilter>('active');
  const createInFlightRef = useRef(false);
  const toggleInFlightRef = useRef(new Set<string>());
  const pauseInFlightRef = useRef(new Set<string>());
  const [creatingHabit, setCreatingHabit] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createHabitTitle, setCreateHabitTitle] = useState('');
  const [createHabitFrequency, setCreateHabitFrequency] = useState<HabitFrequency>('daily');
  const [createHabitCustomDays, setCreateHabitCustomDays] = useState<number[]>([]);
  const [pendingToggleKeys, setPendingToggleKeys] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<HabitToggleRetry | null>(null);
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: weekStartsOnNum });
  const weekStart = addWeeks(currentWeekStart, weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isViewingCurrentWeek = weekOffset === 0;
  const isViewingCurrentMonth = isSameMonth(currentMonth, today);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const createStepWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => format(
      addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), index),
      'EEE',
      { locale }
    )),
    [locale]
  );
  const createHabitDefaultWeeklyDay = weekStartSetting === 'sunday' ? 6 : 0;
  
  // Calculate padding days to align first day with correct weekday (Monday = 0)
  const firstDayOfMonth = getDay(monthStart);
  const paddingDays = (firstDayOfMonth - weekStartsOnNum + 7) % 7;
  const calendarHeaderDays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(monthStart, { weekStartsOn: weekStartsOnNum }), index)
  );

  // `waiting` habits are paused, not gone. Filtering strictly on `active` used
  // to make any habit that left that status vanish from the page with no way
  // to find it again.
  const habits = useMemo(
    () => items.filter((i) => (
      i.type === 'habit'
      && (filter === 'all'
        ? i.status === 'active' || i.status === PAUSED_STATUS
        : filter === 'paused'
          ? i.status === PAUSED_STATUS
          : i.status === 'active')
    )),
    [items, filter]
  );

  const pausedCount = useMemo(
    () => items.filter((i) => i.type === 'habit' && i.status === PAUSED_STATUS).length,
    [items]
  );

  const activeHabits = useMemo(
    () => items.filter((i) => i.type === 'habit' && i.status === 'active'),
    [items]
  );

  const completionRate = getWeekCompletionRate(activeHabits, weekStart);

  const toggleDay = async (habitId: string, date: Date, requestedDesired?: boolean) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const key = toggleKey(habitId, dateKey);
    // Keyed by habit *and* day: keying by habit alone silently discarded every
    // click after the first when ticking several days in quick succession.
    // `updateItem` already serialises per item, so a broader guard only cost
    // input.
    if (toggleInFlightRef.current.has(key)) return;
    toggleInFlightRef.current.add(key);
    setPendingToggleKeys((previous) => new Set(previous).add(key));
    setToggleError(null);

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
      toggleInFlightRef.current.delete(key);
      setPendingToggleKeys((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  };

  const resetCreateHabitDialog = () => {
    setCreateStep(1);
    setCreateHabitTitle('');
    setCreateHabitFrequency('daily');
    setCreateHabitCustomDays([]);
  };

  const updateCreateHabitFrequency = (frequency: HabitFrequency) => {
    setCreateHabitFrequency(frequency);
    if (frequency === 'weekly') {
      setCreateHabitCustomDays([createHabitDefaultWeeklyDay]);
      return;
    }
    if (frequency === 'custom') {
      setCreateHabitCustomDays((currentDays) => (
        currentDays.length ? currentDays : [createHabitDefaultWeeklyDay]
      ));
      return;
    }
    setCreateHabitCustomDays([]);
  };

  const toggleCreateHabitDay = (day: number) => {
    setCreateHabitCustomDays((currentDays) => {
      if (createHabitFrequency === 'weekly') {
        return [day];
      }
      const next = new Set(currentDays);
      if (next.has(day)) {
        if (next.size === 1) return currentDays;
        next.delete(day);
      } else {
        next.add(day);
      }
      return Array.from(next).sort((a, b) => a - b);
    });
  };

  // Creation is name-first now: nothing is written until the user commits, so
  // backing out no longer leaves a "New habit" record in the list, the sidebar
  // badge and the cloud.
  const handleCreateHabit = async (
    title: string,
    frequency: HabitFrequency,
  ): Promise<boolean> => {
    if (createInFlightRef.current) return false;
    if (!user) {
      setCreateError(lang === 'de'
        ? 'Deine Sitzung ist nicht mehr aktiv. Melde dich erneut an und versuche es noch einmal.'
        : 'Your session is no longer active. Sign in again and retry.');
      return false;
    }

    createInFlightRef.current = true;
    setCreatingHabit(true);
    setCreateError(null);
    try {
      const id = await createItem({
        type: 'habit',
        status: 'active',
        title,
        completions: {},
        tags: [],
        frequency,
        ...(frequency === 'daily'
          ? {}
          : {
              customDays: Array.from(
                new Set(frequency === 'weekly'
                  ? (createHabitCustomDays.length ? createHabitCustomDays : [createHabitDefaultWeeklyDay])
                  : createHabitCustomDays
                )
              ).sort((a, b) => a - b),
            }),
        userId: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setSelectedItemId(id);
      return true;
    } catch (cause) {
      console.error('[THREADMAP] Habit creation failed:', cause);
      setCreateError(lang === 'de'
        ? 'Die Gewohnheit konnte nicht erstellt werden. Versuche es erneut.'
        : 'The habit could not be created. Please retry.');
      return false;
    } finally {
      createInFlightRef.current = false;
      setCreatingHabit(false);
    }
  };

  const togglePause = async (habitId: string, paused: boolean) => {
    if (pauseInFlightRef.current.has(habitId)) return;
    pauseInFlightRef.current.add(habitId);
    try {
      await updateItem(habitId, { status: paused ? 'active' : PAUSED_STATUS });
    } catch (cause) {
      console.error('[THREADMAP] Habit pause update failed:', cause);
      toast.error(t(paused ? 'habits.resumeError' : 'habits.pauseError'));
    } finally {
      pauseInFlightRef.current.delete(habitId);
    }
  };

  const habitToggleLabel = (title: string, date: Date, completed: boolean) => t(
    completed ? 'habits.markIncomplete' : 'habits.markComplete',
    { title, date: format(date, 'PPPP', { locale }) }
  );

  const isTogglePending = (habitId: string, day: Date) =>
    pendingToggleKeys.has(toggleKey(habitId, format(day, 'yyyy-MM-dd')));

  /** Screen readers get silence on a bare decorative dot otherwise. */
  const notScheduledLabel = (day: Date) =>
    t('habits.notScheduled', { date: format(day, 'PPPP', { locale }) });

  const FILTERS: { key: HabitFilter; labelKey: TranslationKey }[] = [
    { key: 'active', labelKey: 'habits.filterActive' },
    { key: 'paused', labelKey: 'habits.filterPaused' },
    { key: 'all', labelKey: 'habits.filterAll' },
  ];

  const renderHabitTime = (habit: OrbitItem) => {
    const label = formatHabitTime(habit.habitTime, timeFormat === '24h');
    if (!label) return null;
    return (
      <span className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground/50">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
    );
  };

  const renderPauseButton = (habit: OrbitItem) => {
    const paused = habit.status === PAUSED_STATUS;
    return (
      <button
        type="button"
        onClick={() => void togglePause(habit.id, paused)}
        aria-label={t(paused ? 'habits.resumeItem' : 'habits.pauseItem', { title: habit.title })}
        className="mobile-touch-target shrink-0 rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground lg:min-h-0"
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
    );
  };

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
          {/* Week navigation — the month view had prev/next and the week view
              did not, so last month's consistency was reviewable and last
              week's was not. */}
          {viewMode === 'week' && (
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setWeekOffset((offset) => offset - 1)}
                className="mobile-touch-target flex items-center justify-center rounded-md p-1.5 text-muted-foreground/60 transition-all hover:bg-background hover:text-foreground lg:min-h-0"
                aria-label={t('habits.previousWeek')}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                aria-label={t('habits.jumpToToday')}
                className="mobile-touch-target whitespace-nowrap px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:text-foreground lg:min-h-0"
              >
                {isViewingCurrentWeek
                  ? `${t('common.today')} · ${format(weekStart, 'd MMM', { locale })}`
                  : `${format(weekStart, 'd MMM', { locale })} – ${format(addDays(weekStart, 6), 'd MMM', { locale })}`}
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((offset) => offset + 1)}
                className="mobile-touch-target flex items-center justify-center rounded-md p-1.5 text-muted-foreground/60 transition-all hover:bg-background hover:text-foreground lg:min-h-0"
                aria-label={t('habits.nextWeek')}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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
                aria-label={t('habits.jumpToToday')}
                className="mobile-touch-target whitespace-nowrap px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:text-foreground lg:min-h-0"
              >
                {/* Only say "Today" when today is actually in view — browsing
                    October used to read "Today · Oct 2026". */}
                {isViewingCurrentMonth
                  ? `${t('common.today')} · ${format(currentMonth, 'MMM yyyy', { locale })}`
                  : format(currentMonth, 'MMM yyyy', { locale })}
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

          {/* Status filter — so a paused habit is still reachable. */}
          <SegmentedControl
            label={t('habits.filterLabel')}
            value={filter}
            onChange={setFilter}
            options={FILTERS.map(({ key, labelKey }) => ({
              value: key,
              label: t(labelKey),
              ...(key === 'paused' && pausedCount > 0 ? { badge: pausedCount } : {}),
            }))}
          />
          {/* View mode toggle */}
          <SegmentedControl
            label={t('habits.calendarView')}
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'week', label: t('habits.week'), icon: CalendarDays },
              { value: 'month', label: t('habits.month'), icon: Calendar },
            ]}
          />
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              resetCreateHabitDialog();
              setCreateDialogOpen(true);
            }}
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

      <Dialog
        open={createDialogOpen}
        onOpenChange={(next) => {
          if (!next && creatingHabit) return;
          if (!next) {
            resetCreateHabitDialog();
          }
          setCreateDialogOpen(next);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t('habits.createTitle')}</DialogTitle>
            <DialogDescription className="text-[12px]">
              {createStep === 1
                ? t('habits.createDescription')
                : (lang === 'de' ? 'Gib die Frequenz für diese Gewohnheit an.' : 'Pick the habit frequency.')}
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 ? (
            <div className="space-y-3">
              <Input
                value={createHabitTitle}
                onChange={(event) => setCreateHabitTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!createHabitTitle.trim()) return;
                    updateCreateHabitFrequency(createHabitFrequency);
                    setCreateStep(2);
                  }
                }}
                placeholder={t('habits.createPlaceholder')}
                disabled={creatingHabit}
                aria-label={t('habits.createTitle')}
              />

              {createError && (
                <p role="alert" className="text-[12px] text-destructive">
                  {createError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={creatingHabit}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!createHabitTitle.trim()) return;
                    updateCreateHabitFrequency(createHabitFrequency);
                    setCreateStep(2);
                  }}
                  disabled={creatingHabit || !createHabitTitle.trim()}
                  aria-busy={creatingHabit}
                >
                  {lang === 'de' ? 'Weiter' : 'Next'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {HABIT_CREATE_FREQUENCY_OPTIONS.map((frequency) => (
                  <button
                    key={frequency}
                    type="button"
                    onClick={() => updateCreateHabitFrequency(frequency)}
                    disabled={creatingHabit}
                    className={cn(
                      'min-h-11 w-full rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm transition-colors',
                      createHabitFrequency === frequency
                        ? 'border-foreground bg-foreground/5 text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/[0.03]'
                    )}
                  >
                    {t(`frequency.${frequency}`)}
                  </button>
                ))}
              </div>

              {(createHabitFrequency === 'weekly' || createHabitFrequency === 'custom') && (
                <div>
                  <p className="mb-1.5 text-[10px] text-muted-foreground/60">
                    {createHabitFrequency === 'weekly' ? t('detail.scheduledDay') : t('detail.scheduledDays')}
                  </p>
                  <div className="grid grid-cols-4 gap-1">
                    {createStepWeekDays.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleCreateHabitDay(idx)}
                        disabled={creatingHabit}
                        aria-pressed={createHabitCustomDays.includes(idx)}
                        className={cn(
                          'flex min-h-11 w-full items-center justify-center rounded text-[10px] font-medium lg:min-h-10',
                          createHabitCustomDays.includes(idx)
                            ? 'bg-foreground text-background'
                            : 'bg-foreground/[0.05] text-muted-foreground'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {createError && (
                <p role="alert" className="text-[12px] text-destructive">
                  {createError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateStep(1)}
                  disabled={creatingHabit}
                >
                  {lang === 'de' ? 'Zurück' : 'Back'}
                </Button>
                <Button
                  type="button"
                  onClick={() => void (async () => {
                    if (!createHabitTitle.trim()) return;
                    const created = await handleCreateHabit(
                      createHabitTitle.trim(),
                      createHabitFrequency
                    );
                    if (!created) return;
                    resetCreateHabitDialog();
                    setCreateDialogOpen(false);
                  })()}
                  disabled={creatingHabit}
                  aria-busy={creatingHabit}
                >
                  {t('common.create')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              if (createError) setCreateDialogOpen(true);
              else if (toggleError) void toggleDay(toggleError.habitId, toggleError.date, toggleError.desired);
            }}
            disabled={creatingHabit || Boolean(toggleError && isTogglePending(toggleError.habitId, toggleError.date))}
            aria-busy={creatingHabit || Boolean(toggleError && isTogglePending(toggleError.habitId, toggleError.date))}
            className="min-h-11 rounded-lg bg-destructive/10 px-3 font-medium transition-colors hover:bg-destructive/20 disabled:cursor-wait disabled:opacity-60 lg:min-h-9"
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
                      disabled={isTogglePending(habit.id, today)}
                      aria-busy={isTogglePending(habit.id, today)}
                      aria-label={habitToggleLabel(habit.title, today, completed)}
                      aria-pressed={completed}
                      className={cn(
                        'relative -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-lg border-[1.5px] transition-colors',
                          completed
                            ? 'border-[var(--copy-tertiary)] bg-foreground/10'
                            : 'border-[var(--copy-tertiary)]',
                        )}
                      >
                        {completed && <CheckSquare className="h-3.5 w-3.5 text-foreground" />}
                      </span>
                    </button>
                    <button
                      onClick={() => setSelectedItemId(habit.id)}
                      className={cn(
                        'min-h-11 flex-1 truncate text-left text-[14px] font-medium transition-colors',
                        completed ? 'text-muted-foreground/50 line-through' : 'text-foreground'
                      )}
                    >
                      {habit.title}
                    </button>
                    {renderHabitTime(habit)}
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 tabular-nums font-medium shrink-0">
                        <Flame className="h-3.5 w-3.5" />
                        {streak}
                      </span>
                    )}
                    {renderPauseButton(habit)}
                  </div>
                  {/* Week dots */}
                  <div className="flex items-center justify-around px-1 pb-3 sm:px-4">
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
                              disabled={isFuture || isTogglePending(habit.id, day)}
                              aria-busy={isTogglePending(habit.id, day)}
                              aria-label={habitToggleLabel(habit.title, day, dayCompleted)}
                              aria-pressed={dayCompleted}
                              className={cn(
                                'flex h-11 w-11 items-center justify-center rounded-lg transition-all active:scale-90',
                                dayCompleted
                                  ? 'border border-[var(--copy-tertiary)] bg-foreground/10'
                                  : isCurrentDay
                                  ? 'border-[1.5px] border-[var(--copy-tertiary)]'
                                  : isFuture
                                  ? 'border border-border/30 opacity-30'
                                  : 'border border-[var(--copy-tertiary)]'
                              )}
                            >
                              {dayCompleted && <CheckSquare className="h-3.5 w-3.5 text-foreground" />}
                            </button>
                          ) : (
                            <div
                              className="flex h-11 w-11 items-center justify-center"
                              role="img"
                              aria-label={notScheduledLabel(day)}
                            >
                              <div className="h-1 w-1 rounded-full bg-foreground/10" aria-hidden="true" />
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
              return (
                <div
                  key={habit.id}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  {/* Habit header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                    <button
                      onClick={() => setSelectedItemId(habit.id)}
                      className="min-h-11 flex-1 truncate text-left text-[14px] font-medium"
                    >
                      {habit.title}
                    </button>
                    {renderHabitTime(habit)}
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 tabular-nums font-medium shrink-0">
                        <Flame className="h-3.5 w-3.5" />
                        {streak}
                      </span>
                    )}
                    {renderPauseButton(habit)}
                  </div>
                  {/* Month calendar grid */}
                  <div className="overflow-x-auto p-3">
                    <div className="grid min-w-[332px] grid-cols-7 gap-1">
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
                                disabled={isFuture || isTogglePending(habit.id, day)}
                                aria-busy={isTogglePending(habit.id, day)}
                                aria-label={habitToggleLabel(habit.title, day, dayCompleted)}
                                aria-pressed={dayCompleted}
                                className={cn(
                                  'w-full h-full rounded-md flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90',
                                  dayCompleted
                                    ? 'border border-[var(--copy-tertiary)] bg-foreground/10'
                                    : isCurrentDay
                                    ? 'border-[1.5px] border-[var(--copy-tertiary)]'
                                    : isFuture
                                    ? 'border border-border/30 opacity-30'
                                    : 'border border-[var(--copy-tertiary)]'
                                )}
                              >
                                <span className={cn(
                                  'text-[10px] tabular-nums font-medium',
                                  dayCompleted ? 'text-muted-foreground' : 'text-foreground/70'
                                )}>
                                  {format(day, 'd')}
                                </span>
                                {dayCompleted && <CheckSquare className="h-2.5 w-2.5 text-foreground" />}
                              </button>
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center"
                                role="img"
                                aria-label={notScheduledLabel(day)}
                              >
                                <span aria-hidden="true" className="text-[10px] text-muted-foreground/20 tabular-nums">
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
            <p className="text-[13px] text-muted-foreground/50">
              {t(filter === 'paused' ? 'habits.noPaused' : 'habits.noHabits')}
            </p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">
              {t(filter === 'paused' ? 'habits.noPausedDesc' : 'habits.noHabitsDesc')}
            </p>
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
                          disabled={isFuture || isTogglePending(habit.id, day)}
                          aria-busy={isTogglePending(habit.id, day)}
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
                        <div
                          className="h-7 w-7 flex items-center justify-center"
                          role="img"
                          aria-label={notScheduledLabel(day)}
                        >
                          <div className="h-0.5 w-0.5 rounded-full bg-foreground/10" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-center gap-0.5">
                  {streak > 0 ? (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums font-medium">
                      <Flame className="h-3 w-3" />
                      {streak}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/20">—</span>
                  )}
                  {renderPauseButton(habit)}
                </div>
              </div>
            );
          })}

          {habits.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                <Repeat className="h-4 w-4 text-muted-foreground/30" />
              </div>
              <p className="text-[12px] text-muted-foreground/50">
                {t(filter === 'paused' ? 'habits.noPaused' : 'habits.noHabits')}
              </p>
            </div>
          )}
        </div>
      ) : (
        // Month View - Desktop
        <div className="hidden lg:block space-y-4">
          {habits.map((habit) => {
            const streak = calculateStreak(habit);
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
                  {renderHabitTime(habit)}
                  {streak > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums font-medium">
                      <Flame className="h-3 w-3" />
                      {streak}
                    </span>
                  )}
                  {renderPauseButton(habit)}
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
                              disabled={isFuture || isTogglePending(habit.id, day)}
                              aria-busy={isTogglePending(habit.id, day)}
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
                            <div
                              className="w-full h-full flex items-center justify-center"
                              role="img"
                              aria-label={notScheduledLabel(day)}
                            >
                              <span aria-hidden="true" className="text-[11px] text-muted-foreground/15 tabular-nums">
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
              <p className="text-[12px] text-muted-foreground/50">
                {t(filter === 'paused' ? 'habits.noPaused' : 'habits.noHabits')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
