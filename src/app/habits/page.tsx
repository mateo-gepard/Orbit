'use client';

import { useMemo } from 'react';
import { Repeat, Flame, Plus, CheckSquare } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem, updateItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { calculateStreak, isHabitScheduledForDate, isHabitCompletedForDate, getWeekCompletionRate } from '@/lib/habits';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HabitsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const habits = useMemo(
    () => items.filter((i) => i.type === 'habit' && i.status === 'active'),
    [items]
  );

  const completionRate = getWeekCompletionRate(habits, weekStart);

  const toggleDay = async (habit: typeof habits[0], date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const completions = { ...(habit.completions || {}) };
    completions[dateKey] = !completions[dateKey];
    await updateItem(habit.id, { completions });
  };

  const handleNewHabit = async () => {
    if (!user) return;
    const id = await createItem({
      type: 'habit',
      status: 'active',
      title: 'New Habit',
      frequency: 'daily',
      completions: {},
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Habits</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {completionRate}% this week
          </p>
        </div>
        <button
          onClick={handleNewHabit}
          className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Habit tracker grid */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
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
                {DAY_LABELS[(day.getDay() + 6) % 7]}
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
            Streak
          </div>
        </div>

        {/* Habit rows */}
        {habits.map((habit) => {
          const streak = calculateStreak(habit);
          return (
            <div
              key={habit.id}
              className="grid grid-cols-[1fr_repeat(7,40px)_56px] gap-px items-center px-4 py-2 border-b border-border/30 last:border-0 hover:bg-foreground/[0.02] transition-colors"
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
                        onClick={() => !isFuture && toggleDay(habit, day)}
                        disabled={isFuture}
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
            <p className="text-[12px] text-muted-foreground/50">No habits yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
