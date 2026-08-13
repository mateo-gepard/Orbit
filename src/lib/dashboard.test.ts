import { describe, expect, it } from 'vitest';
import { eventOccursOnDate, getProjectTaskProgress } from './dashboard';
import type { ThreadmapItem } from './types';

function item(overrides: Partial<ThreadmapItem>): ThreadmapItem {
  return {
    id: 'item',
    type: 'task',
    status: 'active',
    title: 'Item',
    userId: 'user',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('eventOccursOnDate', () => {
  it('includes every date in an event span', () => {
    const event = item({ type: 'event', startDate: '2026-08-05', endDate: '2026-08-07' });
    expect(eventOccursOnDate(event, '2026-08-04')).toBe(false);
    expect(eventOccursOnDate(event, '2026-08-05')).toBe(true);
    expect(eventOccursOnDate(event, '2026-08-06')).toBe(true);
    expect(eventOccursOnDate(event, '2026-08-07')).toBe(true);
    expect(eventOccursOnDate(event, '2026-08-08')).toBe(false);
  });

  it('uses dueDate for legacy events and excludes archived events', () => {
    expect(eventOccursOnDate(item({ type: 'event', dueDate: '2026-08-06' }), '2026-08-06')).toBe(true);
    expect(eventOccursOnDate(item({ type: 'event', status: 'archived', startDate: '2026-08-06' }), '2026-08-06')).toBe(false);
  });
});

describe('getProjectTaskProgress', () => {
  it('counts non-archived direct and goal-nested tasks only', () => {
    const items = [
      item({ id: 'goal', type: 'goal', parentId: 'project' }),
      item({ id: 'direct-done', parentId: 'project', status: 'done' }),
      item({ id: 'nested-active', parentId: 'goal' }),
      item({ id: 'archived', parentId: 'project', status: 'archived' }),
      item({ id: 'note', type: 'note', parentId: 'project', status: 'done' }),
    ];
    expect(getProjectTaskProgress(items, 'project')).toBe(50);
  });

  it('returns zero when the project has no tasks', () => {
    expect(getProjectTaskProgress([item({ type: 'note', parentId: 'project' })], 'project')).toBe(0);
  });
});
