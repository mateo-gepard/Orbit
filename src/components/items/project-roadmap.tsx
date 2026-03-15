'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  GanttChart,
  Plus,
  ChevronDown,
  Target,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { getLocale, getWeekStartsOn } from '@/lib/utils';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  addMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  differenceInCalendarDays,
  format,
  isSameMonth,
  isToday,
  isBefore,
  isAfter,
  parseISO,
} from 'date-fns';
import type { OrbitItem } from '@/lib/types';

type TimeScale = 'quarter' | 'year';

interface ProjectRoadmapProps {
  open: boolean;
  onClose: () => void;
  project: OrbitItem;
  allItems: OrbitItem[];
  onNavigate: (itemId: string) => void;
}

// ═══ Date helpers ═══

function getQuarterRange(today: Date, weekStartsOn: 0 | 1) {
  const start = startOfWeek(startOfQuarter(today), { weekStartsOn });
  const end = endOfWeek(addWeeks(start, 12), { weekStartsOn });
  return { start, end };
}

function getYearRange(today: Date) {
  const start = startOfMonth(today);
  const end = endOfMonth(addMonths(start, 11));
  return { start, end };
}

function getWeekColumns(rangeStart: Date, rangeEnd: Date, weekStartsOn: 0 | 1) {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  let current = startOfWeek(rangeStart, { weekStartsOn });
  while (isBefore(current, rangeEnd) || differenceInCalendarDays(rangeEnd, current) >= 0) {
    const weekEnd = endOfWeek(current, { weekStartsOn });
    weeks.push({
      start: current,
      end: weekEnd,
      label: format(current, 'd'),
    });
    current = addWeeks(current, 1);
  }
  return weeks;
}

function getMonthColumns(rangeStart: Date, rangeEnd: Date) {
  const months: { start: Date; end: Date; label: string; shortLabel: string }[] = [];
  let current = startOfMonth(rangeStart);
  while (isBefore(current, rangeEnd) || isSameMonth(current, rangeEnd)) {
    months.push({
      start: current,
      end: endOfMonth(current),
      label: format(current, 'MMMM yyyy'),
      shortLabel: format(current, 'MMM'),
    });
    current = addMonths(current, 1);
  }
  return months;
}

// ═══ Position calculation ═══

function getPositionPercent(date: Date, rangeStart: Date, totalDays: number): number {
  const offset = differenceInCalendarDays(date, rangeStart);
  return Math.max(0, Math.min(100, (offset / totalDays) * 100));
}

// ═══ Lane data structures ═══

interface RoadmapLane {
  milestone: OrbitItem | null; // null = ungrouped
  tasks: OrbitItem[];
  datedTasks: OrbitItem[];
  undatedTasks: OrbitItem[];
}

export function ProjectRoadmap({ open, onClose, project, allItems, onNavigate }: ProjectRoadmapProps) {
  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({ onClose });
  const { user } = useAuth();
  const settings = useSettingsStore((s) => s.settings);
  const weekStartsOn = getWeekStartsOn(settings.weekStart);
  const locale = getLocale(settings.language);

  const [timeScale, setTimeScale] = useState<TimeScale>('quarter');
  const [showUndated, setShowUndated] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);

  // ═══ Time range & columns ═══

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (timeScale === 'quarter') {
      const { start, end } = getQuarterRange(today, weekStartsOn);
      return { rangeStart: start, rangeEnd: end, totalDays: differenceInCalendarDays(end, start) };
    }
    const { start, end } = getYearRange(today);
    return { rangeStart: start, rangeEnd: end, totalDays: differenceInCalendarDays(end, start) };
  }, [timeScale, today, weekStartsOn]);

  const weekColumns = useMemo(
    () => (timeScale === 'quarter' ? getWeekColumns(rangeStart, rangeEnd, weekStartsOn) : []),
    [timeScale, rangeStart, rangeEnd, weekStartsOn],
  );

  const monthColumns = useMemo(
    () => getMonthColumns(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  // ═══ Milestones & task grouping ═══

  const milestones = useMemo(
    () => allItems
      .filter((i) => i.parentId === project.id && i.type === 'goal')
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.createdAt - b.createdAt;
      }),
    [allItems, project.id],
  );

  const milestoneIds = useMemo(() => new Set(milestones.map((m) => m.id)), [milestones]);

  const lanes: RoadmapLane[] = useMemo(() => {
    const result: RoadmapLane[] = [];

    // Milestone lanes
    for (const ms of milestones) {
      const tasks = allItems.filter((i) => i.parentId === ms.id && i.type === 'task');
      result.push({
        milestone: ms,
        tasks,
        datedTasks: tasks.filter((t) => t.dueDate || t.startDate),
        undatedTasks: tasks.filter((t) => !t.dueDate && !t.startDate),
      });
    }

    // Ungrouped lane: tasks parented directly to project
    const ungrouped = allItems.filter(
      (i) => i.parentId === project.id && i.type === 'task',
    );
    if (ungrouped.length > 0) {
      result.push({
        milestone: null,
        tasks: ungrouped,
        datedTasks: ungrouped.filter((t) => t.dueDate || t.startDate),
        undatedTasks: ungrouped.filter((t) => !t.dueDate && !t.startDate),
      });
    }

    return result;
  }, [milestones, allItems, project.id, milestoneIds]);

  const totalUndated = lanes.reduce((sum, l) => sum + l.undatedTasks.length, 0);

  // Today marker position
  const todayPercent = getPositionPercent(today, rangeStart, totalDays);

  // Scroll timeline to show today on mount
  useEffect(() => {
    if (timelineRef.current) {
      const scrollable = timelineRef.current;
      const todayOffset = (todayPercent / 100) * scrollable.scrollWidth;
      const visibleWidth = scrollable.clientWidth;
      scrollable.scrollLeft = Math.max(0, todayOffset - visibleWidth * 0.3);
    }
  }, [todayPercent, open]);

  // ═══ Quick add task to lane ═══

  const handleAddTask = async (parentId: string) => {
    if (!user) return;
    const id = await createItem({
      type: 'task',
      status: 'active',
      title: 'New Task',
      parentId,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    onNavigate(id);
  };

  const handleAddMilestone = async () => {
    if (!user) return;
    const id = await createItem({
      type: 'goal',
      status: 'active',
      title: 'New Milestone',
      parentId: project.id,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    onNavigate(id);
  };

  // ═══ Render task bar ═══

  const renderTaskBar = (task: OrbitItem) => {
    const start = task.startDate ? parseISO(task.startDate) : task.dueDate ? parseISO(task.dueDate) : null;
    const end = task.dueDate ? parseISO(task.dueDate) : start;
    if (!start || !end) return null;

    const leftPct = getPositionPercent(start, rangeStart, totalDays);
    const rightPct = getPositionPercent(end, rangeStart, totalDays);
    const isPoint = differenceInCalendarDays(end, start) <= 0;
    const widthPct = isPoint ? 0 : rightPct - leftPct;
    const isDone = task.status === 'done';
    const isWaiting = task.status === 'waiting';
    const isOutOfRange = leftPct >= 100 || rightPct <= 0;
    if (isOutOfRange) return null;

    const barColor = project.color || '#6366f1';

    return (
      <button
        key={task.id}
        onClick={() => onNavigate(task.id)}
        title={task.title}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center transition-all hover:brightness-110 hover:shadow-sm cursor-pointer z-10 group',
          isDone && 'opacity-40',
          isWaiting && 'opacity-60',
        )}
        style={{
          left: `${leftPct}%`,
          width: isPoint ? '8px' : `max(${widthPct}%, 8px)`,
          backgroundColor: barColor,
          minWidth: 8,
        }}
      >
        {!isPoint && (
          <span className={cn(
            'text-[10px] font-medium px-1.5 truncate text-white',
            isDone && 'line-through',
          )}>
            {task.title}
          </span>
        )}
        {/* Tooltip on hover */}
        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-30">
          <div className="rounded-md bg-foreground text-background px-2 py-1 text-[11px] font-medium whitespace-nowrap shadow-lg">
            {task.title}
            {task.dueDate && <span className="text-background/60 ml-1.5">· {task.dueDate}</span>}
          </div>
        </div>
      </button>
    );
  };

  // ═══ Render milestone diamond ═══

  const renderMilestoneDiamond = (milestone: OrbitItem) => {
    if (!milestone.dueDate) return null;
    const pct = getPositionPercent(parseISO(milestone.dueDate), rangeStart, totalDays);
    if (pct < 0 || pct > 100) return null;
    const isDone = milestone.status === 'done';

    return (
      <button
        onClick={() => onNavigate(milestone.id)}
        title={`${milestone.title} — ${milestone.dueDate}`}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rotate-45 rounded-[2px] z-20 transition-all hover:scale-125 cursor-pointer',
          isDone
            ? 'bg-foreground/30 border border-foreground/20'
            : 'bg-foreground border border-foreground/80',
        )}
        style={{ left: `${pct}%` }}
      />
    );
  };

  // ═══ Month header groups for quarter view ═══

  const quarterMonthHeaders = useMemo(() => {
    if (timeScale !== 'quarter') return [];
    return monthColumns.map((month) => {
      const startOffset = differenceInCalendarDays(month.start < rangeStart ? rangeStart : month.start, rangeStart);
      const endOffset = differenceInCalendarDays(month.end > rangeEnd ? rangeEnd : month.end, rangeStart);
      return {
        ...month,
        leftPct: (startOffset / totalDays) * 100,
        widthPct: ((endOffset - startOffset + 1) / totalDays) * 100,
      };
    });
  }, [timeScale, monthColumns, rangeStart, rangeEnd, totalDays]);

  const LANE_HEADER_W = 'w-[140px] lg:w-[180px]';
  const LANE_HEIGHT = 'h-12';

  const content = (
    <div className="flex h-full flex-col bg-background">
      {/* Swipe Handle (mobile) */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center pt-4 pb-8 cursor-grab active:cursor-grabbing z-20 lg:hidden"
        {...swipeHandlers}
      >
        <div className={cn(
          'w-10 h-1 rounded-full bg-muted-foreground/20 transition-all',
          isDragging && 'bg-muted-foreground/40 w-12',
        )} />
      </div>

      {/* ── Header ── */}
      <div className="bg-background border-b border-border/60 pt-10 lg:pt-4 pb-3 px-4 z-20 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <GanttChart className="h-5 w-5 text-muted-foreground/70 shrink-0" />
            <span className="text-lg shrink-0">{project.emoji || '📁'}</span>
            <h2 className="text-base font-semibold truncate">{project.title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Time scale toggle */}
            <div className="flex items-center rounded-lg border border-border/50 bg-muted/40 p-0.5">
              <button
                onClick={() => setTimeScale('quarter')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                  timeScale === 'quarter'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground/60 hover:text-foreground',
                )}
              >
                Quarter
              </button>
              <button
                onClick={() => setTimeScale('year')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                  timeScale === 'year'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground/60 hover:text-foreground',
                )}
              >
                Year
              </button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 shrink-0"
              aria-label="Close roadmap"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Timeline Body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex min-h-full">
          {/* ── Left: Lane headers (sticky) ── */}
          <div className={cn('shrink-0 border-r border-border/60 bg-background z-10 sticky left-0', LANE_HEADER_W)}>
            {/* Column header spacer */}
            <div className="h-14 border-b border-border/60 flex items-end px-3 pb-2">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Milestones</span>
            </div>

            {/* Lane headers */}
            {lanes.map((lane, i) => (
              <div
                key={lane.milestone?.id || 'ungrouped'}
                className={cn(
                  'flex items-center gap-2 px-3 border-b border-border/30',
                  LANE_HEIGHT,
                  i % 2 === 0 ? 'bg-background' : 'bg-foreground/[0.015]',
                )}
              >
                {lane.milestone ? (
                  <button
                    onClick={() => onNavigate(lane.milestone!.id)}
                    className="flex items-center gap-2 min-w-0 group"
                  >
                    <Target className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      lane.milestone.status === 'done' ? 'text-foreground/30' : 'text-muted-foreground/50',
                    )} />
                    <span className={cn(
                      'text-[12px] font-medium truncate',
                      lane.milestone.status === 'done'
                        ? 'text-muted-foreground/40 line-through'
                        : 'text-foreground/80 group-hover:text-foreground',
                    )}>
                      {lane.milestone.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
                      {lane.tasks.length}
                    </span>
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40 italic">Ungrouped</span>
                )}
              </div>
            ))}

            {/* Add milestone row */}
            <div className={cn('flex items-center px-3', LANE_HEIGHT)}>
              <button
                onClick={handleAddMilestone}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add milestone
              </button>
            </div>
          </div>

          {/* ── Right: Timeline grid (scrollable) ── */}
          <div ref={timelineRef} className="flex-1 overflow-x-auto min-w-0">
            <div className="min-w-[800px] lg:min-w-[1000px]" style={{ width: timeScale === 'quarter' ? '1400px' : '1800px' }}>
              {/* Column headers */}
              <div className="h-14 border-b border-border/60 relative">
                {timeScale === 'quarter' ? (
                  <>
                    {/* Month group headers */}
                    <div className="h-7 flex relative">
                      {quarterMonthHeaders.map((mh) => (
                        <div
                          key={mh.label}
                          className="absolute top-0 h-full flex items-center justify-center border-r border-border/30"
                          style={{ left: `${mh.leftPct}%`, width: `${mh.widthPct}%` }}
                        >
                          <span className="text-[11px] font-medium text-muted-foreground/60">{mh.shortLabel}</span>
                        </div>
                      ))}
                    </div>
                    {/* Week columns */}
                    <div className="h-7 flex relative">
                      {weekColumns.map((wk, i) => {
                        const leftPct = (differenceInCalendarDays(wk.start, rangeStart) / totalDays) * 100;
                        const widthPct = (7 / totalDays) * 100;
                        return (
                          <div
                            key={i}
                            className="absolute top-0 h-full flex items-center justify-center border-r border-border/20 text-[10px] text-muted-foreground/40 tabular-nums"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          >
                            {wk.label}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Year view: month columns */
                  <div className="h-full flex relative">
                    {monthColumns.map((mc) => {
                      const startClamped = mc.start < rangeStart ? rangeStart : mc.start;
                      const endClamped = mc.end > rangeEnd ? rangeEnd : mc.end;
                      const leftPct = (differenceInCalendarDays(startClamped, rangeStart) / totalDays) * 100;
                      const widthPct = ((differenceInCalendarDays(endClamped, startClamped) + 1) / totalDays) * 100;
                      return (
                        <div
                          key={mc.label}
                          className={cn(
                            'absolute top-0 h-full flex items-end justify-center pb-2 border-r border-border/30',
                          )}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        >
                          <span className="text-[11px] font-medium text-muted-foreground/60">{mc.shortLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lane rows */}
              <div className="relative">
                {/* Today marker line */}
                {todayPercent >= 0 && todayPercent <= 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20 pointer-events-none"
                    style={{ left: `${todayPercent}%` }}
                  >
                    <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
                  </div>
                )}

                {/* Column grid lines */}
                {timeScale === 'quarter'
                  ? weekColumns.map((wk, i) => {
                      const leftPct = (differenceInCalendarDays(wk.start, rangeStart) / totalDays) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px bg-border/20 pointer-events-none"
                          style={{ left: `${leftPct}%` }}
                        />
                      );
                    })
                  : monthColumns.map((mc, i) => {
                      const startClamped = mc.start < rangeStart ? rangeStart : mc.start;
                      const leftPct = (differenceInCalendarDays(startClamped, rangeStart) / totalDays) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px bg-border/20 pointer-events-none"
                          style={{ left: `${leftPct}%` }}
                        />
                      );
                    })}

                {/* Swim lanes */}
                {lanes.map((lane, i) => (
                  <div
                    key={lane.milestone?.id || 'ungrouped'}
                    className={cn(
                      'relative border-b border-border/30',
                      LANE_HEIGHT,
                      i % 2 === 0 ? 'bg-background' : 'bg-foreground/[0.015]',
                    )}
                  >
                    {/* Milestone diamond */}
                    {lane.milestone && renderMilestoneDiamond(lane.milestone)}

                    {/* Task bars */}
                    {lane.datedTasks.map((task) => renderTaskBar(task))}

                    {/* Add task button (right edge) */}
                    <button
                      onClick={() => handleAddTask(lane.milestone?.id || project.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 focus:opacity-100 p-1 rounded-md bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground/40 hover:text-muted-foreground transition-all z-10"
                      title="Add task"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Undated items section ── */}
        {totalUndated > 0 && (
          <div className="border-t border-border/60 px-4 py-3">
            <button
              onClick={() => setShowUndated(!showUndated)}
              className="flex items-center gap-2 text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showUndated && '-rotate-90')} />
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-medium">Undated tasks</span>
              <span className="text-muted-foreground/30 tabular-nums">{totalUndated}</span>
            </button>
            {showUndated && (
              <div className="mt-2 space-y-1.5 pl-6">
                {lanes.map((lane) =>
                  lane.undatedTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onNavigate(task.id)}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-foreground/[0.03] transition-colors group"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: project.color || '#6366f1', opacity: task.status === 'done' ? 0.3 : 0.7 }}
                      />
                      <span className={cn(
                        'text-[12px] flex-1 truncate',
                        task.status === 'done' ? 'text-muted-foreground/40 line-through' : 'text-foreground/70 group-hover:text-foreground',
                      )}>
                        {task.title}
                      </span>
                      {lane.milestone && (
                        <span className="text-[10px] text-muted-foreground/30 shrink-0">{lane.milestone.title}</span>
                      )}
                    </button>
                  )),
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {lanes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-16">
            <div className="h-16 w-16 rounded-2xl bg-foreground/[0.04] flex items-center justify-center mb-4">
              <GanttChart className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-sm font-semibold text-foreground/80 mb-1">No milestones yet</h3>
            <p className="text-[12px] text-muted-foreground/50 max-w-[240px] leading-relaxed mb-4">
              Add milestones to your project to see them on the roadmap timeline
            </p>
            <button
              onClick={handleAddMilestone}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[12px] font-medium text-background hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Milestone
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-[90dvh] lg:h-[85dvh] rounded-t-2xl p-0 border-0"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={swipeStyles}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Project Roadmap</SheetTitle>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
