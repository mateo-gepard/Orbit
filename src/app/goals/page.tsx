'use client';

import { useMemo, useState } from 'react';
import { 
  Target, 
  Plus, 
  Award, 
  Lock, 
  Flame,
  CheckCircle2,
  FolderKanban,
  Repeat,
  TrendingUp,
  Sparkles,
  ChevronRight
} from 'lucide-react';
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

  const categories: { 
    key: BadgeCategory | 'all'; 
    label: string; 
    icon: typeof Award;
  }[] = [
    { key: 'all', label: 'All Badges', icon: Award },
    { key: 'streak', label: 'Streaks', icon: Flame },
    { key: 'tasks', label: 'Tasks', icon: CheckCircle2 },
    { key: 'projects', label: 'Projects', icon: FolderKanban },
    { key: 'habits', label: 'Habits', icon: Repeat },
    { key: 'goals', label: 'Goals', icon: Target },
    { key: 'special', label: 'Special', icon: Sparkles },
  ];

  // Get icon for badge category
  const getBadgeIcon = (category: BadgeCategory) => {
    switch (category) {
      case 'streak': return Flame;
      case 'tasks': return CheckCircle2;
      case 'projects': return FolderKanban;
      case 'habits': return Repeat;
      case 'goals': return Target;
      case 'special': return Sparkles;
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Achievements & Goals</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {unlockedCount} of {totalBadges} achievements unlocked · {goals.length} active goals
          </p>
        </div>
        <button
          onClick={handleNewGoal}
          className="flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Goal</span>
        </button>
      </div>

      {/* Achievement Badges Section */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
              <Award className="h-4 w-4 text-foreground/70" strokeWidth={2} />
            </div>
            <h2 className="text-[17px] font-semibold">Achievements</h2>
          </div>
        </div>

        {/* Category Navigation */}
        <div className="border-b border-border/50">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
            {categories.map((cat) => {
              const categoryBadges = cat.key === 'all' ? badges : badges.filter((b) => b.category === cat.key);
              const earnedInCategory = categoryBadges.filter((b) => b.isEarned).length;
              const Icon = cat.icon;
              
              return (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={cn(
                    'shrink-0 px-4 py-2.5 text-[13px] font-medium transition-all flex items-center gap-2 border-b-2 -mb-px',
                    selectedCategory === cat.key
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground/60 hover:text-foreground/80'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{cat.label}</span>
                  <span className={cn(
                    "ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold",
                    selectedCategory === cat.key
                      ? "bg-foreground/10"
                      : "bg-foreground/5"
                  )}>
                    {earnedInCategory}/{categoryBadges.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Badges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBadges.map((badge) => {
            const Icon = getBadgeIcon(badge.category);
            const progressPercent = badge.requirement > 0 
              ? Math.min((badge.progress / badge.requirement) * 100, 100) 
              : 0;

            return (
              <div
                key={badge.id}
                className={cn(
                  'relative rounded-lg border p-4 transition-all group',
                  badge.isEarned
                    ? cn(
                        'bg-gradient-to-br border-border/40 hover:border-border/60 cursor-pointer hover:shadow-md',
                        badge.tier === 'bronze' && 'from-amber-50/30 to-orange-50/20 dark:from-amber-950/10 dark:to-orange-950/5',
                        badge.tier === 'silver' && 'from-slate-50/30 to-zinc-50/20 dark:from-slate-950/10 dark:to-zinc-950/5',
                        badge.tier === 'gold' && 'from-yellow-50/30 to-amber-50/20 dark:from-yellow-950/10 dark:to-amber-950/5',
                        badge.tier === 'platinum' && 'from-cyan-50/30 to-blue-50/20 dark:from-cyan-950/10 dark:to-blue-950/5',
                        badge.tier === 'diamond' && 'from-purple-50/30 to-pink-50/20 dark:from-purple-950/10 dark:to-pink-950/5',
                        !badge.tier && 'from-foreground/[0.02] to-foreground/[0.01]'
                      )
                    : 'bg-card border-border/30 opacity-60'
                )}
              >
                {/* Lock icon for unearned badges */}
                {!badge.isEarned && (
                  <div className="absolute top-3 right-3">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/30" strokeWidth={2} />
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={cn(
                    'shrink-0 h-10 w-10 rounded-lg flex items-center justify-center transition-all',
                    badge.isEarned
                      ? cn(
                          badge.tier === 'bronze' && 'bg-gradient-to-br from-amber-500/20 to-orange-500/20',
                          badge.tier === 'silver' && 'bg-gradient-to-br from-slate-400/20 to-zinc-400/20',
                          badge.tier === 'gold' && 'bg-gradient-to-br from-yellow-500/20 to-amber-500/20',
                          badge.tier === 'platinum' && 'bg-gradient-to-br from-cyan-400/20 to-blue-500/20',
                          badge.tier === 'diamond' && 'bg-gradient-to-br from-purple-500/20 to-pink-500/20',
                          !badge.tier && 'bg-foreground/5'
                        )
                      : 'bg-foreground/5'
                  )}>
                    <Icon className={cn(
                      'h-5 w-5',
                      badge.isEarned ? 'text-foreground/70' : 'text-muted-foreground/40'
                    )} strokeWidth={2} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div>
                      <h3 className={cn(
                        'text-[13px] font-semibold leading-tight',
                        badge.isEarned ? 'text-foreground' : 'text-muted-foreground/70'
                      )}>
                        {badge.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed mt-0.5">
                        {badge.description}
                      </p>
                    </div>

                    {/* Tier badge */}
                    {badge.tier && (
                      <div className={cn(
                        "inline-block px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider",
                        badge.tier === 'bronze' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                        badge.tier === 'silver' && 'bg-slate-400/10 text-slate-700 dark:text-slate-400',
                        badge.tier === 'gold' && 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
                        badge.tier === 'platinum' && 'bg-cyan-400/10 text-cyan-700 dark:text-cyan-400',
                        badge.tier === 'diamond' && 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
                      )}>
                        {badge.tier}
                      </div>
                    )}

                    {/* Progress bar for unearned badges */}
                    {!badge.isEarned && badge.progress > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground/30 transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                          {badge.progress} / {badge.requirement}
                        </span>
                      </div>
                    )}

                    {/* Earned status */}
                    {badge.isEarned && (
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/60">
                        <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                        <span>Unlocked</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredBadges.length === 0 && (
          <div className="text-center py-12 border border-border/40 rounded-lg bg-card">
            <Award className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground/50">
              No badges in this category yet
            </p>
          </div>
        )}
      </div>

      {/* Goals Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Target className="h-4 w-4 text-foreground/70" strokeWidth={2} />
          </div>
          <h2 className="text-[17px] font-semibold">Your Goals</h2>
        </div>

        {(['quarterly', 'yearly', 'longterm'] as GoalTimeframe[]).map((timeframe) => {
          const group = groupedGoals[timeframe];
          if (group.length === 0) return null;
          return (
            <div key={timeframe} className="space-y-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-1">
                {TIMEFRAME_LABELS[timeframe]}
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.map((goal) => {
                  const progress = getGoalProgress(goal.id);
                  const linkedCount = goal.linkedIds?.length || 0;
                  return (
                    <button
                      key={goal.id}
                      onClick={() => setSelectedItemId(goal.id)}
                      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 text-left transition-all hover:bg-foreground/[0.02] hover:border-border group active:scale-[0.98]"
                    >
                      <div>
                        <h3 className="text-[14px] font-semibold group-hover:text-foreground transition-colors leading-tight">
                          {goal.title}
                        </h3>
                        {goal.metric && (
                          <p className="text-[12px] text-muted-foreground/60 mt-1.5 line-clamp-2 leading-relaxed">
                            {goal.metric}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground/25 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground/50 tabular-nums font-medium">{progress}%</span>
                          <span className="text-muted-foreground/40">{linkedCount} linked items</span>
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
          <div className="flex flex-col items-center justify-center py-16 text-center border border-border/40 rounded-lg bg-card">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-foreground/5">
              <Target className="h-6 w-6 text-muted-foreground/40" strokeWidth={2} />
            </div>
            <h3 className="text-[15px] font-medium">No goals yet</h3>
            <p className="text-[13px] text-muted-foreground/60 mt-1 max-w-sm leading-relaxed">
              Define goals and link tasks to track progress toward what matters most.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
