'use client';

import { Check, Clock, CalendarClock, CalendarPlus, CalendarX } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import type { OrbitItem, Priority } from '@/lib/types';
import { cn, shortDatePattern, getLocale } from '@/lib/utils';
import { format, isPast, isToday, isValid, parseISO } from 'date-fns';
import { SwipeableRow } from '@/components/mobile/swipeable-row';
import { haptic } from '@/lib/mobile';
import { calculateStreak, isHabitScheduledForDate } from '@/lib/habits';
import { formatHabitTime } from '@/lib/habit-reminders';
import { useSettingsStore } from '@/lib/settings-store';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';

const PRIORITY_DOTS: Record<Priority, string> = {
  low: 'bg-foreground/20',
  medium: 'bg-amber-500/60',
  high: 'bg-red-500/60',
};

interface ItemRowProps {
  item: OrbitItem;
  showType?: boolean;
  showProject?: boolean;
  compact?: boolean;
  enableSwipe?: boolean;
}

export function ItemRow({ item, showType = false, showProject = false, compact = false, enableSwipe = true }: ItemRowProps) {
  const setSelectedItemId = useOrbitStore((state) => state.setSelectedItemId);
  const setCompletionAnimation = useOrbitStore((state) => state.setCompletionAnimation);
  const parent = useOrbitStore((state) => item.parentId
    ? state.items.find((candidate) => candidate.id === item.parentId)
    : undefined);
  const { dateFormat, language, timeFormat } = useSettingsStore((s) => s.settings);
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');
  const { t } = useTranslation();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isComplete = item.type === 'habit'
    ? Boolean(item.completions?.[todayStr])
    : item.status === 'done';
  const canToggleHabitToday = item.type !== 'habit'
    || isComplete
    || isHabitScheduledForDate(item, new Date());

  const toggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canToggleHabitToday) return;
    haptic(isComplete ? 'light' : 'success');

    try {
      if (item.type === 'habit') {
        const completions = { ...(item.completions || {}) };
        if (isComplete) delete completions[todayStr];
        else completions[todayStr] = true;

        if (!isComplete) {
          setCompletionAnimation({ type: 'habit', streak: calculateStreak(item) + 1 });
        }
        await updateItem(item.id, { completions });
        return;
      }

      const newStatus = item.status === 'done' ? 'active' : 'done';
      if (newStatus === 'done' && item.type === 'task') {
        setCompletionAnimation({ type: 'task' });
      }

      await updateItem(item.id, {
        status: newStatus,
        completedAt: newStatus === 'done' ? Date.now() : undefined,
      });
    } catch {
      setCompletionAnimation(null);
      haptic('error');
      toast.error(isComplete ? t('itemRow.incompleteError') : t('itemRow.completeError'));
    }
  };

  const handleSwipeComplete = async () => {
    if (!canToggleHabitToday) return;
    haptic('success');

    try {
      if (item.type === 'habit') {
        if (!isComplete) {
          setCompletionAnimation({ type: 'habit', streak: calculateStreak(item) + 1 });
        }
        await updateItem(item.id, {
          completions: { ...(item.completions || {}), [todayStr]: true },
        });
        return;
      } else if (item.type === 'task') {
        setCompletionAnimation({ type: 'task' });
      }

      await updateItem(item.id, {
        status: 'done',
        completedAt: Date.now(),
      });
    } catch {
      setCompletionAnimation(null);
      haptic('error');
      toast.error(t('itemRow.completeError'));
    }
  };

  const parsedDueDate = item.dueDate ? parseISO(item.dueDate) : null;
  const hasValidDueDate = Boolean(parsedDueDate && isValid(parsedDueDate));
  const isOverdue = Boolean(
    parsedDueDate
      && hasValidDueDate
      && isPast(parsedDueDate)
      && !isToday(parsedDueDate)
      && item.status !== 'done'
      && item.status !== 'archived'
  );
  const isDueToday = Boolean(parsedDueDate && hasValidDueDate && isToday(parsedDueDate));

  const isMyDay = item.myDay === todayStr;
  const isAutoScheduledByDueDate = item.type === 'task' && (Boolean(isDueToday) || Boolean(isOverdue));
  const shouldClearMyDay = isMyDay;
  const canToggleToday = item.type === 'task' && item.status !== 'done' && item.status !== 'archived' && !isAutoScheduledByDueDate;

  const handleSwipeToday = async () => {
    if (!canToggleToday) {
      haptic('light');
      return;
    }

    haptic(shouldClearMyDay ? 'light' : 'success');
    
    try {
      if (shouldClearMyDay) {
        await updateItem(item.id, { myDay: undefined });
      } else {
        await updateItem(item.id, {
          myDay: todayStr,
        });
      }
    } catch {
      haptic('error');
      toast.error(shouldClearMyDay ? t('itemRow.removeTodayError') : t('itemRow.addTodayError'));
    }
  };

  const handleAddToToday = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await handleSwipeToday();
  };

  const row = (
    <div
      data-slot="item-row"
      className={cn(
        'group mobile-touch-target orbit-pressable relative flex w-full touch-manipulation items-center gap-3 rounded-xl px-3.5 text-left outline-none',
        'hover:bg-foreground/[0.035] active:bg-foreground/[0.055]',
        'focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0',
        // Bigger touch targets on mobile
        compact ? 'py-2.5 lg:py-1.5' : 'py-3 lg:py-2',
      )}
    >
      <button
        type="button"
        aria-label={t('itemRow.open', { type: t(`type.${item.type}`), title: item.title })}
        onClick={() => {
          haptic('light');
          setSelectedItemId(item.id);
        }}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />

      {/* Completion toggle — big hit area for mobile */}
      {(item.type === 'task' || (item.type === 'habit' && canToggleHabitToday)) && item.status !== 'archived' && (
        <button
          type="button"
          onClick={toggleComplete}
          aria-label={isComplete ? t('itemRow.markIncomplete') : t('itemRow.markComplete')}
          aria-pressed={isComplete}
          className={cn(
            'relative z-10 flex h-6 w-6 lg:h-[18px] lg:w-[18px] shrink-0 items-center justify-center rounded-full border bg-background/60 shadow-[var(--shadow-hairline)] transition-all',
            'focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0',
            isComplete
              ? 'border-foreground/25 bg-foreground/10 text-foreground/60'
              : 'border-transparent hover:border-foreground/25 hover:bg-background',
            // Bigger invisible hit target on mobile
            'before:absolute before:inset-[-10px] lg:before:inset-[-6px] before:content-[""]'
          )}
        >
          {isComplete && <Check className="h-3 w-3 lg:h-2.5 lg:w-2.5 text-foreground/50" />}
        </button>
      )}

      {/* Project indicator */}
      {item.type === 'project' && (
        <span className="pointer-events-none relative z-[1] text-base lg:text-sm">{item.emoji || '📁'}</span>
      )}

      {/* Event indicator */}
      {item.type === 'event' && (
        <div className="pointer-events-none relative z-[1] flex h-5 w-5 lg:h-4 lg:w-4 items-center justify-center shrink-0">
          <div className="h-2 w-2 lg:h-1.5 lg:w-1.5 rounded-full bg-foreground/30" />
        </div>
      )}
      {(item.type === 'goal' || item.type === 'note') && !showType && (
        <div className="pointer-events-none relative z-[1] flex h-5 w-5 lg:h-4 lg:w-4 items-center justify-center shrink-0">
          <div className="h-2 w-2 lg:h-1.5 lg:w-1.5 rounded-full bg-foreground/15" />
        </div>
      )}

      {/* Content */}
      <div className="pointer-events-none relative z-[1] flex-1 min-w-0 py-px">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-[14px] leading-snug lg:text-[13px]',
              isComplete ? 'text-muted-foreground/60 line-through' : 'text-foreground'
            )}
          >
            {item.title}
          </span>
          {item.priority && (
            <span
              className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOTS[item.priority])}
              role="img"
              aria-label={t('itemRow.priorityLabel', { priority: t(`priority.${item.priority}`) })}
              title={t('itemRow.priorityLabel', { priority: t(`priority.${item.priority}`) })}
            />
          )}
        </div>
        {/* Meta row - always show on mobile for better scannability */}
        {(showType || showProject || item.status === 'waiting' || (item.tags && item.tags.length > 0) || item.startTime) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {item.status === 'waiting' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                {t('status.waiting')}
              </span>
            )}
            {showType && (
              <span className="text-[10px] uppercase text-muted-foreground/60 font-medium">
                {t(`type.${item.type}`)}
              </span>
            )}
            {showProject && parent && (
              <span className="text-[10px] text-muted-foreground/60">
                {parent.emoji || '📁'} {parent.title}
              </span>
            )}
            {/* Stored times are 24-hour; the row used to print them raw, so a
                user on 12-hour time still read 14:00 here while the Calendar
                and Dispatch views respected the setting. */}
            {item.type === 'event' && item.startTime && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
                <Clock className="h-2.5 w-2.5" />
                {formatHabitTime(item.startTime, timeFormat === '24h') ?? item.startTime}
              </span>
            )}
            {/* The habit reminder time, which nothing used to display. */}
            {item.type === 'habit' && item.habitTime && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
                <Clock className="h-2.5 w-2.5" />
                {formatHabitTime(item.habitTime, timeFormat === '24h') ?? item.habitTime}
              </span>
            )}
            {item.tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-[4px] bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground/50">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add/Remove Today button - desktop hover only */}
      {canToggleToday && (
        <button
          type="button"
          onClick={handleAddToToday}
          aria-label={t(shouldClearMyDay ? 'itemRow.removeTodayLabel' : 'itemRow.addTodayLabel', { title: item.title })}
          aria-pressed={shouldClearMyDay}
          className={cn(
            'relative z-10 flex h-9 w-9 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all shrink-0 shadow-[var(--shadow-hairline)] lg:h-auto lg:w-auto',
            'focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0',
            'opacity-70 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100',
            isMyDay 
              ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400'
              : 'bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground/60 hover:text-foreground',
          )}
        >
          <CalendarClock className="h-3 w-3" />
          <span className="hidden lg:inline">{shouldClearMyDay ? (hockeyMode ? 'Rausnehmen' : t('itemRow.removeBtn')) : t('nav.today')}</span>
        </button>
      )}

      {/* Due date */}
      {item.dueDate && (
        <span
          className={cn(
            'pointer-events-none relative z-[1] inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] tabular-nums',
            isDueToday ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' :
            isOverdue ? 'bg-destructive/10 text-destructive font-medium' : 'text-muted-foreground/60'
          )}
        >
          {isDueToday
            ? t('date.today')
            : hasValidDueDate && parsedDueDate
              ? format(parsedDueDate, shortDatePattern(dateFormat), { locale: getLocale(language) })
              : t('common.dateUnavailable')}
        </span>
      )}
    </div>
  );

  // Wrap in swipeable on mobile (swipe right = done, swipe left = add/remove from today)
  if (enableSwipe && item.status !== 'done' && item.status !== 'archived') {
    return (
      <SwipeableRow
        onSwipeRight={item.type === 'task' || (item.type === 'habit' && canToggleHabitToday) ? handleSwipeComplete : undefined}
        onSwipeLeft={canToggleToday ? handleSwipeToday : undefined}
        rightLabel={t('itemRow.doneSwipe')}
        leftLabel={shouldClearMyDay ? (hockeyMode ? 'Raus' : t('itemRow.removeBtn')) : (hockeyMode ? 'Aufstellung' : t('itemRow.todayBtn'))}
        rightIcon={Check}
        leftIcon={shouldClearMyDay ? CalendarX : CalendarPlus}
      >
        {row}
      </SwipeableRow>
    );
  }

  return row;
}
