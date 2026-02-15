'use client';

import { useMemo, useState } from 'react';
import { Target, Plus, Award, Lock, ChevronRight } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import type { GoalTimeframe } from '@/lib/types';
import { calculateBadges, getTierColor, getTierBorderColor, type Badge, type BadgeCategory } from '@/lib/badges';

const TIMEFRAME_LABELS: Record<GoalTimeframe, string> = {
  quarterly: 'This Quarter',
  yearly: 'This Year',
  longterm: 'Long-term',
};

export default function GoalsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | 'all'>('all');

  const goals = useMemo(
    () => items.filter((i) => i.type === 'goal' && i.status !== 'archived'),
    [items]
  );

  // Calculate all badges
  const badges = useMemo(() => calculateBadges(items), [items]);
  const earnedBadges = badges.filter((b) => b.isEarned);
  const unlockedCount = earnedBadges.length;
  const totalBadges = badges.length;

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

  // Group badges by category
  const filteredBadges = useMemo(() => {
    if (selectedCategory === 'all') return badges;
    return badges.filter((b) => b.category === selectedCategory);
  }, [badges, selectedCategory]);

  const categories: { key: BadgeCategory | 'all'; label: string; emoji: string }[] = [
    { key: 'all', label: 'All', emoji: '🏆' },
    { key: 'streak', label: 'Streaks', emoji: '🔥' },
    { key: 'tasks', label: 'Tasks', emoji: '✅' },
    { key: 'projects', label: 'Projects', emoji: '📁' },
    { key: 'habits', label: 'Habits', emoji: '🌱' },
    { key: 'goals', label: 'Goals', emoji: '🎯' },
    { key: 'special', label: 'Special', emoji: '✨' },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Goals & Achievements</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {goals.length} active goals · {unlockedCount}/{totalBadges} badges earned
          </p>
        </div>
        <button
          onClick={handleNewGoal}
          className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-1.5 text-[13px] lg:text-[12px] font-medium text-background transition-opacity hover:opacity-90 active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" />
          New Goal
        </button>
      </div>

      {/* Achievement Badges Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.5} />
          <h2 className="text-[15px] font-semibold">Achievements</h2>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
          {categories.map((cat) => {
            const categoryBadges = cat.key === 'all' ? badges : badges.filter((b) => b.category === cat.key);
            const earnedInCategory = categoryBadges.filter((b) => b.isEarned).length;
            
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={cn(
                  'shrink-0 rounded-xl lg:rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all active:scale-95 flex items-center gap-1.5',
                  selectedCategory === cat.key
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                )}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-60">
                  {earnedInCategory}/{categoryBadges.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Badges Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {filteredBadges.map((badge) => (
            <div
              key={badge.id}
              className={cn(
                'relative rounded-xl border p-3 transition-all',
                badge.isEarned
                  ? cn(
                      'bg-gradient-to-br',
                      getTierColor(badge.tier),
                      getTierBorderColor(badge.tier),
                      'hover:scale-[1.02] cursor-pointer'
                    )
                  : 'bg-card border-border/40 opacity-50'
              )}
            >
              {/* Lock icon for unearned badges */}
              {!badge.isEarned && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-3 w-3 text-muted-foreground/30" strokeWidth={2} />
                </div>
              )}

              {/* Badge emoji */}
              <div className={cn(
                'text-3xl mb-2 transition-all',
                badge.isEarned ? 'grayscale-0' : 'grayscale opacity-40'
              )}>
                {badge.emoji}
              </div>

              {/* Badge info */}
              <div className="space-y-1">
                <h3 className={cn(
                  'text-[12px] font-semibold leading-tight',
                  badge.isEarned ? 'text-foreground' : 'text-muted-foreground/50'
                )}>
                  {badge.name}
                </h3>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2">
                  {badge.description}
                </p>

                {/* Progress bar for unearned badges */}
                {!badge.isEarned && badge.progress > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/20 transition-all"
                        style={{ width: `${Math.min((badge.progress / badge.requirement) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/40 tabular-nums">
                      {badge.progress}/{badge.requirement}
                    </span>
                  </div>
                )}

                {/* Earned indicator */}
                {badge.isEarned && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[9px] font-medium text-foreground/60 uppercase tracking-wider">
                      Unlocked
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Empty state for category */}
        {filteredBadges.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[12px] text-muted-foreground/40">
              No badges in this category yet
            </p>
          </div>
        )}
      </div>

      {/* Goals Section */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.5} />
          <h2 className="text-[15px] font-semibold">Your Goals</h2>
        </div>

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
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-border/40 bg-card">
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
    </div>
  );
}
