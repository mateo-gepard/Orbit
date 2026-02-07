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
  priority?: Priority;
  dueDate?: string;
  startDate?: string;
}