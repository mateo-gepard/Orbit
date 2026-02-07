import { format, addDays, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday, parse, isValid } from 'date-fns';
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

const PRIORITY_MAP: Record<string, Priority> = {
  '!low': 'low',
  '!medium': 'medium',
  '!high': 'high',
};

export function parseCommand(input: string): ParsedCommand {
  let text = input.trim();
  let type: ItemType = 'task';
  const tags: string[] = [];
  let priority: Priority | undefined;
  let dueDate: string | undefined;
  let startDate: string | undefined;

  // Extract type prefix
  for (const [prefix, itemType] of Object.entries(TYPE_PREFIXES)) {
    if (text.toLowerCase().startsWith(prefix)) {
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
  const tagRegex = /#(\w+)/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    tags.push(tagMatch[1].toLowerCase());
  }
  text = text.replace(tagRegex, '').trim();

  // Extract priority (!priority)
  const priorityRegex = /!(low|medium|high)/i;
  const priorityMatch = text.match(priorityRegex);
  if (priorityMatch) {
    priority = priorityMatch[1].toLowerCase() as Priority;
    text = text.replace(priorityRegex, '').trim();
  }

  // Extract date keywords
  const words = text.split(/\s+/);
  const remainingWords: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (DATE_KEYWORDS[lower]) {
      if (type === 'event') {
        startDate = DATE_KEYWORDS[lower]();
      } else {
        dueDate = DATE_KEYWORDS[lower]();
      }
    } else {
      // Try DD.MM or DD.MM.YY or DD.MM.YYYY format
      const dateMatch = word.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        if (!year) {
          year = new Date().getFullYear().toString();
        } else if (year.length === 2) {
          year = '20' + year;
        }
        const dateStr = `${year}-${month}-${day}`;
        const parsed = new Date(dateStr);
        if (isValid(parsed)) {
          if (type === 'event') {
            startDate = dateStr;
          } else {
            dueDate = dateStr;
          }
        } else {
          remainingWords.push(word);
        }
      } else {
        remainingWords.push(word);
      }
    }
  }

  const title = remainingWords.join(' ').replace(/\s+/g, ' ').trim();

  return {
    type,
    title,
    tags,
    priority,
    dueDate,
    startDate,
  };
}
