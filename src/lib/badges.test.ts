import { describe, expect, it } from 'vitest';
import { computeBadges } from './badges';
import type { OrbitItem } from './types';

function item(id: string, linkedIds: string[] = []): OrbitItem {
  const now = Date.now();
  return {
    id,
    userId: 'test-user',
    type: 'task',
    title: id,
    status: 'active',
    priority: 'low',
    tags: [],
    linkedIds,
    createdAt: now,
    updatedAt: now,
  };
}

describe('connection badge progress', () => {
  it('counts a bidirectional relationship as one connection', () => {
    const categories = computeBadges([
      item('a', ['b']),
      item('b', ['a']),
    ]);

    expect(categories.find((category) => category.id === 'links')?.badges[0].current).toBe(1);
  });

  it('counts legacy one-way links while ignoring self-links and missing targets', () => {
    const categories = computeBadges([
      item('a', ['b', 'a', 'missing']),
      item('b'),
    ]);

    expect(categories.find((category) => category.id === 'links')?.badges[0].current).toBe(1);
  });
});
