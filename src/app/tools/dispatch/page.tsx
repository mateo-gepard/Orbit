'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Route,
  Clock,
  Play,
  Plus,
  Shuffle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { format, isToday, parseISO } from 'date-fns';
import type { OrbitItem } from '@/lib/types';

interface TimeBlock {
  id: string;
  label: string;
  startHour: number;
  startMin: number;
  durationMin: number;
  tasks: OrbitItem[];
  color: string;
}

const BLOCK_COLORS = [
  'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400',
  'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
  'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400',
  'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',
  'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400',
];

const BLOCK_LABELS = [
  'Morning Focus',
  'Deep Work',
  'Afternoon Sprint',
  'Wrap-up',
  'Late Session',
  'Overtime',
];

function formatTimeSlot(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mins = m > 0 ? `:${m.toString().padStart(2, '0')}` : '';
  return `${display}${mins} ${period}`;
}

function generateRoute(tasks: OrbitItem[]): TimeBlock[] {
  const active = tasks.filter(
    (i) => i.type === 'task' && i.status === 'active'
  );
  if (active.length === 0) return [];

  // Sort by priority → dueDate → updatedAt (deterministic)
  const sorted = [...active].sort((a, b) => {
    const pMap: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const pa = pMap[a.priority || 'low'];
    const pb = pMap[b.priority || 'low'];
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const blocks: TimeBlock[] = [];
  let idx = 0;
  const now = new Date();
  // Start at current hour rounded up, minimum 8 AM
  let currentHour = Math.max(8, now.getHours() + (now.getMinutes() > 30 ? 1 : 0));
  let currentMin = 0;

  while (idx < sorted.length && blocks.length < 6 && currentHour < 22) {
    const remaining = sorted.length - idx;
    // 2-3 tasks per block, prefer 2 when few tasks remain
    const batchSize = remaining <= 2 ? remaining : Math.min(3, remaining);
    const batch = sorted.slice(idx, idx + batchSize);
    const blockDuration = batchSize <= 2 ? 50 : 75;

    // Determine label from the first task's tag, or use positional label
    const tagLabel = batch[0].tags?.[0];
    const label = tagLabel
      ? tagLabel.charAt(0).toUpperCase() + tagLabel.slice(1)
      : BLOCK_LABELS[blocks.length] || `Block ${blocks.length + 1}`;

    blocks.push({
      id: `block-${Date.now()}-${blocks.length}`,
      label,
      startHour: currentHour,
      startMin: currentMin,
      durationMin: blockDuration,
      tasks: batch,
      color: BLOCK_COLORS[blocks.length % BLOCK_COLORS.length],
    });

    // Advance time: block duration + 15 min break
    const totalMin = currentMin + blockDuration + 15;
    currentHour += Math.floor(totalMin / 60);
    currentMin = totalMin % 60;
    idx += batchSize;
  }

  return blocks;
}

export default function DispatchPage() {
  const { items } = useOrbitStore();
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => items.filter((i) => i.type === 'task' && i.status === 'active'),
    [items]
  );

  const todayTasks = useMemo(
    () =>
      activeTasks.filter((i) => {
        if (!i.dueDate) return false;
        try {
          return isToday(parseISO(i.dueDate));
        } catch {
          return false;
        }
      }),
    [activeTasks]
  );

  // Tasks already scheduled in some block
  const scheduledTaskIds = useMemo(
    () => new Set(blocks.flatMap((b) => b.tasks.map((t) => t.id))),
    [blocks]
  );

  // Unscheduled tasks
  const unscheduledTasks = useMemo(
    () => activeTasks.filter((t) => !scheduledTaskIds.has(t.id)),
    [activeTasks, scheduledTaskIds]
  );

  const totalFocusMin = blocks.reduce((sum, b) => sum + b.durationMin, 0);

  const handleGenerateRoute = () => {
    setBlocks(generateRoute(items));
  };

  const handleReroute = () => {
    setBlocks(generateRoute(items));
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const handleRemoveTaskFromBlock = (blockId: string, taskId: string) => {
    setBlocks((prev) =>
      prev
        .map((b) => {
          if (b.id !== blockId) return b;
          return { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) };
        })
        .filter((b) => b.tasks.length > 0)
    );
  };

  const handleAddTaskToBlock = (blockId: string, task: OrbitItem) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return { ...b, tasks: [...b.tasks, task] };
      })
    );
    setAddingToBlock(null);
  };

  const handleMoveBlock = (blockId: string, direction: 'up' | 'down') => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      // Recalculate times
      const now = new Date();
      let currentHour = Math.max(8, now.getHours());
      let currentMin = 0;
      return next.map((block, i) => {
        const updated = { ...block, startHour: currentHour, startMin: currentMin, color: BLOCK_COLORS[i % BLOCK_COLORS.length] };
        const totalMin = currentMin + block.durationMin + 15;
        currentHour += Math.floor(totalMin / 60);
        currentMin = totalMin % 60;
        return updated;
      });
    });
  };

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-emerald-500" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Dispatch</h1>
        </div>
        <p className="text-[11px] text-muted-foreground/40">
          {format(new Date(), 'EEEE, MMM d')}
        </p>
      </div>

      {/* Overview strip */}
      <div className="flex items-center gap-4 text-[12px] flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          <span>{activeTasks.length} active</span>
        </div>
        <div className="text-muted-foreground/30">·</div>
        <div className="text-muted-foreground/50">
          {todayTasks.length} due today
        </div>
        <div className="text-muted-foreground/30">·</div>
        <div className="text-muted-foreground/50">
          {blocks.length} blocks · {totalFocusMin}m focus
        </div>
      </div>

      {/* Empty state */}
      {blocks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/40 p-8 flex flex-col items-center justify-center text-center">
          <Route
            className="h-8 w-8 text-emerald-500/30 mb-3"
            strokeWidth={1.5}
          />
          <p className="text-[14px] font-medium">No route planned</p>
          <p className="text-[12px] text-muted-foreground/40 mt-1 max-w-[260px]">
            Generate a route to organize your tasks into focused time blocks for
            today.
          </p>
          <button
            onClick={handleGenerateRoute}
            disabled={activeTasks.length === 0}
            className={cn(
              'mt-4 flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all active:scale-95',
              activeTasks.length > 0
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/15'
                : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
            )}
          >
            <Shuffle className="h-3.5 w-3.5" />
            Generate Route
          </button>
        </div>
      )}

      {/* Route timeline */}
      {blocks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              Today&apos;s Route
            </p>
            <button
              onClick={handleReroute}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-emerald-500 transition-colors"
            >
              <Shuffle className="h-3 w-3" />
              Re-route
            </button>
          </div>

          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className={cn(
                'group rounded-xl border p-4 transition-all',
                block.color
              )}
            >
              <div className="flex items-start justify-between mb-2.5">
                <div>
                  <p className="text-[13px] font-semibold">{block.label}</p>
                  <p className="text-[11px] opacity-60">
                    {formatTimeSlot(block.startHour, block.startMin)} ·{' '}
                    {block.durationMin}m · {block.tasks.length} task
                    {block.tasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Reorder */}
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                    {idx > 0 && (
                      <button
                        onClick={() => handleMoveBlock(block.id, 'up')}
                        className="opacity-40 hover:opacity-100 transition-opacity"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                    )}
                    {idx < blocks.length - 1 && (
                      <button
                        onClick={() => handleMoveBlock(block.id, 'down')}
                        className="opacity-40 hover:opacity-100 transition-opacity"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* Fly — link to flight tool */}
                  <Link
                    href="/tools/flight"
                    className="flex items-center gap-1 text-[10px] opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <Play className="h-3 w-3" />
                    Fly
                  </Link>
                  <button
                    onClick={() => handleRemoveBlock(block.id)}
                    className="ml-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-0.5">
                {block.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="group/task flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] opacity-80"
                  >
                    <span className="h-1 w-1 rounded-full bg-current shrink-0 opacity-40" />
                    <span className="flex-1 truncate">{task.title}</span>
                    {task.priority && (
                      <span
                        className={cn(
                          'text-[9px] uppercase opacity-50',
                          task.priority === 'high' && 'text-red-500',
                          task.priority === 'medium' && 'text-amber-500'
                        )}
                      >
                        {task.priority === 'high' ? '!' : task.priority === 'medium' ? '·' : ''}
                      </span>
                    )}
                    <button
                      onClick={() =>
                        handleRemoveTaskFromBlock(block.id, task.id)
                      }
                      className="opacity-0 group-hover/task:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add task to this block */}
              {addingToBlock === block.id ? (
                <div className="mt-2 rounded-lg border border-border/30 bg-background/50 p-2 max-h-[150px] overflow-y-auto">
                  {unscheduledTasks.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/30 text-center py-2">
                      All tasks scheduled
                    </p>
                  ) : (
                    unscheduledTasks.slice(0, 8).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleAddTaskToBlock(block.id, task)}
                        className="w-full flex items-center gap-2 rounded px-2 py-1 text-[11px] text-left hover:bg-foreground/[0.04] transition-colors"
                      >
                        <Plus className="h-2.5 w-2.5 shrink-0 opacity-50" />
                        <span className="truncate">{task.title}</span>
                      </button>
                    ))
                  )}
                  <button
                    onClick={() => setAddingToBlock(null)}
                    className="w-full text-[10px] text-muted-foreground/30 mt-1 hover:text-foreground transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingToBlock(block.id)}
                  className="mt-2 flex items-center gap-1 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-foreground"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Add task
                </button>
              )}
            </div>
          ))}

          {/* Unscheduled tasks */}
          {unscheduledTasks.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-2">
                Unscheduled ({unscheduledTasks.length})
              </p>
              <div className="space-y-0.5">
                {unscheduledTasks.slice(0, 12).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-muted-foreground/40"
                  >
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/20 shrink-0" />
                    <span className="truncate flex-1">{task.title}</span>
                    {task.dueDate && (
                      <span className="text-[10px] text-muted-foreground/20 font-mono">
                        {task.dueDate.slice(5)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
