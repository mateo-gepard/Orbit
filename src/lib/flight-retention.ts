export const MAX_FLIGHT_LOGS = 100;

export interface RetainableFlightHistoryEntry {
  id: string;
  startedAt: number;
  endedAt?: number;
}

export function isRetainableFlightHistoryEntry(
  value: unknown,
): value is RetainableFlightHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RetainableFlightHistoryEntry>;
  return typeof candidate.id === 'string'
      && candidate.id.length > 0
      && candidate.id.length <= 512
      && !candidate.id.includes('/')
      && typeof candidate.startedAt === 'number'
      && Number.isFinite(candidate.startedAt);
}

/** Deterministically retain the latest unique flight records. */
export function boundFlightHistory<T extends RetainableFlightHistoryEntry>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const candidates = value
    .filter(isRetainableFlightHistoryEntry)
    .sort((left, right) =>
      right.startedAt - left.startedAt
      || Number(right.endedAt || 0) - Number(left.endedAt || 0)
      || right.id.localeCompare(left.id)
    );
  const seen = new Set<string>();
  return candidates.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).slice(0, MAX_FLIGHT_LOGS) as T[];
}
