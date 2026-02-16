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

export type FlightDuration = 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 | 85 | 90 | 95 | 100 | 105 | 120 | 125 | 130 | 135 | 140 | 145 | 150 | 170 | 180 | 185 | 190 | 200 | 210 | 225 | 230 | 240 | 260 | 270 | 280 | 290 | 300 | 310 | 330 | 335 | 340 | 350 | 360 | 365 | 375 | 380 | 390 | 400 | 405 | 410 | 420 | 425 | 430 | 435 | 440 | 445 | 450 | 460;

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
  // Europe — Western
  { code: 'LHR', name: 'Heathrow', city: 'London', region: 'europe' },
  { code: 'LGW', name: 'Gatwick', city: 'London', region: 'europe' },
  { code: 'LCY', name: 'London City', city: 'London', region: 'europe' },
  { code: 'MAN', name: 'Manchester', city: 'Manchester', region: 'europe' },
  { code: 'EDI', name: 'Edinburgh', city: 'Edinburgh', region: 'europe' },
  { code: 'GLA', name: 'Glasgow', city: 'Glasgow', region: 'europe' },
  { code: 'BFS', name: 'Belfast Intl', city: 'Belfast', region: 'europe' },
  { code: 'NCL', name: 'Newcastle', city: 'Newcastle', region: 'europe' },
  { code: 'ABZ', name: 'Aberdeen', city: 'Aberdeen', region: 'europe' },
  { code: 'INV', name: 'Inverness', city: 'Inverness', region: 'europe' },
  { code: 'JER', name: 'Jersey', city: 'Jersey', region: 'europe' },
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', region: 'europe' },
  { code: 'AMS', name: 'Schiphol', city: 'Amsterdam', region: 'europe' },
  { code: 'RTM', name: 'Rotterdam', city: 'Rotterdam', region: 'europe' },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', region: 'europe' },
  { code: 'LUX', name: 'Luxembourg', city: 'Luxembourg', region: 'europe' },
  { code: 'FRA', name: 'Frankfurt', city: 'Frankfurt', region: 'europe' },
  { code: 'MUC', name: 'Franz Josef Strauss', city: 'Munich', region: 'europe' },
  { code: 'BER', name: 'Brandenburg', city: 'Berlin', region: 'europe' },
  { code: 'STR', name: 'Stuttgart', city: 'Stuttgart', region: 'europe' },
  { code: 'ZRH', name: 'Kloten', city: 'Zürich', region: 'europe' },
  { code: 'GVA', name: 'Geneva', city: 'Geneva', region: 'europe' },
  { code: 'VIE', name: 'Schwechat', city: 'Vienna', region: 'europe' },
  { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', region: 'europe' },
  { code: 'SNN', name: 'Shannon', city: 'Shannon', region: 'europe' },
  { code: 'IOM', name: 'Ronaldsway', city: 'Isle of Man', region: 'europe' },
  { code: 'GIB', name: 'Gibraltar', city: 'Gibraltar', region: 'europe' },
  // Europe — Nordic & Baltic
  { code: 'CPH', name: 'Kastrup', city: 'Copenhagen', region: 'europe' },
  { code: 'OSL', name: 'Gardermoen', city: 'Oslo', region: 'europe' },
  { code: 'ARN', name: 'Arlanda', city: 'Stockholm', region: 'europe' },
  { code: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', region: 'europe' },
  { code: 'TLL', name: 'Lennart Meri', city: 'Tallinn', region: 'europe' },
  { code: 'KEF', name: 'Keflavík', city: 'Reykjavík', region: 'europe' },
  // Europe — Southern & Eastern
  { code: 'FCO', name: 'Fiumicino', city: 'Rome', region: 'europe' },
  { code: 'PMO', name: 'Falcone-Borsellino', city: 'Palermo', region: 'europe' },
  { code: 'BCN', name: 'El Prat', city: 'Barcelona', region: 'europe' },
  { code: 'MAD', name: 'Barajas', city: 'Madrid', region: 'europe' },
  { code: 'LIS', name: 'Humberto Delgado', city: 'Lisbon', region: 'europe' },
  { code: 'OPO', name: 'Francisco Sá Carneiro', city: 'Porto', region: 'europe' },
  { code: 'ATH', name: 'Eleftherios Venizelos', city: 'Athens', region: 'europe' },
  { code: 'LCA', name: 'Larnaca', city: 'Larnaca', region: 'europe' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', region: 'europe' },
  { code: 'BUD', name: 'Budapest Liszt Ferenc', city: 'Budapest', region: 'europe' },
  { code: 'WAW', name: 'Chopin', city: 'Warsaw', region: 'europe' },
  // Americas — North
  { code: 'JFK', name: 'John F. Kennedy', city: 'New York', region: 'americas' },
  { code: 'LGA', name: 'LaGuardia', city: 'New York', region: 'americas' },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', region: 'americas' },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', region: 'americas' },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', region: 'americas' },
  { code: 'ORD', name: "O'Hare", city: 'Chicago', region: 'americas' },
  { code: 'ATL', name: 'Hartsfield-Jackson', city: 'Atlanta', region: 'americas' },
  { code: 'DEN', name: 'Denver Intl', city: 'Denver', region: 'americas' },
  { code: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', region: 'americas' },
  { code: 'SEA', name: 'Seattle-Tacoma', city: 'Seattle', region: 'americas' },
  { code: 'LAS', name: 'Harry Reid', city: 'Las Vegas', region: 'americas' },
  { code: 'MCO', name: 'Orlando Intl', city: 'Orlando', region: 'americas' },
  { code: 'BOS', name: 'Logan', city: 'Boston', region: 'americas' },
  { code: 'IAD', name: 'Dulles', city: 'Washington DC', region: 'americas' },
  { code: 'IAH', name: 'George Bush', city: 'Houston', region: 'americas' },
  { code: 'AUS', name: 'Austin-Bergstrom', city: 'Austin', region: 'americas' },
  { code: 'YYZ', name: 'Pearson', city: 'Toronto', region: 'americas' },
  { code: 'YVR', name: 'Vancouver Intl', city: 'Vancouver', region: 'americas' },
  { code: 'YYJ', name: 'Victoria Intl', city: 'Victoria', region: 'americas' },
  { code: 'YUL', name: 'Trudeau', city: 'Montreal', region: 'americas' },
  { code: 'MEX', name: 'Benito Juárez', city: 'Mexico City', region: 'americas' },
  // Americas — Caribbean & South
  { code: 'SXM', name: 'Princess Juliana', city: 'St. Maarten', region: 'americas' },
  { code: 'SBH', name: 'Gustaf III', city: 'St. Barths', region: 'americas' },
  { code: 'CUR', name: 'Hato Intl', city: 'Curaçao', region: 'americas' },
  { code: 'BON', name: 'Flamingo Intl', city: 'Bonaire', region: 'americas' },
  { code: 'STT', name: 'Cyril E. King', city: 'St. Thomas', region: 'americas' },
  { code: 'SJU', name: 'Luis Muñoz Marín', city: 'San Juan', region: 'americas' },
  { code: 'NAS', name: 'Lynden Pindling', city: 'Nassau', region: 'americas' },
  { code: 'GRU', name: 'Guarulhos', city: 'São Paulo', region: 'americas' },
  { code: 'GIG', name: 'Galeão', city: 'Rio de Janeiro', region: 'americas' },
  { code: 'BOG', name: 'El Dorado', city: 'Bogotá', region: 'americas' },
  // Asia — East
  { code: 'NRT', name: 'Narita', city: 'Tokyo', region: 'asia' },
  { code: 'HND', name: 'Haneda', city: 'Tokyo', region: 'asia' },
  { code: 'ITM', name: 'Itami', city: 'Osaka', region: 'asia' },
  { code: 'KIX', name: 'Kansai', city: 'Osaka', region: 'asia' },
  { code: 'ICN', name: 'Incheon', city: 'Seoul', region: 'asia' },
  { code: 'GMP', name: 'Gimpo', city: 'Seoul', region: 'asia' },
  { code: 'CJU', name: 'Jeju Intl', city: 'Jeju', region: 'asia' },
  { code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', region: 'asia' },
  { code: 'TPE', name: 'Taoyuan', city: 'Taipei', region: 'asia' },
  { code: 'TSA', name: 'Songshan', city: 'Taipei', region: 'asia' },
  { code: 'MNL', name: 'Ninoy Aquino', city: 'Manila', region: 'asia' },
  // Asia — Southeast
  { code: 'SIN', name: 'Changi', city: 'Singapore', region: 'asia' },
  { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', region: 'asia' },
  { code: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', region: 'asia' },
  { code: 'REP', name: 'Siem Reap Intl', city: 'Siem Reap', region: 'asia' },
  // Asia — South
  { code: 'DEL', name: 'Indira Gandhi', city: 'Delhi', region: 'asia' },
  { code: 'BOM', name: 'Chhatrapati Shivaji', city: 'Mumbai', region: 'asia' },
  // Middle East
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', region: 'middle-east' },
  { code: 'DOH', name: 'Hamad Intl', city: 'Doha', region: 'middle-east' },
  { code: 'BAH', name: 'Bahrain Intl', city: 'Bahrain', region: 'middle-east' },
  { code: 'MCT', name: 'Muscat Intl', city: 'Muscat', region: 'middle-east' },
  { code: 'TLV', name: 'Ben Gurion', city: 'Tel Aviv', region: 'middle-east' },
  // Oceania
  { code: 'SYD', name: 'Kingsford Smith', city: 'Sydney', region: 'oceania' },
  { code: 'MEL', name: 'Tullamarine', city: 'Melbourne', region: 'oceania' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', region: 'oceania' },
  { code: 'WLG', name: 'Wellington Airport', city: 'Wellington', region: 'oceania' },
  { code: 'PER', name: 'Perth Airport', city: 'Perth', region: 'oceania' },
  { code: 'ADL', name: 'Adelaide Airport', city: 'Adelaide', region: 'oceania' },
  { code: 'CBR', name: 'Canberra Airport', city: 'Canberra', region: 'oceania' },
  { code: 'DRW', name: 'Darwin Intl', city: 'Darwin', region: 'oceania' },
  { code: 'HNL', name: 'Daniel K. Inouye', city: 'Honolulu', region: 'oceania' },
  { code: 'OGG', name: 'Kahului', city: 'Maui', region: 'oceania' },
  { code: 'PPT', name: "Faa'a", city: 'Tahiti', region: 'oceania' },
  { code: 'MOZ', name: 'Moorea', city: 'Moorea', region: 'oceania' },
  // Africa
  { code: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', region: 'africa' },
  { code: 'JNB', name: 'O.R. Tambo', city: 'Johannesburg', region: 'africa' },
  { code: 'NBO', name: 'Jomo Kenyatta', city: 'Nairobi', region: 'africa' },
  { code: 'CAI', name: 'Cairo Intl', city: 'Cairo', region: 'africa' },
  { code: 'FIH', name: "N'djili", city: 'Kinshasa', region: 'africa' },
  { code: 'BZV', name: 'Maya-Maya', city: 'Brazzaville', region: 'africa' },
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
  // ─── ULTRA SHORT (20m - 45m) ───
  { id: 'SXM-SBH', from: 'SXM', to: 'SBH', cityFrom: 'St. Maarten', cityTo: 'St. Barths', min: 20 },
  { id: 'CUR-BON', from: 'CUR', to: 'BON', cityFrom: 'Curaçao', cityTo: 'Bonaire', min: 25 },
  { id: 'HEL-TLL', from: 'HEL', to: 'TLL', cityFrom: 'Helsinki', cityTo: 'Tallinn', min: 30 },
  { id: 'STT-SJU', from: 'STT', to: 'SJU', cityFrom: 'St. Thomas', cityTo: 'San Juan', min: 30 },
  { id: 'PPT-MOZ', from: 'PPT', to: 'MOZ', cityFrom: 'Tahiti', cityTo: 'Moorea', min: 30 },
  { id: 'FIH-BZV', from: 'FIH', to: 'BZV', cityFrom: 'Kinshasa', cityTo: 'Brazzaville', min: 35 },
  { id: 'DOH-BAH', from: 'DOH', to: 'BAH', cityFrom: 'Doha', cityTo: 'Bahrain', min: 40 },
  { id: 'AMS-BRU', from: 'AMS', to: 'BRU', cityFrom: 'Amsterdam', cityTo: 'Brussels', min: 45 },
  { id: 'ZRH-STR', from: 'ZRH', to: 'STR', cityFrom: 'Zurich', cityTo: 'Stuttgart', min: 45 },
  { id: 'DUB-IOM', from: 'DUB', to: 'IOM', cityFrom: 'Dublin', cityTo: 'Isle of Man', min: 45 },
  { id: 'OGG-HNL', from: 'OGG', to: 'HNL', cityFrom: 'Maui', cityTo: 'Honolulu', min: 45 },

  // ─── SHORT HOPS (50m - 1h 10m) ───
  { id: 'IAH-AUS', from: 'IAH', to: 'AUS', cityFrom: 'Houston', cityTo: 'Austin', min: 50 },
  { id: 'YVR-YYJ', from: 'YVR', to: 'YYJ', cityFrom: 'Vancouver', cityTo: 'Victoria', min: 50 },
  { id: 'LCY-RTM', from: 'LCY', to: 'RTM', cityFrom: 'London', cityTo: 'Rotterdam', min: 50 },
  { id: 'LHR-AMS', from: 'LHR', to: 'AMS', cityFrom: 'London', cityTo: 'Amsterdam', min: 55 },
  { id: 'SYD-CBR', from: 'SYD', to: 'CBR', cityFrom: 'Sydney', cityTo: 'Canberra', min: 55 },
  { id: 'GRU-GIG', from: 'GRU', to: 'GIG', cityFrom: 'São Paulo', cityTo: 'Rio de Janeiro', min: 55 },
  { id: 'LGW-JER', from: 'LGW', to: 'JER', cityFrom: 'London', cityTo: 'Jersey', min: 55 },
  { id: 'SIN-KUL', from: 'SIN', to: 'KUL', cityFrom: 'Singapore', cityTo: 'Kuala Lumpur', min: 60 },
  { id: 'CJU-GMP', from: 'CJU', to: 'GMP', cityFrom: 'Jeju', cityTo: 'Seoul', min: 60 },
  { id: 'HND-ITM', from: 'HND', to: 'ITM', cityFrom: 'Tokyo', cityTo: 'Osaka', min: 60 },
  { id: 'LGA-BOS', from: 'LGA', to: 'BOS', cityFrom: 'New York', cityTo: 'Boston', min: 65 },
  { id: 'LIS-OPO', from: 'LIS', to: 'OPO', cityFrom: 'Lisbon', cityTo: 'Porto', min: 65 },
  { id: 'LHR-NCL', from: 'LHR', to: 'NCL', cityFrom: 'London', cityTo: 'Newcastle', min: 65 },
  { id: 'SFO-LAX', from: 'SFO', to: 'LAX', cityFrom: 'San Francisco', cityTo: 'Los Angeles', min: 70 },
  { id: 'DXB-MCT', from: 'DXB', to: 'MCT', cityFrom: 'Dubai', cityTo: 'Muscat', min: 70 },
  { id: 'HKG-TPE', from: 'HKG', to: 'TPE', cityFrom: 'Hong Kong', cityTo: 'Taipei', min: 70 },
  { id: 'BKK-REP', from: 'BKK', to: 'REP', cityFrom: 'Bangkok', cityTo: 'Siem Reap', min: 70 },
  { id: 'LCY-LUX', from: 'LCY', to: 'LUX', cityFrom: 'London', cityTo: 'Luxembourg', min: 70 },

  // ─── STANDARD COMMUTE (1h 15m - 1h 45m) ───
  { id: 'LHR-CDG', from: 'LHR', to: 'CDG', cityFrom: 'London', cityTo: 'Paris', min: 75 },
  { id: 'LHR-DUB', from: 'LHR', to: 'DUB', cityFrom: 'London', cityTo: 'Dublin', min: 75 },
  { id: 'CPH-OSL', from: 'CPH', to: 'OSL', cityFrom: 'Copenhagen', cityTo: 'Oslo', min: 75 },
  { id: 'VIE-FRA', from: 'VIE', to: 'FRA', cityFrom: 'Vienna', cityTo: 'Frankfurt', min: 75 },
  { id: 'LHR-EDI', from: 'LHR', to: 'EDI', cityFrom: 'London', cityTo: 'Edinburgh', min: 75 },
  { id: 'LHR-GLA', from: 'LHR', to: 'GLA', cityFrom: 'London', cityTo: 'Glasgow', min: 75 },
  { id: 'LGA-YYZ', from: 'LGA', to: 'YYZ', cityFrom: 'New York', cityTo: 'Toronto', min: 80 },
  { id: 'MIA-NAS', from: 'MIA', to: 'NAS', cityFrom: 'Miami', cityTo: 'Nassau', min: 80 },
  { id: 'LHR-BFS', from: 'LHR', to: 'BFS', cityFrom: 'London', cityTo: 'Belfast', min: 80 },
  { id: 'MEL-SYD', from: 'MEL', to: 'SYD', cityFrom: 'Melbourne', cityTo: 'Sydney', min: 85 },
  { id: 'LHR-ABZ', from: 'LHR', to: 'ABZ', cityFrom: 'London', cityTo: 'Aberdeen', min: 85 },
  { id: 'DEL-BOM', from: 'DEL', to: 'BOM', cityFrom: 'New Delhi', cityTo: 'Mumbai', min: 90 },
  { id: 'JNB-CPT', from: 'JNB', to: 'CPT', cityFrom: 'Johannesburg', cityTo: 'Cape Town', min: 90 },
  { id: 'GVA-LHR', from: 'GVA', to: 'LHR', cityFrom: 'Geneva', cityTo: 'London', min: 90 },
  { id: 'LCY-ZRH', from: 'LCY', to: 'ZRH', cityFrom: 'London', cityTo: 'Zurich', min: 90 },
  { id: 'FRA-LHR', from: 'FRA', to: 'LHR', cityFrom: 'Frankfurt', cityTo: 'London', min: 95 },
  { id: 'LHR-INV', from: 'LHR', to: 'INV', cityFrom: 'London', cityTo: 'Inverness', min: 95 },
  { id: 'BER-ZRH', from: 'BER', to: 'ZRH', cityFrom: 'Berlin', cityTo: 'Zurich', min: 100 },
  { id: 'BCN-MAD', from: 'BCN', to: 'MAD', cityFrom: 'Barcelona', cityTo: 'Madrid', min: 100 },
  { id: 'MUC-LHR', from: 'MUC', to: 'LHR', cityFrom: 'Munich', cityTo: 'London', min: 100 },
  { id: 'FCO-PMO', from: 'FCO', to: 'PMO', cityFrom: 'Rome', cityTo: 'Palermo', min: 105 },

  // ─── MEDIUM RANGE (1h 50m - 2h 30m) ───
  { id: 'LHR-BCN', from: 'LHR', to: 'BCN', cityFrom: 'London', cityTo: 'Barcelona', min: 120 },
  { id: 'AKL-WLG', from: 'AKL', to: 'WLG', cityFrom: 'Auckland', cityTo: 'Wellington', min: 120 },
  { id: 'ATL-MCO', from: 'ATL', to: 'MCO', cityFrom: 'Atlanta', cityTo: 'Orlando', min: 120 },
  { id: 'HKG-MNL', from: 'HKG', to: 'MNL', cityFrom: 'Hong Kong', cityTo: 'Manila', min: 125 },
  { id: 'ICN-KIX', from: 'ICN', to: 'KIX', cityFrom: 'Seoul', cityTo: 'Osaka', min: 125 },
  { id: 'OSL-LHR', from: 'OSL', to: 'LHR', cityFrom: 'Oslo', cityTo: 'London', min: 130 },
  { id: 'LHR-MAD', from: 'LHR', to: 'MAD', cityFrom: 'London', cityTo: 'Madrid', min: 135 },
  { id: 'DEN-LAS', from: 'DEN', to: 'LAS', cityFrom: 'Denver', cityTo: 'Las Vegas', min: 135 },
  { id: 'SIN-BKK', from: 'SIN', to: 'BKK', cityFrom: 'Singapore', cityTo: 'Bangkok', min: 140 },
  { id: 'BUD-LHR', from: 'BUD', to: 'LHR', cityFrom: 'Budapest', cityTo: 'London', min: 140 },
  { id: 'WAW-LHR', from: 'WAW', to: 'LHR', cityFrom: 'Warsaw', cityTo: 'London', min: 145 },
  { id: 'MIA-JFK', from: 'MIA', to: 'JFK', cityFrom: 'Miami', cityTo: 'New York', min: 150 },
  { id: 'LHR-FCO', from: 'LHR', to: 'FCO', cityFrom: 'London', cityTo: 'Rome', min: 150 },
  { id: 'ORD-DFW', from: 'ORD', to: 'DFW', cityFrom: 'Chicago', cityTo: 'Dallas', min: 150 },
  { id: 'NRT-ICN', from: 'NRT', to: 'ICN', cityFrom: 'Tokyo', cityTo: 'Seoul', min: 150 },
  { id: 'ARN-LHR', from: 'ARN', to: 'LHR', cityFrom: 'Stockholm', cityTo: 'London', min: 150 },
  { id: 'LHR-GIB', from: 'LHR', to: 'GIB', cityFrom: 'London', cityTo: 'Gibraltar', min: 170 },

  // ─── LONG RANGE (3h - 3h 30m) ───
  { id: 'BOM-DXB', from: 'BOM', to: 'DXB', cityFrom: 'Mumbai', cityTo: 'Dubai', min: 180 },
  { id: 'LHR-ATH', from: 'LHR', to: 'ATH', cityFrom: 'London', cityTo: 'Athens', min: 180 },
  { id: 'LAX-SEA', from: 'LAX', to: 'SEA', cityFrom: 'Los Angeles', cityTo: 'Seattle', min: 180 },
  { id: 'HEL-LHR', from: 'HEL', to: 'LHR', cityFrom: 'Helsinki', cityTo: 'London', min: 180 },
  { id: 'JFK-MCO', from: 'JFK', to: 'MCO', cityFrom: 'New York', cityTo: 'Orlando', min: 185 },
  { id: 'HND-TSA', from: 'HND', to: 'TSA', cityFrom: 'Tokyo', cityTo: 'Taipei', min: 190 },
  { id: 'SYD-AKL', from: 'SYD', to: 'AKL', cityFrom: 'Sydney', cityTo: 'Auckland', min: 190 },
  { id: 'CDG-IST', from: 'CDG', to: 'IST', cityFrom: 'Paris', cityTo: 'Istanbul', min: 200 },
  { id: 'LHR-KEF', from: 'LHR', to: 'KEF', cityFrom: 'London', cityTo: 'Reykjavík', min: 200 },
  { id: 'DRW-SIN', from: 'DRW', to: 'SIN', cityFrom: 'Darwin', cityTo: 'Singapore', min: 210 },
  { id: 'HKG-SIN', from: 'HKG', to: 'SIN', cityFrom: 'Hong Kong', cityTo: 'Singapore', min: 210 },
  { id: 'YVR-LAX', from: 'YVR', to: 'LAX', cityFrom: 'Vancouver', cityTo: 'Los Angeles', min: 210 },

  // ─── HALF DAY (3h 40m - 4h 30m) ───
  { id: 'CAI-LHR', from: 'CAI', to: 'LHR', cityFrom: 'Cairo', cityTo: 'London', min: 225 },
  { id: 'PER-ADL', from: 'PER', to: 'ADL', cityFrom: 'Perth', cityTo: 'Adelaide', min: 230 },
  { id: 'ATH-LHR', from: 'ATH', to: 'LHR', cityFrom: 'Athens', cityTo: 'London', min: 230 },
  { id: 'HKG-NRT', from: 'HKG', to: 'NRT', cityFrom: 'Hong Kong', cityTo: 'Tokyo', min: 240 },
  { id: 'LAX-ORD', from: 'LAX', to: 'ORD', cityFrom: 'Los Angeles', cityTo: 'Chicago', min: 240 },
  { id: 'DXB-IST', from: 'DXB', to: 'IST', cityFrom: 'Dubai', cityTo: 'Istanbul', min: 240 },
  { id: 'IST-LHR', from: 'IST', to: 'LHR', cityFrom: 'Istanbul', cityTo: 'London', min: 240 },
  { id: 'MEX-JFK', from: 'MEX', to: 'JFK', cityFrom: 'Mexico City', cityTo: 'New York', min: 260 },
  { id: 'BOG-MIA', from: 'BOG', to: 'MIA', cityFrom: 'Bogotá', cityTo: 'Miami', min: 270 },
  { id: 'PER-SYD', from: 'PER', to: 'SYD', cityFrom: 'Perth', cityTo: 'Sydney', min: 270 },
  { id: 'LHR-LCA', from: 'LHR', to: 'LCA', cityFrom: 'London', cityTo: 'Larnaca', min: 270 },
  { id: 'LIS-LHR', from: 'LIS', to: 'LHR', cityFrom: 'Lisbon', cityTo: 'London', min: 270 },
  { id: 'YYZ-YVR', from: 'YYZ', to: 'YVR', cityFrom: 'Toronto', cityTo: 'Vancouver', min: 280 },
  { id: 'LHR-TLV', from: 'LHR', to: 'TLV', cityFrom: 'London', cityTo: 'Tel Aviv', min: 290 },

  // ─── MARATHON (4h 40m - 5h 30m) ───
  { id: 'BOS-KEF', from: 'BOS', to: 'KEF', cityFrom: 'Boston', cityTo: 'Reykjavík', min: 300 },
  { id: 'LAX-HNL', from: 'LAX', to: 'HNL', cityFrom: 'Los Angeles', cityTo: 'Honolulu', min: 310 },
  { id: 'JFK-SFO', from: 'JFK', to: 'SFO', cityFrom: 'New York', cityTo: 'San Francisco', min: 330 },
  { id: 'BOS-SFO', from: 'BOS', to: 'SFO', cityFrom: 'Boston', cityTo: 'San Francisco', min: 335 },
  { id: 'MIA-LAX', from: 'MIA', to: 'LAX', cityFrom: 'Miami', cityTo: 'Los Angeles', min: 335 },
  { id: 'YUL-CDG', from: 'YUL', to: 'CDG', cityFrom: 'Montreal', cityTo: 'Paris', min: 340 },
  { id: 'BOS-LHR', from: 'BOS', to: 'LHR', cityFrom: 'Boston', cityTo: 'London', min: 340 },
  { id: 'DXB-LHR', from: 'DXB', to: 'LHR', cityFrom: 'Dubai', cityTo: 'London', min: 350 },
  { id: 'SIN-PER', from: 'SIN', to: 'PER', cityFrom: 'Singapore', cityTo: 'Perth', min: 360 },
  { id: 'IST-JFK', from: 'IST', to: 'JFK', cityFrom: 'Istanbul', cityTo: 'New York', min: 360 },
  { id: 'NBO-DXB', from: 'NBO', to: 'DXB', cityFrom: 'Nairobi', cityTo: 'Dubai', min: 360 },

  // ─── FULL DAY (5h 40m - 6h 30m) ───
  { id: 'JFK-LHR', from: 'JFK', to: 'LHR', cityFrom: 'New York', cityTo: 'London', min: 365 },
  { id: 'LHR-DXB', from: 'LHR', to: 'DXB', cityFrom: 'London', cityTo: 'Dubai', min: 375 },
  { id: 'DUB-BOS', from: 'DUB', to: 'BOS', cityFrom: 'Dublin', cityTo: 'Boston', min: 380 },
  { id: 'CDG-JFK', from: 'CDG', to: 'JFK', cityFrom: 'Paris', cityTo: 'New York', min: 390 },
  { id: 'MAD-JFK', from: 'MAD', to: 'JFK', cityFrom: 'Madrid', cityTo: 'New York', min: 390 },
  { id: 'AMS-JFK', from: 'AMS', to: 'JFK', cityFrom: 'Amsterdam', cityTo: 'New York', min: 400 },
  { id: 'HND-SIN', from: 'HND', to: 'SIN', cityFrom: 'Tokyo', cityTo: 'Singapore', min: 400 },
  { id: 'ICN-SIN', from: 'ICN', to: 'SIN', cityFrom: 'Seoul', cityTo: 'Singapore', min: 400 },
  { id: 'SNN-JFK', from: 'SNN', to: 'JFK', cityFrom: 'Shannon', cityTo: 'New York', min: 400 },
  { id: 'LHR-BOS', from: 'LHR', to: 'BOS', cityFrom: 'London', cityTo: 'Boston', min: 405 },
  { id: 'FRA-JFK', from: 'FRA', to: 'JFK', cityFrom: 'Frankfurt', cityTo: 'New York', min: 410 },

  // ─── TRANSATLANTIC / LONG (6h 40m - 7h+) ───
  { id: 'LHR-IAD', from: 'LHR', to: 'IAD', cityFrom: 'London', cityTo: 'Washington DC', min: 420 },
  { id: 'MAN-JFK', from: 'MAN', to: 'JFK', cityFrom: 'Manchester', cityTo: 'New York', min: 420 },
  { id: 'CDG-IAD', from: 'CDG', to: 'IAD', cityFrom: 'Paris', cityTo: 'Washington DC', min: 425 },
  { id: 'LHR-ORD', from: 'LHR', to: 'ORD', cityFrom: 'London', cityTo: 'Chicago', min: 430 },
  { id: 'ZRH-JFK', from: 'ZRH', to: 'JFK', cityFrom: 'Zurich', cityTo: 'New York', min: 430 },
  { id: 'MAN-MCO', from: 'MAN', to: 'MCO', cityFrom: 'Manchester', cityTo: 'Orlando', min: 430 },
  { id: 'MUC-JFK', from: 'MUC', to: 'JFK', cityFrom: 'Munich', cityTo: 'New York', min: 435 },
  { id: 'DOH-LHR', from: 'DOH', to: 'LHR', cityFrom: 'Doha', cityTo: 'London', min: 440 },
  { id: 'LHR-JFK', from: 'LHR', to: 'JFK', cityFrom: 'London', cityTo: 'New York', min: 445 },
  { id: 'DXB-CDG', from: 'DXB', to: 'CDG', cityFrom: 'Dubai', cityTo: 'Paris', min: 450 },
  { id: 'SIN-SYD', from: 'SIN', to: 'SYD', cityFrom: 'Singapore', cityTo: 'Sydney', min: 450 },
  { id: 'JNB-DXB', from: 'JNB', to: 'DXB', cityFrom: 'Johannesburg', cityTo: 'Dubai', min: 460 },
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

// Build adjacency map: airport code → set of connected airport codes
const _adjacency = new Map<string, Set<string>>();
for (const r of FLIGHT_ROUTES) {
  if (!_adjacency.has(r.from)) _adjacency.set(r.from, new Set());
  if (!_adjacency.has(r.to)) _adjacency.set(r.to, new Set());
  _adjacency.get(r.from)!.add(r.to);
  _adjacency.get(r.to)!.add(r.from);
}

/** Get all airports that have a known route from/to the given airport code */
export function getConnectedAirports(airportCode: string): Airport[] {
  const connected = _adjacency.get(airportCode);
  if (!connected) return [];
  return AIRPORTS.filter((a) => connected.has(a.code));
}

/** Get all airports that appear in at least one route */
export function getRoutedAirports(): Airport[] {
  return AIRPORTS.filter((a) => _adjacency.has(a.code));
}

// Rough great-circle distance estimates for display
const DISTANCE_ESTIMATES: Record<string, number> = {
  // Ultra Short
  'SXM-SBH': 25, 'CUR-BON': 70, 'HEL-TLL': 80, 'STT-SJU': 110, 'PPT-MOZ': 17,
  'FIH-BZV': 10, 'DOH-BAH': 150, 'AMS-BRU': 175, 'ZRH-STR': 190, 'DUB-IOM': 260, 'OGG-HNL': 160,
  // Short Hops
  'IAH-AUS': 235, 'YVR-YYJ': 100, 'LCY-RTM': 310, 'LHR-AMS': 370, 'SYD-CBR': 280, 'GRU-GIG': 360,
  'LGW-JER': 310, 'SIN-KUL': 315, 'CJU-GMP': 450, 'HND-ITM': 400, 'LGA-BOS': 310, 'LIS-OPO': 310,
  'LHR-NCL': 400, 'SFO-LAX': 540, 'DXB-MCT': 340, 'HKG-TPE': 820, 'BKK-REP': 560, 'LCY-LUX': 490,
  // Standard Commute
  'LHR-CDG': 340, 'LHR-DUB': 450, 'CPH-OSL': 480, 'VIE-FRA': 600, 'LHR-EDI': 530, 'LHR-GLA': 550,
  'LGA-YYZ': 560, 'MIA-NAS': 300, 'LHR-BFS': 520, 'MEL-SYD': 710, 'LHR-ABZ': 640,
  'DEL-BOM': 1150, 'JNB-CPT': 1270, 'GVA-LHR': 750, 'LCY-ZRH': 780,
  'FRA-LHR': 660, 'LHR-INV': 720, 'BER-ZRH': 680, 'BCN-MAD': 510, 'MUC-LHR': 920, 'FCO-PMO': 430,
  // Medium Range
  'LHR-BCN': 1140, 'AKL-WLG': 480, 'ATL-MCO': 650, 'HKG-MNL': 1120, 'ICN-KIX': 920,
  'OSL-LHR': 1150, 'LHR-MAD': 1260, 'DEN-LAS': 980, 'SIN-BKK': 1420, 'BUD-LHR': 1460,
  'WAW-LHR': 1450, 'MIA-JFK': 1760, 'LHR-FCO': 1440, 'ORD-DFW': 1290, 'NRT-ICN': 1200,
  'ARN-LHR': 1440, 'LHR-GIB': 1730,
  // Long Range
  'BOM-DXB': 1930, 'LHR-ATH': 2400, 'LAX-SEA': 1540, 'HEL-LHR': 1830,
  'JFK-MCO': 1520, 'HND-TSA': 2100, 'SYD-AKL': 2160, 'CDG-IST': 2240,
  'LHR-KEF': 1900, 'DRW-SIN': 3350, 'HKG-SIN': 2580, 'YVR-LAX': 1740,
  // Half Day
  'CAI-LHR': 3520, 'PER-ADL': 2130, 'ATH-LHR': 2400, 'HKG-NRT': 2900, 'LAX-ORD': 2810,
  'DXB-IST': 3000, 'IST-LHR': 2500, 'MEX-JFK': 3370, 'BOG-MIA': 2590,
  'PER-SYD': 3290, 'LHR-LCA': 3230, 'LIS-LHR': 1590, 'YYZ-YVR': 3360, 'LHR-TLV': 3600,
  // Marathon
  'BOS-KEF': 4000, 'LAX-HNL': 4110, 'JFK-SFO': 4150, 'BOS-SFO': 4350, 'MIA-LAX': 3760,
  'YUL-CDG': 5510, 'BOS-LHR': 5370, 'DXB-LHR': 5470, 'SIN-PER': 4930,
  'IST-JFK': 8050, 'NBO-DXB': 4450,
  // Full Day
  'JFK-LHR': 5540, 'LHR-DXB': 5470, 'DUB-BOS': 4830, 'CDG-JFK': 5840, 'MAD-JFK': 5770,
  'AMS-JFK': 5850, 'HND-SIN': 5320, 'ICN-SIN': 4680, 'SNN-JFK': 5100, 'LHR-BOS': 5370, 'FRA-JFK': 6200,
  // Transatlantic
  'LHR-IAD': 5900, 'MAN-JFK': 5460, 'CDG-IAD': 6160, 'LHR-ORD': 6350, 'ZRH-JFK': 6330,
  'MAN-MCO': 7100, 'MUC-JFK': 6590, 'DOH-LHR': 5260, 'LHR-JFK': 5540,
  'DXB-CDG': 5250, 'SIN-SYD': 6290, 'JNB-DXB': 6350,
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

/** All unique valid flight durations extracted from routes */
const ALL_VALID_DURATIONS: FlightDuration[] = (() => {
  const set = new Set<number>();
  for (const r of FLIGHT_ROUTES) set.add(r.min);
  return [...set].sort((a, b) => a - b) as FlightDuration[];
})();

/** Snap any minute value to the nearest valid FlightDuration */
export function nearestValidDuration(minutes: number): FlightDuration {
  let best = ALL_VALID_DURATIONS[0];
  let bestDiff = Math.abs(minutes - best);
  for (const d of ALL_VALID_DURATIONS) {
    const diff = Math.abs(minutes - d);
    if (diff < bestDiff) { best = d; bestDiff = diff; }
  }
  return best;
}

/**
 * Build a FlightRoute from two manually selected airports.
 * If a known route exists, use its real flight time.
 * Otherwise estimate and snap to the nearest valid duration.
 */
export function getRouteForAirports(from: Airport, to: Airport): FlightRoute {
  const knownTime = getFlightTimeBetween(from.code, to.code);
  const distanceKm = getDistanceEstimate(from.code, to.code);

  const realFlightMin = knownTime ?? nearestValidDuration(Math.round(distanceKm / 13));

  return {
    from,
    to,
    distanceKm,
    realFlightMin,
  };
}

// ─── Duration Categories ───────────────────────────────────

export const DURATION_PRESETS: {
  category: FlightCategory;
  label: string;
  durations: FlightDuration[];
}[] = [
  { category: 'short-haul', label: 'Ultra Short', durations: [20, 25, 30, 35, 40, 45] },
  { category: 'short-haul', label: 'Short Hops', durations: [50, 55, 60, 65, 70, 75] },
  { category: 'medium', label: 'Standard Commute', durations: [80, 85, 90, 95, 100, 105] },
  { category: 'medium', label: 'Medium Range', durations: [120, 125, 130, 135, 140, 145, 150, 170] },
  { category: 'long-haul', label: 'Long Range', durations: [180, 185, 190, 200, 210, 225, 230, 240, 260, 270, 280, 290] },
  { category: 'long-haul', label: 'Marathon', durations: [300, 310, 330, 335, 340, 350, 360, 365, 375, 380, 390] },
  { category: 'long-haul', label: 'Transatlantic', durations: [400, 405, 410, 420, 425, 430, 435, 440, 445, 450, 460] },
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
