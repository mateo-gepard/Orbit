'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Multi-select over a list of ids.
 *
 * There was no multi-select anywhere in the app: no bulk complete, tag,
 * reschedule, archive or delete, and Archive could restore but never purge —
 * so removing archived items meant one at a time through the detail panel.
 */
export function useBulkSelection(visibleIds: readonly string[]) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Ids that have scrolled out of the filter should not stay selected, or a
  // bulk action would hit rows the user can no longer see.
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const effective = useMemo(
    () => new Set([...selected].filter((id) => visible.has(id))),
    [selected, visible]
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(visibleIds)), [visibleIds]);
  const clear = useCallback(() => setSelected(new Set()), []);

  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  return {
    selecting,
    startSelecting: () => setSelecting(true),
    stopSelecting,
    selectedIds: [...effective],
    count: effective.size,
    allSelected: visibleIds.length > 0 && effective.size === visibleIds.length,
    isSelected: (id: string) => effective.has(id),
    toggle,
    selectAll,
    clear,
  };
}
