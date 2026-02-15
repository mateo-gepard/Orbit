'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Flame,
  CheckSquare,
  FolderKanban,
  Target,
  Repeat,
  PenLine,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BadgeCategory, EarnedBadge, BadgeTier } from '@/lib/badges';
import { TIER_STYLES } from '@/lib/badges';

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

// ─── Tier visual order (for the subtle ring on stacked cards) ──

const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// ─── Single Badge Card ─────────────────────────────────────

function BadgeCard({
  badge,
  size = 'md',
  showDetails = false,
  className,
}: {
  badge: EarnedBadge;
  size?: 'sm' | 'md';
  showDetails?: boolean;
  className?: string;
}) {
  const Icon = ICON_MAP[badge.icon] || Target;
  const style = TIER_STYLES[badge.tier];

  return (
    <div
      className={cn(
        'relative flex flex-col items-center rounded-xl border transition-all',
        style.bg,
        style.border,
        style.glow,
        badge.earned ? 'opacity-100' : 'opacity-30',
        size === 'sm' ? 'p-2.5 min-w-[72px]' : 'p-3.5 min-w-[88px]',
        className
      )}
    >
      {/* Tier indicator dot */}
      <div
        className={cn(
          'absolute -top-1 -right-1 rounded-full border text-[8px] font-bold leading-none',
          'flex items-center justify-center',
          size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
          badge.earned
            ? cn(style.bg, style.border, style.text)
            : 'bg-muted/50 border-border/40 text-muted-foreground/30'
        )}
      >
        {TIER_ORDER.indexOf(badge.tier) + 1}
      </div>

      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center rounded-lg',
          size === 'sm' ? 'h-7 w-7 mb-1.5' : 'h-9 w-9 mb-2',
          badge.earned ? style.text : 'text-muted-foreground/20'
        )}
      >
        <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={1.5} />
      </div>

      {/* Name */}
      <span
        className={cn(
          'font-semibold text-center leading-tight',
          size === 'sm' ? 'text-[10px]' : 'text-[11px]',
          badge.earned ? 'text-foreground' : 'text-muted-foreground/30'
        )}
      >
        {badge.name}
      </span>

      {/* Tier label */}
      <span
        className={cn(
          'font-medium mt-0.5',
          size === 'sm' ? 'text-[8px]' : 'text-[9px]',
          badge.earned ? style.text : 'text-muted-foreground/20'
        )}
      >
        {style.label}
      </span>

      {/* Details on hover expansion */}
      {showDetails && (
        <div className="mt-1.5 text-center">
          <p
            className={cn(
              'text-[9px] leading-snug',
              badge.earned ? 'text-muted-foreground/60' : 'text-muted-foreground/20'
            )}
          >
            {badge.description}
          </p>
          {!badge.earned && (
            <p className="text-[9px] text-muted-foreground/30 mt-1 tabular-nums">
              {badge.current}/{badge.threshold}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Badge Stack (collapsed → expandable) ──────────────────

export function BadgeStack({ category }: { category: BadgeCategory }) {
  const [expanded, setExpanded] = useState(false);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const { highestEarned, badges } = category;
  const Icon = ICON_MAP[category.icon] || Target;

  // Get stacked badges (show top earned + hints of lower tiers underneath)
  const earnedBadges = badges.filter((b) => b.earned);
  const hasAny = earnedBadges.length > 0;

  const handleEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (stackRef.current) {
      const rect = stackRef.current.getBoundingClientRect();
      setOverlayPos({
        top: rect.top,
        left: rect.left,
        width: rect.width,
      });
    }
    setExpanded(true);
  };

  const handleLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      setExpanded(false);
    }, 200);
  };

  // Close on escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [expanded]);

  const topStyle = highestEarned ? TIER_STYLES[highestEarned.tier] : null;

  return (
    <>
      {/* Collapsed stack */}
      <div
        ref={stackRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={handleEnter}
        className="relative cursor-pointer group"
      >
        {/* Visual stack layers behind the top card */}
        {hasAny && earnedBadges.length > 1 && (
          <>
            {/* Bottom layer */}
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
            {/* Middle layer */}
            <div
              className={cn(
                'absolute inset-x-0.5 -bottom-0.5 h-2 rounded-b-xl border border-t-0 opacity-50',
                TIER_STYLES[earnedBadges[earnedBadges.length - 2]?.tier || earnedBadges[0].tier].border,
                TIER_STYLES[earnedBadges[earnedBadges.length - 2]?.tier || earnedBadges[0].tier].bg
              )}
            />
          </>
        )}

        {/* Top badge (highest earned) or empty state */}
        <div
          className={cn(
            'relative flex flex-col items-center rounded-xl border p-3.5 min-w-[88px] transition-all',
            'group-hover:scale-[1.03] group-active:scale-[0.97]',
            hasAny && topStyle
              ? cn(topStyle.bg, topStyle.border, topStyle.glow)
              : 'bg-foreground/[0.02] border-border/40'
          )}
        >
          {/* Tier dot */}
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

          <div
            className={cn(
              'flex items-center justify-center h-9 w-9 mb-2',
              hasAny && topStyle ? topStyle.text : 'text-muted-foreground/20'
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </div>

          <span
            className={cn(
              'text-[11px] font-semibold text-center leading-tight',
              hasAny ? 'text-foreground' : 'text-muted-foreground/30'
            )}
          >
            {hasAny && highestEarned ? highestEarned.name : category.label}
          </span>

          <span
            className={cn(
              'text-[9px] font-medium mt-0.5',
              hasAny && topStyle ? topStyle.text : 'text-muted-foreground/20'
            )}
          >
            {hasAny && highestEarned ? TIER_STYLES[highestEarned.tier].label : 'Locked'}
          </span>

          {/* Category label */}
          <span className="text-[8px] text-muted-foreground/40 mt-1 font-medium uppercase tracking-wider">
            {category.label}
          </span>
        </div>
      </div>

      {/* Expanded overlay */}
      {expanded && (
        <>
          {/* Backdrop blur */}
          <div
            className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setExpanded(false)}
          />

          {/* Expanded panel */}
          <div
            ref={overlayRef}
            onMouseEnter={() => {
              if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
            }}
            onMouseLeave={handleLeave}
            className={cn(
              'fixed z-[70] animate-in zoom-in-95 fade-in duration-200',
              'rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl',
              'shadow-2xl shadow-black/10 dark:shadow-black/30',
              'p-5 min-w-[280px] max-w-[320px]'
            )}
            style={{
              top: overlayPos
                ? `${Math.min(overlayPos.top - 20, window.innerHeight - 400)}px`
                : '50%',
              left: overlayPos
                ? `${Math.max(overlayPos.left - 40, 16)}px`
                : '50%',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
              <div className={cn(
                'flex items-center justify-center h-8 w-8 rounded-lg',
                hasAny && topStyle ? cn(topStyle.bg, topStyle.text) : 'bg-foreground/[0.04] text-muted-foreground/40'
              )}>
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">{category.label}</h3>
                <p className="text-[10px] text-muted-foreground/50">
                  {earnedBadges.length}/{badges.length} unlocked
                </p>
              </div>
            </div>

            {/* All tiers */}
            <div className="flex flex-col gap-2">
              {badges.map((badge) => (
                <BadgeTierRow key={badge.id} badge={badge} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Badge Tier Row (in expanded view) ─────────────────────

function BadgeTierRow({ badge }: { badge: EarnedBadge }) {
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
        <Icon className="h-4 w-4" strokeWidth={1.5} />
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
            {badge.name}
          </span>
          <span
            className={cn(
              'text-[9px] font-medium px-1.5 py-0.5 rounded-md',
              badge.earned
                ? cn(style.bg, style.text, 'border', style.border)
                : 'bg-foreground/[0.03] text-muted-foreground/20'
            )}
          >
            {style.label}
          </span>
        </div>
        <p
          className={cn(
            'text-[10px] mt-0.5',
            badge.earned ? 'text-muted-foreground/50' : 'text-muted-foreground/20'
          )}
        >
          {badge.description}
        </p>

        {/* Progress bar for unearned */}
        {!badge.earned && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1 rounded-full bg-foreground/[0.04] overflow-hidden">
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
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
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
            <svg className="h-3.5 w-3.5 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18" />
              <path d="M18 9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
              <path d="M12 3v4" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold">Achievements</span>
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
