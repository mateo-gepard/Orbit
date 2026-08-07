import type { OrbitItem } from '@/lib/types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Return only completed task IDs old enough for the task retention policy. */
export function getAutoArchiveTaskIds(
  items: OrbitItem[],
  autoArchiveDays: number,
  now = Date.now()
): string[] {
  if (!Number.isFinite(autoArchiveDays) || autoArchiveDays <= 0) return [];

  const cutoff = now - autoArchiveDays * DAY_IN_MS;
  return items
    .filter((item) => (
      item.type === 'task'
      && item.status === 'done'
      && typeof item.completedAt === 'number'
      && Number.isFinite(item.completedAt)
      && item.completedAt <= cutoff
    ))
    .map((item) => item.id);
}
