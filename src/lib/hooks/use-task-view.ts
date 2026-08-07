'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TASK_VIEW,
  parseTaskView,
  taskViewQuery,
  type TaskView,
} from '@/lib/task-view';

/**
 * Keep the Tasks view in the URL, so it can be bookmarked, shared and restored.
 *
 * Written against `history` rather than the router's `useSearchParams`, which
 * would drag a Suspense boundary into a page that is already fully client-side.
 * `replaceState` keeps filter changes out of the back-button history; `back`
 * and `forward` between two saved views still work via `popstate`.
 */
export function useTaskView(): [TaskView, (patch: Partial<TaskView>) => void, () => void] {
  const [view, setView] = useState<TaskView>(DEFAULT_TASK_VIEW);

  // Adopt whatever the URL already says, and follow history navigation.
  useEffect(() => {
    const read = () => setView(parseTaskView(new URLSearchParams(window.location.search)));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const update = useCallback((patch: Partial<TaskView>) => {
    setView((current) => {
      const next = { ...current, ...patch };
      const url = `${window.location.pathname}${taskViewQuery(next)}`;
      window.history.replaceState(window.history.state, '', url);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setView(DEFAULT_TASK_VIEW);
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  return [view, update, reset];
}
