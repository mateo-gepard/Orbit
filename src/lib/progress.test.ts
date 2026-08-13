import { describe, expect, it } from 'vitest';
import { getGoalStats, getProjectStats, getProjectTaskProgress, getProjectTasks } from './progress';
import type { ItemStatus, ItemType, ThreadmapItem } from './types';

function item(
  id: string,
  type: ItemType,
  extra: { status?: ItemStatus; parentId?: string; linkedIds?: string[] } = {}
): ThreadmapItem {
  return {
    id,
    title: id,
    type,
    status: extra.status ?? 'active',
    createdAt: 0,
    updatedAt: 0,
    userId: 'u1',
    ...(extra.parentId ? { parentId: extra.parentId } : {}),
    ...(extra.linkedIds ? { linkedIds: extra.linkedIds } : {}),
  };
}

describe('getGoalStats', () => {
  it('does not dilute progress with items that can never complete (F-02)', () => {
    const items = [
      item('g', 'goal'),
      item('t1', 'task', { status: 'done', parentId: 'g' }),
      item('t2', 'task', { status: 'done', parentId: 'g' }),
      item('n1', 'note', { parentId: 'g' }),
      item('n2', 'note', { parentId: 'g' }),
      item('e1', 'event', { parentId: 'g' }),
    ];
    const stats = getGoalStats(items, 'g');
    // Two of two completable items are done — the three reference items are
    // still reported as related, but they no longer cap the goal below 100%.
    expect(stats.progress).toBe(100);
    expect(stats.total).toBe(2);
    expect(stats.relatedCount).toBe(5);
  });

  it('counts habits as related but not as progress', () => {
    const items = [
      item('g', 'goal'),
      item('h', 'habit', { parentId: 'g' }),
      item('t', 'task', { parentId: 'g' }),
    ];
    expect(getGoalStats(items, 'g')).toMatchObject({ progress: 0, total: 1, relatedCount: 2 });
  });

  it('counts linked items in both directions', () => {
    const items = [
      item('g', 'goal', { linkedIds: ['t1'] }),
      item('t1', 'task', { status: 'done' }),
      item('t2', 'task', { status: 'done', linkedIds: ['g'] }),
    ];
    expect(getGoalStats(items, 'g')).toMatchObject({ progress: 100, total: 2 });
  });

  it('ignores archived items', () => {
    const items = [
      item('g', 'goal'),
      item('t1', 'task', { status: 'done', parentId: 'g' }),
      item('t2', 'task', { status: 'archived', parentId: 'g' }),
    ];
    expect(getGoalStats(items, 'g')).toMatchObject({ progress: 100, total: 1, relatedCount: 1 });
  });

  it('reports zero for a goal with nothing attached', () => {
    expect(getGoalStats([item('g', 'goal')], 'g')).toMatchObject({ progress: 0, relatedCount: 0 });
  });

  it('reports zero for a goal that does not exist', () => {
    expect(getGoalStats([], 'missing')).toMatchObject({ progress: 0, relatedCount: 0 });
  });

  it('breaks down statuses', () => {
    const items = [
      item('g', 'goal'),
      item('a', 'task', { status: 'done', parentId: 'g' }),
      item('b', 'task', { status: 'active', parentId: 'g' }),
      item('c', 'task', { status: 'waiting', parentId: 'g' }),
    ];
    expect(getGoalStats(items, 'g')).toMatchObject({
      done: 1,
      inProgress: 1,
      waiting: 1,
      total: 3,
      progress: 33,
    });
  });
});

describe('getProjectTasks', () => {
  const items = [
    item('p', 'project'),
    item('direct', 'task', { parentId: 'p', status: 'done' }),
    item('milestone', 'goal', { parentId: 'p' }),
    item('nested', 'task', { parentId: 'milestone' }),
    item('archivedMilestone', 'goal', { parentId: 'p', status: 'archived' }),
    item('underArchived', 'task', { parentId: 'archivedMilestone' }),
    item('unrelated', 'task'),
    item('archivedTask', 'task', { parentId: 'p', status: 'archived' }),
  ];

  it('includes direct tasks and tasks under live milestones only', () => {
    expect(getProjectTasks(items, 'p').map((i) => i.id)).toEqual(['direct', 'nested']);
  });

  it('gives the same number through both entry points (F-08)', () => {
    expect(getProjectStats(items, 'p').progress).toBe(getProjectTaskProgress(items, 'p'));
    expect(getProjectTaskProgress(items, 'p')).toBe(50);
  });

  it('reports zero for a project with no tasks', () => {
    expect(getProjectTaskProgress([item('p', 'project')], 'p')).toBe(0);
  });
});
