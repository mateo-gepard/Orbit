'use client';

import { Check, CalendarDays, Flag, Circle } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import type { OrbitItem, Priority } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, parseISO } from 'date-fns';

const PRIORITY_DOTS: Record<Priority, string> = {
  low: 'bg-foreground/20',
  medium: 'bg-foreground/40',
  high: 'bg-foreground/70',
};

interface ItemRowProps {
  item: OrbitItem;
  showType?: boolean;
  showProject?: boolean;
  compact?: boolean;
}

export function ItemRow({ item, showType = false, showProject = false, compact = false }: ItemRowProps) {
  const { setSelectedItemId, getItemById } = useOrbitStore();
  const parent = item.parentId ? getItemById(item.parentId) : undefined;

  const toggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await updateItem(item.id, {
      status: item.status === 'done' ? 'active' : 'done',
      completedAt: item.status === 'done' ? undefined : Date.now(),
    });
  };

  const isOverdue =
    item.dueDate && isPast(parseISO(item.dueDate)) && !isToday(parseISO(item.dueDate)) && item.status !== 'done';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setSelectedItemId(item.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedItemId(item.id); } }}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-3 text-left transition-all cursor-pointer',
        'hover:bg-foreground/[0.03] active:bg-foreground/[0.05]',
        compact ? 'py-1.5' : 'py-2',
      )}
    >
      {/* Completion toggle — big hit area */}
      {(item.type === 'task' || item.type === 'habit') && (
        <button
          onClick={toggleComplete}
          className={cn(
            'relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all',
            item.status === 'done'
              ? 'border-foreground/30 bg-foreground/10'
              : 'border-foreground/15 hover:border-foreground/40',
            // Enlarge the hit target invisibly
            'before:absolute before:inset-[-6px] before:content-[""]'
          )}
        >
          {item.status === 'done' && <Check className="h-2.5 w-2.5 text-foreground/50" />}
        </button>
      )}

      {/* Project indicator */}
      {item.type === 'project' && (
        <span className="text-sm">{item.emoji || '📁'}</span>
      )}

      {/* Event / Goal / Note indicator */}
      {item.type === 'event' && (
        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
      )}
      {(item.type === 'goal' || item.type === 'note') && !showType && (
        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/15" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-[13px]',
              item.status === 'done' ? 'text-muted-foreground/60 line-through' : 'text-foreground'
            )}
          >
            {item.title}
          </span>
          {item.priority && (
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOTS[item.priority])} />
          )}
        </div>
        {!compact && (showType || showProject || (item.tags && item.tags.length > 0)) && (
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
}
