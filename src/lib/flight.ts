import type { OrbitItem } from './types';

// ═══════════════════════════════════════════════════════════
// ORBIT — Flight Engine
// Focus sessions modeled as flights with phases, routes,
// boarding passes, and a logbook.
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────

export type FlightPhase =
  | 'boarding'    // prep phase
  | 'taxi'        // buffer
  | 'takeoff'     // commitment moment
  | 'cruise'      // deep work
  | 'descent'     // wrap-up
  | 'landed'      // finalize
  | 'debrief';    // reflection

export type FlightDuration = 25 | 35 | 50 | 75 | 90 | 120;

export type FlightCategory = 'short-haul' | 'medium' | 'long-haul';

export interface Airport {
  code: string;
  name: string;
}

export interface FlightRoute {
  from: Airport;
  to: Airport;
}

export interface FlightTask {
  id: string;        // OrbitItem id
  title: string;
  type: 'primary' | 'carry-on';
  completed: boolean;
}

export interface TurbulenceLog {
  timestamp: number;
  type: 'phone' | 'thought' | 'notification' | 'person' | 'other';
}

export interface FlightLog {
  id: string;
  flightNumber: string;
  route: FlightRoute;
  duration: FlightDuration;
  actualDuration: number;     // ms
  startedAt: number;          // timestamp
  endedAt: number;            // timestamp
  tasks: FlightTask[];
  turbulence: TurbulenceLog[];
  debrief: {
    summary?: string;
    nextAction?: string;
    turbulenceTags?: string[];
  };
  userId: string;
}

// ─── Default Airports ──────────────────────────────────────

export const DEFAULT_AIRPORTS: Airport[] = [
  { code: 'HOM', name: 'Home' },
  { code: 'DSK', name: 'Desk' },
  { code: 'DWP', name: 'Deep Work' },
  { code: 'DON', name: 'Done' },
  { code: 'LIB', name: 'Library' },
  { code: 'CAF', name: 'Café' },
  // Real airports users might enjoy
  { code: 'MUC', name: 'Munich' },
  { code: 'LHR', name: 'London Heathrow' },
  { code: 'JFK', name: 'New York JFK' },
  { code: 'LAX', name: 'Los Angeles' },
  { code: 'NRT', name: 'Tokyo Narita' },
  { code: 'CDG', name: 'Paris CDG' },
  { code: 'SIN', name: 'Singapore' },
  { code: 'DXB', name: 'Dubai' },
];

export const DEFAULT_ROUTE: FlightRoute = {
  from: { code: 'DSK', name: 'Desk' },
  to: { code: 'DON', name: 'Done' },
};

// ─── Duration Categories ───────────────────────────────────

export const DURATION_PRESETS: {
  category: FlightCategory;
  label: string;
  durations: FlightDuration[];
}[] = [
  { category: 'short-haul', label: 'Short-haul', durations: [25, 35, 50] },
  { category: 'medium', label: 'Medium', durations: [75, 90] },
  { category: 'long-haul', label: 'Long-haul', durations: [120] },
];

// ─── Phase Timing ──────────────────────────────────────────

export interface PhaseConfig {
  phase: FlightPhase;
  label: string;
  durationSec: number;
}

export function getPhaseConfig(totalMinutes: FlightDuration): PhaseConfig[] {
  const cruiseMinutes = totalMinutes - 8; // 8 minutes for non-cruise phases

  return [
    { phase: 'boarding',  label: 'Boarding',  durationSec: 120 },  // 2m
    { phase: 'taxi',      label: 'Taxi',      durationSec: 60 },   // 1m
    { phase: 'takeoff',   label: 'Takeoff',   durationSec: 120 },  // 2m
    { phase: 'cruise',    label: 'Cruise',    durationSec: cruiseMinutes * 60 },
    { phase: 'descent',   label: 'Descent',   durationSec: 120 },  // 2m
    { phase: 'landed',    label: 'Landing',   durationSec: 60 },   // 1m
  ];
}

export function getCurrentPhase(
  elapsedSec: number,
  totalMinutes: FlightDuration
): { phase: FlightPhase; label: string; progress: number; phaseProgress: number } {
  const phases = getPhaseConfig(totalMinutes);
  const totalSec = totalMinutes * 60;
  let accumulated = 0;

  for (const p of phases) {
    if (elapsedSec < accumulated + p.durationSec) {
      const phaseElapsed = elapsedSec - accumulated;
      return {
        phase: p.phase,
        label: p.label,
        progress: Math.min(elapsedSec / totalSec, 1),
        phaseProgress: Math.min(phaseElapsed / p.durationSec, 1),
      };
    }
    accumulated += p.durationSec;
  }

  return { phase: 'landed', label: 'Landed', progress: 1, phaseProgress: 1 };
}

// ─── Flight Number Generator ───────────────────────────────

let flightCounter = Math.floor(Math.random() * 900) + 100;

export function generateFlightNumber(): string {
  flightCounter++;
  return `OF-${flightCounter}`;
}

// ─── Task Selection Helpers ────────────────────────────────

export function selectFlightTasks(items: OrbitItem[]): FlightTask[] {
  const activeTasks = items
    .filter((i) => i.type === 'task' && i.status === 'active')
    .sort((a, b) => {
      // High priority first
      const pMap = { high: 0, medium: 1, low: 2 };
      const pa = pMap[a.priority || 'low'];
      const pb = pMap[b.priority || 'low'];
      if (pa !== pb) return pa - pb;
      // Due date sooner first
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.updatedAt - a.updatedAt;
    });

  const primary = activeTasks.slice(0, 3).map((t) => ({
    id: t.id,
    title: t.title,
    type: 'primary' as const,
    completed: false,
  }));

  const carryOn = activeTasks.slice(3, 8).map((t) => ({
    id: t.id,
    title: t.title,
    type: 'carry-on' as const,
    completed: false,
  }));

  return [...primary, ...carryOn];
}

// ─── Turbulence Types ──────────────────────────────────────

export const TURBULENCE_TYPES: { type: TurbulenceLog['type']; label: string; emoji: string }[] = [
  { type: 'phone', label: 'Phone', emoji: '📱' },
  { type: 'thought', label: 'Thought', emoji: '💭' },
  { type: 'notification', label: 'Notification', emoji: '🔔' },
  { type: 'person', label: 'Person', emoji: '🗣️' },
  { type: 'other', label: 'Other', emoji: '⚡' },
];
