'use client';

import { Check, CalendarDays, Flag, Circle, Clock } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import type { OrbitItem, Priority } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { SwipeableRow } from '@/components/mobile/swipeable-row';
import { haptic } from '@/lib/mobile';

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
  const { setSelectedItemId, getItemById } = useOrbitStore();
  const parent = item.parentId ? getItemById(item.parentId) : undefined;

  const toggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    haptic(item.status === 'done' ? 'light' : 'success');
    await updateItem(item.id, {
      status: item.status === 'done' ? 'active' : 'done',
      completedAt: item.status === 'done' ? undefined : Date.now(),
    });
  };

  const handleSwipeComplete = async () => {
    haptic('success');
    await updateItem(item.id, {
      status: 'done',
      completedAt: Date.now(),
    });
  };

  const handleSwipeArchive = async () => {
    haptic('medium');
    await updateItem(item.id, { status: 'archived' });
  };

  const isOverdue =
    item.dueDate && isPast(parseISO(item.dueDate)) && !isToday(parseISO(item.dueDate)) && item.status !== 'done';

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
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOTS[item.priority])} />
          )}
        </div>
        {/* Meta row - always show on mobile for better scannability */}
        {(showType || showProject || (item.tags && item.tags.length > 0) || item.startTime) && (
          <div className="flex items-center gap-1.5 mt-0.5">
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

      {/* Due date */}
      {item.dueDate && (
        <span
          className={cn(
            'text-[11px] shrink-0 tabular-nums',
            isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground/60'
          )}
        >
          {isToday(parseISO(item.dueDate))
            ? 'today'
            : format(parseISO(item.dueDate), 'dd MMM')}
        </span>
      )}
    </div>
  );

  // Wrap in swipeable on mobile (swipe right = done, swipe left = archive)
  if (enableSwipe && item.status !== 'done' && item.status !== 'archived') {
    return (
      <SwipeableRow
        onSwipeRight={item.type === 'task' || item.type === 'habit' ? handleSwipeComplete : undefined}
        onSwipeLeft={handleSwipeArchive}
      >
        {row}
      </SwipeableRow>
    );
  }

  return row;
}
