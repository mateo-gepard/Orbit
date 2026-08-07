import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCommand } from './command-parser';

afterEach(() => {
  vi.useRealTimers();
});

describe('parseCommand dates', () => {
  it('accepts a real leap day', () => {
    expect(parseCommand('Review 29.02.2028')).toMatchObject({
      title: 'Review',
      dueDate: '2028-02-29',
    });
  });

  it('keeps impossible dates in the title instead of normalizing them', () => {
    expect(parseCommand('Review 31.02.2028')).toMatchObject({
      title: 'Review 31.02.2028',
      dueDate: undefined,
    });
    expect(parseCommand('Review 29.02.2027')).toMatchObject({
      title: 'Review 29.02.2027',
      dueDate: undefined,
    });
  });

  it('validates dates without a year against the current leap year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-01-10T12:00:00Z'));
    expect(parseCommand('Review 29.02')).toMatchObject({
      title: 'Review',
      dueDate: '2028-02-29',
    });
  });
});

describe('parseCommand tags', () => {
  it('supports Unicode letters, combining marks, numbers, underscores, and hyphens', () => {
    expect(parseCommand('Plan #München #café #e\u0301quipe-2')).toMatchObject({
      title: 'Plan',
      tags: ['münchen', 'café', 'e\u0301quipe-2'],
    });
  });
});
