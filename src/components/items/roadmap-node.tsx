'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Circle,
  Clock,
  Target,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import type { OrbitItem } from '@/lib/types';
import { format, isValid, parseISO } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { useSettingsStore } from '@/lib/settings-store';
import { getLocale, shortDatePattern } from '@/lib/utils';

// ─── Status config ──────────────────────────────────────

const STATUS_CONFIG = {
  active: { icon: Circle, color: 'text-blue-500', ring: 'ring-blue-500/20' },
  waiting: { icon: Clock, color: 'text-amber-500', ring: 'ring-amber-500/20' },
  done: { icon: CheckCircle2, color: 'text-emerald-500', ring: 'ring-emerald-500/20' },
  archived: { icon: Circle, color: 'text-muted-foreground/40', ring: '' },
} as const;

const PRIORITY_CONFIG = {
  high: { color: 'bg-red-500' },
  medium: { color: 'bg-amber-500' },
  low: { color: 'bg-blue-400' },
} as const;

function useRoadmapDateFormatter(): { formatDueDate: (value: string) => string } {
  const { t, lang } = useTranslation();
  const dateFormat = useSettingsStore((state) => state.settings.dateFormat);
  const locale = getLocale(lang);
  return {
    formatDueDate: (value: string) => {
      const date = parseISO(value);
      return isValid(date)
        ? format(date, shortDatePattern(dateFormat), { locale })
        : t('common.dateUnavailable');
    },
  };
}

// ─── Project root node ──────────────────────────────────

interface ProjectNodeData {
  item: OrbitItem;
  progress: number;
  taskCount: number;
  doneCount: number;
  [key: string]: unknown;
}

function ProjectNodeComponent({ data }: { data: ProjectNodeData }) {
  const { t, tp } = useTranslation();
  const { item, progress, taskCount, doneCount } = data;

  return (
    <div className="relative">
      <div
        className={cn(
          'px-5 py-4 rounded-2xl border-2 min-w-[220px] max-w-[280px] shadow-lg',
          'bg-background border-foreground/20',
          'hover:shadow-xl transition-shadow cursor-pointer',
        )}
      >
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-2xl">{item.emoji || '📁'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold truncate leading-tight">
              {item.title || t('projects.untitledProject')}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {tp('roadmap.tasksComplete.one', 'roadmap.tasksComplete.other', taskCount, {
                done: doneCount,
                total: taskCount,
              })}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={t('roadmap.projectProgress', { percent: progress })}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              backgroundColor: item.color || '#6366f1',
            }}
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-foreground/40 !border-background !w-3 !h-3 !-bottom-1.5"
      />
    </div>
  );
}

// ─── Milestone node ─────────────────────────────────────

interface MilestoneNodeData {
  item: OrbitItem;
  progress: number;
  taskCount: number;
  doneCount: number;
  projectColor: string;
  [key: string]: unknown;
}

function MilestoneNodeComponent({ data }: { data: MilestoneNodeData }) {
  const { t } = useTranslation();
  const { formatDueDate } = useRoadmapDateFormatter();
  const { item, progress, taskCount, doneCount, projectColor } = data;
  const title = item.title || t('common.untitled');
  const isDone = item.status === 'done';
  const isOverdue = !isDone && item.dueDate && item.dueDate < format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-foreground/40 !border-background !w-2.5 !h-2.5 !-top-1.5"
      />

      <div
        className={cn(
          'px-4 py-3 rounded-xl border-2 min-w-[190px] max-w-[240px] shadow-md',
          'hover:shadow-lg transition-all cursor-pointer',
          isDone
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300/60 dark:border-emerald-700/40'
            : isOverdue
            ? 'bg-red-50/50 dark:bg-red-950/20 border-red-300/60 dark:border-red-700/40'
            : 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-300/60 dark:border-orange-700/40',
        )}
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className={cn(
            'flex items-center justify-center h-7 w-7 rounded-lg shrink-0',
            isDone ? 'bg-emerald-100 dark:bg-emerald-900/40' : isOverdue ? 'bg-red-100 dark:bg-red-900/40' : 'bg-orange-100 dark:bg-orange-900/40',
          )}>
            <Target className={cn(
              'h-3.5 w-3.5',
              isDone ? 'text-emerald-600 dark:text-emerald-400' : isOverdue ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400',
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-[12px] font-semibold truncate leading-tight',
              isDone && 'line-through opacity-60',
            )}>
              {title}
            </p>
          </div>
          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          <span className="sr-only">
            {isDone ? t('status.done') : isOverdue ? t('briefing.overdue') : t('status.active')}
          </span>
        </div>

        {/* Date */}
        {item.dueDate && (
          <div className="flex items-center gap-1 mb-1.5">
            <CalendarDays className="h-3 w-3 text-muted-foreground/40" />
            <span className={cn(
              'text-[10px] font-medium',
              isDone ? 'text-muted-foreground/40' : isOverdue ? 'text-red-500' : 'text-muted-foreground/60',
            )}>
              {formatDueDate(item.dueDate)}
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-1 rounded-full bg-foreground/[0.06] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={t('roadmap.milestoneProgress', {
              name: title,
              done: doneCount,
              total: taskCount,
            })}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: isDone ? '#10b981' : projectColor,
              }}
            />
          </div>
          <span className="text-[9px] font-medium text-muted-foreground/50 tabular-nums shrink-0">
            {doneCount}/{taskCount}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-foreground/40 !border-background !w-2.5 !h-2.5 !-bottom-1.5"
      />
    </div>
  );
}

// ─── Task node ──────────────────────────────────────────

interface TaskNodeData {
  item: OrbitItem;
  projectColor: string;
  [key: string]: unknown;
}

function TaskNodeComponent({ data }: { data: TaskNodeData }) {
  const { t } = useTranslation();
  const { formatDueDate } = useRoadmapDateFormatter();
  const { item, projectColor } = data;
  const title = item.title || t('common.untitled');
  const isDone = item.status === 'done';
  const isWaiting = item.status === 'waiting';
  const isOverdue = !isDone && item.dueDate && item.dueDate < format(new Date(), 'yyyy-MM-dd');
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.active;
  const StatusIcon = status.icon;
  const checklistDone = item.checklist?.filter((entry) => entry.done).length || 0;

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-foreground/30 !border-background !w-2 !h-2 !-top-1"
      />

      <div
        className={cn(
          'px-3 py-2.5 rounded-lg border min-w-[160px] max-w-[200px] shadow-sm',
          'hover:shadow-md transition-all cursor-pointer',
          isDone
            ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-800/30 opacity-70'
            : isWaiting
            ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-800/30'
            : isOverdue
            ? 'bg-red-50/30 dark:bg-red-950/10 border-red-200/60 dark:border-red-800/30'
            : 'bg-background border-border/60',
        )}
      >
        <div className="flex items-center gap-2">
          {/* Priority dot */}
          {item.priority && (
            <>
              <div className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                PRIORITY_CONFIG[item.priority]?.color || 'bg-muted-foreground/30',
              )} />
              <span className="sr-only">{t(`priority.${item.priority}`)}</span>
            </>
          )}

          {/* Status icon */}
          <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', status.color)} />
          <span className="sr-only">{t(`status.${item.status}`)}</span>

          {/* Title */}
          <p className={cn(
            'text-[11px] font-medium truncate flex-1 leading-tight',
            isDone && 'line-through opacity-60',
          )}>
            {title}
          </p>
        </div>

        {/* Date row */}
        {item.dueDate && (
          <div className="flex items-center gap-1 mt-1.5 pl-5">
            <CalendarDays className="h-2.5 w-2.5 text-muted-foreground/30" />
            <span className={cn(
              'text-[9px] font-medium tabular-nums',
              isOverdue ? 'text-red-500' : 'text-muted-foreground/50',
            )}>
              {formatDueDate(item.dueDate)}
            </span>
          </div>
        )}

        {/* Checklist progress if any */}
        {item.checklist && item.checklist.length > 0 && (
          <div className="mt-1.5 pl-5">
            <div
              className="h-0.5 rounded-full bg-foreground/[0.06] overflow-hidden w-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={item.checklist.length}
              aria-valuenow={checklistDone}
              aria-label={t('roadmap.checklistProgress', {
                name: title,
                done: checklistDone,
                total: item.checklist.length,
              })}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(checklistDone / item.checklist.length) * 100}%`,
                  backgroundColor: projectColor,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Source handle for dependency edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-foreground/30 !border-background !w-2 !h-2 !-bottom-1"
      />
    </div>
  );
}

export const ProjectRoadmapNode = memo(ProjectNodeComponent);
export const MilestoneRoadmapNode = memo(MilestoneNodeComponent);
export const TaskRoadmapNode = memo(TaskNodeComponent);
