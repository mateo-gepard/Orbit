import type { ThreadmapItem } from './types';

/**
 * How confident we are that a typed `@mention` means a particular item.
 *
 * The distinction matters because a resolved mention can become a *hierarchy
 * parent*, not just a peer link. Reparenting on a guess moves the user's item
 * somewhere they never asked for, so only an `exact` match is allowed to do it.
 */
export type MentionConfidence = 'exact' | 'partial';

export interface MentionMatch {
  item: ThreadmapItem;
  confidence: MentionConfidence;
}

/** Below this, a partial match is too weak to be worth guessing from. */
const MIN_PARTIAL_QUERY_LENGTH = 3;

function mostRecent(items: ThreadmapItem[]): ThreadmapItem {
  return items.reduce((best, candidate) =>
    (candidate.updatedAt ?? 0) > (best.updatedAt ?? 0) ? candidate : best
  );
}

/**
 * Resolve the title typed after `@` to an item.
 *
 * The previous implementation also tested `typedText.includes(item.title)`,
 * which meant *any* item whose title happened to be a substring of what the
 * user typed qualified — and the first hit in `updatedAt desc` order won. A
 * project called "Do" matched almost every sentence. That direction is gone:
 * a match now requires the item's title to contain the query, never the
 * reverse, and an ambiguous partial match resolves to nothing rather than to
 * whichever item was touched last.
 */
export function resolveMention(query: string, items: readonly ThreadmapItem[]): MentionMatch | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const candidates = items.filter((item) => item.status !== 'archived');

  const exact = candidates.filter((item) => item.title.trim().toLowerCase() === needle);
  if (exact.length > 0) return { item: mostRecent(exact), confidence: 'exact' };

  if (needle.length < MIN_PARTIAL_QUERY_LENGTH) return null;

  const prefix = candidates.filter((item) => item.title.trim().toLowerCase().startsWith(needle));
  if (prefix.length === 1) return { item: prefix[0], confidence: 'partial' };
  // More than one item starts with what was typed: the user has to disambiguate.
  if (prefix.length > 1) return null;

  const substring = candidates.filter((item) => item.title.trim().toLowerCase().includes(needle));
  if (substring.length === 1) return { item: substring[0], confidence: 'partial' };

  return null;
}
