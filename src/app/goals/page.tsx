'use client';

import { useMemo, useRef, useState } from 'react';
import { Target, Plus } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { computeBadges } from '@/lib/badges';
import { BadgesSection } from '@/components/ui/badge-stack';
import type { GoalTimeframe } from '@/lib/types';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

const TIMEFRAME_KEYS: Record<GoalTimeframe, TranslationKey> = {
  quarterly: 'goals.thisQuarter',
  yearly: 'goals.thisYear',
  longterm: 'goals.longterm',
};

export default function GoalsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const { t, tp, lang } = useTranslation();
  const createInFlightRef = useRef(false);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const goals = useMemo(
    () => items.filter((i) => i.type === 'goal' && i.status !== 'archived'),
    [items]
  );

  const badgeCategories = useMemo(() => computeBadges(items), [items]);

  const getGoalStats = (goalId: string) => {
    const goal = items.find((i) => i.id === goalId);
    if (!goal) return { progress: 0, relatedCount: 0 };

    const related = items.filter((candidate) =>
      candidate.id !== goalId &&
      candidate.status !== 'archived' &&
      (
        candidate.parentId === goalId ||
        goal.linkedIds?.includes(candidate.id) ||
        candidate.linkedIds?.includes(goalId)
      )
    );
    const done = related.filter((candidate) => candidate.status === 'done').length;
    return {
      progress: related.length > 0 ? Math.round((done / related.length) * 100) : 0,
      relatedCount: related.length,
    };
  };

  const handleNewGoal = async () => {
    if (createInFlightRef.current) return;
    if (!user) {
      setCreateError(lang === 'de'
        ? 'Deine Sitzung ist nicht mehr aktiv. Melde dich erneut an und versuche es noch einmal.'
        : 'Your session is no longer active. Sign in again and retry.');
      return;
    }

    createInFlightRef.current = true;
    setCreatingGoal(true);
    setCreateError(null);
    try {
      const id = await createItem({
        type: 'goal',
        status: 'active',
        title: t('goals.newGoalTitle'),
        timeframe: 'quarterly',
        tags: [],
        userId: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setSelectedItemId(id);
    } catch (cause) {
      console.error('[THREADMAP] Goal creation failed:', cause);
      setCreateError(lang === 'de'
        ? 'Das Ziel konnte nicht erstellt werden. Versuche es erneut.'
        : 'The goal could not be created. Please retry.');
    } finally {
      createInFlightRef.current = false;
      setCreatingGoal(false);
    }
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

  const ongoingCount = goals.filter((goal) => goal.status !== 'done').length;
  const completedCount = goals.filter((goal) => goal.status === 'done').length;

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-4xl mx-auto" data-slot="page-content">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('nav.goals')}</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {tp('goals.ongoing.one', 'goals.ongoing.other', ongoingCount)} ·{' '}
            {tp('goals.complete.one', 'goals.complete.other', completedCount)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleNewGoal()}
          disabled={creatingGoal}
          aria-busy={creatingGoal}
          className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-1.5 text-[13px] lg:text-[12px] font-medium text-background transition-opacity hover:opacity-90 active:scale-95 transition-transform disabled:cursor-wait disabled:opacity-70"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          {creatingGoal
            ? (lang === 'de' ? 'Wird erstellt …' : 'Creating…')
            : t('common.new')}
        </button>
      </div>

      {createError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.05] px-3 py-2.5 text-[12px] text-destructive">
          <p>{createError}</p>
          <button
            type="button"
            onClick={() => void handleNewGoal()}
            disabled={creatingGoal}
            aria-busy={creatingGoal}
            className="min-h-9 rounded-lg bg-destructive/10 px-3 font-medium transition-colors hover:bg-destructive/20 disabled:cursor-wait disabled:opacity-60"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* ── Achievements ── */}
      <BadgesSection categories={badgeCategories} />

      {/* ── Goals by timeframe ── */}

      {(['quarterly', 'yearly', 'longterm'] as GoalTimeframe[]).map((timeframe) => {
        const group = groupedGoals[timeframe];
        if (group.length === 0) return null;
        return (
          <div key={timeframe}>
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 px-1">
              {t(TIMEFRAME_KEYS[timeframe])}
            </span>
            <div className="grid gap-2.5 sm:grid-cols-2 mt-2">
              {group.map((goal) => {
                const { progress, relatedCount } = getGoalStats(goal.id);
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
                      {goal.status === 'done' && (
                        <span className="mt-1 inline-flex rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                          {t('goals.completeBadge')}
                        </span>
                      )}
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
                        <span className="text-[10px] text-muted-foreground/40">
                          {tp('goals.related.one', 'goals.related.other', relatedCount)}
                        </span>
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
          <h3 className="text-[15px] font-medium">{t('goals.noGoals')}</h3>
          <p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs">
            {t('goals.noGoalsDesc')}
          </p>
        </div>
      )}
    </div>
  );
}
