import { format, addDays, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday } from 'date-fns';
import type { ItemType, ParsedCommand, Priority } from './types';

const TYPE_PREFIXES: Record<string, ItemType> = {
  '/task': 'task',
  '/project': 'project',
  '/event': 'event',
  '/habit': 'habit',
  '/goal': 'goal',
  '/note': 'note',
  '/idea': 'note',
};

/**
 * Types whose primary shape includes a scheduling date, and only those.
 *
 * Date extraction *removes* the matched word from the title, so running it on
 * every type edits the user's prose: `/note Was ich heute gelernt habe` loses
 * "heute", and `/goal Become fluent by friday` loses "friday". German is worst
 * hit, because `heute` and `morgen` are ordinary words in ordinary sentences.
 */
const DATE_BEARING_TYPES: ReadonlySet<ItemType> = new Set<ItemType>(['task', 'event', 'project']);

const DATE_KEYWORDS: Record<string, () => string> = {
  // German
  'heute': () => format(new Date(), 'yyyy-MM-dd'),
  'morgen': () => format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  'übermorgen': () => format(addDays(new Date(), 2), 'yyyy-MM-dd'),
  'montag': () => format(nextMonday(new Date()), 'yyyy-MM-dd'),
  'dienstag': () => format(nextTuesday(new Date()), 'yyyy-MM-dd'),
  'mittwoch': () => format(nextWednesday(new Date()), 'yyyy-MM-dd'),
  'donnerstag': () => format(nextThursday(new Date()), 'yyyy-MM-dd'),
  'freitag': () => format(nextFriday(new Date()), 'yyyy-MM-dd'),
  'samstag': () => format(nextSaturday(new Date()), 'yyyy-MM-dd'),
  'sonntag': () => format(nextSunday(new Date()), 'yyyy-MM-dd'),
  // English
  'today': () => format(new Date(), 'yyyy-MM-dd'),
  'tomorrow': () => format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  'monday': () => format(nextMonday(new Date()), 'yyyy-MM-dd'),
  'tuesday': () => format(nextTuesday(new Date()), 'yyyy-MM-dd'),
  'wednesday': () => format(nextWednesday(new Date()), 'yyyy-MM-dd'),
  'thursday': () => format(nextThursday(new Date()), 'yyyy-MM-dd'),
  'friday': () => format(nextFriday(new Date()), 'yyyy-MM-dd'),
  'saturday': () => format(nextSaturday(new Date()), 'yyyy-MM-dd'),
  'sunday': () => format(nextSunday(new Date()), 'yyyy-MM-dd'),
};

/** `15.12`, `15.12.`, `15.12.25`, `15.12.2025`. */
const NUMERIC_DATE = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4})?)?$/;

/** How many years ahead a year-less date may roll to find a real occurrence. */
const MAX_ROLL_FORWARD_YEARS = 8;

export interface ParseCommandOptions {
  /**
   * Titles of items the user could plausibly mean by an `@` mention. Supplying
   * them lets a multi-word title be consumed whole; without them a bare mention
   * stops at the first space, so it can never swallow the rest of the line.
   */
  knownTitles?: readonly string[];
}

function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolve `DD.MM[.YY[YY]]`, or return null so the word stays in the title.
 *
 * A year-less date rolls forward to its next real occurrence rather than
 * pinning to the current year, which used to land anything earlier in the
 * calendar than today as an already-overdue item. An explicit year is taken
 * literally — a user who types a past year means it.
 */
function resolveNumericDate(word: string): string | null {
  const match = word.match(NUMERIC_DATE);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3];

  if (rawYear) {
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    if (year < 1 || day < 1 || day > daysInMonth(year, month)) return null;
    return toIsoDate(year, month, day);
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const currentYear = new Date().getFullYear();
  for (let offset = 0; offset <= MAX_ROLL_FORWARD_YEARS; offset += 1) {
    const year = currentYear + offset;
    if (day < 1 || day > daysInMonth(year, month)) continue;
    const candidate = toIsoDate(year, month, day);
    if (candidate >= today) return candidate;
  }
  return null;
}

function matchesKnownTitleAtBoundary(rest: string, candidate: string): boolean {
  if (!candidate || rest.length < candidate.length) return false;
  if (rest.slice(0, candidate.length).toLowerCase() !== candidate.toLowerCase()) return false;
  const next = rest[candidate.length];
  return next === undefined || /[\s@#!]/.test(next);
}

/**
 * Pull `@mentions` out of the text.
 *
 * A mention ends at a word boundary. The previous lookahead only terminated at
 * another sigil or end-of-string, so `Fix bug @Openpulse tomorrow` produced the
 * link title "Openpulse tomorrow" *and* silently lost the due date. Multi-word
 * targets are still reachable two ways: quote them (`@"Q3 Roadmap"`), or let a
 * known item title match (which is what the autocomplete inserts).
 */
function extractMentions(
  text: string,
  knownTitles: readonly string[]
): { text: string; titles: string[] } {
  const titles: string[] = [];
  // Longest first, so `@Home Lab` prefers "Home Lab" over "Home".
  const candidates = knownTitles.filter(Boolean).slice().sort((a, b) => b.length - a.length);
  let out = '';
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    // An `@` only opens a mention at the start of a word, which leaves email
    // addresses and handles inside words as ordinary text.
    if (char !== '@' || (index > 0 && !/\s/.test(text[index - 1]))) {
      out += char;
      index += 1;
      continue;
    }

    const rest = text.slice(index + 1);

    const quoted = rest.match(/^(["'])([^"']+)\1/);
    if (quoted) {
      titles.push(quoted[2].trim());
      index += 1 + quoted[0].length;
      continue;
    }

    const known = candidates.find((candidate) => matchesKnownTitleAtBoundary(rest, candidate));
    if (known) {
      titles.push(rest.slice(0, known.length).trim());
      index += 1 + known.length;
      continue;
    }

    const token = rest.match(/^[^\s@#!]+/);
    if (token) {
      titles.push(token[0]);
      index += 1 + token[0].length;
      continue;
    }

    // A dangling `@` is just a character the user typed.
    out += char;
    index += 1;
  }

  return { text: out.replace(/\s+/g, ' ').trim(), titles };
}

export function parseCommand(input: string, options: ParseCommandOptions = {}): ParsedCommand {
  let text = input.trim();
  let type: ItemType = 'task';
  const tags: string[] = [];
  let priority: Priority | undefined;
  let dueDate: string | undefined;
  let startDate: string | undefined;

  // Extract type prefix. The prefix must be followed by a boundary, so
  // "/taskmaster" stays a title rather than becoming a task called "master".
  for (const [prefix, itemType] of Object.entries(TYPE_PREFIXES)) {
    const lower = text.toLowerCase();
    if (lower.startsWith(prefix) && (text.length === prefix.length || /\s/.test(text[prefix.length]))) {
      type = itemType;
      text = text.slice(prefix.length).trim();
      // Special: /idea sets note subtype
      if (prefix === '/idea') {
        tags.push('idea');
      }
      break;
    }
  }

  // Extract tags (#tag)
  const tagRegex = /#([\p{L}\p{M}\p{N}_-]+)/gu;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    const tag = tagMatch[1].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  text = text.replace(tagRegex, '').trim();

  // Extract links (@item title)
  const mentions = extractMentions(text, options.knownTitles ?? []);
  const linkedItemTitles = mentions.titles;
  text = mentions.text;

  // Extract priority (!priority). The trailing boundary keeps "!highlight"
  // from reading as "!high" plus a stray "light".
  const priorityRegex = /!(low|medium|high)\b/i;
  const priorityMatch = text.match(priorityRegex);
  if (priorityMatch) {
    priority = priorityMatch[1].toLowerCase() as Priority;
    text = text.replace(priorityRegex, '').trim();
  }

  let title = text.replace(/\s+/g, ' ').trim();

  if (DATE_BEARING_TYPES.has(type)) {
    const remainingWords: string[] = [];
    let resolved: string | undefined;

    for (const word of title.split(/\s+/)) {
      // First date wins, so a second date-like word stays as prose.
      if (resolved) {
        remainingWords.push(word);
        continue;
      }
      const keyword = DATE_KEYWORDS[word.toLowerCase()];
      if (keyword) {
        resolved = keyword();
        continue;
      }
      const numeric = resolveNumericDate(word);
      if (numeric) {
        resolved = numeric;
        continue;
      }
      remainingWords.push(word);
    }

    if (resolved) {
      if (type === 'event') startDate = resolved;
      else dueDate = resolved;
    }
    title = remainingWords.join(' ').replace(/\s+/g, ' ').trim();
  }

  return {
    type,
    title,
    tags,
    linkedItemTitles,
    priority,
    dueDate,
    startDate,
  };
}
