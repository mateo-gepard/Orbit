'use client';

import { useMemo } from 'react';
import { CheckSquare, Flame, Repeat } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { ItemRow } from '@/components/items/item-row';
import { cn } from '@/lib/utils';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { calculateStreak, isHabitScheduledForDate, isHabitCompletedForDate } from '@/lib/habits';
import { updateItem } from '@/lib/firestore';
import { useTranslation } from '@/lib/i18n';
import { getLocale } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';

export default function TodayPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const { overdue, todayTasks, todayEvents, todayHabits } = useMemo(() => {
    const overdue = items.filter(
      (i) => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate && isPast(parseISO(i.dueDate)) && !isToday(parseISO(i.dueDate))
    );
    const todayTasks = items.filter(
      (i) => i.type === 'task' && i.status !== 'done' && i.status !== 'archived' && i.dueDate === todayStr
    );
    const todayEvents = items.filter(
      (i) => i.type === 'event' && i.status !== 'archived' && i.startDate === todayStr
    );
    const todayHabits = items.filter(
      (i) => i.type === 'habit' && i.status === 'active' && isHabitScheduledForDate(i, today)
    );
    return { overdue, todayTasks, todayEvents, todayHabits };
  }, [items, todayStr]);

  const toggleHabit = async (habit: typeof items[0]) => {
    const completions = { ...(habit.completions || {}) };
    completions[todayStr] = !completions[todayStr];
    await updateItem(habit.id, { completions });
  };

  const totalTasks = overdue.length + todayTasks.length;

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-[13px] text-muted-foreground/60">{format(today, 'EEEE', { locale })}</p>
        <h1 className="text-xl font-semibold tracking-tight">{format(today, 'd MMMM yyyy', { locale })}</h1>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {t('today.overdue')} · {overdue.length}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card py-1">
            {overdue.map((item) => (
              <ItemRow key={item.id} item={item} showProject compact />
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <CheckSquare className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {t('today.tasks')} · {todayTasks.length}
          </span>
        </div>
        <div className="rounded-xl border border-border/60 bg-card py-1">
          {todayTasks.map((item) => (
            <ItemRow key={item.id} item={item} showProject compact />
          ))}
          {todayTasks.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground/40">
              {t('today.noTasks')}
            </p>
          )}
        </div>
      </div>

      {/* Events */}
      {todayEvents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {t('today.events')} · {todayEvents.length}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card py-1">
            {todayEvents.map((item) => (
              <ItemRow key={item.id} item={item} compact />
            ))}
          </div>
        </div>
      )}

      {/* Habits */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Repeat className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {t('today.habits')} · {todayHabits.length}
          </span>
        </div>
        <div className="rounded-xl border border-border/60 bg-card px-3 py-2 space-y-0.5">
          {todayHabits.map((habit) => {
            const completed = isHabitCompletedForDate(habit, today);
            const streak = calculateStreak(habit);
            return (
              <div key={habit.id} className="flex items-center gap-2.5 py-1.5">
                <button
                  onClick={() => toggleHabit(habit)}
                  className={cn(
                    'relative flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] transition-all shrink-0',
                    'before:absolute before:inset-[-6px]',
                    completed
                      ? 'border-foreground/20 bg-foreground/10'
                      : 'border-foreground/15 hover:border-foreground/30'
                  )}
                >
                  {completed && <CheckSquare className="h-2.5 w-2.5 text-foreground/40" />}
                </button>
                <span
                  className={cn(
                    'flex-1 text-[13px] cursor-pointer transition-colors hover:text-foreground',
                    completed ? 'line-through text-muted-foreground/40' : 'text-foreground'
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
            <p className="py-5 text-center text-[12px] text-muted-foreground/40">{t('today.noHabits')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
