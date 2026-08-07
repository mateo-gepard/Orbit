import type { OrbitItem } from '@/lib/types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The moment the retention clock runs from.
 *
 * Normally that is completion. But a restore from the Archive has to reset it:
 * restoring keeps the original `completedAt`, which is by definition already
 * past the cutoff, so measuring from completion alone re-archived the item on
 * the very next render — the user saw an "Item restored" toast and watched the
 * row vanish, forever, burning a write each attempt.
 */
function retentionStart(item: OrbitItem): number | null {
  if (!isTimestamp(item.completedAt)) return null;
  return isTimestamp(item.restoredAt)
    ? Math.max(item.completedAt, item.restoredAt)
    : item.completedAt;
}

/** Return only completed task IDs old enough for the task retention policy. */
export function getAutoArchiveTaskIds(
  items: OrbitItem[],
  autoArchiveDays: number,
  now = Date.now()
): string[] {
  if (!Number.isFinite(autoArchiveDays) || autoArchiveDays <= 0) return [];

  const cutoff = now - autoArchiveDays * DAY_IN_MS;
  return items
    .filter((item) => {
      if (item.type !== 'task' || item.status !== 'done') return false;
      const start = retentionStart(item);
      return start !== null && start <= cutoff;
    })
    .map((item) => item.id);
}
