'use client';

import { Check, CalendarDays, Flag, Circle, Clock, CalendarClock, CalendarPlus, CalendarX } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import type { OrbitItem, Priority } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { SwipeableRow } from '@/components/mobile/swipeable-row';
import { haptic } from '@/lib/mobile';
import { calculateStreak } from '@/lib/habits';

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
  const { setSelectedItemId, getItemById, setCompletionAnimation } = useOrbitStore();
  const parent = item.parentId ? getItemById(item.parentId) : undefined;

  const toggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    haptic(item.status === 'done' ? 'light' : 'success');
    
    const newStatus = item.status === 'done' ? 'active' : 'done';
    
    // Show completion animation when marking as done
    if (newStatus === 'done') {
      if (item.type === 'habit') {
        const streak = calculateStreak(item) + 1; // +1 for the completion about to happen
        setCompletionAnimation({ type: 'habit', streak });
      } else if (item.type === 'task') {
        setCompletionAnimation({ type: 'task' });
      }
    }
    
    await updateItem(item.id, {
      status: newStatus,
      completedAt: newStatus === 'done' ? Date.now() : undefined,
    });
  };

  const handleSwipeComplete = async () => {
    haptic('success');
    
    // Show completion animation
    if (item.type === 'habit') {
      const streak = calculateStreak(item) + 1; // +1 for the completion about to happen
      setCompletionAnimation({ type: 'habit', streak });
    } else if (item.type === 'task') {
      setCompletionAnimation({ type: 'task' });
    }
    
    await updateItem(item.id, {
      status: 'done',
      completedAt: Date.now(),
    });
  };

  const isOverdue =
    item.dueDate && isPast(parseISO(item.dueDate)) && !isToday(parseISO(item.dueDate)) && item.status !== 'done';
  
  const isDueToday = item.dueDate && isToday(parseISO(item.dueDate));

  const handleSwipeToday = async () => {
    haptic(isDueToday ? 'light' : 'success');
    const today = new Date().toISOString().split('T')[0];
    
    if (isDueToday) {
      await updateItem(item.id, { dueDate: undefined });
    } else {
      await updateItem(item.id, { dueDate: today });
    }
  };

  const handleAddToToday = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await handleSwipeToday();
  };

  const row = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        haptic('light');
        setSelectedItemId(item.id);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedItemId(item.id); } }}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-3 text-left transition-all cursor-pointer',
        'hover:bg-foreground/[0.03] active:bg-foreground/[0.05]',
        // Bigger touch targets on mobile
        compact ? 'py-2.5 lg:py-1.5' : 'py-3 lg:py-2',
      )}
    >
      {/* Completion toggle — big hit area for mobile */}
      {(item.type === 'task' || item.type === 'habit') && (
        <button
          onClick={toggleComplete}
          className={cn(
            'relative flex h-5 w-5 lg:h-[18px] lg:w-[18px] shrink-0 items-center justify-center rounded-full border transition-all',
            item.status === 'done'
              ? 'border-foreground/30 bg-foreground/10'
              : 'border-foreground/15 hover:border-foreground/40',
            // Bigger invisible hit target on mobile
            'before:absolute before:inset-[-10px] lg:before:inset-[-6px] before:content-[""]'
          )}
        >
          {item.status === 'done' && <Check className="h-2.5 w-2.5 text-foreground/50" />}
        </button>
      )}

      {/* Project indicator */}
      {item.type === 'project' && (
        <span className="text-base lg:text-sm">{item.emoji || '📁'}</span>
      )}

      {/* Event indicator */}
      {item.type === 'event' && (
        <div className="flex h-5 w-5 lg:h-4 lg:w-4 items-center justify-center shrink-0">
          <div className="h-2 w-2 lg:h-1.5 lg:w-1.5 rounded-full bg-foreground/30" />
        </div>
      )}
      {(item.type === 'goal' || item.type === 'note') && !showType && (
        <div className="flex h-5 w-5 lg:h-4 lg:w-4 items-center justify-center shrink-0">
          <div className="h-2 w-2 lg:h-1.5 lg:w-1.5 rounded-full bg-foreground/15" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-[14px] lg:text-[13px]',
              item.status === 'done' ? 'text-muted-foreground/60 line-through' : 'text-foreground'
            )}
          >
            {item.title}
          </span>
          {item.priority && (
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOTS[item.priority])} role="img" aria-label={`${item.priority} priority`} title={`${item.priority} priority`} />
          )}
        </div>
        {/* Meta row - always show on mobile for better scannability */}
        {(showType || showProject || item.status === 'waiting' || (item.tags && item.tags.length > 0) || item.startTime) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.status === 'waiting' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-500/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Waiting
              </span>
            )}
            {showType && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                {item.type}
              </span>
            )}
            {showProject && parent && (
              <span className="text-[10px] text-muted-foreground/60">
                {parent.emoji || '📁'} {parent.title}
              </span>
            )}
            {item.type === 'event' && item.startTime && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
                <Clock className="h-2.5 w-2.5" />
                {item.startTime}
              </span>
            )}
            {item.tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] text-muted-foreground/50">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add/Remove Today button - desktop hover only */}
      {item.type === 'task' && item.status !== 'done' && (
        <button
          onClick={handleAddToToday}
          className={cn(
            'hidden lg:flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all shrink-0',
            'opacity-0 group-hover:opacity-100',
            isDueToday 
              ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400'
              : 'bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground/60 hover:text-foreground',
          )}
        >
          <CalendarClock className="h-3 w-3" />
          <span>{isDueToday ? 'Remove' : 'Today'}</span>
        </button>
      )}

      {/* Due date */}
      {item.dueDate && (
        <span
          className={cn(
            'text-[11px] shrink-0 tabular-nums',
            isDueToday ? 'text-blue-600 dark:text-blue-400 font-medium' :
            isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground/60'
          )}
        >
          {isDueToday
            ? 'today'
            : format(parseISO(item.dueDate), 'dd MMM')}
        </span>
      )}
    </div>
  );

  // Wrap in swipeable on mobile (swipe right = done, swipe left = add/remove from today)
  if (enableSwipe && item.status !== 'done' && item.status !== 'archived') {
    return (
      <SwipeableRow
        onSwipeRight={item.type === 'task' || item.type === 'habit' ? handleSwipeComplete : undefined}
        onSwipeLeft={item.type === 'task' ? handleSwipeToday : undefined}
        rightLabel="Done"
        leftLabel={isDueToday ? "Remove" : "Today"}
        rightIcon={Check}
        leftIcon={isDueToday ? CalendarX : CalendarPlus}
      >
        {row}
      </SwipeableRow>
    );
  }

  return row;
}
