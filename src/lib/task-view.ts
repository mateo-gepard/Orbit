import type { Priority } from './types';
import type { SortKey } from './task-sort';

/**
 * The Tasks page's view, as data.
 *
 * Status, tag, priority, search, sort, grouping and collapsed groups all lived
 * in component state, so every one of them reset on navigation and none of
 * them was in the URL — a filtered view could not be bookmarked, shared or
 * saved. For an app built on views over a single item graph, that plumbing is
 * the thing saved views are made of.
 */

export type FilterStatus = 'active' | 'waiting' | 'done' | 'all';
export type GroupBy = 'none' | 'project' | 'goal' | 'priority' | 'dueDate' | 'tag';

export interface TaskView {
  status: FilterStatus;
  tag: string | null;
  priority: Priority | null;
  search: string;
  sort: SortKey;
  ascending: boolean;
  group: GroupBy;
}

export const DEFAULT_TASK_VIEW: TaskView = {
  status: 'active',
  tag: null,
  priority: null,
  search: '',
  sort: 'dueDate',
  ascending: true,
  group: 'none',
};

const STATUSES: readonly FilterStatus[] = ['active', 'waiting', 'done', 'all'];
const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];
const SORTS: readonly SortKey[] = ['dueDate', 'priority', 'createdAt', 'title'];
const GROUPS: readonly GroupBy[] = ['none', 'project', 'goal', 'priority', 'dueDate', 'tag'];

const MAX_SEARCH_LENGTH = 200;
const MAX_TAG_LENGTH = 64;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Read a view out of query parameters. Anything unrecognised falls back to the
 * default rather than erroring — a hand-edited or stale URL should still open.
 */
export function parseTaskView(params: URLSearchParams): TaskView {
  const tag = params.get('tag');
  const priority = params.get('priority');
  const search = params.get('q');

  return {
    status: oneOf(params.get('status'), STATUSES, DEFAULT_TASK_VIEW.status),
    tag: tag ? tag.slice(0, MAX_TAG_LENGTH) : null,
    priority: priority !== null && (PRIORITIES as readonly string[]).includes(priority)
      ? (priority as Priority)
      : null,
    search: search ? search.slice(0, MAX_SEARCH_LENGTH) : '',
    sort: oneOf(params.get('sort'), SORTS, DEFAULT_TASK_VIEW.sort),
    ascending: params.get('dir') !== 'desc',
    group: oneOf(params.get('group'), GROUPS, DEFAULT_TASK_VIEW.group),
  };
}

/**
 * Write a view to query parameters, omitting anything at its default so a
 * plain view has a clean URL.
 */
export function taskViewToParams(view: TaskView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_TASK_VIEW.status) params.set('status', view.status);
  if (view.tag) params.set('tag', view.tag);
  if (view.priority) params.set('priority', view.priority);
  if (view.search.trim()) params.set('q', view.search.trim());
  if (view.sort !== DEFAULT_TASK_VIEW.sort) params.set('sort', view.sort);
  if (!view.ascending) params.set('dir', 'desc');
  if (view.group !== DEFAULT_TASK_VIEW.group) params.set('group', view.group);
  return params;
}

export function isDefaultTaskView(view: TaskView): boolean {
  return taskViewToParams(view).toString() === '';
}

/** The query string for a view, with the leading `?`, or '' when default. */
export function taskViewQuery(view: TaskView): string {
  const query = taskViewToParams(view).toString();
  return query ? `?${query}` : '';
}
