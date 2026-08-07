'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Shown after the label, e.g. a count. */
  badge?: ReactNode;
  /** Hide the label below `lg`, keeping only the icon. */
  labelOnDesktopOnly?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  /** `segmented` is the app default; `pill` is the denser list-filter form. */
  variant?: 'segmented' | 'pill';
  className?: string;
}

/**
 * One sub-tab control for the whole app.
 *
 * The same interaction had four appearances — Radix `Tabs` with an underline
 * on Archive, unstyled Radix on Areas, `bg-foreground` pills on Tasks and
 * Notes, a `bg-muted/30` segmented control on Habits, Calendar and Projects,
 * and larger pills on Files — all of them hand-rolled `aria-pressed` buttons
 * apart from the two Radix ones, and no single place to change any of it.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = 'segmented',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        variant === 'segmented'
          ? 'flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5'
          : 'flex items-center gap-1',
        className
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'mobile-touch-target flex shrink-0 items-center gap-1.5 text-[12px] font-medium transition-all active:scale-95 lg:min-h-0',
              variant === 'segmented'
                ? cn(
                    'rounded-md px-2.5 py-1.5',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground/60 hover:text-foreground'
                  )
                : cn(
                    'rounded-lg px-2.5 py-1.5',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                  )
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span className={cn(option.labelOnDesktopOnly && 'hidden lg:inline')}>{option.label}</span>
            {option.badge !== undefined && (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  active ? 'opacity-70' : 'text-muted-foreground/45'
                )}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
