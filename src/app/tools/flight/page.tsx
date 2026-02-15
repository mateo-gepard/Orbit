'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plane,
  Play,
  Pause,
  Clock,
  CheckSquare,
  Zap,
  X,
  Plus,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { updateItem } from '@/lib/firestore';
import { PlaneAnimation } from '@/components/flight/plane-animation';
import {
  AIRPORTS,
  DURATION_PRESETS,
  TURBULENCE_TYPES,
  getCurrentPhase,
  generateFlightNumber,
  getRouteForDuration,
  getRouteForAirports,
  formatFlightTime,
  type Airport,
  type FlightRoute,
  type FlightTask,
  type FlightDuration,
  type FlightStatus,
  type TurbulenceLog,
} from '@/lib/flight';
import type { OrbitItem } from '@/lib/types';

// ─── Sub-views ─────────────────────────────────────────────

type FlightView = 'preflight' | 'inflight' | 'debrief';

export default function FlightPage() {
  const { items } = useOrbitStore();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  // ── Preflight state ──
  const [duration, setDuration] = useState<FlightDuration>(50);
  const [route, setRoute] = useState<FlightRoute>(() => getRouteForDuration(50));
  const [tasks, setTasks] = useState<FlightTask[]>([]);
  const [flightNumber, setFlightNumber] = useState('');
  const [gateNumber, setGateNumber] = useState(0);
  const [seatRow, setSeatRow] = useState(0);
  const [seatLetter, setSeatLetter] = useState('');
  const [pickingAirport, setPickingAirport] = useState<'from' | 'to' | null>(null);
  const [addingTasks, setAddingTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  // ── In-flight state ──
  const [status, setStatus] = useState<FlightStatus>('preflight');
  const [elapsed, setElapsed] = useState(0);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [turbulence, setTurbulence] = useState<TurbulenceLog[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Debrief state ──
  const [debriefSummary, setDebriefSummary] = useState('');
  const [debriefNextAction, setDebriefNextAction] = useState('');
  const [completedNormally, setCompletedNormally] = useState(true);

  // Generate random/time-dependent values only on the client to avoid hydration mismatch
  useEffect(() => {
    setFlightNumber(generateFlightNumber());
    setGateNumber(Math.floor(Math.random() * 40) + 1);
    setSeatRow(Math.floor(Math.random() * 30) + 1);
    setSeatLetter(['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)]);
    setMounted(true);
  }, []);

  // Compute departure and arrival times from route flight time (client only)
  const departureTime = useMemo(() => {
    if (!mounted) return null;
    const now = new Date();
    // Departure is "now" rounded up to next 5 min
    const mins = now.getMinutes();
    const roundedMins = Math.ceil(mins / 5) * 5;
    now.setMinutes(roundedMins, 0, 0);
    return now;
  }, [mounted]);

  const arrivalTime = useMemo(() => {
    if (!departureTime) return null;
    const arrival = new Date(departureTime.getTime() + route.realFlightMin * 60 * 1000);
    return arrival;
  }, [departureTime, route.realFlightMin]);

  const formatClock = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const activeTasks = useMemo(
    () =>
      items
        .filter((i) => i.type === 'task' && i.status === 'active')
        .sort((a, b) => {
          const pMap: Record<string, number> = { high: 0, medium: 1, low: 2 };
          const pa = pMap[a.priority || 'low'];
          const pb = pMap[b.priority || 'low'];
          if (pa !== pb) return pa - pb;
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return b.updatedAt - a.updatedAt;
        }),
    [items]
  );

  const filteredTasks = useMemo(() => {
    const q = taskSearch.toLowerCase().trim();
    const available = activeTasks.filter(
      (t) => !tasks.some((ft) => ft.id === t.id)
    );
    if (!q) return available;
    return available.filter((t) => t.title.toLowerCase().includes(q));
  }, [activeTasks, tasks, taskSearch]);

  const handleDurationChange = (d: FlightDuration) => {
    const newRoute = getRouteForDuration(d);
    setDuration(d);
    setRoute(newRoute);
  };

  // ── Timer ──
  useEffect(() => {
    if (status === 'inflight') {
      const resumeBase = pausedElapsed;
      const resumeTime = Date.now();
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const currentElapsed = resumeBase + Math.floor((now - resumeTime) / 1000);
        setElapsed(currentElapsed);
        if (currentElapsed >= duration * 60) {
          clearInterval(timerRef.current!);
          setCompletedNormally(true);
          setStatus('debrief');
        }
      }, 250);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, duration, pausedElapsed]);

  const phaseInfo = useMemo(
    () => getCurrentPhase(elapsed, duration),
    [elapsed, duration]
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(Math.abs(sec) / 60);
    const s = Math.abs(sec) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remainingSec = Math.max(0, duration * 60 - elapsed);

  // ── Actions ──

  const handleStartFlight = () => {
    setElapsed(0);
    setPausedElapsed(0);
    setTurbulence([]);
    setCompletedNormally(true);
    setStatus('inflight');
  };

  const handlePause = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPausedElapsed(elapsed);
    setStatus('paused');
  };

  const handleResume = () => {
    setStatus('inflight');
  };

  const handleDivert = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCompletedNormally(false);
    setStatus('debrief');
  };

  const handleLogTurbulence = (type: TurbulenceLog['type']) => {
    setTurbulence((prev) => [...prev, { timestamp: Date.now(), type }]);
  };

  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleAddTask = (item: OrbitItem) => {
    const type = tasks.length < 3 ? 'primary' : 'carry-on';
    setTasks((prev) => [
      ...prev,
      { id: item.id, title: item.title, type, completed: false },
    ]);
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks((prev) => {
      const updated = prev.filter((t) => t.id !== taskId);
      return updated.map((t, i) => ({
        ...t,
        type: i < 3 ? ('primary' as const) : ('carry-on' as const),
      }));
    });
  };

  const handleSelectAirport = (airport: Airport) => {
    if (pickingAirport === 'from') {
      setRoute((prev) => getRouteForAirports(airport, prev.to));
    } else if (pickingAirport === 'to') {
      setRoute((prev) => getRouteForAirports(prev.from, airport));
    }
    setPickingAirport(null);
  };

  const handleFinishDebrief = async () => {
    for (const t of tasks.filter((t) => t.completed)) {
      try {
        await updateItem(t.id, {
          status: 'done',
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch {
        /* silently skip */
      }
    }
    setStatus('preflight');
    setTasks([]);
    setDebriefSummary('');
    setDebriefNextAction('');
    setElapsed(0);
    setPausedElapsed(0);
    setTurbulence([]);
    setRoute(getRouteForDuration(duration));
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER — IN-FLIGHT / PAUSED
  // ═══════════════════════════════════════════════════════════

  if (status === 'inflight' || status === 'paused') {
    return (
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Flight strip header */}
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="h-3.5 w-3.5 text-sky-500" strokeWidth={1.5} />
            <span className="text-[11px] font-mono text-muted-foreground/50">{flightNumber}</span>
            <span className="text-[11px] text-muted-foreground/30">
              {route.from.code} → {route.to.code}
            </span>
            {status === 'paused' && (
              <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                HOLDING
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status === 'inflight' ? (
              <button
                onClick={handlePause}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-amber-500 transition-colors"
              >
                <Pause className="h-3 w-3" />
                Hold
              </button>
            ) : (
              <button
                onClick={handleResume}
                className="flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-400 transition-colors font-medium"
              >
                <Play className="h-3 w-3" />
                Resume
              </button>
            )}
            <button
              onClick={handleDivert}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-red-400 transition-colors ml-2"
            >
              <AlertTriangle className="h-3 w-3" />
              Divert
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 py-8">
          <p
            className={cn(
              'text-[11px] font-medium uppercase tracking-[0.2em] mb-2 transition-colors',
              status === 'paused'
                ? 'text-amber-500'
                : phaseInfo.phase === 'cruise'
                  ? 'text-sky-500'
                  : 'text-muted-foreground/40'
            )}
          >
            {status === 'paused' ? 'Holding Pattern' : phaseInfo.label}
          </p>

          <PlaneAnimation
            phase={phaseInfo.phase}
            phaseProgress={phaseInfo.phaseProgress}
            progress={phaseInfo.progress}
            isPaused={status === 'paused'}
          />

          <p
            className={cn(
              'text-6xl lg:text-7xl font-bold tabular-nums tracking-tight transition-colors',
              status === 'paused' && 'text-amber-500/70'
            )}
          >
            {formatTime(remainingSec)}
          </p>

          <p className="text-[12px] text-muted-foreground/30 mt-1 tabular-nums">
            {formatTime(elapsed)} elapsed · {route.from.code} → {route.to.code} · {formatFlightTime(route.realFlightMin)} flight
          </p>

          {/* Phase Progress Bar */}
          <div className="w-full max-w-md mt-8">
            <div className="relative h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-linear',
                  status === 'paused' ? 'bg-amber-500' : 'bg-sky-500'
                )}
                style={{ width: `${phaseInfo.progress * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              {['Boarding', 'Taxi', 'Takeoff', 'Cruise', 'Descent', 'Landing'].map((label) => (
                <span
                  key={label}
                  className={cn(
                    'text-[8px] uppercase tracking-wider transition-colors',
                    phaseInfo.label === label
                      ? status === 'paused'
                        ? 'text-amber-500 font-semibold'
                        : 'text-sky-500 font-semibold'
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
              Manifest ({tasks.filter((t) => t.completed).length}/{tasks.length})
            </p>
            <div className="space-y-1">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleToggleTask(task.id)}
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
                  <div
                    className={cn(
                      'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                      task.completed ? 'bg-sky-500 border-sky-500' : 'border-border/60'
                    )}
                  >
                    {task.completed && (
                      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M4 8.5L6.5 11L12 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="truncate">{task.title}</span>
                </button>
              ))}
              {tasks.length === 0 && (
                <p className="text-[12px] text-muted-foreground/20 text-center py-3">
                  No tasks on this flight
                </p>
              )}
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
                onClick={() => handleLogTurbulence(t.type)}
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
  // RENDER — DEBRIEF
  // ═══════════════════════════════════════════════════════════

  if (status === 'debrief') {
    const completedCount = tasks.filter((t) => t.completed).length;

    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest">
            {completedNormally ? 'Debrief' : 'Diverted — Emergency Debrief'}
          </p>
          <h1 className="text-xl font-semibold tracking-tight mt-1">
            {completedNormally ? 'Flight Complete' : 'Flight Diverted'}
          </h1>
          <p className="text-[12px] text-muted-foreground/50 mt-0.5 font-mono">
            {flightNumber} · {route.from.code} → {route.to.code} · {formatFlightTime(route.realFlightMin)} · {formatTime(elapsed)} focus
          </p>
          {!completedNormally && (
            <p className="text-[12px] text-amber-500/70 mt-1">
              Diverted after {formatTime(elapsed)} of {duration}m scheduled flight.
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/40 p-3 text-center">
            <p className="text-xl font-bold tabular-nums">{formatTime(elapsed)}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">Flight Time</p>
          </div>
          <div className="rounded-xl border border-border/40 p-3 text-center">
            <p className="text-xl font-bold tabular-nums">
              {completedCount}/{tasks.length}
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">Tasks Done</p>
          </div>
          <div className="rounded-xl border border-border/40 p-3 text-center">
            <p className="text-xl font-bold tabular-nums">{turbulence.length}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">Turbulence</p>
          </div>
        </div>

        {/* Task review */}
        {tasks.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/50 mb-2 uppercase tracking-wider">
              Task Review
            </p>
            <div className="space-y-1">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleToggleTask(task.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-left transition-all',
                    task.completed ? 'text-muted-foreground/30 line-through' : 'text-foreground',
                    'hover:bg-foreground/[0.03]'
                  )}
                >
                  <div
                    className={cn(
                      'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                      task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-border/60'
                    )}
                  >
                    {task.completed && (
                      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M4 8.5L6.5 11L12 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <span>{task.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Debrief inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              What did you accomplish?
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

        <button
          onClick={handleFinishDebrief}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
        >
          <CheckSquare className="h-4 w-4" />
          Complete Debrief
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — PREFLIGHT
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Plane className="h-5 w-5 text-sky-500" strokeWidth={1.5} />
        <h1 className="text-xl font-semibold tracking-tight">Cleared for Takeoff</h1>
      </div>

      {/* ── Boarding Pass ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {/* Airline header strip */}
        <div className="bg-sky-600 dark:bg-sky-700 px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="h-3.5 w-3.5 text-white/90" />
            <span className="text-[13px] font-bold text-white tracking-wide">ORBIT AIR</span>
          </div>
          <span className="text-[11px] font-mono text-white/70 tracking-wider">{flightNumber}</span>
        </div>

        {/* Main boarding pass body */}
        <div className="p-5 pb-4">
          {/* Route row: FROM → TO */}
          <div className="flex items-start gap-3">
            <button onClick={() => setPickingAirport('from')} className="flex-1 group">
              <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">
                Departure
              </p>
              <p className="text-3xl font-black tracking-tight group-hover:text-sky-500 transition-colors leading-none mt-1">
                {route.from.code}
              </p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">{route.from.city}</p>
              <p className="text-[18px] font-bold tabular-nums mt-1.5 tracking-tight">
                {departureTime ? formatClock(departureTime) : '--:--'}
              </p>
            </button>

            <div className="flex flex-col items-center pt-5 shrink-0 px-2">
              <div className="flex items-center gap-1">
                <div className="h-[1px] w-6 bg-muted-foreground/20" />
                <Plane className="h-3.5 w-3.5 text-muted-foreground/30 rotate-0" />
                <div className="h-[1px] w-6 bg-muted-foreground/20" />
              </div>
              <span className="text-[9px] text-muted-foreground/30 mt-1 tabular-nums font-medium">
                {formatFlightTime(route.realFlightMin)}
              </span>
            </div>

            <button onClick={() => setPickingAirport('to')} className="flex-1 text-right group">
              <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">
                Arrival
              </p>
              <p className="text-3xl font-black tracking-tight group-hover:text-sky-500 transition-colors leading-none mt-1">
                {route.to.code}
              </p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">{route.to.city}</p>
              <p className="text-[18px] font-bold tabular-nums mt-1.5 tracking-tight">
                {arrivalTime ? formatClock(arrivalTime) : '--:--'}
              </p>
            </button>
          </div>
        </div>

        {/* Tear line */}
        <div className="relative mx-0">
          <div className="border-t border-dashed border-border/40" />
          <div className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
          <div className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
        </div>

        {/* Bottom details row */}
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Passenger</p>
            <p className="text-[12px] font-semibold truncate mt-0.5">
              {(user?.displayName || 'Pilot').toUpperCase()}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Focus</p>
            <p className="text-[12px] font-semibold mt-0.5">{duration}m</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Seat</p>
            <p className="text-[12px] font-semibold font-mono mt-0.5">{seatRow}{seatLetter}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Gate</p>
            <p className="text-[12px] font-semibold font-mono mt-0.5">G{gateNumber}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Distance</p>
            <p className="text-[12px] font-semibold font-mono mt-0.5">{route.distanceKm.toLocaleString()} km</p>
          </div>
        </div>

        {/* Barcode strip */}
        <div className="px-5 pb-4">
          <div className="flex items-center justify-center gap-[2px] h-8 overflow-hidden opacity-20">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="bg-foreground rounded-[0.5px]"
                style={{
                  width: [1, 2, 3][Math.abs((flightNumber || 'OA').charCodeAt(i % (flightNumber.length || 1)) + i) % 3] + 'px',
                  height: '100%',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Task Manifest ── */}
      <div className="rounded-2xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest">
              Task Manifest ({tasks.length})
            </p>
            <button
              onClick={() => setAddingTasks(true)}
              className="flex items-center gap-1 text-[11px] text-sky-500 hover:text-sky-400 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <button
              onClick={() => setAddingTasks(true)}
              className="w-full rounded-xl border border-dashed border-border/40 py-6 flex flex-col items-center justify-center text-center hover:border-sky-500/30 hover:bg-sky-500/[0.02] transition-all"
            >
              <Plus className="h-5 w-5 text-muted-foreground/20 mb-1.5" />
              <p className="text-[12px] text-muted-foreground/40">Add tasks to your flight manifest</p>
              <p className="text-[10px] text-muted-foreground/25 mt-0.5">
                First 3 are primary, rest are carry-on
              </p>
            </button>
          ) : (
            <div className="space-y-1">
              {tasks.map((task, i) => (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors group',
                    task.type === 'primary' ? 'font-medium' : 'text-muted-foreground/50'
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      task.type === 'primary' ? 'bg-sky-500' : 'bg-muted-foreground/20'
                    )}
                  />
                  <span className="flex-1 truncate">{task.title}</span>
                  <span className="text-[9px] text-muted-foreground/25 uppercase">
                    {task.type === 'primary' ? `P${i + 1}` : 'C/O'}
                  </span>
                  <button
                    onClick={() => handleRemoveTask(task.id)}
                    className="text-muted-foreground/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ── Duration Selection ── */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground/50 mb-2.5 uppercase tracking-wider">
          Flight Duration
        </p>
        <div className="space-y-2">
          {DURATION_PRESETS.map((preset) => (
            <div key={preset.label}>
              <p className="text-[10px] text-muted-foreground/30 mb-1.5">{preset.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {preset.durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDurationChange(d)}
                    className={cn(
                      'rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95 border',
                      d === duration
                        ? 'bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400'
                        : 'border-border/40 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/70'
                    )}
                  >
                    {formatFlightTime(d)}
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
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold transition-all active:scale-[0.98] bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-600/20"
      >
        <Play className="h-4 w-4" />
        Start Flight
      </button>

      {/* ── Airport Picker Modal ── */}
      {pickingAirport && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
            onClick={() => setPickingAirport(null)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none p-6">
            <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card p-5 w-full max-w-[340px] shadow-2xl max-h-[80vh] flex flex-col">
              <p className="text-[13px] font-semibold mb-3">
                Select {pickingAirport === 'from' ? 'Departure' : 'Destination'}
              </p>
              <div className="flex-1 overflow-y-auto space-y-3">
                {(['europe', 'americas', 'asia', 'middle-east', 'oceania', 'africa'] as const).map(
                  (region) => {
                    const regionAirports = AIRPORTS.filter((a) => a.region === region);
                    if (regionAirports.length === 0) return null;
                    return (
                      <div key={region}>
                        <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1">
                          {region.replace('-', ' ')}
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          {regionAirports.map((airport) => {
                            const isSelected =
                              (pickingAirport === 'from' && route.from.code === airport.code) ||
                              (pickingAirport === 'to' && route.to.code === airport.code);
                            return (
                              <button
                                key={airport.code}
                                onClick={() => handleSelectAirport(airport)}
                                className={cn(
                                  'text-left rounded-lg px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.05]',
                                  isSelected
                                    ? 'bg-sky-500/10 border border-sky-500/20'
                                    : 'border border-transparent'
                                )}
                              >
                                <p className="text-[13px] font-bold">{airport.code}</p>
                                <p className="text-[10px] text-muted-foreground/50 truncate">
                                  {airport.city}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Task Picker Modal ── */}
      {addingTasks && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
            onClick={() => {
              setAddingTasks(false);
              setTaskSearch('');
            }}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none p-6">
            <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card p-5 w-full max-w-[400px] shadow-2xl max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold">Add Tasks to Manifest</p>
                <button
                  onClick={() => {
                    setAddingTasks(false);
                    setTaskSearch('');
                  }}
                  className="text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
                <input
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search tasks..."
                  autoFocus
                  className="w-full rounded-xl border border-border/40 bg-transparent pl-9 pr-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-sky-500/40 transition-colors"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-0.5">
                {filteredTasks.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/30 text-center py-6">
                    {taskSearch ? 'No matching tasks' : 'All tasks already added'}
                  </p>
                ) : (
                  filteredTasks.slice(0, 20).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleAddTask(task)}
                      className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-left hover:bg-foreground/[0.04] transition-colors"
                    >
                      <Plus className="h-3 w-3 text-sky-500 shrink-0" />
                      <span className="flex-1 truncate">{task.title}</span>
                      {task.priority && (
                        <span
                          className={cn(
                            'text-[9px] uppercase font-medium',
                            task.priority === 'high'
                              ? 'text-red-400'
                              : task.priority === 'medium'
                                ? 'text-amber-400'
                                : 'text-muted-foreground/30'
                          )}
                        >
                          {task.priority}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground/30 font-mono">
                          {task.dueDate.slice(5)}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {tasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <button
                    onClick={() => {
                      setAddingTasks(false);
                      setTaskSearch('');
                    }}
                    className="w-full rounded-xl py-2 text-[13px] font-medium text-sky-500 hover:bg-sky-500/5 transition-colors"
                  >
                    Done ({tasks.length} tasks)
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
