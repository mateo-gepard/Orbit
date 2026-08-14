import { describe, expect, it } from 'vitest';
import { defaultAscending, sortTasks } from './task-sort';
import type { OrbitItem, Priority } from './types';

function task(
  id: string,
  extra: { dueDate?: string; priority?: Priority; createdAt?: number; title?: string } = {}
): OrbitItem {
  return {
    id,
    title: extra.title ?? id,
    type: 'task',
    status: 'active',
    createdAt: extra.createdAt ?? 0,
    updatedAt: 0,
    userId: 'u1',
    ...(extra.dueDate ? { dueDate: extra.dueDate } : {}),
    ...(extra.priority ? { priority: extra.priority } : {}),
  };
}

const ids = (items: OrbitItem[]) => items.map((item) => item.id);

describe('sortTasks by due date', () => {
  const tasks = [
    task('undated'),
    task('late', { dueDate: '2026-12-01' }),
    task('soon', { dueDate: '2026-08-08' }),
  ];

  it('puts the soonest first when ascending, undated last', () => {
    expect(ids(sortTasks(tasks, 'dueDate', true))).toEqual(['soon', 'late', 'undated']);
  });

  it('keeps undated tasks last when descending (F-05)', () => {
    expect(ids(sortTasks(tasks, 'dueDate', false))).toEqual(['late', 'soon', 'undated']);
  });

  it('keeps several undated tasks together at the end', () => {
    const many = [task('u1'), task('due', { dueDate: '2026-09-01' }), task('u2')];
    expect(ids(sortTasks(many, 'dueDate', false)).slice(0, 1)).toEqual(['due']);
  });
});

describe('sortTasks by created date', () => {
  const tasks = [
    task('old', { createdAt: 100 }),
    task('new', { createdAt: 300 }),
    task('middle', { createdAt: 200 }),
  ];

  it('reads ascending as oldest first, so the ↑ arrow is honest (F-06)', () => {
    expect(ids(sortTasks(tasks, 'createdAt', true))).toEqual(['old', 'middle', 'new']);
  });

  it('reads descending as newest first', () => {
    expect(ids(sortTasks(tasks, 'createdAt', false))).toEqual(['new', 'middle', 'old']);
  });

  it('opens the "Newest" option descending so it shows newest first', () => {
    expect(defaultAscending('createdAt')).toBe(false);
    expect(defaultAscending('dueDate')).toBe(true);
    expect(defaultAscending('priority')).toBe(true);
    expect(defaultAscending('title')).toBe(true);
  });
});

describe('sortTasks by priority and title', () => {
  it('ranks high before medium before low before none', () => {
    const tasks = [
      task('none'),
      task('low', { priority: 'low' }),
      task('high', { priority: 'high' }),
      task('medium', { priority: 'medium' }),
    ];
    expect(ids(sortTasks(tasks, 'priority', true))).toEqual(['high', 'medium', 'low', 'none']);
    expect(ids(sortTasks(tasks, 'priority', false))).toEqual(['none', 'low', 'medium', 'high']);
  });

  it('sorts titles both ways', () => {
    const tasks = [task('b', { title: 'Beta' }), task('a', { title: 'Alpha' })];
    expect(ids(sortTasks(tasks, 'title', true))).toEqual(['a', 'b']);
    expect(ids(sortTasks(tasks, 'title', false))).toEqual(['b', 'a']);
  });
});

describe('sortTasks purity', () => {
  it('does not mutate the input array', () => {
    const tasks = [task('b', { title: 'Beta' }), task('a', { title: 'Alpha' })];
    sortTasks(tasks, 'title', true);
    expect(ids(tasks)).toEqual(['b', 'a']);
  });
});
