import type { ThreadmapItem } from './types';

/**
 * One definition of "matches this search".
 *
 * Search behaved differently on five surfaces: the command bar matched title
 * and tags *and silently included archived items*; Tasks matched title only;
 * Notes matched title and content; Archive matched title and tags; Areas
 * matched title only. Note bodies were unreachable from the global command
 * bar — the one place a user would look for them.
 */

export interface ItemSearchOptions {
  /** Also search note/item bodies. On by default. */
  includeContent?: boolean;
  /** Include archived items in the result. Off by default. */
  includeArchived?: boolean;
}

/** Locale-aware lowercasing, so "MÜNCHEN" matches "münchen" in German. */
function fold(value: string, language: string): string {
  return value.toLocaleLowerCase(language === 'de' ? 'de' : 'en');
}

export function matchesSearch(
  item: ThreadmapItem,
  query: string,
  language: string,
  options: ItemSearchOptions = {}
): boolean {
  const { includeContent = true, includeArchived = false } = options;
  if (!includeArchived && item.status === 'archived') return false;

  const needle = fold(query.trim(), language);
  if (!needle) return true;

  if (fold(item.title, language).includes(needle)) return true;
  if (item.tags?.some((tag) => fold(tag, language).includes(needle))) return true;
  if (includeContent && item.content && fold(item.content, language).includes(needle)) return true;

  return false;
}

export function searchItems(
  items: readonly ThreadmapItem[],
  query: string,
  language: string,
  options: ItemSearchOptions = {}
): ThreadmapItem[] {
  return items.filter((item) => matchesSearch(item, query, language, options));
}
