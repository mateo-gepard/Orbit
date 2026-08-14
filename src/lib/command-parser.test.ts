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

  it('validates dates without a year against the year it resolves into', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-01-10T12:00:00Z'));
    expect(parseCommand('Review 29.02')).toMatchObject({
      title: 'Review',
      dueDate: '2028-02-29',
    });
  });

  it('rolls a year-less date forward instead of resolving into the past (F-13)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('Taxes 1.3')).toMatchObject({
      title: 'Taxes',
      dueDate: '2027-03-01',
    });
    expect(parseCommand('Review 15.12')).toMatchObject({
      title: 'Review',
      dueDate: '2026-12-15',
    });
  });

  it('keeps today itself in the current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('Standup 7.8')).toMatchObject({ dueDate: '2026-08-07' });
  });

  it('rolls forward past a 29 February that the next year does not have', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    // 2027 has no 29 February, so the next real occurrence is in 2028.
    expect(parseCommand('Leap 29.2')).toMatchObject({
      title: 'Leap',
      dueDate: '2028-02-29',
    });
  });

  it('honours an explicit year even when it is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('Filed 1.3.2024')).toMatchObject({ dueDate: '2024-03-01' });
  });

  it('lets the first date win so later date words stay as prose', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('Call today about tomorrow')).toMatchObject({
      title: 'Call about tomorrow',
      dueDate: '2026-08-07',
    });
  });

  it('routes dates to startDate for events', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('/event Standup tomorrow')).toMatchObject({
      type: 'event',
      title: 'Standup',
      startDate: '2026-08-08',
      dueDate: undefined,
    });
  });
});

describe('parseCommand date keywords do not edit prose (F-12)', () => {
  it('leaves a note title untouched', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('/note Was ich heute gelernt habe')).toMatchObject({
      type: 'note',
      title: 'Was ich heute gelernt habe',
      dueDate: undefined,
    });
    expect(parseCommand('/note Ideas for the Monday meeting')).toMatchObject({
      title: 'Ideas for the Monday meeting',
      dueDate: undefined,
    });
  });

  it('leaves a goal title untouched', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('/goal Become fluent by friday')).toMatchObject({
      type: 'goal',
      title: 'Become fluent by friday',
      dueDate: undefined,
    });
  });

  it('leaves a habit title untouched', () => {
    expect(parseCommand('/habit Read every morgen')).toMatchObject({
      type: 'habit',
      title: 'Read every morgen',
      dueDate: undefined,
    });
  });

  it('still extracts dates for tasks, events and projects', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('/task Pay rent heute')).toMatchObject({
      title: 'Pay rent',
      dueDate: '2026-08-07',
    });
    expect(parseCommand('/project Launch site 15.12')).toMatchObject({
      title: 'Launch site',
      dueDate: '2026-12-15',
    });
  });

  it('does not strip a date keyword that is part of a longer word', () => {
    expect(parseCommand('Fix the todays-report script')).toMatchObject({
      title: 'Fix the todays-report script',
      dueDate: undefined,
    });
  });
});

describe('parseCommand mentions (F-10)', () => {
  it('stops a bare mention at the first word boundary', () => {
    expect(parseCommand('Email @john about the report')).toMatchObject({
      title: 'Email about the report',
      linkedItemTitles: ['john'],
    });
  });

  it('keeps a date keyword that follows a mention', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(parseCommand('/task Fix bug @Openpulse tomorrow')).toMatchObject({
      title: 'Fix bug',
      linkedItemTitles: ['Openpulse'],
      dueDate: '2026-08-08',
    });
  });

  it('reads consecutive mentions as separate links', () => {
    expect(parseCommand('/task ping @Alice @Bob now')).toMatchObject({
      title: 'ping now',
      linkedItemTitles: ['Alice', 'Bob'],
    });
  });

  it('accepts a quoted multi-word mention', () => {
    expect(parseCommand('Draft spec @"Q3 Roadmap" #uni')).toMatchObject({
      title: 'Draft spec',
      linkedItemTitles: ['Q3 Roadmap'],
      tags: ['uni'],
    });
  });

  it('consumes a multi-word title when it is a known item', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
    expect(
      parseCommand('/task Draft spec @Q3 Roadmap tomorrow', {
        knownTitles: ['Q3 Roadmap', 'Q3'],
      })
    ).toMatchObject({
      title: 'Draft spec',
      linkedItemTitles: ['Q3 Roadmap'],
      dueDate: '2026-08-08',
    });
  });

  it('prefers the longest known title that matches', () => {
    expect(
      parseCommand('note @Home Lab things', { knownTitles: ['Home', 'Home Lab'] })
    ).toMatchObject({ linkedItemTitles: ['Home Lab'], title: 'note things' });
  });

  it('does not treat an email address as a mention', () => {
    expect(parseCommand('Email mateo@example.com about the PCB')).toMatchObject({
      title: 'Email mateo@example.com about the PCB',
      linkedItemTitles: [],
    });
  });

  it('leaves a dangling @ alone', () => {
    expect(parseCommand('Ask about @')).toMatchObject({
      title: 'Ask about @',
      linkedItemTitles: [],
    });
  });

  it('does not let a mention swallow a tag or a priority', () => {
    expect(parseCommand('/task Ship it @release !high #tech')).toMatchObject({
      title: 'Ship it',
      linkedItemTitles: ['release'],
      priority: 'high',
      tags: ['tech'],
    });
  });
});

describe('parseCommand tags', () => {
  it('supports Unicode letters, combining marks, numbers, underscores, and hyphens', () => {
    expect(parseCommand('Plan #München #café #équipe-2')).toMatchObject({
      title: 'Plan',
      tags: ['münchen', 'café', 'équipe-2'],
    });
  });

  it('does not report the same tag twice', () => {
    expect(parseCommand('Plan #tech #tech #Tech')).toMatchObject({ tags: ['tech'] });
  });
});

describe('parseCommand priority', () => {
  it('does not match a priority word embedded in a longer word', () => {
    expect(parseCommand('Fix the !highlight renderer')).toMatchObject({
      title: 'Fix the !highlight renderer',
      priority: undefined,
    });
  });

  it('reads a standalone priority', () => {
    expect(parseCommand('Fix the renderer !high')).toMatchObject({
      title: 'Fix the renderer',
      priority: 'high',
    });
  });
});

describe('parseCommand type prefixes', () => {
  it('maps /idea to a note tagged idea', () => {
    expect(parseCommand('/idea Ship a CLI')).toMatchObject({
      type: 'note',
      title: 'Ship a CLI',
      tags: ['idea'],
    });
  });

  it('only treats a prefix as a prefix when a boundary follows it', () => {
    expect(parseCommand('/taskmaster setup')).toMatchObject({
      type: 'task',
      title: '/taskmaster setup',
    });
  });
});
