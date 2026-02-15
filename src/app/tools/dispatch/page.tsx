'use client';

import { useState, useMemo } from 'react';
import {
  Route,
  Clock,
  Play,
  Plus,
  Shuffle,
  ArrowRight,
  GripVertical,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import type { OrbitItem } from '@/lib/types';

interface TimeBlock {
  id: string;
  label: string;
  startHour: number; // 0-23
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

function formatHour(h: number) {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display} ${period}`;
}

function generateRoute(tasks: OrbitItem[]): TimeBlock[] {
  const active = tasks.filter(
    (i) => i.type === 'task' && i.status === 'active'
  );
  if (active.length === 0) return [];

  // Sort by priority then dueDate
  const sorted = [...active].sort((a, b) => {
    const pMap = { high: 0, medium: 1, low: 2 };
    const pa = pMap[a.priority || 'low'];
    const pb = pMap[b.priority || 'low'];
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  // Bundle into blocks of 2-3 tasks
  const blocks: TimeBlock[] = [];
  let idx = 0;
  let currentHour = 9; // Start at 9 AM

  while (idx < sorted.length && blocks.length < 6) {
    const batchSize = Math.min(2 + Math.floor(Math.random() * 2), sorted.length - idx);
    const batch = sorted.slice(idx, idx + batchSize);
    const blockDuration = batchSize <= 2 ? 50 : 75;

    blocks.push({
      id: `block-${blocks.length}`,
      label: batch[0].tags?.[0]
        ? batch[0].tags[0].charAt(0).toUpperCase() + batch[0].tags[0].slice(1)
        : `Block ${blocks.length + 1}`,
      startHour: currentHour,
      durationMin: blockDuration,
      tasks: batch,
      color: BLOCK_COLORS[blocks.length % BLOCK_COLORS.length],
    });

    currentHour += Math.ceil(blockDuration / 60) + (Math.random() > 0.5 ? 1 : 0);
    idx += batchSize;
  }

  return blocks;
}

export default function DispatchPage() {
  const { items } = useOrbitStore();
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [selectedDate] = useState(new Date());

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
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) };
      }).filter((b) => b.tasks.length > 0)
    );
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
          {format(selectedDate, 'EEEE, MMM d')}
        </p>
      </div>

      {/* Overview strip */}
      <div className="flex items-center gap-4 text-[12px]">
        <div className="flex items-center gap-1.5 text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          <span>{activeTasks.length} active tasks</span>
        </div>
        <div className="text-muted-foreground/30">·</div>
        <div className="text-muted-foreground/50">
          {todayTasks.length} due today
        </div>
        <div className="text-muted-foreground/30">·</div>
        <div className="text-muted-foreground/50">
          {blocks.length} blocks planned
        </div>
      </div>

      {/* No route yet */}
      {blocks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/40 p-8 flex flex-col items-center justify-center text-center">
          <Route className="h-8 w-8 text-emerald-500/30 mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-medium">No route planned</p>
          <p className="text-[12px] text-muted-foreground/40 mt-1 max-w-[260px]">
            Generate a route to automatically organize your tasks into focused time blocks.
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
                'rounded-xl border p-4 transition-all',
                block.color
              )}
            >
              <div className="flex items-start justify-between mb-2.5">
                <div>
                  <p className="text-[13px] font-semibold">{block.label}</p>
                  <p className="text-[11px] opacity-60">
                    {formatHour(block.startHour)} · {block.durationMin}m
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={`/tools/flight`}
                    className="flex items-center gap-1 text-[10px] opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <Play className="h-3 w-3" />
                    Fly
                  </a>
                  <button
                    onClick={() => handleRemoveBlock(block.id)}
                    className="ml-1 opacity-30 hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-0.5">
                {block.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] opacity-80"
                  >
                    <span className="h-1 w-1 rounded-full bg-current shrink-0 opacity-40" />
                    <span className="flex-1 truncate">{task.title}</span>
                    <button
                      onClick={() => handleRemoveTaskFromBlock(block.id, task.id)}
                      className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Unscheduled tasks */}
          {activeTasks.length > blocks.reduce((sum, b) => sum + b.tasks.length, 0) && (
            <div className="mt-4">
              <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-2">
                Unscheduled
              </p>
              <div className="space-y-0.5">
                {activeTasks
                  .filter(
                    (t) => !blocks.some((b) => b.tasks.some((bt) => bt.id === t.id))
                  )
                  .slice(0, 10)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-muted-foreground/40"
                    >
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/20 shrink-0" />
                      <span className="truncate">{task.title}</span>
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
