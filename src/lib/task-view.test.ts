import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_VIEW,
  isDefaultTaskView,
  parseTaskView,
  taskViewQuery,
  taskViewToParams,
  type TaskView,
} from './task-view';

const parse = (query: string) => parseTaskView(new URLSearchParams(query));

describe('parseTaskView', () => {
  it('returns the default view for an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_TASK_VIEW);
  });

  it('reads a full view', () => {
    expect(parse('status=waiting&tag=uni&priority=high&q=exam&sort=title&dir=desc&group=project'))
      .toEqual({
        status: 'waiting',
        tag: 'uni',
        priority: 'high',
        search: 'exam',
        sort: 'title',
        ascending: false,
        group: 'project',
      });
  });

  it('falls back to defaults for unrecognised values rather than erroring', () => {
    expect(parse('status=nonsense&sort=colour&group=galaxy&priority=urgent')).toEqual(DEFAULT_TASK_VIEW);
  });

  it('bounds free text so a hostile URL cannot blow up the filter', () => {
    const long = 'x'.repeat(500);
    const view = parse(`q=${long}&tag=${long}`);
    expect(view.search).toHaveLength(200);
    expect(view.tag).toHaveLength(64);
  });

  it('treats any dir other than desc as ascending', () => {
    expect(parse('dir=asc').ascending).toBe(true);
    expect(parse('dir=sideways').ascending).toBe(true);
    expect(parse('dir=desc').ascending).toBe(false);
  });
});

describe('taskViewToParams', () => {
  it('writes nothing for the default view', () => {
    expect(taskViewToParams(DEFAULT_TASK_VIEW).toString()).toBe('');
    expect(taskViewQuery(DEFAULT_TASK_VIEW)).toBe('');
    expect(isDefaultTaskView(DEFAULT_TASK_VIEW)).toBe(true);
  });

  it('writes only what differs from the default', () => {
    const view: TaskView = { ...DEFAULT_TASK_VIEW, status: 'waiting', tag: 'uni' };
    expect(taskViewToParams(view).toString()).toBe('status=waiting&tag=uni');
    expect(isDefaultTaskView(view)).toBe(false);
  });

  it('trims the search term and drops it when blank', () => {
    expect(taskViewToParams({ ...DEFAULT_TASK_VIEW, search: '  ' }).toString()).toBe('');
    expect(taskViewToParams({ ...DEFAULT_TASK_VIEW, search: '  exam ' }).get('q')).toBe('exam');
  });

  it('round-trips every view it can produce', () => {
    const view: TaskView = {
      status: 'all',
      tag: 'health',
      priority: 'low',
      search: 'gym',
      sort: 'createdAt',
      ascending: false,
      group: 'tag',
    };
    expect(parseTaskView(taskViewToParams(view))).toEqual(view);
  });

  it('prefixes the query only when there is one', () => {
    expect(taskViewQuery({ ...DEFAULT_TASK_VIEW, group: 'goal' })).toBe('?group=goal');
  });
});
