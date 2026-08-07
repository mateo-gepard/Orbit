import { describe, expect, it } from 'vitest';
import { matchesSearch, searchItems } from './item-search';
import type { ItemStatus, OrbitItem } from './types';

function item(
  id: string,
  extra: { title?: string; content?: string; tags?: string[]; status?: ItemStatus } = {}
): OrbitItem {
  return {
    id,
    title: extra.title ?? id,
    type: 'note',
    status: extra.status ?? 'active',
    createdAt: 0,
    updatedAt: 0,
    userId: 'u1',
    ...(extra.content ? { content: extra.content } : {}),
    ...(extra.tags ? { tags: extra.tags } : {}),
  };
}

describe('matchesSearch', () => {
  it('matches title, tags and content alike (F-15)', () => {
    const note = item('n', { title: 'Groceries', content: 'Buy oat milk', tags: ['home'] });
    expect(matchesSearch(note, 'groc', 'en')).toBe(true);
    expect(matchesSearch(note, 'oat milk', 'en')).toBe(true);
    expect(matchesSearch(note, 'home', 'en')).toBe(true);
    expect(matchesSearch(note, 'bicycle', 'en')).toBe(false);
  });

  it('can be told to ignore bodies', () => {
    const note = item('n', { title: 'Groceries', content: 'Buy oat milk' });
    expect(matchesSearch(note, 'oat', 'en', { includeContent: false })).toBe(false);
  });

  it('excludes archived items unless asked (the command bar used to include them unlabelled)', () => {
    const archived = item('a', { title: 'Old plan', status: 'archived' });
    expect(matchesSearch(archived, 'plan', 'en')).toBe(false);
    expect(matchesSearch(archived, 'plan', 'en', { includeArchived: true })).toBe(true);
  });

  it('treats an empty query as matching everything visible', () => {
    expect(matchesSearch(item('n'), '   ', 'en')).toBe(true);
    expect(matchesSearch(item('a', { status: 'archived' }), '', 'en')).toBe(false);
  });

  it('folds case using the active language', () => {
    const note = item('n', { title: 'MÜNCHEN' });
    expect(matchesSearch(note, 'münchen', 'de')).toBe(true);
    expect(matchesSearch(note, 'MÜNCHEN', 'de')).toBe(true);
  });

  it('filters a list', () => {
    const items = [
      item('a', { title: 'Alpha' }),
      item('b', { title: 'Beta', content: 'mentions alpha' }),
      item('c', { title: 'Gamma' }),
    ];
    expect(searchItems(items, 'alpha', 'en').map((i) => i.id)).toEqual(['a', 'b']);
  });
});
