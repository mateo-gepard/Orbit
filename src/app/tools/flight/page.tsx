'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  BookOpen,
  ChevronLeft,
  Flame,
  Target,
  TrendingUp,
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
  getConnectedAirports,
  getRoutedAirports,
  nearestValidDuration,
  formatFlightTime,
  saveFlightLog,
  loadFlightLogs,
  getFlightStats,
  type Airport,
  type FlightRoute,
  type FlightTask,
  type FlightDuration,
  type FlightStatus,
  type FlightLog,
  type TurbulenceLog,
} from '@/lib/flight';
import type { OrbitItem } from '@/lib/types';

// ─── Sub-views ─────────────────────────────────────────────

type FlightView = 'preflight' | 'inflight' | 'debrief' | 'logbook';

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
  const [startTimestamp, setStartTimestamp] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Debrief state ──
  const [debriefSummary, setDebriefSummary] = useState('');
  const [debriefNextAction, setDebriefNextAction] = useState('');
  const [completedNormally, setCompletedNormally] = useState(true);

  // ── Log book state ──
  const [showLogbook, setShowLogbook] = useState(false);
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);

  // Generate random values on mount
  useEffect(() => {
    setFlightNumber(generateFlightNumber());
    setGateNumber(Math.floor(Math.random() * 40) + 1);
    setSeatRow(Math.floor(Math.random() * 30) + 1);
    setSeatLetter(['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)]);
    setFlightLogs(loadFlightLogs());
    setMounted(true);
  }, []);

  // Departure/arrival times
  const departureTime = useMemo(() => {
    if (!mounted) return null;
    const now = new Date();
    const mins = now.getMinutes();
    const roundedMins = Math.ceil(mins / 5) * 5;
    now.setMinutes(roundedMins, 0, 0);
    return now;
  }, [mounted]);

  const arrivalTime = useMemo(() => {
    if (!departureTime) return null;
    return new Date(departureTime.getTime() + route.realFlightMin * 60 * 1000);
  }, [departureTime, route.realFlightMin]);

  const formatClock = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

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
    const available = activeTasks.filter((t) => !tasks.some((ft) => ft.id === t.id));
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

  const phaseInfo = useMemo(() => getCurrentPhase(elapsed, duration), [elapsed, duration]);

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
    setStartTimestamp(Date.now());
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
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
  };

  const handleAddTask = (item: OrbitItem) => {
    const type = tasks.length < 3 ? 'primary' : 'carry-on';
    setTasks((prev) => [...prev, { id: item.id, title: item.title, type, completed: false }]);
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks((prev) => {
      const updated = prev.filter((t) => t.id !== taskId);
      return updated.map((t, i) => ({ ...t, type: i < 3 ? ('primary' as const) : ('carry-on' as const) }));
    });
  };

  const handleSelectAirport = (airport: Airport) => {
    let newRoute: FlightRoute;
    if (pickingAirport === 'from') {
      newRoute = getRouteForAirports(airport, route.to);
    } else if (pickingAirport === 'to') {
      newRoute = getRouteForAirports(route.from, airport);
    } else {
      return;
    }
    setRoute(newRoute);
    setDuration(nearestValidDuration(newRoute.realFlightMin));
    setPickingAirport(null);
  };

  const handleFinishDebrief = async () => {
    // Save flight log
    const log: FlightLog = {
      id: crypto.randomUUID(),
      flightNumber,
      route,
      duration,
      actualDuration: elapsed * 1000,
      startedAt: startTimestamp,
      endedAt: Date.now(),
      tasks: [...tasks],
      turbulence: [...turbulence],
      completedNormally,
      debrief: {
        summary: debriefSummary || undefined,
        nextAction: debriefNextAction || undefined,
      },
      userId: user?.uid || 'local',
    };
    saveFlightLog(log);
    setFlightLogs(loadFlightLogs());

    // Mark completed tasks as done
    for (const t of tasks.filter((t) => t.completed)) {
      try {
        await updateItem(t.id, { status: 'done', completedAt: Date.now(), updatedAt: Date.now() });
      } catch { /* silently skip */ }
    }

    // Reset
    setStatus('preflight');
    setTasks([]);
    setDebriefSummary('');
    setDebriefNextAction('');
    setElapsed(0);
    setPausedElapsed(0);
    setTurbulence([]);
    setFlightNumber(generateFlightNumber());
    setRoute(getRouteForDuration(duration));
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER — LOG BOOK
  // ═══════════════════════════════════════════════════════════

  if (showLogbook) {
    const stats = getFlightStats(flightLogs);
    return (
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Header */}
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLogbook(false)}
              className="text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <BookOpen className="h-3.5 w-3.5 text-sky-500" strokeWidth={1.5} />
            <span className="text-[11px] font-mono text-muted-foreground/50">FLIGHT LOG BOOK</span>
          </div>
          <span className="text-[11px] text-muted-foreground/30">{flightLogs.length} flights</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
          {/* Stats Overview */}
          {flightLogs.length > 0 && (
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Flights', value: stats.totalFlights.toString(), icon: Plane },
                { label: 'Focus Time', value: stats.totalMinutes > 60 ? `${Math.round(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m` : `${stats.totalMinutes}m`, icon: Clock },
                { label: 'Tasks Done', value: `${stats.completedTasks}/${stats.totalTasks}`, icon: Target },
                { label: 'Avg Turb.', value: stats.avgTurbulence.toFixed(1), icon: Zap },
                { label: 'Streak', value: `${stats.longestStreak}d`, icon: Flame },
                { label: 'Completion', value: stats.totalFlights > 0 ? `${Math.round(flightLogs.filter((l) => l.completedNormally).length / stats.totalFlights * 100)}%` : '—', icon: TrendingUp },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/40 p-3 text-center">
                  <stat.icon className="h-3.5 w-3.5 text-sky-500/50 mx-auto mb-1.5" strokeWidth={1.5} />
                  <p className="text-lg font-bold tabular-nums leading-none">{stat.value}</p>
                  <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Flight Log Cards */}
          {flightLogs.length === 0 ? (
            <div className="text-center py-16">
              <Plane className="h-8 w-8 text-muted-foreground/10 mx-auto mb-3" />
              <p className="text-[14px] text-muted-foreground/30">No flights yet</p>
              <p className="text-[12px] text-muted-foreground/20 mt-1">
                Complete a focus session to see it here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {flightLogs.map((log) => (
                <LogbookCard key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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
              className="flex items-center gap-1 text-[11px] text-muted-foreground/20 hover:text-red-400 transition-colors"
            >
              <AlertTriangle className="h-3 w-3" />
              Divert
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
            {/* Phase label */}
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">
                {phaseInfo.label}
              </p>
            </div>

            {/* Side-view plane animation */}
            <PlaneAnimation
              phase={phaseInfo.phase}
              phaseProgress={phaseInfo.phaseProgress}
              progress={phaseInfo.progress}
              isPaused={status === 'paused'}
            />

            {/* Big countdown */}
            <div className="text-center">
              <p className="text-5xl lg:text-6xl font-black tabular-nums tracking-tighter leading-none">
                {formatTime(remainingSec)}
              </p>
              <p className="text-[10px] text-muted-foreground/25 mt-2 tabular-nums font-mono">
                {formatTime(elapsed)} elapsed · {route.from.code} → {route.to.code}
              </p>
            </div>

            {/* Desktop two-column layout */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
              {/* Phase progress bar */}
              <div className="space-y-3">
                <div className="flex items-center gap-0.5 h-1.5">
                  {['Boarding', 'Taxi', 'Takeoff', 'Cruise', 'Descent', 'Landing'].map((label, i) => {
                    const phases = ['boarding', 'taxi', 'takeoff', 'cruise', 'descent', 'landed'];
                    const phaseIdx = phases.indexOf(phaseInfo.phase);
                    const isCurrent = i === phaseIdx;
                    const isPast = i < phaseIdx;
                    return (
                      <div key={label} className="flex-1 relative group">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isPast
                              ? 'bg-sky-500/60'
                              : isCurrent
                                ? 'bg-sky-500'
                                : 'bg-foreground/[0.04]'
                          )}
                          style={isCurrent ? { width: `${phaseInfo.phaseProgress * 100}%`, position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: '9999px' } : undefined}
                        />
                        {isCurrent && (
                          <div
                            className="absolute inset-0 rounded-full bg-foreground/[0.04]"
                            style={{ zIndex: -1 }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] text-muted-foreground/20 uppercase tracking-wider">
                  {['Board', 'Taxi', 'T/O', 'Cruise', 'Desc', 'Land'].map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>

                {/* Turbulence quick-log */}
                <div className="rounded-2xl border border-border/30 p-3">
                  <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-2">
                    Log Turbulence ({turbulence.length})
                  </p>
                  <div className="flex gap-2">
                    {TURBULENCE_TYPES.map(({ type, emoji, label }) => (
                      <button
                        key={type}
                        onClick={() => handleLogTurbulence(type)}
                        title={label}
                        className="flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2 hover:bg-foreground/[0.03] active:scale-95 transition-all"
                      >
                        <span className="text-base">{emoji}</span>
                        <span className="text-[7px] text-muted-foreground/20 uppercase">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Task manifest */}
              {tasks.length > 0 && (
                <div className="rounded-2xl border border-border/30 p-4">
                  <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-2.5">
                    Task Manifest ({tasks.filter((t) => t.completed).length}/{tasks.length})
                  </p>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleToggleTask(task.id)}
                        className={cn(
                          'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] text-left transition-all',
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
                              <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{task.title}</span>
                        <span className="text-[9px] text-muted-foreground/15 uppercase shrink-0">
                          {task.type === 'primary' ? 'P' : 'C/O'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-2">
            {completedNormally ? 'Flight Complete' : 'Diverted'}
          </p>
          <h2 className="text-xl font-bold tracking-tight">
            {flightNumber} · Debrief
          </h2>
          <p className="text-[12px] text-muted-foreground/40 mt-1">
            {route.from.code} → {route.to.code}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border/40 p-4 text-center">
            <Clock className="h-3.5 w-3.5 text-sky-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold tabular-nums">{formatTime(elapsed)}</p>
            <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-0.5">Flight Time</p>
          </div>
          <div className="rounded-2xl border border-border/40 p-4 text-center">
            <CheckSquare className="h-3.5 w-3.5 text-emerald-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold tabular-nums">{completedCount}/{tasks.length}</p>
            <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-0.5">Tasks Done</p>
          </div>
          <div className="rounded-2xl border border-border/40 p-4 text-center">
            <Zap className="h-3.5 w-3.5 text-amber-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold tabular-nums">{turbulence.length}</p>
            <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-0.5">Turbulence</p>
          </div>
        </div>

        {/* Task Review */}
        {tasks.length > 0 && (
          <div className="rounded-2xl border border-border/40 p-4">
            <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-2.5">
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
                        <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-500" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Cleared for Takeoff</h1>
        </div>
        {flightLogs.length > 0 && (
          <button
            onClick={() => setShowLogbook(true)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-sky-500 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Log Book ({flightLogs.length})
          </button>
        )}
      </div>

      {/* Desktop two-column layout for preflight */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 space-y-6 lg:space-y-0">
        {/* Left column: Boarding Pass + Duration */}
        <div className="space-y-6">
          {/* ── Boarding Pass ── */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {/* Airline header */}
            <div className="bg-sky-600 dark:bg-sky-700 px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane className="h-3.5 w-3.5 text-white/90" />
                <span className="text-[13px] font-bold text-white tracking-wide">ORBIT AIR</span>
              </div>
              <span className="text-[11px] font-mono text-white/70 tracking-wider">{flightNumber}</span>
            </div>

            {/* Route row */}
            <div className="p-5 pb-4">
              <div className="flex items-start gap-3">
                <button onClick={() => setPickingAirport('from')} className="flex-1 group">
                  <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">Departure</p>
                  <p className="text-3xl font-black tracking-tight group-hover:text-sky-500 transition-colors leading-none mt-1">{route.from.code}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">{route.from.city}</p>
                  <p className="text-[18px] font-bold tabular-nums mt-1.5 tracking-tight">{departureTime ? formatClock(departureTime) : '--:--'}</p>
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
                  <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">Arrival</p>
                  <p className="text-3xl font-black tracking-tight group-hover:text-sky-500 transition-colors leading-none mt-1">{route.to.code}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">{route.to.city}</p>
                  <p className="text-[18px] font-bold tabular-nums mt-1.5 tracking-tight">{arrivalTime ? formatClock(arrivalTime) : '--:--'}</p>
                </button>
              </div>
            </div>

            {/* Tear line */}
            <div className="relative mx-0">
              <div className="border-t border-dashed border-border/40" />
              <div className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
              <div className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
            </div>

            {/* Bottom details */}
            <div className="px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Passenger</p>
                <p className="text-[12px] font-semibold truncate mt-0.5">{(user?.displayName || 'Pilot').toUpperCase()}</p>
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

            {/* Barcode */}
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

          {/* ── Duration Wheel ── */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/50 mb-2.5 uppercase tracking-wider">
              Flight Duration
            </p>
            <DurationWheel
              value={duration}
              onChange={handleDurationChange}
            />
          </div>
        </div>

        {/* Right column: Task Manifest + Start */}
        <div className="space-y-6">
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
                <p className="text-[12px] text-muted-foreground/40">Add tasks to your manifest</p>
                <p className="text-[10px] text-muted-foreground/25 mt-0.5">First 3 are primary, rest carry-on</p>
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
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', task.type === 'primary' ? 'bg-sky-500' : 'bg-muted-foreground/20')} />
                    <span className="flex-1 truncate">{task.title}</span>
                    <span className="text-[9px] text-muted-foreground/25 uppercase">{task.type === 'primary' ? `P${i + 1}` : 'C/O'}</span>
                    <button onClick={() => handleRemoveTask(task.id)} className="text-muted-foreground/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Start Flight ── */}
          <button
            onClick={handleStartFlight}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold transition-all active:scale-[0.98] bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-600/20"
          >
            <Play className="h-4 w-4" />
            Start Flight
          </button>
        </div>
      </div>

      {/* ── Airport Picker Modal ── */}
      {pickingAirport && (
        <>
          <div className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm" onClick={() => setPickingAirport(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none p-6">
            <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card p-5 w-full max-w-[340px] shadow-2xl max-h-[80vh] flex flex-col">
              <p className="text-[13px] font-semibold mb-3">
                Select {pickingAirport === 'from' ? 'Departure' : 'Destination'}
              </p>
              <div className="flex-1 overflow-y-auto space-y-3">
                {(() => {
                  const availableAirports = pickingAirport === 'from'
                    ? getConnectedAirports(route.to.code)
                    : getConnectedAirports(route.from.code);
                  const airports = availableAirports.length > 0 ? availableAirports : getRoutedAirports();
                  const regions = ['europe', 'americas', 'asia', 'middle-east', 'oceania', 'africa'] as const;
                  return regions.map((region) => {
                    const regionAirports = airports.filter((a) => a.region === region);
                    if (regionAirports.length === 0) return null;
                    return (
                      <div key={region}>
                        <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1">{region.replace('-', ' ')}</p>
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
                                  isSelected ? 'bg-sky-500/10 border border-sky-500/20' : 'border border-transparent'
                                )}
                              >
                                <p className="text-[13px] font-bold">{airport.code}</p>
                                <p className="text-[10px] text-muted-foreground/50 truncate">{airport.city}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Task Picker Modal ── */}
      {addingTasks && (
        <>
          <div className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm" onClick={() => { setAddingTasks(false); setTaskSearch(''); }} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none p-6">
            <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card p-5 w-full max-w-[400px] shadow-2xl max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold">Add Tasks to Manifest</p>
                <button onClick={() => { setAddingTasks(false); setTaskSearch(''); }} className="text-muted-foreground/40 hover:text-foreground transition-colors">
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
                        <span className={cn('text-[9px] uppercase font-medium', task.priority === 'high' ? 'text-red-400' : task.priority === 'medium' ? 'text-amber-400' : 'text-muted-foreground/30')}>
                          {task.priority}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground/30 font-mono">{task.dueDate.slice(5)}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {tasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <button
                    onClick={() => { setAddingTasks(false); setTaskSearch(''); }}
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

// ═══════════════════════════════════════════════════════════
// Duration Wheel — Scrollable disc for time selection
// ═══════════════════════════════════════════════════════════

function DurationWheel({ value, onChange }: { value: FlightDuration; onChange: (d: FlightDuration) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [allDurations] = useState<FlightDuration[]>(() => {
    const set = new Set<FlightDuration>();
    for (const preset of DURATION_PRESETS) {
      for (const d of preset.durations) set.add(d);
    }
    return [...set].sort((a, b) => a - b);
  });

  // Scroll to selected value on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const idx = allDurations.indexOf(value);
    if (idx < 0) return;
    const el = scrollRef.current.children[idx] as HTMLElement;
    if (el) {
      scrollRef.current.scrollTo({
        left: el.offsetLeft - scrollRef.current.offsetWidth / 2 + el.offsetWidth / 2,
        behavior: 'smooth',
      });
    }
  }, []);

  // Category label for a duration
  const getCategory = (d: FlightDuration): string => {
    for (const preset of DURATION_PRESETS) {
      if (preset.durations.includes(d)) return preset.label;
    }
    return '';
  };

  return (
    <div className="relative">
      {/* Gradient overlays */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-8 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {allDurations.map((d) => {
          const isSelected = d === value;
          const category = getCategory(d);
          return (
            <button
              key={d}
              onClick={() => onChange(d)}
              className={cn(
                'shrink-0 snap-center rounded-2xl px-4 py-3 text-center transition-all active:scale-95 border min-w-[72px]',
                isSelected
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400 scale-105 shadow-sm'
                  : 'border-border/30 text-muted-foreground/40 hover:border-border/50 hover:text-foreground/60'
              )}
            >
              <p className={cn('text-[15px] font-bold tabular-nums', isSelected && 'text-sky-500')}>
                {formatFlightTime(d)}
              </p>
              <p className="text-[7px] text-muted-foreground/25 uppercase tracking-wider mt-0.5 truncate max-w-[64px]">
                {category}
              </p>
            </button>
          );
        })}
      </div>

      {/* Selection indicator */}
      <div className="flex justify-center mt-1">
        <div className="h-0.5 w-6 rounded-full bg-sky-500/30" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Logbook Card — Mini boarding pass for past flights
// ═══════════════════════════════════════════════════════════

function LogbookCard({ log }: { log: FlightLog }) {
  const date = new Date(log.startedAt);
  const dateStr = date.toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const actualMin = Math.round(log.actualDuration / 60000);
  const completedTasks = log.tasks.filter((t) => t.completed).length;

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-colors',
      log.completedNormally ? 'border-border/40' : 'border-amber-500/20'
    )}>
      {/* Header strip */}
      <div className={cn(
        'px-4 py-2 flex items-center justify-between',
        log.completedNormally ? 'bg-sky-600/10' : 'bg-amber-500/10'
      )}>
        <div className="flex items-center gap-2">
          <Plane className={cn('h-3 w-3', log.completedNormally ? 'text-sky-500' : 'text-amber-500')} />
          <span className="text-[11px] font-mono font-bold text-muted-foreground/60">{log.flightNumber}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/30">{dateStr} · {timeStr}</span>
      </div>

      {/* Route */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xl font-black tracking-tight leading-none">{log.route.from.code}</p>
          <p className="text-[9px] text-muted-foreground/40 mt-0.5">{log.route.from.city}</p>
        </div>
        <div className="flex items-center gap-1 px-2">
          <div className="h-[1px] w-4 bg-muted-foreground/15" />
          <Plane className="h-3 w-3 text-muted-foreground/20" />
          <div className="h-[1px] w-4 bg-muted-foreground/15" />
        </div>
        <div className="flex-1 text-right">
          <p className="text-xl font-black tracking-tight leading-none">{log.route.to.code}</p>
          <p className="text-[9px] text-muted-foreground/40 mt-0.5">{log.route.to.city}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-muted-foreground/35">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatFlightTime(actualMin)}
        </span>
        {log.tasks.length > 0 && (
          <span className="flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            {completedTasks}/{log.tasks.length}
          </span>
        )}
        {log.turbulence.length > 0 && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {log.turbulence.length}
          </span>
        )}
        {!log.completedNormally && (
          <span className="text-amber-500 font-medium">DIVERTED</span>
        )}
        {log.debrief.summary && (
          <span className="flex-1 truncate text-right italic text-muted-foreground/25">
            &ldquo;{log.debrief.summary}&rdquo;
          </span>
        )}
      </div>
    </div>
  );
}
