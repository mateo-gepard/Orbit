import { describe, expect, it } from 'vitest';
import { getTaskBuckets } from './task-buckets';
import type { OrbitItem } from './types';

function task(overrides: Partial<OrbitItem>): OrbitItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: 'task',
    status: 'active',
    title: 'Task',
    createdAt: 1,
    updatedAt: 1,
    userId: 'user-1',
    ...overrides,
  };
}

describe('getTaskBuckets', () => {
  it('keeps due-today tasks out of manual My Day duplicates', () => {
    const item = task({ id: 'due-and-my-day', dueDate: '2026-05-27', myDay: '2026-05-27' });

    const buckets = getTaskBuckets({
      items: [item],
      selectedDateStr: '2026-05-27',
      todayStr: '2026-05-27',
      isViewingPast: false,
      isViewingToday: true,
    });

    expect(buckets.todayTasks.map((i) => i.id)).toEqual(['due-and-my-day']);
    expect(buckets.myDayTasks).toHaveLength(0);
    expect(buckets.notDoneFromBefore).toHaveLength(0);
  });

  it('keeps overdue tasks out of carryover duplicates', () => {
    const item = task({ id: 'overdue-carryover', dueDate: '2026-05-26', myDay: '2026-05-26' });

    const buckets = getTaskBuckets({
      items: [item],
      selectedDateStr: '2026-05-27',
      todayStr: '2026-05-27',
      isViewingPast: false,
      isViewingToday: true,
    });

    expect(buckets.overdueItems.map((i) => i.id)).toEqual(['overdue-carryover']);
    expect(buckets.myDayTasks).toHaveLength(0);
    expect(buckets.notDoneFromBefore).toHaveLength(0);
  });

  it('keeps unscheduled manual carryover visible', () => {
    const item = task({ id: 'plain-carryover', myDay: '2026-05-26' });

    const buckets = getTaskBuckets({
      items: [item],
      selectedDateStr: '2026-05-27',
      todayStr: '2026-05-27',
      isViewingPast: false,
      isViewingToday: true,
    });

    expect(buckets.notDoneFromBefore.map((i) => i.id)).toEqual(['plain-carryover']);
    expect(buckets.overdueItems).toHaveLength(0);
  });

  it('keeps inbox tasks out of dashboard schedule buckets', () => {
    const item = task({
      id: 'stale-inbox-schedule',
      status: 'inbox',
      dueDate: '2026-05-27',
      myDay: '2026-05-26',
    });

    const buckets = getTaskBuckets({
      items: [item],
      selectedDateStr: '2026-05-27',
      todayStr: '2026-05-27',
      isViewingPast: false,
      isViewingToday: true,
    });

    expect(buckets.todayTasks).toHaveLength(0);
    expect(buckets.myDayTasks).toHaveLength(0);
    expect(buckets.notDoneFromBefore).toHaveLength(0);
    expect(buckets.overdueItems).toHaveLength(0);
  });
});
