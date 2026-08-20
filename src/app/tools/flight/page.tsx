'use client';

import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSettingsStore } from '@/lib/settings-store';
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
  Smartphone,
  Brain,
  Bell,
  UserRound,
  Shield,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { updateItem } from '@/lib/firestore';
import { PlaneAnimation } from '@/components/flight/plane-animation';
import { AircraftSilhouette } from '@/components/flight/aircraft-silhouette';
import {
  DURATION_PRESETS,
  PRIVATE_DURATION_PRESETS,
  TURBULENCE_TYPES,
  getCurrentPhase,
  generateFlightNumber,
  generatePrivateFlightNumber,
  getRouteForDuration,
  getRouteForAirports,
  getConnectedAirports,
  getRoutedAirports,
  nearestValidDuration,
  saveFlightLog,
  loadFlightLogsLocal,
  subscribeToFlightLogs,
  getFlightStats,
  type Airport,
  type FlightRoute,
  type FlightTask,
  type FlightDuration,
  type FlightStatus,
  type FlightLog,
  type TurbulenceLog,
  type FlightClass,
} from '@/lib/flight';
import type { OrbitItem } from '@/lib/types';
import { scopedStorageKey } from '@/lib/account-storage';
import { consumeDispatchFlightHandoff } from '@/lib/dispatch';
import { removeLocalStorageVerified, writeLocalStorageVerified } from '@/lib/verified-storage';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  FLIGHT_SESSION_VERSION,
  beginFlightReconciliation,
  buildFlightSessionQuarantine,
  finishFlightTaskReconciliation,
  parseFlightSession,
  serializeFlightSession,
  type FlightPendingReconciliation,
  type FlightSession,
  type FlightSessionParseFailure,
} from '@/lib/flight-session';

// ─── Persistent Flight Session ─────────────────────────────
// Survives tab switches and app closes by persisting to localStorage.
// Elapsed time is computed from timestamps, not incremented.

const FLIGHT_SESSION_KEY = 'orbit-flight-session';
const FLIGHT_SESSION_QUARANTINE_KEY = 'orbit-flight-session-quarantine';

type FlightLanguage = 'en' | 'de';

const FlightLanguageContext = createContext<FlightLanguage>('en');

function useFlightLocale() {
  const lang = useContext(FlightLanguageContext);
  return {
    lang,
    text: (english: string, german: string) => lang === 'de' ? german : english,
  };
}

function formatLocalizedFlightTime(minutes: number, lang: FlightLanguage): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} ${lang === 'de' ? 'Min.' : 'min'}`;
  if (remainingMinutes === 0) return `${hours} ${lang === 'de' ? 'Std.' : 'hr'}`;
  return `${hours} ${lang === 'de' ? 'Std.' : 'hr'} ${remainingMinutes} ${lang === 'de' ? 'Min.' : 'min'}`;
}

function localizedPhaseLabel(phase: string, lang: FlightLanguage): string {
  const labels: Record<string, [string, string]> = {
    boarding: ['Boarding', 'Boarding'],
    taxi: ['Taxi', 'Rollen'],
    takeoff: ['Takeoff', 'Start'],
    cruise: ['Cruise', 'Reiseflug'],
    descent: ['Descent', 'Sinkflug'],
    landed: ['Landing', 'Landung'],
  };
  const label = labels[phase] ?? [phase, phase];
  return lang === 'de' ? label[1] : label[0];
}

function localizedTurbulenceLabel(type: TurbulenceLog['type'], lang: FlightLanguage): string {
  const labels: Record<TurbulenceLog['type'], [string, string]> = {
    phone: ['Phone', 'Telefon'],
    thought: ['Thought', 'Gedanke'],
    notification: ['Notification', 'Mitteilung'],
    person: ['Person', 'Person'],
    other: ['Other', 'Sonstiges'],
  };
  return labels[type][lang === 'de' ? 1 : 0];
}

function localizedDurationCategory(label: string, lang: FlightLanguage): string {
  const labels: Record<string, string> = {
    'Ultra Short': 'Ultrakurz',
    'Short Hops': 'Kurzstrecke',
    'Standard Commute': 'Standardstrecke',
    'Medium Range': 'Mittelstrecke',
    'Long Range': 'Langstrecke',
    Marathon: 'Marathon',
    Transatlantic: 'Transatlantik',
    Sprint: 'Sprint',
    'Deep Work': 'Tiefenarbeit',
    'Extended Focus': 'Verlängerter Fokus',
  };
  return lang === 'de' ? (labels[label] ?? label) : label;
}

function localizedRegion(region: Airport['region'], lang: FlightLanguage): string {
  const labels: Record<Airport['region'], [string, string]> = {
    europe: ['Europe', 'Europa'],
    americas: ['Americas', 'Amerika'],
    asia: ['Asia', 'Asien'],
    'middle-east': ['Middle East', 'Naher Osten'],
    africa: ['Africa', 'Afrika'],
    oceania: ['Oceania', 'Ozeanien'],
  };
  return labels[region][lang === 'de' ? 1 : 0];
}

function createTurbulenceLog(type: TurbulenceLog['type']): TurbulenceLog {
  return { timestamp: Date.now(), type };
}

function saveFlightSession(session: FlightSession | null, userId: string): void {
  const key = scopedStorageKey(FLIGHT_SESSION_KEY, userId);
  if (session) {
    writeLocalStorageVerified(key, serializeFlightSession(session));
  } else {
    removeLocalStorageVerified(key);
  }
}

type FlightSessionReadResult =
  | { session: FlightSession; issue?: 'upgraded-storage-failed' }
  | { session: null; issue?: 'storage-unavailable' | 'corrupt-quarantined'; reason?: FlightSessionParseFailure };

type FlightSessionIssue = 'storage-failed' | 'storage-unavailable' | 'upgraded-storage-failed';
type FlightSessionNotice = 'corrupt-quarantined';
type FlightDebriefIssue = 'task-sync-failed' | 'log-save-failed';

function loadFlightSession(userId: string): FlightSessionReadResult {
  const key = scopedStorageKey(FLIGHT_SESSION_KEY, userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { session: null };
    const parsed = parseFlightSession(raw);
    if (!parsed.ok) {
      const quarantineKey = scopedStorageKey(FLIGHT_SESSION_QUARANTINE_KEY, userId);
      const quarantine = buildFlightSessionQuarantine(raw, parsed.reason);
      try {
        writeLocalStorageVerified(quarantineKey, quarantine);
        removeLocalStorageVerified(key);
      } catch {
        // If the store is full, first release the larger unsafe active payload
        // and then retry the bounded quarantine write from the in-memory copy.
        removeLocalStorageVerified(key);
        writeLocalStorageVerified(quarantineKey, quarantine);
      }
      return { session: null, issue: 'corrupt-quarantined', reason: parsed.reason };
    }
    // Canonicalize and verify every valid restore, even when only unknown
    // fields were stripped. Consumers never receive the untrusted object.
    try {
      saveFlightSession(parsed.session, userId);
    } catch {
      return { session: parsed.session, issue: 'upgraded-storage-failed' };
    }
    return { session: parsed.session };
  } catch {
    return { session: null, issue: 'storage-unavailable' };
  }
}

function getSessionElapsed(session: FlightSession): number {
  if (session.status === 'paused') {
    return session.accumulatedBeforePause;
  }
  if (session.status === 'inflight') {
    const elapsed = session.accumulatedBeforePause + Math.floor((Date.now() - session.resumeTimestamp) / 1000);
    return Math.min(session.duration * 60, Math.max(session.accumulatedBeforePause, elapsed));
  }
  return session.accumulatedBeforePause;
}

function flightLogId(startTimestamp: number, flightNumber: string): string {
  const safeNumber = flightNumber.replace(/[^a-z0-9_-]/gi, '-').slice(0, 64) || 'flight';
  return `${startTimestamp}-${safeNumber}`;
}

export default function FlightPage() {
  const language = useSettingsStore((state) => state.settings.language);
  return (
    <FlightLanguageContext.Provider value={language}>
      <FlightPageContent />
    </FlightLanguageContext.Provider>
  );
}

function FlightPageContent() {
  const items = useOrbitStore((state) => state.items);
  const { user } = useAuth();
  const { lang, text } = useFlightLocale();
  const [mountedUserId, setMountedUserId] = useState<string | null>(null);
  const mounted = Boolean(user?.uid && mountedUserId === user.uid);

  // ── Preflight state ──
  const [flightClass, setFlightClass] = useState<FlightClass>('commercial');
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
  const taskSearchRef = useRef<HTMLInputElement>(null);

  // ── In-flight state ──
  const [status, setStatus] = useState<FlightStatus>('preflight');
  const [elapsed, setElapsed] = useState(0);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [turbulence, setTurbulence] = useState<TurbulenceLog[]>([]);
  const [shakeClass, setShakeClass] = useState<string | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimestampRef = useRef(0);

  // ── Debrief state ──
  const [debriefSummary, setDebriefSummary] = useState('');
  const [debriefNextAction, setDebriefNextAction] = useState('');
  const [completedNormally, setCompletedNormally] = useState(true);
  const [pendingReconciliation, setPendingReconciliation] = useState<FlightPendingReconciliation | null>(null);
  const startingFlightRef = useRef(false);
  const [finishingDebrief, setFinishingDebrief] = useState(false);
  const finishingDebriefRef = useRef(false);
  const [debriefSaveError, setDebriefSaveError] = useState<FlightDebriefIssue | null>(null);
  const [sessionSaveError, setSessionSaveError] = useState<FlightSessionIssue | null>(null);
  const [sessionRecoveryNotice, setSessionRecoveryNotice] = useState<FlightSessionNotice | null>(null);
  const [confirmDiscardSession, setConfirmDiscardSession] = useState(false);

  // ── Log book state ──
  const [showLogbook, setShowLogbook] = useState(false);
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [acceptDispatchHandoff, setAcceptDispatchHandoff] = useState(false);

  // Generate random values on mount OR restore active session
  useEffect(() => {
    if (!user?.uid) return;
    setMountedUserId(null);
    setAcceptDispatchHandoff(false);
    const frame = requestAnimationFrame(() => {
      setSessionSaveError(null);
      setSessionRecoveryNotice(null);
      setDebriefSaveError(null);
      setConfirmDiscardSession(false);
      finishingDebriefRef.current = false;
      startingFlightRef.current = false;
      const loaded = loadFlightSession(user.uid);
      const session = loaded.session;
      if (loaded.issue === 'corrupt-quarantined') {
        setSessionRecoveryNotice('corrupt-quarantined');
      } else if (loaded.issue === 'storage-unavailable' || loaded.issue === 'upgraded-storage-failed') {
        setSessionSaveError(loaded.issue);
      }
      if (session) {
        setCompletedNormally(session.completedNormally ?? true);
        setDebriefSummary(session.debriefSummary || '');
        setDebriefNextAction(session.debriefNextAction || '');
        setPendingReconciliation(session.pendingReconciliation ?? null);
        // Check if the flight should have ended while we were away
        const sessionElapsed = getSessionElapsed(session);
        const endedWhileAway = session.status !== 'debrief' && sessionElapsed >= session.duration * 60;
        if (session.status === 'debrief' || endedWhileAway) {
          // Flight ended while the app was closed, or an unfinished debrief was restored.
          const finalElapsed = endedWhileAway
            ? session.duration * 60
            : session.accumulatedBeforePause;
          setStatus('debrief');
          setElapsed(finalElapsed);
          setPausedElapsed(finalElapsed);
          if (endedWhileAway) {
            try {
              saveFlightSession({
                ...session,
                status: 'debrief',
                accumulatedBeforePause: finalElapsed,
                completedNormally: true,
              }, user.uid);
            } catch {
              setSessionSaveError('storage-failed');
            }
          }
        } else {
          setStatus(session.status);
          setElapsed(sessionElapsed);
          setPausedElapsed(session.accumulatedBeforePause);
        }
        setStartTimestamp(session.startTimestamp);
        resumeTimestampRef.current = session.resumeTimestamp;
        setDuration(session.duration);
        setRoute(session.route);
        setFlightNumber(session.flightNumber);
        setFlightClass(session.flightClass);
        setTasks(session.tasks);
        setTurbulence(session.turbulence);
        setGateNumber(session.gateNumber);
        setSeatRow(session.seatRow);
        setSeatLetter(session.seatLetter);
      } else {
        setStatus('preflight');
        setStartTimestamp(0);
        resumeTimestampRef.current = 0;
        setElapsed(0);
        setPausedElapsed(0);
        setTasks([]);
        setTurbulence([]);
        setCompletedNormally(true);
        setDebriefSummary('');
        setDebriefNextAction('');
        setPendingReconciliation(null);
        const configuredDuration = nearestValidDuration(
          useSettingsStore.getState().settings.focus.defaultFlightDuration
        );
        setDuration(configuredDuration);
        setRoute(getRouteForDuration(configuredDuration));
        setFlightNumber(generateFlightNumber());
        setGateNumber(Math.floor(Math.random() * 40) + 1);
        setSeatRow(Math.floor(Math.random() * 30) + 1);
        setSeatLetter(['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)]);
        setAcceptDispatchHandoff(true);
      }
      setFlightLogs(loadFlightLogsLocal(user.uid));
      setMountedUserId(user.uid);
    });
    return () => cancelAnimationFrame(frame);
  }, [user?.uid]);

  // Consume Dispatch only when there is no active/restored session and the
  // item graph is ready, so navigation cannot overwrite live work.
  useEffect(() => {
    if (!mounted || !acceptDispatchHandoff || !user?.uid || items.length === 0) return;
    const frame = requestAnimationFrame(() => {
      const handoff = consumeDispatchFlightHandoff(user.uid);
      setAcceptDispatchHandoff(false);
      if (!handoff) return;
      const handedOffTasks = handoff.taskIds
        .map((taskId) => items.find((item) => item.id === taskId))
        .filter((item): item is OrbitItem => Boolean(item))
        .map((item, index) => ({
          id: item.id,
          title: item.title,
          type: index < 3 ? 'primary' as const : 'carry-on' as const,
          completed: item.status === 'done',
        }));
      const handedOffDuration = nearestValidDuration(handoff.durationMin);
      setDuration(handedOffDuration);
      setRoute(getRouteForDuration(handedOffDuration));
      setTasks(handedOffTasks);
    });
    return () => cancelAnimationFrame(frame);
  }, [acceptDispatchHandoff, items, mounted, user?.uid]);

  const isPrivate = flightClass === 'private';

  // Subscribe to Firestore flight logs for real-time sync
  useEffect(() => {
    // DataProvider establishes the guarded Flight owner before this page's
    // deferred per-account initialization marks the scope as mounted. Waiting
    // for that sentinel prevents cold-route effects from racing the owner
    // assignment without weakening the cross-account check in flight.ts.
    if (!mounted || !user?.uid) return;
    const unsub = subscribeToFlightLogs(user.uid, (logs) => {
      setFlightLogs(logs);
    });
    return () => unsub();
  }, [mounted, user?.uid]);

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
    date.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const formatTaskDueDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return text('Date unavailable', 'Datum nicht verfügbar');
    return date.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
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
    const available = activeTasks.filter((t) => !tasks.some((ft) => ft.id === t.id));
    if (!q) return available;
    return available.filter((t) => t.title.toLowerCase().includes(q));
  }, [activeTasks, tasks, taskSearch]);

  const handleDurationChange = (d: FlightDuration) => {
    const newRoute = getRouteForDuration(d);
    setDuration(d);
    setRoute(newRoute);
  };

  const buildFlightSession = useCallback((
    nextStatus: FlightSession['status'],
    overrides: Partial<FlightSession> = {},
  ): FlightSession => ({
    version: FLIGHT_SESSION_VERSION,
    status: nextStatus,
    startTimestamp,
    resumeTimestamp: resumeTimestampRef.current || startTimestamp,
    accumulatedBeforePause: pausedElapsed,
    duration,
    route,
    flightNumber,
    flightClass,
    tasks,
    turbulence,
    gateNumber,
    seatRow,
    seatLetter,
    completedNormally,
    debriefSummary,
    debriefNextAction,
    pendingReconciliation: pendingReconciliation ?? undefined,
    ...overrides,
  }), [
    completedNormally,
    debriefNextAction,
    debriefSummary,
    duration,
    flightClass,
    flightNumber,
    gateNumber,
    pausedElapsed,
    pendingReconciliation,
    route,
    seatLetter,
    seatRow,
    startTimestamp,
    tasks,
    turbulence,
  ]);

  // ── Timer — derives elapsed from persisted timestamps ──

  useEffect(() => {
    if (status === 'inflight') {
      if (!resumeTimestampRef.current) resumeTimestampRef.current = Date.now();
      const base = pausedElapsed;

      timerRef.current = setInterval(() => {
        const now = Date.now();
        const currentElapsed = base + Math.floor((now - resumeTimestampRef.current) / 1000);
        setElapsed(currentElapsed);
        if (currentElapsed >= duration * 60) {
          const finalElapsed = duration * 60;
          try {
            saveFlightSession(buildFlightSession('debrief', {
              accumulatedBeforePause: finalElapsed,
              completedNormally: true,
            }), user?.uid || 'demo-user');
            setSessionSaveError(null);
          } catch {
            // Keep the full flight in memory and still enter debrief. The
            // recovery panel can retry persistence or explicitly discard it.
            setSessionSaveError('storage-failed');
          }
          if (timerRef.current) clearInterval(timerRef.current);
          setElapsed(finalElapsed);
          setPausedElapsed(finalElapsed);
          setCompletedNormally(true);
          setStatus('debrief');
        }
      }, 250);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [buildFlightSession, duration, pausedElapsed, status, user?.uid]);

  // Verify the active backup periodically and on page hide. If another tab or
  // the browser clears the key mid-flight, this reconstructs it from live
  // state instead of making pause/divert/debrief actions unusable.
  useEffect(() => {
    if (!mounted || !user?.uid || (status !== 'inflight' && status !== 'paused')) return;
    const checkpoint = () => {
      try {
        saveFlightSession(buildFlightSession(status), user.uid);
        setSessionSaveError(null);
      } catch {
        setSessionSaveError('storage-failed');
      }
    };
    const checkpointTimer = window.setInterval(checkpoint, 15_000);
    window.addEventListener('pagehide', checkpoint);
    return () => {
      window.clearInterval(checkpointTimer);
      window.removeEventListener('pagehide', checkpoint);
    };
  }, [buildFlightSession, mounted, status, user?.uid]);

  // Save debrief drafts continuously. The session is removed only after the
  // user explicitly completes the debrief and the flight log is created.
  useEffect(() => {
    if (!mounted || status !== 'debrief' || !user?.uid) return;
    try {
      saveFlightSession(buildFlightSession('debrief', {
        accumulatedBeforePause: elapsed,
      }), user.uid);
      setSessionSaveError(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
  }, [buildFlightSession, elapsed, mounted, status, user?.uid]);

  const phaseInfo = useMemo(() => getCurrentPhase(elapsed, duration), [elapsed, duration]);

  const formatTime = (sec: number) => {
    const m = Math.floor(Math.abs(sec) / 60);
    const s = Math.abs(sec) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remainingSec = Math.max(0, duration * 60 - elapsed);
  const sessionIssueMessage = sessionSaveError
    ? text(
        'This flight is safe in this tab, but its browser backup could not be updated. Retry the backup or end the flight safely before closing the tab.',
        'Dieser Flug ist in diesem Tab sicher, aber die Browser-Sicherung konnte nicht aktualisiert werden. Versuche die Sicherung erneut oder beende den Flug sicher, bevor du den Tab schließt.',
      )
    : null;
  const debriefIssueMessage = debriefSaveError === 'task-sync-failed'
    ? text(
        'Some selected task completions could not be saved. The flight log has not been finalized. Retry when the connection is available.',
        'Einige ausgewählte Aufgabenabschlüsse konnten nicht gespeichert werden. Das Flugprotokoll wurde noch nicht abgeschlossen. Versuche es erneut, sobald eine Verbindung verfügbar ist.',
      )
    : debriefSaveError === 'log-save-failed'
      ? text(
          'The task completions are saved, but the flight log still needs to be stored. Your debrief remains available for retry.',
          'Die Aufgabenabschlüsse sind gespeichert, aber das Flugprotokoll muss noch gesichert werden. Deine Nachbesprechung bleibt für einen erneuten Versuch erhalten.',
        )
      : null;

  // ── Actions ──

  const handleStartFlight = () => {
    if (startingFlightRef.current) return;
    startingFlightRef.current = true;
    const now = Date.now();
    const finalTasks = isPrivate && tasks.length > 1
      ? tasks.slice(0, 1).map(t => ({ ...t, type: 'primary' as const }))
      : tasks;
    try {
      saveFlightSession({
        version: FLIGHT_SESSION_VERSION,
        status: 'inflight',
        startTimestamp: now,
        resumeTimestamp: now,
        accumulatedBeforePause: 0,
        duration,
        route,
        flightNumber,
        flightClass,
        tasks: finalTasks,
        turbulence: [],
        gateNumber,
        seatRow,
        seatLetter,
      }, user?.uid || 'demo-user');
    } catch {
      startingFlightRef.current = false;
      setSessionSaveError('storage-failed');
      return;
    }
    setSessionSaveError(null);
    setTasks(finalTasks);
    setElapsed(0);
    setPausedElapsed(0);
    setTurbulence([]);
    setCompletedNormally(true);
    setPendingReconciliation(null);
    resumeTimestampRef.current = now;
    setStartTimestamp(now);
    setStatus('inflight');
  };

  const handlePause = () => {
    try {
      saveFlightSession(buildFlightSession('paused', {
        accumulatedBeforePause: elapsed,
      }), user?.uid || 'demo-user');
      setSessionSaveError(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setPausedElapsed(elapsed);
    setStatus('paused');
  };

  const handleResume = () => {
    const now = Date.now();
    try {
      saveFlightSession(buildFlightSession('inflight', {
        resumeTimestamp: now,
      }), user?.uid || 'demo-user');
      setSessionSaveError(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
    resumeTimestampRef.current = now;
    setStatus('inflight');
  };

  const handleDivert = () => {
    try {
      saveFlightSession(buildFlightSession('debrief', {
        accumulatedBeforePause: elapsed,
        completedNormally: false,
      }), user?.uid || 'demo-user');
      setSessionSaveError(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setPausedElapsed(elapsed);
    setCompletedNormally(false);
    setStatus('debrief');
  };

  const handleLogTurbulence = (type: TurbulenceLog['type']) => {
    const newEntry = createTurbulenceLog(type);
    const updated = [...turbulence, newEntry];
    try {
      saveFlightSession(buildFlightSession(status === 'paused' ? 'paused' : 'inflight', {
        turbulence: updated,
      }), user?.uid || 'demo-user');
      setSessionSaveError(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
    setTurbulence(updated);
    // Screen shake intensity by distraction type (gated by settings)
    const shakeEnabled = useSettingsStore.getState().settings.focus.turbulenceShakeScreen;
    if (!shakeEnabled) return;
    const heavy = type === 'person' || type === 'other';
    const cls = heavy ? 'animate-turbulence-heavy' : 'animate-turbulence-light';
    // Reset then re-apply so consecutive taps re-trigger
    setShakeClass(null);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    requestAnimationFrame(() => {
      setShakeClass(cls);
      shakeTimerRef.current = setTimeout(() => setShakeClass(null), heavy ? 800 : 500);
    });
  };

  const handleToggleTask = (taskId: string) => {
    const updated = tasks.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );
    try {
      const persistedStatus: FlightSession['status'] = status === 'debrief'
        ? 'debrief'
        : status === 'paused'
          ? 'paused'
          : 'inflight';
      saveFlightSession(buildFlightSession(persistedStatus, {
        tasks: updated,
        accumulatedBeforePause: status === 'debrief' ? elapsed : pausedElapsed,
      }), user?.uid || 'demo-user');
      setSessionSaveError(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
    setTasks(updated);
  };

  const handleAddTask = (item: OrbitItem) => {
    if (isPrivate) {
      // Private mode: single mission only, replace existing
      setTasks([{ id: item.id, title: item.title, type: 'primary', completed: false }]);
      setAddingTasks(false);
      setTaskSearch('');
      return;
    }
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

  const resetToPreflight = () => {
    setStatus('preflight');
    setTasks([]);
    setDebriefSummary('');
    setDebriefNextAction('');
    setElapsed(0);
    setPausedElapsed(0);
    setTurbulence([]);
    setPendingReconciliation(null);
    setDebriefSaveError(null);
    setSessionSaveError(null);
    setConfirmDiscardSession(false);
    resumeTimestampRef.current = 0;
    startingFlightRef.current = false;
    setFlightNumber(isPrivate ? generatePrivateFlightNumber() : generateFlightNumber());
    setRoute(getRouteForDuration(duration));
  };

  const handleRetrySessionSave = () => {
    if (status !== 'inflight' && status !== 'paused' && status !== 'debrief') return;
    try {
      saveFlightSession(buildFlightSession(status, {
        accumulatedBeforePause: status === 'inflight' ? pausedElapsed : elapsed,
      }), user?.uid || 'demo-user');
      setSessionSaveError(null);
      setSessionRecoveryNotice(null);
    } catch {
      setSessionSaveError('storage-failed');
    }
  };

  const handleDiscardSession = () => {
    if (finishingDebriefRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      saveFlightSession(null, user?.uid || 'demo-user');
    } catch {
      // The explicit discard still releases the in-memory screen. A future
      // valid session overwrites any stale key once browser storage recovers.
    }
    resetToPreflight();
  };

  const handleFinishDebrief = async () => {
    if (finishingDebriefRef.current) return;
    finishingDebriefRef.current = true;
    setFinishingDebrief(true);
    setDebriefSaveError(null);
    try {
      const now = Date.now();
      const attempt = beginFlightReconciliation(tasks, pendingReconciliation, now);

      // Persist the reconciliation intent before mutating any linked task.
      // A crash can then retry every remaining idempotent completion.
      try {
        saveFlightSession(buildFlightSession('debrief', {
          accumulatedBeforePause: elapsed,
          pendingReconciliation: attempt,
        }), user?.uid || 'demo-user');
        setSessionSaveError(null);
      } catch {
        setPendingReconciliation(attempt);
        setSessionSaveError('storage-failed');
        return;
      }
      setPendingReconciliation(attempt);

      const remainingTasks = attempt.remainingTaskIds
        .map((taskId) => tasks.find((task) => task.id === taskId))
        .filter((task): task is FlightTask => Boolean(task));
      const missingTaskIds = attempt.remainingTaskIds.filter(
        (taskId) => !remainingTasks.some((task) => task.id === taskId),
      );
      const completionTimestamp = Date.now();
      const results = await Promise.allSettled(remainingTasks.map((task) =>
        updateItem(task.id, {
          status: 'done',
          completedAt: completionTimestamp,
          updatedAt: completionTimestamp,
        })
      ));
      const failedTaskIds = [
        ...missingTaskIds,
        ...results.flatMap((result, index) => result.status === 'rejected'
          ? [remainingTasks[index].id]
          : []),
      ];
      const reconciled = finishFlightTaskReconciliation(attempt, tasks, failedTaskIds);
      setPendingReconciliation(reconciled);

      try {
        saveFlightSession(buildFlightSession('debrief', {
          accumulatedBeforePause: elapsed,
          pendingReconciliation: reconciled,
        }), user?.uid || 'demo-user');
        setSessionSaveError(null);
      } catch {
        setSessionSaveError('storage-failed');
        return;
      }
      if (reconciled.failures.length > 0) {
        setDebriefSaveError('task-sync-failed');
        return;
      }

      const log: FlightLog = {
        id: flightLogId(startTimestamp, flightNumber),
        flightNumber,
        route,
        duration,
        actualDuration: elapsed * 1000,
        startedAt: startTimestamp,
        endedAt: reconciled.endedAt,
        tasks: [...tasks],
        turbulence: [...turbulence],
        completedNormally,
        debrief: {
          summary: debriefSummary || undefined,
          nextAction: debriefNextAction || undefined,
        },
        userId: user?.uid || 'demo-user',
        flightClass,
      };
      await saveFlightLog(log, user?.uid);
      // The log only exists after every selected task completion succeeded.
      // Clear the resumable debrief last.
      saveFlightSession(null, user?.uid || 'demo-user');
      setSessionSaveError(null);
      setFlightLogs(loadFlightLogsLocal(user?.uid || 'demo-user'));
      resetToPreflight();
    } catch {
      setDebriefSaveError('log-save-failed');
    } finally {
      finishingDebriefRef.current = false;
      setFinishingDebrief(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-6" role="status" aria-live="polite">
        <div className="text-center">
          <Plane aria-hidden="true" className="mx-auto h-5 w-5 animate-pulse text-primary motion-reduce:animate-none" />
          <p className="mt-2 text-[12px] text-muted-foreground">{text('Preparing Flight…', 'Flug wird vorbereitet…')}</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — LOG BOOK
  // ═══════════════════════════════════════════════════════════

  if (showLogbook) {
    const stats = getFlightStats(flightLogs);
    return (
      <div className="motion-surface flex h-full flex-col bg-background">
        {/* Header */}
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLogbook(false)}
              aria-label={text('Back to Flight setup', 'Zurück zur Flugvorbereitung')}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-foreground/[0.04] hover:text-foreground lg:h-8 lg:w-8"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-[11px] font-mono text-muted-foreground/50">{text('FLIGHT LOGBOOK', 'FLUGBUCH')}</span>
          </div>
          <span className="text-[11px] text-muted-foreground/30">
            {text(
              `${flightLogs.length} ${flightLogs.length === 1 ? 'flight' : 'flights'}`,
              `${flightLogs.length} ${flightLogs.length === 1 ? 'Flug' : 'Flüge'}`,
            )}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
          {/* Stats Overview */}
          {flightLogs.length > 0 && (
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: text('Flights', 'Flüge'), value: stats.totalFlights.toString(), icon: Plane },
                { label: text('Focus time', 'Fokuszeit'), value: formatLocalizedFlightTime(stats.totalMinutes, lang), icon: Clock },
                { label: text('Tasks done', 'Aufgaben erledigt'), value: `${stats.completedTasks}/${stats.totalTasks}`, icon: Target },
                { label: text('Avg. turbulence', 'Ø Ablenkungen'), value: new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stats.avgTurbulence), icon: Zap },
                { label: text('Streak', 'Serie'), value: `${stats.longestStreak} ${text('d', 'T')}`, icon: Flame },
                { label: text('Completion', 'Abschluss'), value: stats.totalFlights > 0 ? `${Math.round(flightLogs.filter((l) => l.completedNormally).length / stats.totalFlights * 100)}%` : '—', icon: TrendingUp },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/40 p-3 text-center">
                  <stat.icon aria-hidden="true" className="mx-auto mb-1.5 h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                  <p className="text-lg font-bold tabular-nums leading-none">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Flight Log Cards */}
          {flightLogs.length === 0 ? (
            <div className="text-center py-16">
              <Plane aria-hidden="true" className="h-8 w-8 text-muted-foreground/10 mx-auto mb-3" />
              <p className="text-[14px] text-muted-foreground/30">{text('No flights yet', 'Noch keine Flüge')}</p>
              <p className="text-[12px] text-muted-foreground/45 mt-1">
                {text('Complete a focus session to see it here', 'Schließe eine Fokussitzung ab, damit sie hier erscheint')}
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
      <div className={cn('motion-surface flex h-full flex-col bg-background', shakeClass)}>
        {/* Flight strip header */}
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPrivate ? (
              <Crown className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            ) : (
              <Plane className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            )}
            <span className="text-[11px] font-mono text-muted-foreground/50">{flightNumber}</span>
            <span className="text-[11px] text-muted-foreground/30">
              {route.from.code} → {route.to.code}
            </span>
            {isPrivate && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                {text('PRIVATE', 'PRIVAT')}
              </span>
            )}
            {status === 'paused' && (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                {text('HOLDING', 'WARTESCHLEIFE')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Private mode: no pause/hold — commitment mode */}
            {!isPrivate && (
              <>
                {status === 'inflight' ? (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground/40 transition-colors hover:bg-foreground/[0.04] hover:text-amber-700 dark:hover:text-amber-300 lg:min-h-8"
                  >
                    <Pause aria-hidden="true" className="h-3 w-3" />
                    {text('Hold', 'Pausieren')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResume}
                    className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/[0.06] hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200 lg:min-h-8"
                  >
                    <Play aria-hidden="true" className="h-3 w-3" />
                    {text('Resume', 'Fortsetzen')}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={handleDivert}
              className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground/45 transition-colors hover:bg-red-500/[0.05] hover:text-red-700 dark:hover:text-red-300 lg:min-h-8"
            >
              <AlertTriangle aria-hidden="true" className="h-3 w-3" />
              {isPrivate ? text('Abort', 'Abbrechen') : text('Divert', 'Umleiten')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
            {sessionSaveError && (
              <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[12px] text-red-700 dark:text-red-300">
                <p>{sessionIssueMessage}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRetrySessionSave}
                    className="min-h-11 rounded-lg bg-red-500/10 px-3 font-medium transition-colors hover:bg-red-500/20 lg:min-h-8"
                  >
                    {text('Retry backup', 'Sicherung erneut versuchen')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDivert}
                    className="min-h-11 rounded-lg border border-red-500/20 px-3 font-medium transition-colors hover:bg-red-500/10 lg:min-h-8"
                  >
                    {text('End flight safely', 'Flug sicher beenden')}
                  </button>
                </div>
              </div>
            )}
            {/* Phase label */}
            <div className="text-center">
              <p className={cn(
                'text-[10px] uppercase tracking-widest',
                'text-muted-foreground'
              )}>
                {isPrivate && status === 'inflight'
                  ? text('Deep focus', 'Tiefenfokus')
                  : localizedPhaseLabel(phaseInfo.phase, lang)}
              </p>
            </div>

            {/* Side-view plane animation */}
            <PlaneAnimation
              phase={phaseInfo.phase}
              phaseProgress={phaseInfo.phaseProgress}
              isPaused={status === 'paused'}
              flightClass={flightClass}
            />

            {/* Big countdown */}
            <div className="text-center">
              <p className="text-5xl lg:text-6xl font-black tabular-nums tracking-tighter leading-none">
                {formatTime(remainingSec)}
              </p>
              <p className="text-[10px] text-muted-foreground/45 mt-2 tabular-nums font-mono">
                {formatTime(elapsed)} {text('elapsed', 'vergangen')} · {route.from.code} → {route.to.code}
              </p>
              {isPrivate && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <Shield aria-hidden="true" className="h-3 w-3 text-primary" />
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{text('No-distractions mode', 'Ablenkungsfreier Modus')}</span>
                </div>
              )}
            </div>

            {/* Desktop two-column layout */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
              {/* Phase progress bar */}
              <div className="space-y-3">
                <div className="flex items-center gap-0.5 h-1.5">
                  {(['boarding', 'taxi', 'takeoff', 'cruise', 'descent', 'landed'] as const).map((phase, i) => {
                    const phases = ['boarding', 'taxi', 'takeoff', 'cruise', 'descent', 'landed'];
                    const phaseIdx = phases.indexOf(phaseInfo.phase);
                    const isCurrent = i === phaseIdx;
                    const isPast = i < phaseIdx;
                    const accentColor = 'bg-primary';
                    const accentColorDim = 'bg-primary/60';
                    return (
                      <div key={phase} className="flex-1 relative group">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isPast
                              ? accentColorDim
                              : isCurrent
                                ? accentColor
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
                <div className="flex justify-between text-[10px] text-muted-foreground/45 uppercase tracking-wider">
                  {([
                    text('Board', 'Boarding'),
                    text('Taxi', 'Rollen'),
                    text('T/O', 'Start'),
                    text('Cruise', 'Flug'),
                    text('Desc.', 'Sinken'),
                    text('Land', 'Landung'),
                  ]).map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>

                {/* Turbulence quick-log — commercial only */}
                {!isPrivate && (
                  <div className="rounded-2xl border border-border/30 p-3">
                    <p className="text-[11px] text-muted-foreground/45 uppercase tracking-widest mb-2">
                      {text('Log turbulence', 'Ablenkung erfassen')} ({turbulence.length})
                    </p>
                    <div className="flex gap-2">
                      {TURBULENCE_TYPES.map(({ type, icon }) => {
                        const Icon = {
                          Smartphone,
                          Brain,
                          Bell,
                          UserRound,
                          Zap,
                        }[icon] || Zap;
                        const label = localizedTurbulenceLabel(type, lang);
                        
                        return (
                          <button
                            type="button"
                            key={type}
                            onClick={() => handleLogTurbulence(type)}
                            title={label}
                            aria-label={text(`Log ${label.toLowerCase()} distraction`, `Ablenkung „${label}“ erfassen`)}
                            className="flex min-h-11 flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-all hover:bg-foreground/[0.03] active:scale-95"
                          >
                            <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground/40" />
                            <span className="text-[10px] text-muted-foreground/45 uppercase">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Private: focus commitment card */}
                {isPrivate && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 text-center">
                    <Shield aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-primary" />
                    <p className="text-[11px] font-medium text-foreground">{text('Focus locked', 'Fokus gesperrt')}</p>
                    <p className="text-[11px] text-muted-foreground/30 mt-1">
                      {text('No pauses. No distractions. Stay in the zone.', 'Keine Pausen. Keine Ablenkungen. Bleib im Fokus.')}
                    </p>
                  </div>
                )}
              </div>

              {/* Task manifest */}
              {tasks.length > 0 && (
                <div className="rounded-2xl border border-border/30 p-4">
                  <p className="text-[11px] text-muted-foreground/45 uppercase tracking-widest mb-2.5">
                    {text('Task manifest', 'Aufgabenmanifest')} ({tasks.filter((t) => t.completed).length}/{tasks.length})
                  </p>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <button
                        type="button"
                        key={task.id}
                        onClick={() => handleToggleTask(task.id)}
                        aria-pressed={task.completed}
                        aria-label={text(
                          `Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`,
                          `${task.title} als ${task.completed ? 'offen' : 'erledigt'} markieren`,
                        )}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-all lg:min-h-0',
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
                        <span className="text-[11px] text-muted-foreground/45 uppercase shrink-0">
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
      <div className="motion-surface mx-auto max-w-2xl space-y-6 p-4 lg:p-8">
        <div className="text-center">
          <p className={cn(
            'text-[10px] uppercase tracking-widest mb-2',
            'text-muted-foreground'
          )}>
            {completedNormally 
              ? (isPrivate ? text('Mission complete', 'Mission abgeschlossen') : text('Flight complete', 'Flug abgeschlossen'))
              : (isPrivate ? text('Mission aborted', 'Mission abgebrochen') : text('Diverted', 'Umgeleitet'))}
          </p>
          <h2 className="text-xl font-bold tracking-tight">
            {flightNumber} · {text('Debrief', 'Nachbesprechung')}
          </h2>
          <p className="text-[12px] text-muted-foreground/40 mt-1">
            {route.from.code} → {route.to.code}
          </p>
        </div>

        {/* Stats grid */}
        <div className={cn('grid gap-3', isPrivate ? 'grid-cols-2' : 'grid-cols-3')}>
          <div className="rounded-2xl border border-border/40 p-4 text-center">
            <Clock aria-hidden="true" className="mx-auto mb-1.5 h-3.5 w-3.5 text-primary" />
            <p className="text-lg font-bold tabular-nums">{formatTime(elapsed)}</p>
            <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-0.5">
              {isPrivate ? text('Focus time', 'Fokuszeit') : text('Flight time', 'Flugzeit')}
            </p>
          </div>
          {tasks.length > 0 && (
            <div className="rounded-2xl border border-border/40 p-4 text-center">
              <CheckSquare aria-hidden="true" className="h-3.5 w-3.5 text-emerald-500 mx-auto mb-1.5" />
              <p className="text-lg font-bold tabular-nums">{completedCount}/{tasks.length}</p>
              <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-0.5">{text('Tasks done', 'Aufgaben erledigt')}</p>
            </div>
          )}
          {!isPrivate && (
            <div className="rounded-2xl border border-border/40 p-4 text-center">
              <Zap aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 mx-auto mb-1.5" />
              <p className="text-lg font-bold tabular-nums">{turbulence.length}</p>
              <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-0.5">{text('Distractions', 'Ablenkungen')}</p>
            </div>
          )}
        </div>

        {/* Task Review */}
        {tasks.length > 0 && (
          <div className="rounded-2xl border border-border/40 p-4">
            <p className="text-[11px] text-muted-foreground/45 uppercase tracking-widest mb-2.5">
              {text('Task review', 'Aufgabenprüfung')}
            </p>
            <div className="space-y-1">
              {tasks.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  onClick={() => handleToggleTask(task.id)}
                  disabled={Boolean(pendingReconciliation) || finishingDebrief}
                  aria-pressed={task.completed}
                  aria-label={text(
                    `Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`,
                    `${task.title} als ${task.completed ? 'offen' : 'erledigt'} markieren`,
                  )}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-all',
                    task.completed ? 'text-muted-foreground/30 line-through' : 'text-foreground',
                    'hover:bg-foreground/[0.03] disabled:cursor-not-allowed disabled:opacity-60'
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
            <label htmlFor="flight-debrief-summary" className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              {text('What did you accomplish?', 'Was hast du erreicht?')}
            </label>
            <input
              id="flight-debrief-summary"
              value={debriefSummary}
              onChange={(e) => setDebriefSummary(e.target.value)}
              disabled={finishingDebrief}
              maxLength={10_000}
              placeholder={text('Quick summary…', 'Kurze Zusammenfassung…')}
              className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/45 transition-colors focus-visible:border-[var(--focus-ring)]"
            />
          </div>
          <div>
            <label htmlFor="flight-debrief-next-action" className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              {text('Next action', 'Nächster Schritt')}
            </label>
            <input
              id="flight-debrief-next-action"
              value={debriefNextAction}
              onChange={(e) => setDebriefNextAction(e.target.value)}
              disabled={finishingDebrief}
              maxLength={2_000}
              placeholder={text('What comes next?', 'Was kommt als Nächstes?')}
              className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/45 transition-colors focus-visible:border-[var(--focus-ring)]"
            />
          </div>
        </div>

        {pendingReconciliation && (
          <div aria-live="polite" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3 text-[12px]">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              {pendingReconciliation.stage === 'tasks'
                ? text('Task completion sync pending', 'Aufgabenabgleich ausstehend')
                : text('Flight log save pending', 'Speichern des Flugprotokolls ausstehend')}
            </p>
            <p className="mt-1 text-muted-foreground">
              {pendingReconciliation.stage === 'tasks'
                ? text(
                    'The log will only be finalized after every selected task completion is saved.',
                    'Das Protokoll wird erst abgeschlossen, nachdem jede ausgewählte Aufgabenerledigung gespeichert wurde.',
                  )
                : text(
                    'All selected task completions are saved. The flight log can now be retried safely.',
                    'Alle ausgewählten Aufgabenerledigungen sind gespeichert. Das Flugprotokoll kann jetzt sicher erneut gespeichert werden.',
                  )}
            </p>
            {pendingReconciliation.remainingTaskIds.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label={text('Pending task completions', 'Ausstehende Aufgabenabschlüsse')}>
                {pendingReconciliation.remainingTaskIds.map((taskId) => {
                  const task = tasks.find((entry) => entry.id === taskId);
                  const failed = pendingReconciliation.failures.some((failure) => failure.taskId === taskId);
                  return (
                    <li key={taskId} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-2.5 py-2">
                      <span className="min-w-0 truncate">{task?.title ?? text('Unavailable task', 'Nicht verfügbare Aufgabe')}</span>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        {failed ? text('Sync failed', 'Abgleich fehlgeschlagen') : text('Retry pending', 'Wiederholung ausstehend')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {debriefIssueMessage && (
          <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
            {debriefIssueMessage}
          </p>
        )}

        {sessionSaveError && (
          <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[12px] text-red-700 dark:text-red-300">
            <p>{sessionIssueMessage}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRetrySessionSave}
                disabled={finishingDebrief}
                className="min-h-11 rounded-lg bg-red-500/10 px-3 font-medium transition-colors hover:bg-red-500/20 lg:min-h-8"
              >
                {text('Retry backup', 'Sicherung erneut versuchen')}
              </button>
              {!confirmDiscardSession ? (
                <button
                  type="button"
                  onClick={() => setConfirmDiscardSession(true)}
                  disabled={finishingDebrief}
                  className="min-h-11 rounded-lg border border-red-500/20 px-3 font-medium transition-colors hover:bg-red-500/10 lg:min-h-8"
                >
                  {text('Discard flight', 'Flug verwerfen')}
                </button>
              ) : (
                <div role="group" aria-label={text('Confirm flight discard', 'Verwerfen des Flugs bestätigen')} className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardSession}
                    disabled={finishingDebrief}
                    className="min-h-11 rounded-lg bg-red-600 px-3 font-semibold text-white hover:bg-red-500 lg:min-h-8"
                  >
                    {text('Discard permanently', 'Endgültig verwerfen')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDiscardSession(false)}
                    disabled={finishingDebrief}
                    className="min-h-11 rounded-lg px-3 font-medium hover:bg-red-500/10 lg:min-h-8"
                  >
                    {text('Cancel', 'Abbrechen')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleFinishDebrief}
          disabled={finishingDebrief}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-60',
            'bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90'
          )}
        >
          <CheckSquare aria-hidden="true" className="h-4 w-4" />
          {finishingDebrief
            ? pendingReconciliation?.stage === 'tasks'
              ? text('Syncing tasks…', 'Aufgaben werden abgeglichen…')
              : text('Saving flight…', 'Flug wird gespeichert…')
            : pendingReconciliation?.stage === 'tasks'
              ? text('Retry task completion', 'Aufgabenabschluss erneut versuchen')
              : pendingReconciliation?.stage === 'log'
                ? text('Retry flight save', 'Flug erneut speichern')
                : text('Complete debrief', 'Nachbesprechung abschließen')}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — PREFLIGHT
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="motion-surface mx-auto max-w-2xl space-y-6 p-4 lg:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isPrivate ? (
            <Crown className="h-5 w-5 text-primary" strokeWidth={1.5} />
          ) : (
            <Plane className="h-5 w-5 text-primary" strokeWidth={1.5} />
          )}
          <h1 className="text-xl font-semibold tracking-tight">
            {isPrivate ? text('Private charter', 'Privatcharter') : text('Cleared for takeoff', 'Startfreigabe')}
          </h1>
        </div>
        {flightLogs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLogbook(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground lg:min-h-8"
          >
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            {text('Logbook', 'Flugbuch')} ({flightLogs.length})
          </button>
        )}
      </div>

      {sessionSaveError && (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[12px] text-red-700 dark:text-red-300">
          <p>
            {text(
              'Browser storage is unavailable. Free some space or restore browser access, then retry session recovery before starting another flight.',
              'Der Browserspeicher ist nicht verfügbar. Gib Speicherplatz frei oder stelle den Browserzugriff wieder her und versuche die Sitzungswiederherstellung erneut, bevor du einen weiteren Flug startest.',
            )}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 min-h-11 rounded-lg bg-red-500/10 px-3 font-medium hover:bg-red-500/20 lg:min-h-8"
          >
            {text('Retry session recovery', 'Sitzungswiederherstellung erneut versuchen')}
          </button>
        </div>
      )}

      {sessionRecoveryNotice === 'corrupt-quarantined' && (
        <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[12px] text-amber-700 dark:text-amber-300">
          <p>
            {text(
              'An unsafe saved flight was isolated instead of being restored. You can start a new flight safely.',
              'Ein unsicher gespeicherter Flug wurde isoliert und nicht wiederhergestellt. Du kannst sicher einen neuen Flug starten.',
            )}
          </p>
          <button
            type="button"
            onClick={() => setSessionRecoveryNotice(null)}
            className="mt-2 min-h-11 rounded-lg px-2 font-medium hover:bg-amber-500/10 lg:min-h-8"
          >
            {text('Dismiss', 'Schließen')}
          </button>
        </div>
      )}

      {/* ── Flight Class Selector ── */}
      <div className="relative">
        {/* The toggle track */}
        <div className="relative rounded-2xl border border-border/40 bg-card overflow-hidden">
          {/* Sliding highlight */}
          <div
            className={cn(
              'absolute top-0 bottom-0 w-1/2 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] z-0',
              isPrivate ? 'left-1/2' : 'left-0'
            )}
          >
            <div className="absolute inset-0 bg-primary/[0.06] transition-colors duration-500" />
            <div className={cn(
              'absolute inset-y-0 w-[2px] transition-colors duration-500',
              isPrivate ? 'right-0 left-auto bg-primary/30' : 'left-0 bg-primary/30'
            )} />
          </div>

          {/* Vertical divider */}
          <div className="absolute left-1/2 top-3 bottom-3 w-px bg-border/30 z-10" />

          <div className="relative z-10 grid grid-cols-2">
            {/* Commercial side */}
            <button
              type="button"
              aria-pressed={!isPrivate}
              onClick={() => {
                if (flightClass !== 'commercial') {
                  setFlightClass('commercial');
                  setFlightNumber(generateFlightNumber());
                  const maxCommercial = 460 as FlightDuration;
                  if (duration > maxCommercial) {
                    setDuration(maxCommercial);
                    setRoute(getRouteForDuration(maxCommercial));
                  }
                }
              }}
              className="relative p-4 text-left transition-all group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn(
                  'h-6 w-6 rounded-lg flex items-center justify-center transition-colors duration-500',
                  !isPrivate ? 'bg-primary/10' : 'bg-foreground/[0.04]'
                )}>
                  <Plane className={cn('h-3.5 w-3.5 transition-colors duration-500', !isPrivate ? 'text-primary' : 'text-muted-foreground/45')} />
                </div>
                <span className={cn('text-[13px] font-bold tracking-tight transition-colors duration-500', !isPrivate ? 'text-foreground' : 'text-muted-foreground/30')}>
                  {text('Commercial', 'Linienflug')}
                </span>
              </div>
              <div className={cn('flex items-center gap-2 mt-2 transition-opacity duration-500', !isPrivate ? 'opacity-100' : 'opacity-30')}>
                <AircraftSilhouette kind="commercial" className="h-8 w-16 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium">
                    {text('Widebody', 'Großraumjet')}
                  </span>
                  <span className="text-[11px] text-muted-foreground/45 mt-0.5">{text('Tasks · Distraction log · Pause', 'Aufgaben · Ablenkungslog · Pause')}</span>
                </div>
              </div>
              <div className={cn('mt-2 flex items-center gap-1 transition-opacity duration-500', !isPrivate ? 'opacity-100' : 'opacity-20')}>
                <div className="flex gap-0.5">
                  {[20, 60, 120, 240, 460].map((d) => (
                    <div key={d} className="h-1 w-1 rounded-full bg-primary/40" />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground/45 ml-1">{text('20 min – 7+ hr', '20 Min. – 7+ Std.')}</span>
              </div>
            </button>

            {/* Private side */}
            <button
              type="button"
              aria-pressed={isPrivate}
              onClick={() => {
                if (flightClass !== 'private') {
                  setFlightClass('private');
                  setFlightNumber(generatePrivateFlightNumber());
                  if (duration > 90) {
                    const newDuration = 90 as FlightDuration;
                    setDuration(newDuration);
                    setRoute(getRouteForDuration(newDuration));
                  }
                  if (tasks.length > 1) {
                    setTasks(tasks.slice(0, 1).map(t => ({ ...t, type: 'primary' as const })));
                  }
                }
              }}
              className="relative p-4 text-left transition-all group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn(
                  'h-6 w-6 rounded-lg flex items-center justify-center transition-colors duration-500',
                  isPrivate ? 'bg-primary/10' : 'bg-foreground/[0.04]'
                )}>
                  <Crown className={cn('h-3.5 w-3.5 transition-colors duration-500', isPrivate ? 'text-primary' : 'text-muted-foreground/45')} />
                </div>
                <span className={cn('text-[13px] font-bold tracking-tight transition-colors duration-500', isPrivate ? 'text-foreground' : 'text-muted-foreground/30')}>
                  {text('Private', 'Privat')}
                </span>
              </div>
              <div className={cn('flex items-center gap-2 mt-2 transition-opacity duration-500', isPrivate ? 'opacity-100' : 'opacity-30')}>
                <AircraftSilhouette kind="private" className="h-8 w-16 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium">Charter</span>
                  <span className="text-[11px] text-muted-foreground/45 mt-0.5">{text('1 mission · No pause · Focus', '1 Mission · Keine Pause · Fokus')}</span>
                </div>
              </div>
              <div className={cn('mt-2 flex items-center gap-1 transition-opacity duration-500', isPrivate ? 'opacity-100' : 'opacity-20')}>
                <div className="flex gap-0.5">
                  {[20, 45, 60, 90].map((d) => (
                    <div key={d} className="h-1 w-1 rounded-full bg-primary/40" />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground/45 ml-1">{text('20–90 min', '20–90 Min.')}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Single-column layout */}
      <div className="space-y-6">
        {/* ── Boarding Pass ── */}
        {isPrivate ? (
          // ── Private Charter Document ──
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            {/* Shared accent line; aircraft and labels carry class meaning. */}
            <div className="h-[2px] bg-primary/30" />

            {/* Header */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Crown className="h-4 w-4 text-primary" />
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground">Threadmap Private</span>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{text('Charter manifest', 'Chartermanifest')}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[12px] font-mono font-bold tracking-wider text-foreground">{flightNumber}</span>
              </div>
            </div>

            {/* Thin separator */}
            <div className="mx-5 h-px bg-border" />

            {/* Route — dramatic, large */}
            <div className="px-5 py-5">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setPickingAirport('from')} aria-label={text(`Change origin from ${route.from.city}`, `Abflugort ${route.from.city} ändern`)} className="flex-1 group">
                  <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{text('Origin', 'Abflugort')}</p>
                  <p className="mt-1 text-4xl font-black leading-none tracking-tight text-foreground transition-colors group-hover:text-foreground/80">{route.from.code}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{route.from.city}</p>
                  <p className="mt-2 text-[16px] font-bold tabular-nums tracking-tight text-foreground">{departureTime ? formatClock(departureTime) : '--:--'}</p>
                </button>

                <div className="flex flex-col items-center pt-6 shrink-0 px-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-px w-5 bg-primary/20" />
                    <div className="h-2 w-2 rounded-full border border-primary/30" />
                    <div className="h-px w-3 bg-primary/20" />
                    <Crown className="h-3 w-3 text-primary" />
                    <div className="h-px w-3 bg-primary/20" />
                    <div className="h-2 w-2 rounded-full bg-primary/30" />
                    <div className="h-px w-5 bg-primary/20" />
                  </div>
                  <span className="mt-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {formatLocalizedFlightTime(route.realFlightMin, lang)}
                  </span>
                </div>

                <button type="button" onClick={() => setPickingAirport('to')} aria-label={text(`Change destination from ${route.to.city}`, `Zielort ${route.to.city} ändern`)} className="flex-1 text-right group">
                  <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{text('Destination', 'Zielort')}</p>
                  <p className="mt-1 text-4xl font-black leading-none tracking-tight text-foreground transition-colors group-hover:text-foreground/80">{route.to.code}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{route.to.city}</p>
                  <p className="mt-2 text-[16px] font-bold tabular-nums tracking-tight text-foreground">{arrivalTime ? formatClock(arrivalTime) : '--:--'}</p>
                </button>
              </div>
            </div>

            {/* Thin separator */}
            <div className="mx-5 h-px bg-border" />

            {/* Bottom details — minimal, premium */}
            <div className="px-5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{text('Pilot', 'Pilot/in')}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-foreground">{(user?.displayName || text('Pilot', 'Pilot/in')).toUpperCase()}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{text('Focus', 'Fokus')}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-foreground">{duration} {text('min', 'Min.')}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{text('Range', 'Reichweite')}</p>
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-foreground">{route.distanceKm.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} km</p>
              </div>
            </div>

            {/* Bottom accent */}
            <div className="h-px bg-border" />
          </div>
        ) : (
          // ── Commercial Boarding Pass ──
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {/* Airline header */}
            <div className="flex items-center justify-between bg-primary px-5 py-2.5 text-primary-foreground">
              <div className="flex items-center gap-2">
                <Plane className="h-3.5 w-3.5" />
                <span className="text-[13px] font-bold tracking-wide">THREADMAP AIR</span>
              </div>
              <span className="text-[11px] font-mono tracking-wider">{flightNumber}</span>
            </div>

            {/* Route row */}
            <div className="p-5 pb-4">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setPickingAirport('from')} aria-label={text(`Change departure from ${route.from.city}`, `Abflugort ${route.from.city} ändern`)} className="flex-1 group">
                  <p className="text-[11px] text-muted-foreground/40 uppercase tracking-wider font-medium">{text('Departure', 'Abflug')}</p>
                  <p className="mt-1 text-3xl font-black leading-none tracking-tight transition-colors group-hover:text-foreground/80">{route.from.code}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">{route.from.city}</p>
                  <p className="text-[18px] font-bold tabular-nums mt-1.5 tracking-tight">{departureTime ? formatClock(departureTime) : '--:--'}</p>
                </button>

                <div className="flex flex-col items-center pt-5 shrink-0 px-2">
                  <div className="flex items-center gap-1">
                    <div className="h-[1px] w-6 bg-muted-foreground/20" />
                    <Plane className="h-3.5 w-3.5 text-muted-foreground/30 rotate-0" />
                    <div className="h-[1px] w-6 bg-muted-foreground/20" />
                  </div>
                  <span className="text-[11px] text-muted-foreground/30 mt-1 tabular-nums font-medium">
                    {formatLocalizedFlightTime(route.realFlightMin, lang)}
                  </span>
                </div>

                <button type="button" onClick={() => setPickingAirport('to')} aria-label={text(`Change arrival at ${route.to.city}`, `Zielort ${route.to.city} ändern`)} className="flex-1 text-right group">
                  <p className="text-[11px] text-muted-foreground/40 uppercase tracking-wider font-medium">{text('Arrival', 'Ankunft')}</p>
                  <p className="mt-1 text-3xl font-black leading-none tracking-tight transition-colors group-hover:text-foreground/80">{route.to.code}</p>
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
                <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">{text('Passenger', 'Passagier/in')}</p>
                <p className="text-[12px] font-semibold truncate mt-0.5">{(user?.displayName || text('Pilot', 'Pilot/in')).toUpperCase()}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">{text('Focus', 'Fokus')}</p>
                <p className="text-[12px] font-semibold mt-0.5">{duration} {text('min', 'Min.')}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">{text('Seat', 'Sitz')}</p>
                <p className="text-[12px] font-semibold font-mono mt-0.5">{seatRow}{seatLetter}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">Gate</p>
                <p className="text-[12px] font-semibold font-mono mt-0.5">G{gateNumber}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">{text('Distance', 'Entfernung')}</p>
                <p className="text-[12px] font-semibold font-mono mt-0.5">{route.distanceKm.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} km</p>
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
        )}

          {/* ── Duration Wheel ── */}
          <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {isPrivate ? text('Focus duration', 'Fokusdauer') : text('Flight duration', 'Flugdauer')}
            </p>
            <DurationWheel
              value={duration}
              onChange={handleDurationChange}
              presets={isPrivate ? PRIVATE_DURATION_PRESETS : DURATION_PRESETS}
            />
          </div>

          {/* ── Task Manifest ── */}
          <div className="rounded-2xl border border-border/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {isPrivate
                  ? `${text('Priority mission', 'Prioritätsmission')}${tasks.length > 0 ? ' ✓' : ''}`
                  : `${text('Task manifest', 'Aufgabenmanifest')} (${tasks.length})`}
              </p>
              {(!isPrivate || tasks.length === 0) && (
                <button
                  type="button"
                  onClick={() => setAddingTasks(true)}
                  className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] text-foreground transition-colors hover:bg-foreground/[0.04] lg:min-h-8"
                >
                  <Plus aria-hidden="true" className="h-3 w-3" />
                  {isPrivate ? text('Set mission', 'Mission festlegen') : text('Add task', 'Aufgabe hinzufügen')}
                </button>
              )}
            </div>

            {tasks.length === 0 ? (
              <button
                type="button"
                onClick={() => setAddingTasks(true)}
                className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/40 py-6 text-center transition-colors hover:border-border hover:bg-foreground/[0.025]"
              >
                {isPrivate ? (
                  <>
                    <Target aria-hidden="true" className="mb-1.5 h-5 w-5 text-primary" />
                    <p className="text-[12px] text-muted-foreground/40">{text('Set your single focus mission', 'Lege deine einzige Fokusmission fest')}</p>
                    <p className="text-[10px] text-muted-foreground/45 mt-0.5">{text('One task. No distractions. Maximum output.', 'Eine Aufgabe. Keine Ablenkungen. Maximale Wirkung.')}</p>
                  </>
                ) : (
                  <>
                    <Plus aria-hidden="true" className="h-5 w-5 text-muted-foreground/45 mb-1.5" />
                    <p className="text-[12px] text-muted-foreground/40">{text('Add tasks to your manifest', 'Füge Aufgaben zu deinem Manifest hinzu')}</p>
                    <p className="text-[10px] text-muted-foreground/45 mt-0.5">{text('The first three are primary; the rest are carry-on.', 'Die ersten drei sind Hauptaufgaben, alle weiteren sind Zusatzaufgaben.')}</p>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-1">
                {tasks.map((task, i) => (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors group',
                      isPrivate
                        ? 'font-medium'
                        : task.type === 'primary' ? 'font-medium' : 'text-muted-foreground/50'
                    )}
                  >
                    <span className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      isPrivate || task.type === 'primary' ? 'bg-primary' : 'bg-muted-foreground/20'
                    )} />
                    <span className="flex-1 truncate">{task.title}</span>
                    {!isPrivate && (
                      <span className="text-[11px] text-muted-foreground/45 uppercase">{task.type === 'primary' ? `P${i + 1}` : 'C/O'}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveTask(task.id)}
                      aria-label={text(`Remove ${task.title} from manifest`, `${task.title} aus dem Manifest entfernen`)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 opacity-70 transition-colors hover:bg-red-500/10 hover:text-red-700 focus-visible:opacity-100 dark:hover:text-red-300 lg:h-7 lg:w-7 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Start Flight ── */}
          <button
            type="button"
            onClick={handleStartFlight}
            disabled={Boolean(sessionSaveError)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-[14px] font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPrivate ? (
              <>
                <Shield aria-hidden="true" className="h-4 w-4" />
                {text('Enter focus mode', 'Fokusmodus starten')}
              </>
            ) : (
              <>
                <Play aria-hidden="true" className="h-4 w-4" />
                {text('Start flight', 'Flug starten')}
              </>
            )}
          </button>
      </div>

      {/* ── Airport Picker Modal ── */}
      <Dialog open={pickingAirport !== null} onOpenChange={(open) => {
        if (!open) setPickingAirport(null);
      }}>
        <DialogContent className="flex max-h-[80dvh] max-w-[340px] flex-col p-5" aria-describedby={undefined}>
          <DialogTitle className="pr-8 text-[15px] font-semibold">
            {pickingAirport === 'from'
              ? text('Select departure', 'Abflugort auswählen')
              : text('Select destination', 'Zielort auswählen')}
          </DialogTitle>
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
                        <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest mb-1">{localizedRegion(region, lang)}</p>
                        <div className="grid grid-cols-2 gap-1">
                          {regionAirports.map((airport) => {
                            const isSelected =
                              (pickingAirport === 'from' && route.from.code === airport.code) ||
                              (pickingAirport === 'to' && route.to.code === airport.code);
                            return (
                              <button
                                type="button"
                                key={airport.code}
                                onClick={() => handleSelectAirport(airport)}
                                aria-pressed={isSelected}
                                aria-label={text(`Select ${airport.city} (${airport.code})`, `${airport.city} (${airport.code}) auswählen`)}
                                className={cn(
                                  'min-h-11 text-left rounded-lg px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/30',
                                  isSelected ? 'border border-primary/30 bg-primary/10' : 'border border-transparent'
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
        </DialogContent>
      </Dialog>

      {/* ── Task Picker Modal ── */}
      <Dialog open={addingTasks} onOpenChange={(open) => {
        setAddingTasks(open);
        if (!open) setTaskSearch('');
      }}>
        <DialogContent
          className="flex max-h-[70dvh] max-w-[400px] flex-col p-5"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            taskSearchRef.current?.focus();
          }}
        >
          <DialogTitle className="pr-8 text-[15px] font-semibold">
            {isPrivate ? text('Select focus mission', 'Fokusmission auswählen') : text('Add tasks to manifest', 'Aufgaben zum Manifest hinzufügen')}
          </DialogTitle>

              <div className="relative mb-3">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
                <input
                  ref={taskSearchRef}
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  aria-label={text('Search tasks', 'Aufgaben suchen')}
                  placeholder={text('Search tasks…', 'Aufgaben suchen…')}
                  className="w-full rounded-xl border border-border/40 bg-transparent py-2 pl-9 pr-3 text-[13px] placeholder:text-muted-foreground/45 transition-colors focus-visible:border-[var(--focus-ring)]"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-0.5">
                {filteredTasks.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/30 text-center py-6">
                    {taskSearch
                      ? text('No matching tasks', 'Keine passenden Aufgaben')
                      : text('All tasks are already added', 'Alle Aufgaben wurden bereits hinzugefügt')}
                  </p>
                ) : (
                  filteredTasks.slice(0, 20).map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => handleAddTask(task)}
                      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <Plus aria-hidden="true" className="h-3 w-3 shrink-0 text-primary" />
                      <span className="flex-1 truncate">{task.title}</span>
                      {task.priority && (
                        <span className={cn('text-[11px] font-medium uppercase', task.priority === 'high' ? 'text-red-700 dark:text-red-300' : task.priority === 'medium' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground/30')}>
                          {task.priority === 'high'
                            ? text('high', 'hoch')
                            : task.priority === 'medium'
                              ? text('medium', 'mittel')
                              : text('low', 'niedrig')}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground/30 font-mono">{formatTaskDueDate(task.dueDate)}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {tasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => { setAddingTasks(false); setTaskSearch(''); }}
                    className="min-h-11 w-full rounded-xl py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
                  >
                    {text(
                      `Done (${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'})`,
                      `Fertig (${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'})`,
                    )}
                  </button>
                </div>
              )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Duration Wheel — Scrollable disc for time selection
// ═══════════════════════════════════════════════════════════

function DurationWheel({ value, onChange, presets }: {
  value: FlightDuration; 
  onChange: (d: FlightDuration) => void;
  presets?: typeof DURATION_PRESETS;
}) {
  const { lang, text } = useFlightLocale();
  const reduceMotion = useSettingsStore((state) => state.settings.accessibility.reduceMotion);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activePresets = presets || DURATION_PRESETS;
  const allDurations = useMemo<FlightDuration[]>(() => {
    const set = new Set<FlightDuration>();
    for (const preset of activePresets) {
      for (const d of preset.durations) set.add(d);
    }
    return [...set].sort((a, b) => a - b);
  }, [activePresets]);

  // Scroll to selected value on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const idx = allDurations.indexOf(value);
    if (idx < 0) return;
    const el = scrollRef.current.children[idx] as HTMLElement;
    if (el) {
      scrollRef.current.scrollTo({
        left: el.offsetLeft - scrollRef.current.offsetWidth / 2 + el.offsetWidth / 2,
        behavior: reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }, [allDurations, reduceMotion, value]);

  // Category label for a duration
  const getCategory = useCallback((d: FlightDuration): string => {
    for (const preset of activePresets) {
      if (preset.durations.includes(d)) return preset.label;
    }
    return '';
  }, [activePresets]);

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
              type="button"
              key={d}
              onClick={() => onChange(d)}
              aria-pressed={isSelected}
              aria-label={text(
                `Set duration to ${formatLocalizedFlightTime(d, lang)} (${localizedDurationCategory(category, lang)})`,
                `Dauer auf ${formatLocalizedFlightTime(d, lang)} festlegen (${localizedDurationCategory(category, lang)})`,
              )}
              className={cn(
                'shrink-0 snap-center rounded-2xl px-4 py-3 text-center transition-all active:scale-95 border min-w-[72px]',
                isSelected
                  ? 'scale-105 border-primary/30 bg-primary/10 text-foreground shadow-sm'
                  : 'border-border/30 text-muted-foreground/40 hover:border-border/50 hover:text-foreground/60'
              )}
            >
              <p className="text-[15px] font-bold tabular-nums">
                {formatLocalizedFlightTime(d, lang)}
              </p>
              <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-0.5 truncate max-w-[64px]">
                {localizedDurationCategory(category, lang)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Selection indicator */}
      <div className="flex justify-center mt-1">
        <div className="h-0.5 w-6 rounded-full bg-primary/30" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Logbook Card — Mini boarding pass for past flights
// ═══════════════════════════════════════════════════════════

function LogbookCard({ log }: { log: FlightLog }) {
  const { lang, text } = useFlightLocale();
  const date = new Date(log.startedAt);
  const validDate = !Number.isNaN(date.getTime());
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const dateStr = validDate
    ? date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' })
    : text('Date unavailable', 'Datum nicht verfügbar');
  const timeStr = validDate
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';
  const actualMin = Math.round(log.actualDuration / 60000);
  const completedTasks = log.tasks.filter((t) => t.completed).length;
  const logIsPrivate = log.flightClass === 'private';

  // ── Private: Charter manifest style ──
  if (logIsPrivate) {
    return (
      <div className={cn(
        'overflow-hidden rounded-2xl border bg-card transition-colors',
        log.completedNormally ? 'border-border/40' : 'border-amber-500/30'
      )}>
        {/* Shared status line */}
        <div className={cn(
          'h-[2px]',
          log.completedNormally
            ? 'bg-primary/30'
            : 'bg-amber-500/60'
        )} />

        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className={cn('h-3 w-3', log.completedNormally ? 'text-primary' : 'text-amber-500')} />
            <span className="text-[10px] font-mono font-bold tracking-wider text-muted-foreground">{log.flightNumber}</span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{dateStr} · {timeStr}</span>
        </div>

        {/* Route — larger, more dramatic */}
        <div className="px-4 py-2 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-2xl font-black leading-none tracking-tight text-foreground">{log.route.from.code}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{log.route.from.city}</p>
          </div>
          <div className="flex flex-col items-center gap-0.5 px-1">
            <div className="flex items-center gap-0.5">
              <div className="h-px w-4 bg-primary/30" />
              <div className="h-1.5 w-1.5 rounded-full border border-primary/40" />
              <div className="h-px w-3 bg-primary/20" />
              <Crown className="h-2.5 w-2.5 text-primary" />
              <div className="h-px w-3 bg-primary/20" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
              <div className="h-px w-4 bg-primary/30" />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatLocalizedFlightTime(actualMin, lang)}</span>
          </div>
          <div className="flex-1 text-right">
            <p className="text-2xl font-black leading-none tracking-tight text-foreground">{log.route.to.code}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{log.route.to.city}</p>
          </div>
        </div>

        {/* Bottom stats — minimal, elegant */}
        <div className="px-4 pb-3 pt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {log.tasks.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Target className="h-2.5 w-2.5 text-primary" />
                {completedTasks}/{log.tasks.length}
              </span>
            )}
            {!log.completedNormally && (
              <span className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">{text('Aborted', 'Abgebrochen')}</span>
            )}
          </div>
          {log.debrief.summary && (
            <span className="max-w-[140px] truncate text-[10px] italic text-muted-foreground">
              &ldquo;{log.debrief.summary}&rdquo;
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Commercial: Boarding pass stub style ──
  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-colors bg-card',
      log.completedNormally ? 'border-border/40' : 'border-amber-500/20'
    )}>
      {/* Airline header strip */}
      <div className={cn(
        'px-4 py-2 flex items-center justify-between',
        log.completedNormally ? 'bg-primary/10' : 'bg-amber-500/10'
      )}>
        <div className="flex items-center gap-2">
          <Plane className={cn('h-3 w-3', log.completedNormally ? 'text-primary' : 'text-amber-500')} />
          <span className="text-[10px] font-bold tracking-wider text-foreground">THREADMAP AIR</span>
          <span className="text-[10px] font-mono font-bold text-muted-foreground/50">{log.flightNumber}</span>
        </div>
        <span className="text-[11px] text-muted-foreground/30 font-mono">{dateStr}</span>
      </div>

      {/* Route row — boarding pass style */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">{text('From', 'Von')}</p>
          <p className="text-xl font-black tracking-tight leading-none mt-0.5">{log.route.from.code}</p>
          <p className="text-[10px] text-muted-foreground/30 mt-0.5">{log.route.from.city}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-1 shrink-0">
          <div className="flex items-center gap-0.5">
            <div className="h-px w-5 bg-primary/20" />
            <Plane className="h-3 w-3 text-primary" />
            <div className="h-px w-5 bg-primary/20" />
          </div>
          <span className="text-[10px] text-muted-foreground/45 tabular-nums">{formatLocalizedFlightTime(actualMin, lang)}</span>
        </div>
        <div className="flex-1 text-right">
          <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider">{text('To', 'Nach')}</p>
          <p className="text-xl font-black tracking-tight leading-none mt-0.5">{log.route.to.code}</p>
          <p className="text-[10px] text-muted-foreground/30 mt-0.5">{log.route.to.city}</p>
        </div>
      </div>

      {/* Tear line */}
      <div className="relative mx-0">
        <div className="border-t border-dashed border-border/25" />
        <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-background" />
        <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-background" />
      </div>

      {/* Bottom stub — stats */}
      <div className="px-4 py-2.5 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3 text-muted-foreground/35">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {timeStr}
          </span>
          {log.tasks.length > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-2.5 w-2.5" />
              {completedTasks}/{log.tasks.length}
            </span>
          )}
          {log.turbulence.length > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="h-2.5 w-2.5" />
              {log.turbulence.length}
            </span>
          )}
          {!log.completedNormally && (
            <span className="font-medium uppercase text-amber-700 dark:text-amber-300">{text('Diverted', 'Umgeleitet')}</span>
          )}
        </div>
        {log.debrief.summary && (
          <span className="text-[10px] text-muted-foreground/45 italic truncate max-w-[120px]">
            &ldquo;{log.debrief.summary}&rdquo;
          </span>
        )}
      </div>

      {/* Mini barcode */}
      <div className="px-4 pb-2.5">
        <div className="flex items-center justify-center gap-[1.5px] h-4 overflow-hidden opacity-10">
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              className="bg-foreground rounded-[0.5px]"
              style={{
                width: [1, 2, 1.5][Math.abs((log.flightNumber || 'OA').charCodeAt(i % (log.flightNumber.length || 1)) + i) % 3] + 'px',
                height: '100%',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
