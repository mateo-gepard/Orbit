// ═══════════════════════════════════════════════════════════
// Threadmap — Universal Item Types
// ═══════════════════════════════════════════════════════════

import type { RecurrenceRule } from './recurrence';

export type { RecurrenceRule };

export type ItemType = 'task' | 'project' | 'habit' | 'event' | 'goal' | 'note';

export type ItemStatus = 'active' | 'waiting' | 'done' | 'archived';

export type Priority = 'low' | 'medium' | 'high';

export type GoalTimeframe = 'quarterly' | 'yearly' | 'longterm';

export type ProjectTier = 1 | 2 | 3;

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
  /**
   * Plain text. The note editor is a `<textarea>`; this said "Rich text
   * (HTML from Tiptap)" while holding nothing of the kind, and the MCP
   * layer's `htmlToPlainText` was written against that false claim and
   * silently destroyed content because of it.
   */
  content?: string;
  createdAt: number; // timestamp
  updatedAt: number;
  /** Monotonic cloud revision used to reject stale cross-device writes. */
  revision?: number;
  completedAt?: number;
  /**
   * When the user last pulled this item back out of the Archive. The
   * auto-archive retention clock measures from here when it is newer than
   * `completedAt`, so restoring gives the item a fresh window instead of
   * putting it straight back where it came from on the next render.
   */
  restoredAt?: number;

  // Task fields
  dueDate?: string; // ISO date string YYYY-MM-DD
  priority?: Priority;
  checklist?: ChecklistItem[];

  // Project fields
  emoji?: string;
  color?: string;
  tier?: ProjectTier;

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
  /**
   * A repeating event is one item carrying its rule, expanded by the views
   * that draw it — not one item per occurrence.
   */
  recurrence?: RecurrenceRule;
  /** Google's series id, when this item came from a recurring Google event. */
  googleRecurringEventId?: string;

  // Goal fields
  timeframe?: GoalTimeframe;
  metric?: string; // Success metric as free text

  // Note fields
  noteSubtype?: NoteSubtype;

  // Relations
  parentId?: string;
  linkedIds?: string[];
  tags?: string[];

  // File Attachments
  files?: ProjectFile[];

  // My Day — marks a task as added to "Today" view (YYYY-MM-DD)
  myDay?: string;

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

export interface ProjectFile {
  id: string;
  name: string;
  size: number; // bytes
  type: string; // MIME type
  /** Legacy long-lived download URL. New uploads resolve through the authenticated SDK. */
  url?: string;
  storagePath: string; // Firebase Storage path for deletion
  /** Retained until an idempotent legacy-path migration deletes the old object. */
  legacyStoragePath?: string;
  uploadedAt: number; // timestamp
  uploadedBy: string; // userId
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
