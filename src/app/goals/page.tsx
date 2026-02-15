'use client';

import { useMemo } from 'react';
import { Target, Plus } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import { computeBadges } from '@/lib/badges';
import { BadgesSection } from '@/components/ui/badge-stack';
import type { GoalTimeframe } from '@/lib/types';

const TIMEFRAME_LABELS: Record<GoalTimeframe, string> = {
  quarterly: 'This Quarter',
  yearly: 'This Year',
  longterm: 'Long-term',
};

export default function GoalsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();

  const goals = useMemo(
    () => items.filter((i) => i.type === 'goal' && i.status !== 'archived'),
    [items]
  );

  const badgeCategories = useMemo(() => computeBadges(items), [items]);

  const getGoalProgress = (goalId: string) => {
    const goal = items.find((i) => i.id === goalId);
    if (!goal?.linkedIds?.length) return 0;
    const linked = items.filter((i) => goal.linkedIds!.includes(i.id));
    if (linked.length === 0) return 0;
    const done = linked.filter((i) => i.status === 'done').length;
    return Math.round((done / linked.length) * 100);
  };

  const handleNewGoal = async () => {
    if (!user) return;
    const id = await createItem({
      type: 'goal',
      status: 'active',
      title: 'New Goal',
      timeframe: 'quarterly',
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

  const groupedGoals = useMemo(() => {
    const groups: Record<GoalTimeframe, typeof goals> = {
      quarterly: [],
      yearly: [],
      longterm: [],
    };
    goals.forEach((goal) => {
      const tf = goal.timeframe || 'quarterly';
      groups[tf].push(goal);
    });
    return groups;
  }, [goals]);

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Goals</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {goals.length} active
          </p>
        </div>
        <button
          onClick={handleNewGoal}
          className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-1.5 text-[13px] lg:text-[12px] font-medium text-background transition-opacity hover:opacity-90 active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* ── Achievements ── */}
      <BadgesSection categories={badgeCategories} />

      {/* ── Goals by timeframe ── */}

      {(['quarterly', 'yearly', 'longterm'] as GoalTimeframe[]).map((timeframe) => {
        const group = groupedGoals[timeframe];
        if (group.length === 0) return null;
        return (
          <div key={timeframe}>
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 px-1">
              {TIMEFRAME_LABELS[timeframe]}
            </span>
            <div className="grid gap-2.5 sm:grid-cols-2 mt-2">
              {group.map((goal) => {
                const progress = getGoalProgress(goal.id);
                const linkedCount = goal.linkedIds?.length || 0;
                return (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedItemId(goal.id)}
                    className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:bg-foreground/[0.02] hover:border-border group active:scale-[0.98]"
                  >
                    <div>
                      <h3 className="text-[14px] lg:text-[13px] font-semibold group-hover:text-foreground transition-colors">
                        {goal.title}
                      </h3>
                      {goal.metric && (
                        <p className="text-[11px] text-muted-foreground/50 mt-1 italic line-clamp-2 leading-relaxed">
                          {goal.metric}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-foreground/20 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/40 tabular-nums">{progress}%</span>
                        <span className="text-[10px] text-muted-foreground/30">{linkedCount} linked</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {goals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
            <Target className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <h3 className="text-[15px] font-medium">No goals yet</h3>
          <p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs">
            Define goals and link tasks to track progress toward what matters.
          </p>
        </div>
      )}
    </div>
  );
}
