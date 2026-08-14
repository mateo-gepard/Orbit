import { describe, expect, it } from 'vitest';
import { getAutoArchiveTaskIds } from './auto-archive';
import type { OrbitItem } from './types';

const NOW = Date.UTC(2026, 7, 6, 12);
const DAY = 24 * 60 * 60 * 1000;

function item(overrides: Partial<OrbitItem>): OrbitItem {
  return {
    id: 'item',
    type: 'task',
    status: 'done',
    title: 'Test',
    createdAt: NOW - 40 * DAY,
    updatedAt: NOW,
    completedAt: NOW - 31 * DAY,
    userId: 'user',
    ...overrides,
  };
}

describe('getAutoArchiveTaskIds', () => {
  it('uses completion time and includes the exact cutoff boundary', () => {
    const items = [
      item({ id: 'old', completedAt: NOW - 31 * DAY, updatedAt: NOW }),
      item({ id: 'boundary', completedAt: NOW - 30 * DAY }),
      item({ id: 'recent', completedAt: NOW - 29 * DAY }),
    ];

    expect(getAutoArchiveTaskIds(items, 30, NOW)).toEqual(['old', 'boundary']);
  });

  it('never archives non-tasks, active tasks, or records without completedAt', () => {
    const items = [
      item({ id: 'project', type: 'project' }),
      item({ id: 'active', status: 'active' }),
      item({ id: 'legacy', completedAt: undefined, updatedAt: NOW - 90 * DAY }),
    ];

    expect(getAutoArchiveTaskIds(items, 30, NOW)).toEqual([]);
  });

  it('is disabled for non-positive and invalid retention values', () => {
    const items = [item({ id: 'old' })];
    expect(getAutoArchiveTaskIds(items, 0, NOW)).toEqual([]);
    expect(getAutoArchiveTaskIds(items, Number.NaN, NOW)).toEqual([]);
  });

  it('does not re-archive a task that was just restored (F-01)', () => {
    const items = [
      item({ id: 'restored', completedAt: NOW - 40 * DAY, restoredAt: NOW }),
    ];
    expect(getAutoArchiveTaskIds(items, 30, NOW)).toEqual([]);
  });

  it('archives again once the restored item ages past the cutoff', () => {
    const items = [
      item({ id: 'restored', completedAt: NOW - 90 * DAY, restoredAt: NOW - 31 * DAY }),
    ];
    expect(getAutoArchiveTaskIds(items, 30, NOW)).toEqual(['restored']);
  });

  it('ignores a restore stamp older than completion', () => {
    const items = [
      item({ id: 'old', completedAt: NOW - 31 * DAY, restoredAt: NOW - 200 * DAY }),
    ];
    expect(getAutoArchiveTaskIds(items, 30, NOW)).toEqual(['old']);
  });

  it('ignores a malformed restore stamp', () => {
    const items = [
      item({ id: 'old', completedAt: NOW - 31 * DAY, restoredAt: Number.NaN }),
    ];
    expect(getAutoArchiveTaskIds(items, 30, NOW)).toEqual(['old']);
  });
});
