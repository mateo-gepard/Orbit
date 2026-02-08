// ═══════════════════════════════════════════════════════════
// ORBIT — Universal Item Types
// ═══════════════════════════════════════════════════════════

export type ItemType = 'task' | 'project' | 'habit' | 'event' | 'goal' | 'note';

export type ItemStatus = 'inbox' | 'active' | 'waiting' | 'done' | 'archived';

export type Priority = 'low' | 'medium' | 'high';

export type GoalTimeframe = 'quarterly' | 'yearly' | 'longterm';

export type HabitFrequency = 'daily' | 'weekly' | 'custom';

export type NoteSubtype = 'idea' | 'principle' | 'plan' | 'journal' | 'general';

export const LIFE_AREA_TAGS = [
  'tech', 'uni', 'career', 'health', 'family',
  'social', 'growth', 'finance', 'home', 'personal', 'life'
] as const;

export const NOTE_TAGS = ['idea', 'principle', 'plan', 'journal'] as const;

export type LifeAreaTag = typeof LIFE_AREA_TAGS[number];

// ═══════════════════════════════════════════════════════════
// The Universal Item
// ═══════════════════════════════════════════════════════════

export interface OrbitItem {
  id: string;
  type: ItemType;
  status: ItemStatus;
  title: string;
  content?: string; // Rich text (HTML from Tiptap)
  createdAt: number; // timestamp
  updatedAt: number;
  completedAt?: number;

  // Task fields
  dueDate?: string; // ISO date string YYYY-MM-DD
  priority?: Priority;
  assignee?: string;
  checklist?: ChecklistItem[];

  // Project fields
  emoji?: string;
  color?: string;

  // Habit fields
  frequency?: HabitFrequency;
  customDays?: number[]; // 0=Mon, 1=Tue, ... 6=Sun
  habitTime?: string; // HH:mm
  completions?: Record<string, boolean>; // { "2026-02-07": true }

  // Event fields
  startDate?: string; // ISO date string
  endDate?: string;
  startTime?: string; // HH:mm
  endTime?: string;
  googleCalendarId?: string;

  // Goal fields
  timeframe?: GoalTimeframe;
  metric?: string; // Success metric as free text

  // Note fields
  noteSubtype?: NoteSubtype;

  // Relations
  parentId?: string;
  linkedIds?: string[];
  tags?: string[];

  // Google Calendar sync
  calendarSynced?: boolean;

  // User
  userId: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

// ═══════════════════════════════════════════════════════════
// Parsed Command
// ═══════════════════════════════════════════════════════════

export interface ParsedCommand {
  type: ItemType;
  title: string;
  tags: string[];
  linkedItemTitles?: string[];
  priority?: Priority;
  dueDate?: string;
  startDate?: string;
}

// ═══════════════════════════════════════════════════════════
// Analytics Events
// ═══════════════════════════════════════════════════════════

export type AnalyticsAction =
  | 'item_created'
  | 'item_completed'
  | 'item_uncompleted'
  | 'item_archived'
  | 'item_unarchived'
  | 'item_updated'
  | 'item_deleted'
  | 'habit_checked'
  | 'habit_unchecked'
  | 'session_start'
  | 'session_end';

export interface AnalyticsEvent {
  id: string;
  userId: string;
  action: AnalyticsAction;
  timestamp: number;        // Date.now()
  date: string;             // YYYY-MM-DD (for easy daily queries)
  hour: number;             // 0–23 (for time-of-day patterns)

  // Item context (what was acted on)
  itemId?: string;
  itemType?: ItemType;
  itemTitle?: string;       // Snapshot — useful for timeline display

  // Relationships
  parentId?: string;        // Project or goal this belongs to
  tags?: string[];

  // Task-specific
  priority?: Priority;
  dueDate?: string;

  // Duration context
  durationMs?: number;      // Time from creation to completion (task cycle time)

  // Session context
  sessionId?: string;       // Groups events in one app open
}
