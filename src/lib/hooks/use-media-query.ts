'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Tracks a CSS media query from JavaScript.
 *
 * Required wherever a responsive branch renders a portalled component. A portal
 * mounts onto `document.body`, so a `lg:hidden` wrapper around it hides
 * nothing: the component still renders, still stacks on top of its desktop
 * counterpart, and — for modal content — still locks body scroll. Gate the
 * branch on this hook instead of a responsive class.
 *
 * Returns `false` while server rendering, and the real value from the first
 * client render onward.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onStoreChange);
    return () => list.removeEventListener('change', onStoreChange);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches Tailwind's `lg` breakpoint, where the app switches to side panels. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';
