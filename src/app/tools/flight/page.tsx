'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plane,
  Play,
  Square,
  Clock,
  CheckSquare,
  Zap,
  ChevronRight,
  ArrowRight,
  X,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { updateItem } from '@/lib/firestore';
import {
  DEFAULT_AIRPORTS,
  DEFAULT_ROUTE,
  DURATION_PRESETS,
  TURBULENCE_TYPES,
  getCurrentPhase,
  generateFlightNumber,
  selectFlightTasks,
  type Airport,
  type FlightRoute,
  type FlightTask,
  type FlightDuration,
  type FlightPhase,
  type TurbulenceLog,
} from '@/lib/flight';

// ─── Sub-views ─────────────────────────────────────────────

type FlightView = 'preflight' | 'inflight' | 'debrief';

export default function FlightPage() {
  const { items } = useOrbitStore();
  const { user } = useAuth();

  // ── Preflight state ──
  const [route, setRoute] = useState<FlightRoute>(DEFAULT_ROUTE);
  const [duration, setDuration] = useState<FlightDuration>(50);
  const [tasks, setTasks] = useState<FlightTask[]>([]);
  const [flightNumber, setFlightNumber] = useState('');
  const [pickingAirport, setPickingAirport] = useState<'from' | 'to' | null>(null);

  // ── In-flight state ──
  const [view, setView] = useState<FlightView>('preflight');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [turbulence, setTurbulence] = useState<TurbulenceLog[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Debrief state ──
  const [debriefSummary, setDebriefSummary] = useState('');
  const [debriefNextAction, setDebriefNextAction] = useState('');

  // Auto-select tasks on mount
  useEffect(() => {
    if (tasks.length === 0) {
      setTasks(selectFlightTasks(items));
    }
  }, [items, tasks.length]);

  // Generate flight number
  useEffect(() => {
    if (!flightNumber) setFlightNumber(generateFlightNumber());
  }, [flightNumber]);

  // Timer
  useEffect(() => {
    if (view === 'inflight') {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= duration * 60) {
            // Auto-land
            clearInterval(timerRef.current!);
            setView('debrief');
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [view, duration]);

  const phaseInfo = useMemo(
    () => getCurrentPhase(elapsed, duration),
    [elapsed, duration]
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remainingSec = duration * 60 - elapsed;

  // ── Actions ──

  const handleStartFlight = () => {
    setStartTime(Date.now());
    setElapsed(0);
    setTurbulence([]);
    setView('inflight');
  };

  const handleAbort = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setView('debrief');
  };

  const handleLogTurbulence = (type: TurbulenceLog['type']) => {
    setTurbulence((prev) => [...prev, { timestamp: Date.now(), type }]);
  };

  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleFinishDebrief = async () => {
    // Mark completed tasks as done in Firestore
    for (const t of tasks.filter((t) => t.completed)) {
      try {
        await updateItem(t.id, {
          status: 'done',
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch { /* silently skip */ }
    }

    // Reset for next flight
    setView('preflight');
    setFlightNumber(generateFlightNumber());
    setTasks(selectFlightTasks(items));
    setDebriefSummary('');
    setDebriefNextAction('');
    setElapsed(0);
    setTurbulence([]);
  };

  const handleSelectAirport = (airport: Airport) => {
    if (pickingAirport === 'from') {
      setRoute((prev) => ({ ...prev, from: airport }));
    } else if (pickingAirport === 'to') {
      setRoute((prev) => ({ ...prev, to: airport }));
    }
    setPickingAirport(null);
  };

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════

  if (view === 'inflight') {
    return <InFlightView
      flightNumber={flightNumber}
      route={route}
      duration={duration}
      elapsed={elapsed}
      phaseInfo={phaseInfo}
      tasks={tasks}
      turbulence={turbulence}
      formatTime={formatTime}
      remainingSec={remainingSec}
      onToggleTask={handleToggleTask}
      onLogTurbulence={handleLogTurbulence}
      onAbort={handleAbort}
    />;
  }

  if (view === 'debrief') {
    return <DebriefView
      flightNumber={flightNumber}
      route={route}
      duration={duration}
      elapsed={elapsed}
      tasks={tasks}
      turbulence={turbulence}
      formatTime={formatTime}
      debriefSummary={debriefSummary}
      setDebriefSummary={setDebriefSummary}
      debriefNextAction={debriefNextAction}
      setDebriefNextAction={setDebriefNextAction}
      onToggleTask={handleToggleTask}
      onFinish={handleFinishDebrief}
    />;
  }

  // ── PREFLIGHT ──

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Plane className="h-5 w-5 text-sky-500" strokeWidth={1.5} />
        <h1 className="text-xl font-semibold tracking-tight">Cleared for Takeoff</h1>
      </div>

      {/* ── Boarding Pass ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {/* Top: Route */}
        <div className="p-5 pb-4 border-b border-dashed border-border/40">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest">
              Boarding Pass
            </p>
            <p className="text-[11px] font-mono text-muted-foreground/50">{flightNumber}</p>
          </div>

          <div className="flex items-center gap-4 mt-4">
            {/* From */}
            <button
              onClick={() => setPickingAirport('from')}
              className="flex-1 text-left group"
            >
              <p className="text-[10px] text-muted-foreground/40 uppercase">From</p>
              <p className="text-2xl font-bold tracking-tight group-hover:text-sky-500 transition-colors">
                {route.from.code}
              </p>
              <p className="text-[11px] text-muted-foreground/50">{route.from.name}</p>
            </button>

            <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />

            {/* To */}
            <button
              onClick={() => setPickingAirport('to')}
              className="flex-1 text-right group"
            >
              <p className="text-[10px] text-muted-foreground/40 uppercase">To</p>
              <p className="text-2xl font-bold tracking-tight group-hover:text-sky-500 transition-colors">
                {route.to.code}
              </p>
              <p className="text-[11px] text-muted-foreground/50">{route.to.name}</p>
            </button>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-6 mt-4 pt-3 border-t border-border/20">
            <div>
              <p className="text-[9px] text-muted-foreground/30 uppercase">Passenger</p>
              <p className="text-[12px] font-medium">{user?.displayName || 'Pilot'}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/30 uppercase">Flight Time</p>
              <p className="text-[12px] font-medium">{duration}m</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/30 uppercase">Gate</p>
              <p className="text-[12px] font-medium font-mono">G{Math.floor(Math.random() * 40) + 1}</p>
            </div>
          </div>
        </div>

        {/* Bottom: Task Manifest */}
        <div className="p-5 pt-4">
          <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest mb-3">
            Task Manifest
          </p>

          {tasks.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/30 py-4 text-center">
              No active tasks. Create some first.
            </p>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                    task.type === 'primary'
                      ? 'font-medium'
                      : 'text-muted-foreground/50'
                  )}
                >
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    task.type === 'primary' ? 'bg-sky-500' : 'bg-muted-foreground/20'
                  )} />
                  <span className="flex-1 truncate">{task.title}</span>
                  <button
                    onClick={() => handleRemoveTask(task.id)}
                    className="text-muted-foreground/20 hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Duration Selection ── */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground/50 mb-2.5 uppercase tracking-wider">
          Flight Duration
        </p>
        <div className="space-y-2">
          {DURATION_PRESETS.map((preset) => (
            <div key={preset.category}>
              <p className="text-[10px] text-muted-foreground/30 mb-1.5">{preset.label}</p>
              <div className="flex gap-2">
                {preset.durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      'rounded-xl px-4 py-2 text-[13px] font-medium transition-all active:scale-95 border',
                      d === duration
                        ? 'bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400'
                        : 'border-border/40 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/70'
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Start Flight ── */}
      <button
        onClick={handleStartFlight}
        disabled={tasks.length === 0}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold transition-all active:scale-[0.98]',
          tasks.length > 0
            ? 'bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-600/20'
            : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
        )}
      >
        <Play className="h-4 w-4" />
        Start Flight
      </button>

      {/* Airport Picker Modal */}
      {pickingAirport && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
            onClick={() => setPickingAirport(null)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none p-6">
            <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card p-5 w-full max-w-[300px] shadow-2xl">
              <p className="text-[13px] font-semibold mb-3">
                Select {pickingAirport === 'from' ? 'Departure' : 'Destination'}
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto">
                {DEFAULT_AIRPORTS.map((airport) => (
                  <button
                    key={airport.code}
                    onClick={() => handleSelectAirport(airport)}
                    className={cn(
                      'text-left rounded-lg px-3 py-2 transition-colors hover:bg-foreground/[0.05]',
                      (pickingAirport === 'from' && route.from.code === airport.code) ||
                      (pickingAirport === 'to' && route.to.code === airport.code)
                        ? 'bg-sky-500/10 border border-sky-500/20'
                        : 'border border-transparent'
                    )}
                  >
                    <p className="text-[14px] font-bold">{airport.code}</p>
                    <p className="text-[10px] text-muted-foreground/50">{airport.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// In-Flight View
// ═══════════════════════════════════════════════════════════

function InFlightView({
  flightNumber,
  route,
  duration,
  elapsed,
  phaseInfo,
  tasks,
  turbulence,
  formatTime,
  remainingSec,
  onToggleTask,
  onLogTurbulence,
  onAbort,
}: {
  flightNumber: string;
  route: FlightRoute;
  duration: FlightDuration;
  elapsed: number;
  phaseInfo: ReturnType<typeof getCurrentPhase>;
  tasks: FlightTask[];
  turbulence: TurbulenceLog[];
  formatTime: (sec: number) => string;
  remainingSec: number;
  onToggleTask: (id: string) => void;
  onLogTurbulence: (type: TurbulenceLog['type']) => void;
  onAbort: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* Flight strip */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-3.5 w-3.5 text-sky-500" strokeWidth={1.5} />
          <span className="text-[11px] font-mono text-muted-foreground/50">{flightNumber}</span>
          <span className="text-[11px] text-muted-foreground/30">
            {route.from.code} → {route.to.code}
          </span>
        </div>
        <button
          onClick={onAbort}
          className="text-[11px] text-muted-foreground/40 hover:text-red-400 transition-colors"
        >
          Abort
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 py-8">
        {/* Phase Label */}
        <p className={cn(
          'text-[11px] font-medium uppercase tracking-[0.2em] mb-2 transition-colors',
          phaseInfo.phase === 'cruise' ? 'text-sky-500' : 'text-muted-foreground/40'
        )}>
          {phaseInfo.label}
        </p>

        {/* Big Timer */}
        <p className="text-6xl lg:text-7xl font-bold tabular-nums tracking-tight">
          {formatTime(remainingSec > 0 ? remainingSec : 0)}
        </p>

        <p className="text-[12px] text-muted-foreground/30 mt-1 tabular-nums">
          {formatTime(elapsed)} elapsed
        </p>

        {/* Phase Progress Bar */}
        <div className="w-full max-w-md mt-8">
          <div className="relative h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-sky-500 transition-all duration-1000 ease-linear"
              style={{ width: `${phaseInfo.progress * 100}%` }}
            />
          </div>
          {/* Phase markers */}
          <div className="flex justify-between mt-1.5">
            {['Boarding', 'Taxi', 'Takeoff', 'Cruise', 'Descent', 'Land'].map((label) => (
              <span
                key={label}
                className={cn(
                  'text-[8px] uppercase tracking-wider transition-colors',
                  phaseInfo.label === label || (label === 'Land' && phaseInfo.label === 'Landing')
                    ? 'text-sky-500 font-semibold'
                    : 'text-muted-foreground/20'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Task Manifest */}
        <div className="w-full max-w-md mt-8">
          <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-2">
            Manifest
          </p>
          <div className="space-y-1">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onToggleTask(task.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-left transition-all',
                  task.completed
                    ? 'text-muted-foreground/30 line-through'
                    : task.type === 'primary'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground/60',
                  'hover:bg-foreground/[0.03]'
                )}
              >
                <div className={cn(
                  'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                  task.completed
                    ? 'bg-sky-500 border-sky-500'
                    : 'border-border/60'
                )}>
                  {task.completed && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="truncate">{task.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Turbulence quick-log strip */}
      <div className="px-4 lg:px-8 py-3 border-t border-border/30">
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 text-muted-foreground/30" />
          <span className="text-[10px] text-muted-foreground/30 mr-1">Turbulence:</span>
          {TURBULENCE_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => onLogTurbulence(t.type)}
              className="text-[11px] px-2 py-1 rounded-lg bg-foreground/[0.03] hover:bg-foreground/[0.06] text-muted-foreground/50 hover:text-foreground/70 transition-colors active:scale-95"
              title={t.label}
            >
              {t.emoji}
            </button>
          ))}
          {turbulence.length > 0 && (
            <span className="text-[10px] text-muted-foreground/30 ml-auto tabular-nums">
              {turbulence.length} logged
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Debrief View
// ═══════════════════════════════════════════════════════════

function DebriefView({
  flightNumber,
  route,
  duration,
  elapsed,
  tasks,
  turbulence,
  formatTime,
  debriefSummary,
  setDebriefSummary,
  debriefNextAction,
  setDebriefNextAction,
  onToggleTask,
  onFinish,
}: {
  flightNumber: string;
  route: FlightRoute;
  duration: FlightDuration;
  elapsed: number;
  tasks: FlightTask[];
  turbulence: TurbulenceLog[];
  formatTime: (sec: number) => string;
  debriefSummary: string;
  setDebriefSummary: (v: string) => void;
  debriefNextAction: string;
  setDebriefNextAction: (v: string) => void;
  onToggleTask: (id: string) => void;
  onFinish: () => void;
}) {
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest">
          Debrief
        </p>
        <h1 className="text-xl font-semibold tracking-tight mt-1">Flight Complete</h1>
        <p className="text-[12px] text-muted-foreground/50 mt-0.5 font-mono">
          {flightNumber} · {route.from.code} → {route.to.code} · {formatTime(elapsed)} actual
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/40 p-3 text-center">
          <p className="text-xl font-bold tabular-nums">{formatTime(elapsed)}</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">Flight Time</p>
        </div>
        <div className="rounded-xl border border-border/40 p-3 text-center">
          <p className="text-xl font-bold tabular-nums">{completedCount}/{tasks.length}</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">Tasks Done</p>
        </div>
        <div className="rounded-xl border border-border/40 p-3 text-center">
          <p className="text-xl font-bold tabular-nums">{turbulence.length}</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">Turbulence</p>
        </div>
      </div>

      {/* Task review */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground/50 mb-2 uppercase tracking-wider">
          Task Review
        </p>
        <div className="space-y-1">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => onToggleTask(task.id)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-left transition-all',
                task.completed ? 'text-muted-foreground/30 line-through' : 'text-foreground',
                'hover:bg-foreground/[0.03]'
              )}
            >
              <div className={cn(
                'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-border/60'
              )}>
                {task.completed && (
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                    <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span>{task.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Debrief inputs */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
            What did you finish?
          </label>
          <input
            value={debriefSummary}
            onChange={(e) => setDebriefSummary(e.target.value)}
            placeholder="Quick summary..."
            className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-sky-500/40 transition-colors"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
            Next action
          </label>
          <input
            value={debriefNextAction}
            onChange={(e) => setDebriefNextAction(e.target.value)}
            placeholder="What comes next?"
            className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-sky-500/40 transition-colors"
          />
        </div>
      </div>

      {/* Complete */}
      <button
        onClick={onFinish}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
      >
        <CheckSquare className="h-4 w-4" />
        Complete Debrief
      </button>
    </div>
  );
}
