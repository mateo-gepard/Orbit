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

export type FlightDuration = 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 | 90 | 100 | 110 | 120 | 135 | 150 | 165 | 180 | 210 | 225 | 240 | 270 | 300 | 330 | 360 | 375 | 390 | 420;

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
  { code: 'BER', name: 'Brandenburg', city: 'Berlin', region: 'europe' },
  { code: 'MAD', name: 'Barajas', city: 'Madrid', region: 'europe' },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', region: 'europe' },
  { code: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', region: 'europe' },
  { code: 'TLL', name: 'Lennart Meri', city: 'Tallinn', region: 'europe' },
  { code: 'KEF', name: 'Keflavík', city: 'Reykjavík', region: 'europe' },
  // Americas
  { code: 'JFK', name: 'John F. Kennedy', city: 'New York', region: 'americas' },
  { code: 'LGA', name: 'LaGuardia', city: 'New York', region: 'americas' },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', region: 'americas' },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', region: 'americas' },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', region: 'americas' },
  { code: 'ORD', name: "O'Hare", city: 'Chicago', region: 'americas' },
  { code: 'GRU', name: 'Guarulhos', city: 'São Paulo', region: 'americas' },
  { code: 'YYZ', name: 'Pearson', city: 'Toronto', region: 'americas' },
  { code: 'IAH', name: 'George Bush', city: 'Houston', region: 'americas' },
  { code: 'AUS', name: 'Austin-Bergstrom', city: 'Austin', region: 'americas' },
  { code: 'BOS', name: 'Logan', city: 'Boston', region: 'americas' },
  { code: 'IAD', name: 'Dulles', city: 'Washington DC', region: 'americas' },
  { code: 'BOG', name: 'El Dorado', city: 'Bogotá', region: 'americas' },
  // Asia
  { code: 'NRT', name: 'Narita', city: 'Tokyo', region: 'asia' },
  { code: 'HND', name: 'Haneda', city: 'Tokyo', region: 'asia' },
  { code: 'ITM', name: 'Itami', city: 'Osaka', region: 'asia' },
  { code: 'ICN', name: 'Incheon', city: 'Seoul', region: 'asia' },
  { code: 'SIN', name: 'Changi', city: 'Singapore', region: 'asia' },
  { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', region: 'asia' },
  { code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', region: 'asia' },
  { code: 'DEL', name: 'Indira Gandhi', city: 'Delhi', region: 'asia' },
  { code: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', region: 'asia' },
  { code: 'TPE', name: 'Taoyuan', city: 'Taipei', region: 'asia' },
  { code: 'BOM', name: 'Chhatrapati Shivaji', city: 'Mumbai', region: 'asia' },
  // Middle East
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', region: 'middle-east' },
  { code: 'DOH', name: 'Hamad Intl', city: 'Doha', region: 'middle-east' },
  { code: 'BAH', name: 'Bahrain Intl', city: 'Bahrain', region: 'middle-east' },
  { code: 'MCT', name: 'Muscat Intl', city: 'Muscat', region: 'middle-east' },
  // Oceania
  { code: 'SYD', name: 'Kingsford Smith', city: 'Sydney', region: 'oceania' },
  { code: 'MEL', name: 'Tullamarine', city: 'Melbourne', region: 'oceania' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', region: 'oceania' },
  { code: 'WLG', name: 'Wellington Airport', city: 'Wellington', region: 'oceania' },
  { code: 'PER', name: 'Perth Airport', city: 'Perth', region: 'oceania' },
  { code: 'DRW', name: 'Darwin Intl', city: 'Darwin', region: 'oceania' },
  // Africa
  { code: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', region: 'africa' },
  { code: 'JNB', name: 'O.R. Tambo', city: 'Johannesburg', region: 'africa' },
  { code: 'CAI', name: 'Cairo Intl', city: 'Cairo', region: 'africa' },
  { code: 'FIH', name: "N'djili", city: 'Kinshasa', region: 'africa' },
  { code: 'BZV', name: 'Maya-Maya', city: 'Brazzaville', region: 'africa' },
  // Caribbean
  { code: 'SXM', name: 'Princess Juliana', city: 'St. Maarten', region: 'americas' },
  { code: 'SBH', name: 'Gustaf III', city: 'St. Barths', region: 'americas' },
];

// ─── Flight Routes (real routes with real flight times) ────

export interface FlightRouteData {
  id: string;
  from: string;
  to: string;
  cityFrom: string;
  cityTo: string;
  min: number; // Real scheduled flight time in minutes
}

export const FLIGHT_ROUTES: FlightRouteData[] = [
  // ─── Ultra Short (20-45m) ───
  { id: 'SXM-SBH', from: 'SXM', to: 'SBH', cityFrom: 'St. Maarten', cityTo: 'St. Barths', min: 20 },
  { id: 'FIH-BZV', from: 'FIH', to: 'BZV', cityFrom: 'Kinshasa', cityTo: 'Brazzaville', min: 25 },
  { id: 'HEL-TLL', from: 'HEL', to: 'TLL', cityFrom: 'Helsinki', cityTo: 'Tallinn', min: 30 },
  { id: 'DOH-BAH', from: 'DOH', to: 'BAH', cityFrom: 'Doha', cityTo: 'Bahrain', min: 35 },
  { id: 'AMS-BRU', from: 'AMS', to: 'BRU', cityFrom: 'Amsterdam', cityTo: 'Brussels', min: 40 },
  { id: 'MUC-ZRH', from: 'MUC', to: 'ZRH', cityFrom: 'Munich', cityTo: 'Zürich', min: 45 },

  // ─── Short Commute (50m - 1h 15m) ───
  { id: 'IAH-AUS', from: 'IAH', to: 'AUS', cityFrom: 'Houston', cityTo: 'Austin', min: 50 },
  { id: 'SFO-LAX', from: 'SFO', to: 'LAX', cityFrom: 'San Francisco', cityTo: 'Los Angeles', min: 55 },
  { id: 'SIN-KUL', from: 'SIN', to: 'KUL', cityFrom: 'Singapore', cityTo: 'Kuala Lumpur', min: 60 },
  { id: 'HND-ITM', from: 'HND', to: 'ITM', cityFrom: 'Tokyo', cityTo: 'Osaka', min: 65 },
  { id: 'DXB-MCT', from: 'DXB', to: 'MCT', cityFrom: 'Dubai', cityTo: 'Muscat', min: 70 },
  { id: 'LHR-CDG', from: 'LHR', to: 'CDG', cityFrom: 'London', cityTo: 'Paris', min: 75 },

  // ─── Medium Range (1h 20m - 2h 30m) ───
  { id: 'LGA-YYZ', from: 'LGA', to: 'YYZ', cityFrom: 'New York', cityTo: 'Toronto', min: 80 },
  { id: 'SYD-MEL', from: 'SYD', to: 'MEL', cityFrom: 'Sydney', cityTo: 'Melbourne', min: 90 },
  { id: 'BER-ZRH', from: 'BER', to: 'ZRH', cityFrom: 'Berlin', cityTo: 'Zurich', min: 100 },
  { id: 'HKG-TPE', from: 'HKG', to: 'TPE', cityFrom: 'Hong Kong', cityTo: 'Taipei', min: 110 },
  { id: 'AKL-WLG', from: 'AKL', to: 'WLG', cityFrom: 'Auckland', cityTo: 'Wellington', min: 120 },
  { id: 'LHR-MAD', from: 'LHR', to: 'MAD', cityFrom: 'London', cityTo: 'Madrid', min: 135 },
  { id: 'MIA-JFK', from: 'MIA', to: 'JFK', cityFrom: 'Miami', cityTo: 'New York', min: 150 },

  // ─── Long Range (2h 45m - 5h) ───
  { id: 'NRT-ICN', from: 'NRT', to: 'ICN', cityFrom: 'Tokyo', cityTo: 'Seoul', min: 165 },
  { id: 'BOM-DXB', from: 'BOM', to: 'DXB', cityFrom: 'Mumbai', cityTo: 'Dubai', min: 180 },
  { id: 'DRW-SIN', from: 'DRW', to: 'SIN', cityFrom: 'Darwin', cityTo: 'Singapore', min: 210 },
  { id: 'CAI-LHR', from: 'CAI', to: 'LHR', cityFrom: 'Cairo', cityTo: 'London', min: 225 },
  { id: 'LAX-ORD', from: 'LAX', to: 'ORD', cityFrom: 'Los Angeles', cityTo: 'Chicago', min: 240 },
  { id: 'BOG-MIA', from: 'BOG', to: 'MIA', cityFrom: 'Bogotá', cityTo: 'Miami', min: 270 },

  // ─── Marathon / Transcontinental (5h+) ───
  { id: 'BOS-KEF', from: 'BOS', to: 'KEF', cityFrom: 'Boston', cityTo: 'Reykjavík', min: 300 },
  { id: 'JFK-LAX', from: 'JFK', to: 'LAX', cityFrom: 'New York', cityTo: 'Los Angeles', min: 330 },
  { id: 'SIN-PER', from: 'SIN', to: 'PER', cityFrom: 'Singapore', cityTo: 'Perth', min: 360 },
  { id: 'DXB-LHR', from: 'DXB', to: 'LHR', cityFrom: 'Dubai', cityTo: 'London', min: 375 },
  { id: 'CDG-JFK', from: 'CDG', to: 'JFK', cityFrom: 'Paris', cityTo: 'New York', min: 390 },
  { id: 'LHR-IAD', from: 'LHR', to: 'IAD', cityFrom: 'London', cityTo: 'Washington DC', min: 420 },
];

// Build a lookup map for fast route resolution (works both directions)
const _routeMap = new Map<string, FlightRouteData>();
for (const r of FLIGHT_ROUTES) {
  _routeMap.set(`${r.from}-${r.to}`, r);
  _routeMap.set(`${r.to}-${r.from}`, r);
}

/** Lookup flight time between two airports (either direction). Returns minutes or undefined. */
export function getFlightTimeBetween(fromCode: string, toCode: string): number | undefined {
  const route = _routeMap.get(`${fromCode}-${toCode}`);
  return route?.min;
}

// Rough great-circle distance estimates for display
const DISTANCE_ESTIMATES: Record<string, number> = {
  'SXM-SBH': 25, 'FIH-BZV': 10, 'HEL-TLL': 80, 'DOH-BAH': 150,
  'AMS-BRU': 175, 'MUC-ZRH': 240, 'IAH-AUS': 235, 'SFO-LAX': 540, 'SIN-KUL': 315,
  'HND-ITM': 400, 'DXB-MCT': 340, 'LHR-CDG': 340, 'LGA-YYZ': 560,
  'SYD-MEL': 710, 'BER-ZRH': 680, 'HKG-TPE': 820, 'AKL-WLG': 480,
  'LHR-MAD': 1260, 'MIA-JFK': 1760, 'NRT-ICN': 1200, 'BOM-DXB': 1930,
  'DRW-SIN': 3350, 'CAI-LHR': 3520, 'LAX-ORD': 2810, 'BOG-MIA': 2590,
  'BOS-KEF': 4000, 'JFK-LAX': 3980, 'SIN-PER': 4930, 'DXB-LHR': 5470,
  'CDG-JFK': 5840, 'LHR-IAD': 5900,
};

function getDistanceEstimate(fromCode: string, toCode: string): number {
  return DISTANCE_ESTIMATES[`${fromCode}-${toCode}`]
    ?? DISTANCE_ESTIMATES[`${toCode}-${fromCode}`]
    ?? 1000; // Fallback
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

/**
 * The focus duration IS the real flight time.
 * Each FlightDuration maps 1:1 to a FLIGHT_ROUTES entry.
 */
export function getRouteForDuration(duration: FlightDuration): FlightRoute {
  // Find the route whose real flight time matches the focus duration
  const match = FLIGHT_ROUTES.find((r) => r.min === duration);

  if (!match) {
    // Fallback: pick the closest route
    const sorted = [...FLIGHT_ROUTES].sort((a, b) => Math.abs(a.min - duration) - Math.abs(b.min - duration));
    const closest = sorted[0];
    const fromAirport = AIRPORTS.find((a) => a.code === closest.from)!;
    const toAirport = AIRPORTS.find((a) => a.code === closest.to)!;
    return {
      from: fromAirport,
      to: toAirport,
      distanceKm: getDistanceEstimate(closest.from, closest.to),
      realFlightMin: closest.min,
    };
  }

  const fromAirport = AIRPORTS.find((a) => a.code === match.from)!;
  const toAirport = AIRPORTS.find((a) => a.code === match.to)!;

  // Randomly flip direction
  const flip = Math.random() > 0.5;

  return {
    from: flip ? toAirport : fromAirport,
    to: flip ? fromAirport : toAirport,
    distanceKm: getDistanceEstimate(match.from, match.to),
    realFlightMin: match.min,
  };
}

/**
 * Build a FlightRoute from two manually selected airports.
 * If a known route exists, use its real flight time.
 * Otherwise estimate from the closest known route.
 */
export function getRouteForAirports(from: Airport, to: Airport): FlightRoute {
  const knownTime = getFlightTimeBetween(from.code, to.code);
  const distanceKm = getDistanceEstimate(from.code, to.code);

  return {
    from,
    to,
    distanceKm,
    realFlightMin: knownTime ?? Math.round(distanceKm / 13), // ~780 km/h rough estimate
  };
}

// ─── Duration Categories ───────────────────────────────────

export const DURATION_PRESETS: {
  category: FlightCategory;
  label: string;
  durations: FlightDuration[];
}[] = [
  { category: 'short-haul', label: 'Ultra Short', durations: [20, 25, 30, 35, 40, 45] },
  { category: 'short-haul', label: 'Short Commute', durations: [50, 55, 60, 65, 70, 75] },
  { category: 'medium', label: 'Medium Range', durations: [80, 90, 100, 110, 120, 135, 150] },
  { category: 'long-haul', label: 'Long Range', durations: [165, 180, 210, 225, 240, 270] },
  { category: 'long-haul', label: 'Marathon', durations: [300, 330, 360, 375, 390, 420] },
];

// ─── Phase Timing ──────────────────────────────────────────

export interface PhaseConfig {
  phase: FlightPhase;
  label: string;
  durationSec: number;
}

export function getPhaseConfig(totalMinutes: number): PhaseConfig[] {
  const totalSec = totalMinutes * 60;

  // Realistic proportions — boarding & taxi are brief, cruise dominates
  // Short flights (<30m): ~10% overhead, rest cruise
  // Medium (30-90m): ~6% overhead
  // Long (90m+): ~4% overhead (fixed seconds, cruise absorbs the rest)
  let boardingSec: number, taxiSec: number, takeoffSec: number, descentSec: number, landingSec: number;

  if (totalMinutes <= 25) {
    boardingSec = 15; taxiSec = 10; takeoffSec = 15; descentSec = 15; landingSec = 10;
  } else if (totalMinutes <= 45) {
    boardingSec = 20; taxiSec = 15; takeoffSec = 20; descentSec = 20; landingSec = 15;
  } else if (totalMinutes <= 90) {
    boardingSec = 30; taxiSec = 20; takeoffSec = 25; descentSec = 30; landingSec = 15;
  } else {
    boardingSec = 45; taxiSec = 30; takeoffSec = 30; descentSec = 45; landingSec = 20;
  }

  const overhead = boardingSec + taxiSec + takeoffSec + descentSec + landingSec;
  const cruiseSec = Math.max(0, totalSec - overhead);

  return [
    { phase: 'boarding',  label: 'Boarding',  durationSec: boardingSec },
    { phase: 'taxi',      label: 'Taxi',      durationSec: taxiSec },
    { phase: 'takeoff',   label: 'Takeoff',   durationSec: takeoffSec },
    { phase: 'cruise',    label: 'Cruise',    durationSec: cruiseSec },
    { phase: 'descent',   label: 'Descent',   durationSec: descentSec },
    { phase: 'landed',    label: 'Landing',   durationSec: landingSec },
  ];
}

export function getCurrentPhase(
  elapsedSec: number,
  totalMinutes: number
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
