import { describe, expect, it } from 'vitest';
import {
  getLinkableItems,
  getParentableItems,
  getAllowedParentTypes,
  setParent,
} from './links';
import type { OrbitItem } from './types';

function item(overrides: Partial<OrbitItem>): OrbitItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: overrides.type ?? 'task',
    status: overrides.status ?? 'active',
    title: overrides.title ?? 'Item',
    createdAt: 1,
    updatedAt: 1,
    userId: 'user-1',
    ...overrides,
  } as OrbitItem;
}

describe('link utilities', () => {
  it('treats reverse links as already linked candidates', () => {
    const task = item({ id: 'task' });
    const note = item({ id: 'note', type: 'note', linkedIds: ['task'] });

    const linkable = getLinkableItems(task, [task, note]);

    expect(linkable.map((i) => i.id)).not.toContain('note');
  });

  it('only allows sensible parent types', () => {
    expect(getAllowedParentTypes('project')).toEqual([]);
    expect(getAllowedParentTypes('goal')).toEqual(['project']);
    expect(getAllowedParentTypes('task')).toEqual(['project', 'goal']);
  });

  it('filters parent candidates by hierarchy rules', () => {
    const project = item({ id: 'project', type: 'project' });
    const goal = item({ id: 'goal', type: 'goal', parentId: 'project' });
    const task = item({ id: 'task', type: 'task' });
    const note = item({ id: 'note', type: 'note' });

    const parentable = getParentableItems(task, [project, goal, task, note]);

    expect(parentable.map((i) => i.id).sort()).toEqual(['goal', 'project']);
  });

  it('does not offer the current parent as a parent candidate', () => {
    const project = item({ id: 'project', type: 'project' });
    const otherProject = item({ id: 'other-project', type: 'project' });
    const goal = item({ id: 'goal', type: 'goal', parentId: 'project' });

    const parentable = getParentableItems(goal, [project, otherProject, goal]);

    expect(parentable.map((i) => i.id)).toEqual(['other-project']);
  });

  it('rejects project parents and circular parent changes', () => {
    const project = item({ id: 'project', type: 'project' });
    const goal = item({ id: 'goal', type: 'goal', parentId: 'project' });

    expect(setParent(project, 'goal', [project, goal])).toEqual({});
    expect(setParent(goal, 'project', [project, goal])).toEqual({});
  });
});
