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

export type FlightStatus = 'preflight' | 'inflight' | 'paused' | 'diverted' | 'debrief';

export interface Airport {
  code: string;
  name: string;
  city: string;
  region: 'europe' | 'americas' | 'asia' | 'middle-east' | 'africa' | 'oceania';
}

export interface FlightRoute {
  from: Airport;
  to: Airport;
  distanceKm: number;     // Approximate real distance
  realFlightMin: number;   // Approximate real flight time
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
  completedNormally: boolean; // false if diverted/aborted
  debrief: {
    summary?: string;
    nextAction?: string;
    turbulenceTags?: string[];
  };
  userId: string;
}

// ─── Real Airports ─────────────────────────────────────────

export const AIRPORTS: Airport[] = [
  // Europe
  { code: 'MUC', name: 'Franz Josef Strauss', city: 'Munich', region: 'europe' },
  { code: 'LHR', name: 'Heathrow', city: 'London', region: 'europe' },
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', region: 'europe' },
  { code: 'FCO', name: 'Fiumicino', city: 'Rome', region: 'europe' },
  { code: 'BCN', name: 'El Prat', city: 'Barcelona', region: 'europe' },
  { code: 'AMS', name: 'Schiphol', city: 'Amsterdam', region: 'europe' },
  { code: 'FRA', name: 'Frankfurt', city: 'Frankfurt', region: 'europe' },
  { code: 'ZRH', name: 'Kloten', city: 'Zürich', region: 'europe' },
  { code: 'VIE', name: 'Schwechat', city: 'Vienna', region: 'europe' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', region: 'europe' },
  { code: 'ATH', name: 'Eleftherios Venizelos', city: 'Athens', region: 'europe' },
  { code: 'LIS', name: 'Humberto Delgado', city: 'Lisbon', region: 'europe' },
  // Americas
  { code: 'JFK', name: 'John F. Kennedy', city: 'New York', region: 'americas' },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', region: 'americas' },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', region: 'americas' },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', region: 'americas' },
  { code: 'ORD', name: "O'Hare", city: 'Chicago', region: 'americas' },
  { code: 'GRU', name: 'Guarulhos', city: 'São Paulo', region: 'americas' },
  { code: 'YYZ', name: 'Pearson', city: 'Toronto', region: 'americas' },
  // Asia
  { code: 'NRT', name: 'Narita', city: 'Tokyo', region: 'asia' },
  { code: 'HND', name: 'Haneda', city: 'Tokyo', region: 'asia' },
  { code: 'ICN', name: 'Incheon', city: 'Seoul', region: 'asia' },
  { code: 'SIN', name: 'Changi', city: 'Singapore', region: 'asia' },
  { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', region: 'asia' },
  { code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', region: 'asia' },
  { code: 'DEL', name: 'Indira Gandhi', city: 'Delhi', region: 'asia' },
  // Middle East
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', region: 'middle-east' },
  { code: 'DOH', name: 'Hamad Intl', city: 'Doha', region: 'middle-east' },
  // Oceania
  { code: 'SYD', name: 'Kingsford Smith', city: 'Sydney', region: 'oceania' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', region: 'oceania' },
  // Africa
  { code: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', region: 'africa' },
  { code: 'JNB', name: 'O.R. Tambo', city: 'Johannesburg', region: 'africa' },
];

// ─── Real Route Data (distance km + actual flight time min) ──

interface RouteData {
  distanceKm: number;
  flightMin: number; // Actual scheduled flight time (gate-to-gate)
}

const ROUTES: Record<string, RouteData> = {
  // ── Short-haul Europe (under 2h) ──
  'MUC-ZRH': { distanceKm: 240, flightMin: 55 },
  'MUC-VIE': { distanceKm: 360, flightMin: 65 },
  'MUC-FRA': { distanceKm: 300, flightMin: 60 },
  'MUC-FCO': { distanceKm: 690, flightMin: 95 },
  'MUC-CDG': { distanceKm: 690, flightMin: 95 },
  'LHR-CDG': { distanceKm: 340, flightMin: 75 },
  'LHR-AMS': { distanceKm: 370, flightMin: 75 },
  'LHR-FRA': { distanceKm: 660, flightMin: 100 },
  'LHR-BCN': { distanceKm: 1140, flightMin: 130 },
  'CDG-BCN': { distanceKm: 830, flightMin: 110 },
  'CDG-AMS': { distanceKm: 400, flightMin: 75 },
  'CDG-FCO': { distanceKm: 1100, flightMin: 125 },
  'CDG-LIS': { distanceKm: 1450, flightMin: 155 },
  'FRA-AMS': { distanceKm: 365, flightMin: 75 },
  'FRA-VIE': { distanceKm: 600, flightMin: 85 },
  'FRA-BCN': { distanceKm: 1100, flightMin: 125 },
  'FRA-ATH': { distanceKm: 1800, flightMin: 175 },
  'AMS-BCN': { distanceKm: 1240, flightMin: 135 },
  'BCN-LIS': { distanceKm: 1000, flightMin: 130 },
  'BCN-FCO': { distanceKm: 860, flightMin: 110 },
  'ATH-IST': { distanceKm: 530, flightMin: 80 },
  'VIE-ATH': { distanceKm: 1280, flightMin: 145 },
  'ZRH-LHR': { distanceKm: 780, flightMin: 105 },
  'ZRH-BCN': { distanceKm: 840, flightMin: 110 },
  'LIS-LHR': { distanceKm: 1550, flightMin: 155 },
  'FCO-ATH': { distanceKm: 1050, flightMin: 125 },
  // ── Medium-haul (2h – 6h) ──
  'LHR-IST': { distanceKm: 2500, flightMin: 225 },
  'LHR-ATH': { distanceKm: 2400, flightMin: 215 },
  'CDG-IST': { distanceKm: 2250, flightMin: 210 },
  'FRA-IST': { distanceKm: 1860, flightMin: 185 },
  'LHR-DXB': { distanceKm: 5470, flightMin: 415 },
  'CDG-DXB': { distanceKm: 5250, flightMin: 395 },
  'MUC-DXB': { distanceKm: 4600, flightMin: 365 },
  'IST-DXB': { distanceKm: 3000, flightMin: 255 },
  'IST-DOH': { distanceKm: 2700, flightMin: 240 },
  'JFK-MIA': { distanceKm: 1760, flightMin: 185 },
  'JFK-ORD': { distanceKm: 1180, flightMin: 150 },
  'JFK-YYZ': { distanceKm: 560, flightMin: 90 },
  'LAX-SFO': { distanceKm: 540, flightMin: 80 },
  'JNB-CPT': { distanceKm: 1270, flightMin: 130 },
  // ── Long-haul (6h – 10h) ──
  'LHR-JFK': { distanceKm: 5540, flightMin: 450 },
  'CDG-JFK': { distanceKm: 5840, flightMin: 470 },
  'FRA-JFK': { distanceKm: 6200, flightMin: 500 },
  'JFK-LAX': { distanceKm: 3980, flightMin: 330 },
  'JFK-SFO': { distanceKm: 4150, flightMin: 345 },
  'JFK-GRU': { distanceKm: 7680, flightMin: 600 },
  'DXB-SIN': { distanceKm: 5840, flightMin: 430 },
  'SIN-HKG': { distanceKm: 2580, flightMin: 235 },
  'SIN-NRT': { distanceKm: 5320, flightMin: 415 },
  'BKK-SIN': { distanceKm: 1420, flightMin: 145 },
  'BKK-HKG': { distanceKm: 1700, flightMin: 165 },
  'ICN-NRT': { distanceKm: 1200, flightMin: 140 },
  'JNB-DXB': { distanceKm: 6340, flightMin: 490 },
  'SYD-AKL': { distanceKm: 2160, flightMin: 195 },
  // ── Ultra long-haul (10h+) ──
  'LHR-SIN': { distanceKm: 10870, flightMin: 775 },
  'LHR-HKG': { distanceKm: 9650, flightMin: 720 },
  'LHR-NRT': { distanceKm: 9570, flightMin: 715 },
  'LHR-LAX': { distanceKm: 8760, flightMin: 660 },
  'CDG-NRT': { distanceKm: 9720, flightMin: 720 },
  'CDG-SIN': { distanceKm: 10730, flightMin: 770 },
  'CDG-LAX': { distanceKm: 9100, flightMin: 680 },
  'FRA-NRT': { distanceKm: 9350, flightMin: 700 },
  'FRA-SIN': { distanceKm: 10250, flightMin: 745 },
  'FRA-SYD': { distanceKm: 16500, flightMin: 1260 },
  'DXB-NRT': { distanceKm: 7930, flightMin: 585 },
  'DXB-SYD': { distanceKm: 12050, flightMin: 860 },
  'JFK-NRT': { distanceKm: 10840, flightMin: 810 },
  'JFK-SIN': { distanceKm: 15340, flightMin: 1100 },
  'LAX-NRT': { distanceKm: 8800, flightMin: 665 },
  'LAX-SYD': { distanceKm: 12070, flightMin: 895 },
  'LAX-SIN': { distanceKm: 14100, flightMin: 1070 },
  'SIN-SYD': { distanceKm: 6300, flightMin: 475 },
  'NRT-SYD': { distanceKm: 7830, flightMin: 580 },
  'HKG-SYD': { distanceKm: 7400, flightMin: 555 },
  'DEL-LHR': { distanceKm: 6700, flightMin: 530 },
  'DEL-DXB': { distanceKm: 2200, flightMin: 215 },
  'DEL-SIN': { distanceKm: 4150, flightMin: 345 },
};

function getRouteData(from: string, to: string): RouteData | undefined {
  return ROUTES[`${from}-${to}`] || ROUTES[`${to}-${from}`];
}

/** Format flight time as "Xh Ym" */
export function formatFlightTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Route Selection for Duration ──────────────────────────

/** Get a route that makes sense for the selected focus duration */
export function getRouteForDuration(duration: FlightDuration, seed?: number): FlightRoute {
  // Map focus duration to real-world flight time ranges (minutes)
  const rangeMap: Record<FlightDuration, [number, number]> = {
    25:  [50, 100],      // Short European hops: MUC-ZRH (55m), MUC-FRA (60m)
    35:  [60, 120],      // Short-haul: LHR-CDG (75m), ATH-IST (80m)
    50:  [80, 160],      // Medium short-haul: MUC-FCO (95m), LHR-BCN (130m)
    75:  [130, 260],     // Medium-haul: FRA-ATH (175m), IST-DXB (255m)
    90:  [180, 420],     // Medium to long: LHR-IST (225m), MUC-DXB (365m)
    120: [300, 1300],    // Long-haul: JFK-LAX (330m), LHR-SIN (775m)
  };

  const [minMin, maxMin] = rangeMap[duration];
  
  // Find all routes that fit the range
  const candidates: { from: Airport; to: Airport; dist: number; flightMin: number }[] = [];
  
  for (const [key, data] of Object.entries(ROUTES)) {
    if (data.flightMin >= minMin && data.flightMin <= maxMin) {
      const [fromCode, toCode] = key.split('-');
      const fromAirport = AIRPORTS.find((a) => a.code === fromCode);
      const toAirport = AIRPORTS.find((a) => a.code === toCode);
      if (fromAirport && toAirport) {
        candidates.push({ from: fromAirport, to: toAirport, dist: data.distanceKm, flightMin: data.flightMin });
      }
    }
  }

  if (candidates.length === 0) {
    // Fallback: pick two random airports
    const from = AIRPORTS[0];
    const to = AIRPORTS[1];
    return { from, to, distanceKm: 500, realFlightMin: 60 };
  }

  // Use seed or random
  const idx = seed !== undefined
    ? Math.abs(seed) % candidates.length
    : Math.floor(Math.random() * candidates.length);
  const pick = candidates[idx];

  // Randomly flip direction
  const flip = (seed !== undefined ? seed : Math.floor(Math.random() * 100)) % 2 === 0;

  return {
    from: flip ? pick.to : pick.from,
    to: flip ? pick.from : pick.to,
    distanceKm: pick.dist,
    realFlightMin: pick.flightMin,
  };
}

// ─── Duration Categories ───────────────────────────────────

export const DURATION_PRESETS: {
  category: FlightCategory;
  label: string;
  durations: FlightDuration[];
}[] = [
  { category: 'short-haul', label: 'Short-haul', durations: [25, 35, 50] },
  { category: 'medium', label: 'Medium-haul', durations: [75, 90] },
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

// ─── Turbulence Types ──────────────────────────────────────

export const TURBULENCE_TYPES: { type: TurbulenceLog['type']; label: string; emoji: string }[] = [
  { type: 'phone', label: 'Phone', emoji: '📱' },
  { type: 'thought', label: 'Thought', emoji: '💭' },
  { type: 'notification', label: 'Notification', emoji: '🔔' },
  { type: 'person', label: 'Person', emoji: '🗣️' },
  { type: 'other', label: 'Other', emoji: '⚡' },
];
