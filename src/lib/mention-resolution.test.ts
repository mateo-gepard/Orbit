import { describe, expect, it } from 'vitest';
import { resolveMention } from './mention-resolution';
import type { ItemStatus, ItemType, ThreadmapItem } from './types';

function item(
  id: string,
  title: string,
  extra: { type?: ItemType; status?: ItemStatus; updatedAt?: number } = {}
): ThreadmapItem {
  return {
    id,
    title,
    type: extra.type ?? 'task',
    status: extra.status ?? 'active',
    createdAt: 0,
    updatedAt: extra.updatedAt ?? 0,
    userId: 'u1',
  };
}

describe('resolveMention', () => {
  it('takes an exact title match', () => {
    const items = [item('a', 'Openpulse'), item('b', 'Openpulse Redesign')];
    expect(resolveMention('openpulse', items)).toMatchObject({
      item: { id: 'a' },
      confidence: 'exact',
    });
  });

  it('never matches because the item title is a substring of what was typed (F-11)', () => {
    // "Do" used to match any typed text containing "do" — including a swallowed
    // sentence — and then became the new item's parent.
    const items = [item('p', 'Do', { type: 'project' })];
    expect(resolveMention('john about the report', items)).toBeNull();
    expect(resolveMention('finish the docs', items)).toBeNull();
  });

  it('refuses an ambiguous prefix rather than picking the most recent', () => {
    const items = [
      item('a', 'Website redesign', { updatedAt: 10 }),
      item('b', 'Website copy', { updatedAt: 20 }),
    ];
    expect(resolveMention('website', items)).toBeNull();
  });

  it('accepts an unambiguous prefix as a partial match', () => {
    const items = [item('a', 'Website redesign'), item('b', 'Taxes')];
    expect(resolveMention('website', items)).toMatchObject({
      item: { id: 'a' },
      confidence: 'partial',
    });
  });

  it('accepts an unambiguous substring as a partial match', () => {
    const items = [item('a', 'Q3 Roadmap review'), item('b', 'Taxes')];
    expect(resolveMention('roadmap', items)).toMatchObject({
      item: { id: 'a' },
      confidence: 'partial',
    });
  });

  it('ignores queries too short to guess from', () => {
    const items = [item('a', 'Openpulse')];
    expect(resolveMention('op', items)).toBeNull();
  });

  it('still resolves a short query when it is exact', () => {
    const items = [item('a', 'Op')];
    expect(resolveMention('op', items)).toMatchObject({ confidence: 'exact' });
  });

  it('skips archived items', () => {
    const items = [item('a', 'Openpulse', { status: 'archived' })];
    expect(resolveMention('openpulse', items)).toBeNull();
  });

  it('breaks an exact-match tie by most recently updated', () => {
    const items = [
      item('a', 'Standup', { updatedAt: 10 }),
      item('b', 'Standup', { updatedAt: 99 }),
    ];
    expect(resolveMention('standup', items)).toMatchObject({ item: { id: 'b' } });
  });

  it('returns nothing for an empty query', () => {
    expect(resolveMention('   ', [item('a', 'Openpulse')])).toBeNull();
  });
});
