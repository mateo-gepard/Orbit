'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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

// ─── Tier visual order ─────────────────────────────────────

const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// ─── Detect touch device ───────────────────────────────────

function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// ─── Badge Stack (collapsed → expandable) ──────────────────

export function BadgeStack({ category }: { category: BadgeCategory }) {
  const [visible, setVisible] = useState(false); // controls mount/unmount
  const [animState, setAnimState] = useState<'entering' | 'open' | 'exiting'>('entering');
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { highestEarned, badges } = category;
  const Icon = ICON_MAP[category.icon] || Target;

  const earnedBadges = badges.filter((b) => b.earned);
  const hasAny = earnedBadges.length > 0;

  // ── Open / Close helpers ──

  const open = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (!visible) {
      setAnimState('entering');
      setVisible(true);
      // Transition to 'open' on next frame so CSS transition triggers
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState('open'));
      });
    } else if (animState === 'exiting') {
      // Was closing — reverse it
      setAnimState('open');
    }
  }, [visible, animState]);

  const close = useCallback(() => {
    if (!visible || animState === 'exiting') return;
    setAnimState('exiting');
    closeTimer.current = setTimeout(() => {
      setVisible(false);
      setAnimState('entering');
      closeTimer.current = null;
    }, 200); // match CSS transition duration
  }, [visible, animState]);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, 250);
  }, [close]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // ── Keyboard: Escape to close ──
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, close]);

  // ── Pointer-aware hover: track if pointer is over stack OR overlay ──
  // We use a single ref-based approach: both the stack and the overlay
  // call the same enter/leave with a debounced close.
  const handlePointerEnterStack = useCallback(() => {
    if (isTouchDevice()) return; // touch devices use click only
    cancelClose();
    open();
  }, [cancelClose, open]);

  const handlePointerLeaveStack = useCallback(() => {
    if (isTouchDevice()) return;
    scheduleClose();
  }, [scheduleClose]);

  const handlePointerEnterOverlay = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const handlePointerLeaveOverlay = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const handleClick = useCallback(() => {
    if (visible) {
      close();
    } else {
      open();
    }
  }, [visible, open, close]);

  const topStyle = highestEarned ? TIER_STYLES[highestEarned.tier] : null;

  return (
    <>
      {/* Collapsed stack */}
      <div
        ref={containerRef}
        onPointerEnter={handlePointerEnterStack}
        onPointerLeave={handlePointerLeaveStack}
        onClick={handleClick}
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
      {visible && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm',
              'transition-opacity duration-200 ease-out',
              animState === 'open' ? 'opacity-100' : 'opacity-0'
            )}
            onClick={close}
          />

          {/* Centered overlay container */}
          <div className="fixed z-[70] inset-0 flex items-center justify-center pointer-events-none">
            <div
              onPointerEnter={handlePointerEnterOverlay}
              onPointerLeave={handlePointerLeaveOverlay}
              className={cn(
                'pointer-events-auto relative',
                'rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl',
                'shadow-2xl shadow-black/10 dark:shadow-black/30',
                'p-5 w-[calc(100vw-48px)] max-w-[320px]',
                'transition-all duration-200 ease-out',
                animState === 'open'
                  ? 'opacity-100 scale-100 translate-y-0'
                  : 'opacity-0 scale-95 translate-y-2'
              )}
            >
              {/* Close button */}
              <button
                onClick={(e) => { e.stopPropagation(); close(); }}
                className={cn(
                  'absolute top-3 right-3 p-1 rounded-lg transition-colors',
                  'text-muted-foreground/40 hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>

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
