'use client';

import {
  Flame,
  CheckSquare,
  FolderKanban,
  Target,
  Repeat,
  PenLine,
  Link,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BadgeCategory, EarnedBadge } from '@/lib/badges';
import { TIER_STYLES } from '@/lib/badges';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useTranslation,
  type Translate,
  type TranslatePlural,
  type TranslationKey,
} from '@/lib/i18n';

// ─── Icon mapping ──────────────────────────────────────────

const ICON_MAP: Record<string, typeof Flame> = {
  Flame,
  CheckSquare,
  FolderKanban,
  Target,
  Repeat,
  PenLine,
  Link,
};

const CATEGORY_KEYS: Record<string, TranslationKey> = {
  streak: 'badges.category.streak',
  tasks: 'badges.category.tasks',
  projects: 'badges.category.projects',
  goals: 'badges.category.goals',
  habits: 'badges.category.habits',
  notes: 'badges.category.notes',
  links: 'badges.category.links',
};

const TIER_KEYS: Record<EarnedBadge['tier'], TranslationKey> = {
  bronze: 'badges.tier.bronze',
  silver: 'badges.tier.silver',
  gold: 'badges.tier.gold',
  platinum: 'badges.tier.platinum',
  diamond: 'badges.tier.diamond',
};

const BADGE_NAME_KEYS: Record<string, TranslationKey> = {
  'streak-1': 'badges.name.streak1',
  'streak-2': 'badges.name.streak2',
  'streak-3': 'badges.name.streak3',
  'streak-4': 'badges.name.streak4',
  'streak-5': 'badges.name.streak5',
  'tasks-1': 'badges.name.tasks1',
  'tasks-2': 'badges.name.tasks2',
  'tasks-3': 'badges.name.tasks3',
  'tasks-4': 'badges.name.tasks4',
  'tasks-5': 'badges.name.tasks5',
  'projects-1': 'badges.name.projects1',
  'projects-2': 'badges.name.projects2',
  'projects-3': 'badges.name.projects3',
  'projects-4': 'badges.name.projects4',
  'projects-5': 'badges.name.projects5',
  'goals-1': 'badges.name.goals1',
  'goals-2': 'badges.name.goals2',
  'goals-3': 'badges.name.goals3',
  'goals-4': 'badges.name.goals4',
  'goals-5': 'badges.name.goals5',
  'habits-1': 'badges.name.habits1',
  'habits-2': 'badges.name.habits2',
  'habits-3': 'badges.name.habits3',
  'habits-4': 'badges.name.habits4',
  'habits-5': 'badges.name.habits5',
  'notes-1': 'badges.name.notes1',
  'notes-2': 'badges.name.notes2',
  'notes-3': 'badges.name.notes3',
  'notes-4': 'badges.name.notes4',
  'notes-5': 'badges.name.notes5',
  'links-1': 'badges.name.links1',
  'links-2': 'badges.name.links2',
  'links-3': 'badges.name.links3',
  'links-4': 'badges.name.links4',
  'links-5': 'badges.name.links5',
};

function categoryLabel(category: BadgeCategory, translate: Translate): string {
  const key = CATEGORY_KEYS[category.id];
  return key ? translate(key) : category.label;
}

function badgeName(badge: EarnedBadge, translate: Translate): string {
  const key = BADGE_NAME_KEYS[badge.id];
  return key ? translate(key) : badge.name;
}

function badgeDescription(badge: EarnedBadge, translate: Translate, translatePlural: TranslatePlural): string {
  switch (badge.category) {
    case 'streak':
      return translate('badges.description.streak', { count: badge.threshold });
    case 'tasks':
      return translatePlural('badges.description.tasks.one', 'badges.description.tasks.other', badge.threshold);
    case 'projects':
      return translatePlural('badges.description.projects.one', 'badges.description.projects.other', badge.threshold);
    case 'goals':
      return translatePlural('badges.description.goals.one', 'badges.description.goals.other', badge.threshold);
    case 'habits':
      return translatePlural('badges.description.habits.one', 'badges.description.habits.other', badge.threshold);
    case 'notes':
      return translatePlural('badges.description.notes.one', 'badges.description.notes.other', badge.threshold);
    case 'links':
      return translatePlural('badges.description.links.one', 'badges.description.links.other', badge.threshold);
    default:
      return badge.description;
  }
}

// ─── Badge Stack (collapsed → click-to-expand) ────────────

export function BadgeStack({ category }: { category: BadgeCategory }) {
  const { t } = useTranslation();
  const { highestEarned, badges } = category;
  const Icon = ICON_MAP[category.icon] || Target;
  const earnedBadges = badges.filter((b) => b.earned);
  const hasAny = earnedBadges.length > 0;
  const topStyle = highestEarned ? TIER_STYLES[highestEarned.tier] : null;
  const localizedCategory = categoryLabel(category, t);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('badges.viewCategory', { category: localizedCategory })}
          className="relative block w-full cursor-pointer rounded-xl text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
        {/* Stacked card layers */}
        {hasAny && earnedBadges.length > 1 && (
          <>
            <div
              className={cn(
                'absolute inset-x-1.5 -bottom-1 h-3 rounded-b-xl border border-t-0 opacity-30',
                earnedBadges.length > 2
                  ? TIER_STYLES[earnedBadges[earnedBadges.length - 3]?.tier || 'bronze'].border
                  : TIER_STYLES[earnedBadges[0].tier].border,
                earnedBadges.length > 2
                  ? TIER_STYLES[earnedBadges[earnedBadges.length - 3]?.tier || 'bronze'].bg
                  : TIER_STYLES[earnedBadges[0].tier].bg
              )}
            />
            <div
              className={cn(
                'absolute inset-x-0.5 -bottom-0.5 h-2 rounded-b-xl border border-t-0 opacity-50',
                TIER_STYLES[earnedBadges[earnedBadges.length - 2]?.tier || earnedBadges[0].tier].border,
                TIER_STYLES[earnedBadges[earnedBadges.length - 2]?.tier || earnedBadges[0].tier].bg
              )}
            />
          </>
        )}

        {/* Top card */}
        <div
          className={cn(
            'relative flex flex-col items-center rounded-xl border p-3.5 min-w-[88px] transition-all',
            'group-hover:scale-[1.03] group-active:scale-[0.97]',
            hasAny && topStyle
              ? cn(topStyle.bg, topStyle.border, topStyle.glow)
              : 'bg-foreground/[0.02] border-border/40'
          )}
        >
          {hasAny && highestEarned && (
            <div
              className={cn(
                'absolute -top-1 -right-1 h-4 w-4 rounded-full border text-[8px] font-bold',
                'flex items-center justify-center',
                topStyle!.bg, topStyle!.border, topStyle!.text
              )}
            >
              {earnedBadges.length}
            </div>
          )}

          <div className={cn('flex items-center justify-center h-9 w-9 mb-2', hasAny && topStyle ? topStyle.text : 'text-muted-foreground/20')}>
            <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </div>

          <span className={cn('text-[11px] font-semibold text-center leading-tight', hasAny ? 'text-foreground' : 'text-muted-foreground/30')}>
            {hasAny && highestEarned ? badgeName(highestEarned, t) : localizedCategory}
          </span>

          <span className={cn('text-[9px] font-medium mt-0.5', hasAny && topStyle ? topStyle.text : 'text-muted-foreground/20')}>
            {hasAny && highestEarned ? t(TIER_KEYS[highestEarned.tier]) : t('badges.locked')}
          </span>

          <span className="text-[8px] text-muted-foreground/40 mt-1 font-medium uppercase tracking-wider">
            {localizedCategory}
          </span>
        </div>
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[320px] gap-0 border-border/60 bg-card/95 p-5 backdrop-blur-xl"
      >
        <DialogClose
          aria-label={t('common.close')}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </DialogClose>
        <div className="flex items-center gap-2 mb-4 pb-3 pr-7 border-b border-border/40">
          <div className={cn(
            'flex items-center justify-center h-8 w-8 rounded-lg',
            hasAny && topStyle ? cn(topStyle.bg, topStyle.text) : 'bg-foreground/[0.04] text-muted-foreground/40'
          )}>
            <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div>
            <DialogTitle className="text-[13px] font-semibold">
              {localizedCategory}
            </DialogTitle>
            <DialogDescription className="text-[10px] text-muted-foreground/50">
              {t('badges.unlocked', { earned: earnedBadges.length, total: badges.length })}
            </DialogDescription>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {badges.map((badge) => (
            <BadgeTierRow key={badge.id} badge={badge} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Badge Tier Row (in expanded view) ─────────────────────

function BadgeTierRow({ badge }: { badge: EarnedBadge }) {
  const { t, tp } = useTranslation();
  const Icon = ICON_MAP[badge.icon] || Target;
  const style = TIER_STYLES[badge.tier];
  const progress = Math.min((badge.current / badge.threshold) * 100, 100);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5 transition-all',
        badge.earned
          ? cn(style.bg, style.border, style.glow)
          : 'bg-foreground/[0.015] border-border/30'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center h-8 w-8 rounded-lg shrink-0',
          badge.earned ? style.text : 'text-muted-foreground/15'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-[12px] font-semibold',
              badge.earned ? 'text-foreground' : 'text-muted-foreground/25'
            )}
          >
            {badgeName(badge, t)}
          </span>
          <span
            className={cn(
              'text-[9px] font-medium px-1.5 py-0.5 rounded-md',
              badge.earned
                ? cn(style.bg, style.text, 'border', style.border)
                : 'bg-foreground/[0.03] text-muted-foreground/20'
            )}
          >
            {t(TIER_KEYS[badge.tier])}
          </span>
        </div>
        <p
          className={cn(
            'text-[10px] mt-0.5',
            badge.earned ? 'text-muted-foreground/50' : 'text-muted-foreground/20'
          )}
        >
          {badgeDescription(badge, t, tp)}
        </p>

        {/* Progress bar for unearned */}
        {!badge.earned && (
          <div className="flex items-center gap-2 mt-1.5">
            <div
              className="flex-1 h-1 rounded-full bg-foreground/[0.04] overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={badge.threshold}
              aria-valuenow={Math.min(badge.current, badge.threshold)}
              aria-label={t('badges.progress', {
                name: badgeName(badge, t),
                current: badge.current,
                threshold: badge.threshold,
              })}
            >
              <div
                className="h-full rounded-full bg-foreground/10 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground/25 tabular-nums shrink-0">
              {badge.current}/{badge.threshold}
            </span>
          </div>
        )}
      </div>

      {/* Checkmark for earned */}
      {badge.earned && (
        <div className={cn('shrink-0', style.text)}>
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 8.5L6.5 11L12 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Badges Grid (main component for goals page) ───────────

export function BadgesSection({ categories }: { categories: BadgeCategory[] }) {
  const { t } = useTranslation();
  const totalEarned = categories.reduce(
    (sum, cat) => sum + cat.badges.filter((b) => b.earned).length,
    0
  );
  const totalBadges = categories.reduce((sum, cat) => sum + cat.badges.length, 0);

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-5 w-5">
            <svg aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18" />
              <path d="M18 9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
              <path d="M12 3v4" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold">{t('badges.achievements')}</span>
          <span className="text-[11px] text-muted-foreground/40 tabular-nums">
            {totalEarned}/{totalBadges}
          </span>
        </div>
      </div>

      {/* Badge stacks grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {categories.map((category) => (
          <BadgeStack key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}
