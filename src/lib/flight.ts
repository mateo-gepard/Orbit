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

// ─── Real-ish Route Distances (km) ────────────────────────

const ROUTE_DISTANCES: Record<string, number> = {
  // Short-haul Europe (25-50 min focus = ~300-1500 km)
  'MUC-ZRH': 240, 'MUC-VIE': 360, 'MUC-FRA': 300, 'MUC-FCO': 690, 'MUC-CDG': 690,
  'LHR-CDG': 340, 'LHR-AMS': 370, 'LHR-FRA': 660, 'LHR-BCN': 1140,
  'CDG-BCN': 830, 'CDG-AMS': 400, 'CDG-FCO': 1100, 'CDG-LIS': 1450,
  'FRA-AMS': 365, 'FRA-VIE': 600, 'FRA-BCN': 1100, 'FRA-ATH': 1800,
  'AMS-BCN': 1240, 'BCN-LIS': 1000, 'BCN-FCO': 860, 'ATH-IST': 530,
  'VIE-ATH': 1280, 'ZRH-LHR': 780, 'ZRH-BCN': 840,
  // Medium-haul (75-90 min focus = ~1500-4500 km)
  'LHR-IST': 2500, 'LHR-ATH': 2400, 'CDG-IST': 2250, 'FRA-IST': 1860,
  'LHR-JFK': 5540, 'CDG-JFK': 5840, 'FRA-JFK': 6200,
  'MUC-DXB': 4600, 'LHR-DXB': 5470, 'CDG-DXB': 5250,
  'IST-DXB': 3000, 'IST-DOH': 2700,
  'JFK-MIA': 1760, 'JFK-ORD': 1180, 'JFK-LAX': 3980, 'JFK-SFO': 4150,
  'LAX-SFO': 540, 'JFK-YYZ': 560,
  // Long-haul (120 min focus = ~4500+ km)
  'LHR-SIN': 10870, 'LHR-HKG': 9650, 'LHR-NRT': 9570, 'LHR-LAX': 8760,
  'CDG-NRT': 9720, 'CDG-SIN': 10730, 'CDG-LAX': 9100,
  'FRA-NRT': 9350, 'FRA-SIN': 10250, 'FRA-SYD': 16500,
  'DXB-SIN': 5840, 'DXB-NRT': 7930, 'DXB-SYD': 12050,
  'JFK-NRT': 10840, 'JFK-SIN': 15340, 'JFK-GRU': 7680,
  'LAX-NRT': 8800, 'LAX-SYD': 12070, 'LAX-SIN': 14100,
  'SIN-SYD': 6300, 'SIN-NRT': 5320, 'SIN-HKG': 2580,
  'NRT-SYD': 7830, 'HKG-SYD': 7400,
  'ICN-NRT': 1200, 'BKK-SIN': 1420, 'BKK-HKG': 1700,
  'SYD-AKL': 2160, 'JNB-CPT': 1270, 'JNB-DXB': 6340,
};

function getRouteDistance(from: string, to: string): number | undefined {
  return ROUTE_DISTANCES[`${from}-${to}`] || ROUTE_DISTANCES[`${to}-${from}`];
}

/** Approximate real flight time in minutes from distance */
function estimateFlightMinutes(distanceKm: number): number {
  // Cruise speed ~850 km/h, plus 30 min for taxi/takeoff/landing
  return Math.round(distanceKm / 850 * 60 + 30);
}

// ─── Route Selection for Duration ──────────────────────────

/** Get a route that makes sense for the selected focus duration */
export function getRouteForDuration(duration: FlightDuration, seed?: number): FlightRoute {
  // Map focus duration to rough real-world flight time ranges
  const rangeMap: Record<FlightDuration, [number, number]> = {
    25:  [40, 120],      // Short European hops
    35:  [60, 150],      // Short-haul
    50:  [90, 210],      // Medium short-haul  
    75:  [150, 400],     // Medium-haul
    90:  [200, 600],     // Medium to long
    120: [400, 1500],    // Long-haul
  };

  const [minMin, maxMin] = rangeMap[duration];
  
  // Find all routes that fit the range
  const candidates: { from: Airport; to: Airport; dist: number; flightMin: number }[] = [];
  
  for (const [key, dist] of Object.entries(ROUTE_DISTANCES)) {
    const flightMin = estimateFlightMinutes(dist);
    if (flightMin >= minMin && flightMin <= maxMin) {
      const [fromCode, toCode] = key.split('-');
      const fromAirport = AIRPORTS.find((a) => a.code === fromCode);
      const toAirport = AIRPORTS.find((a) => a.code === toCode);
      if (fromAirport && toAirport) {
        candidates.push({ from: fromAirport, to: toAirport, dist, flightMin });
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
