import { describe, expect, it } from 'vitest';
import type { OrbitItem } from '@/lib/types';
import { buildRoadmapGraph } from './roadmap-utils';

function item(overrides: Partial<OrbitItem>): OrbitItem {
  return {
    id: 'item',
    type: 'task',
    status: 'active',
    title: 'Item',
    userId: 'owner',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('buildRoadmapGraph', () => {
  it('keeps localized dependency edges only when both endpoints are rendered', () => {
    const project = item({ id: 'project', type: 'project' });
    const milestone = item({ id: 'milestone', type: 'goal', parentId: project.id });
    const tasks = Array.from({ length: 9 }, (_, index) => item({
      id: `task-${index + 1}`,
      parentId: milestone.id,
      createdAt: index + 1,
      linkedIds: index === 0 ? ['task-2', 'task-9'] : undefined,
    }));

    const graph = buildRoadmapGraph(project, [project, milestone, ...tasks], {
      dependencyLabel: 'hängt ab von',
    });
    const renderedIds = new Set(graph.nodes.map((node) => node.id));

    expect(renderedIds.has('task-9')).toBe(false);
    expect(graph.edges.every((edge) => renderedIds.has(edge.source) && renderedIds.has(edge.target))).toBe(true);
    expect(graph.edges.find((edge) => edge.id === 'e-dep-task-1-task-2')?.label).toBe('hängt ab von');
    expect(graph.edges.some((edge) => edge.id === 'e-dep-task-1-task-9')).toBe(false);
  });
});
