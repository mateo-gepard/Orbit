import type { OrbitItem } from './types';
import { calculateStreak } from './habits';

// ═══════════════════════════════════════════════════════════
// ORBIT — Badge & Achievement System
// ═══════════════════════════════════════════════════════════

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface BadgeDefinition {
  id: string;
  category: string;
  tier: BadgeTier;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  threshold: number;
  tierIndex: number; // 0-based position within category
}

export interface EarnedBadge extends BadgeDefinition {
  earned: boolean;
  current: number; // current progress value
}

export interface BadgeCategory {
  id: string;
  label: string;
  icon: string;
  badges: EarnedBadge[];
  highestEarned: EarnedBadge | null;
}

// ─── Tier Styling ──────────────────────────────────────────

export const TIER_STYLES: Record<BadgeTier, {
  bg: string;
  border: string;
  text: string;
  glow: string;
  ring: string;
  label: string;
}> = {
  bronze: {
    bg: 'bg-amber-900/10 dark:bg-amber-800/15',
    border: 'border-amber-700/20 dark:border-amber-600/25',
    text: 'text-amber-800 dark:text-amber-400',
    glow: '',
    ring: 'ring-amber-700/10',
    label: 'Bronze',
  },
  silver: {
    bg: 'bg-slate-300/15 dark:bg-slate-400/10',
    border: 'border-slate-400/25 dark:border-slate-400/20',
    text: 'text-slate-600 dark:text-slate-300',
    glow: '',
    ring: 'ring-slate-400/10',
    label: 'Silver',
  },
  gold: {
    bg: 'bg-yellow-500/10 dark:bg-yellow-500/10',
    border: 'border-yellow-500/25 dark:border-yellow-500/20',
    text: 'text-yellow-700 dark:text-yellow-400',
    glow: 'shadow-[0_0_8px_rgba(234,179,8,0.1)]',
    ring: 'ring-yellow-500/15',
    label: 'Gold',
  },
  platinum: {
    bg: 'bg-cyan-500/8 dark:bg-cyan-400/10',
    border: 'border-cyan-500/20 dark:border-cyan-400/20',
    text: 'text-cyan-700 dark:text-cyan-300',
    glow: 'shadow-[0_0_12px_rgba(6,182,212,0.1)]',
    ring: 'ring-cyan-500/15',
    label: 'Platinum',
  },
  diamond: {
    bg: 'bg-violet-500/8 dark:bg-violet-400/10',
    border: 'border-violet-500/20 dark:border-violet-400/20',
    text: 'text-violet-700 dark:text-violet-300',
    glow: 'shadow-[0_0_16px_rgba(139,92,246,0.12)]',
    ring: 'ring-violet-500/15',
    label: 'Diamond',
  },
};

// ─── Badge Definitions ─────────────────────────────────────

const BADGE_DEFS: BadgeDefinition[] = [
  // ── Streak Badges ──
  { id: 'streak-1', category: 'streak', tier: 'bronze',   name: 'Spark',          description: 'Maintain a 7-day habit streak',    icon: 'Flame',    threshold: 7,   tierIndex: 0 },
  { id: 'streak-2', category: 'streak', tier: 'silver',   name: 'Kindling',       description: 'Maintain a 14-day habit streak',   icon: 'Flame',    threshold: 14,  tierIndex: 1 },
  { id: 'streak-3', category: 'streak', tier: 'gold',     name: 'Bonfire',        description: 'Maintain a 30-day habit streak',   icon: 'Flame',    threshold: 30,  tierIndex: 2 },
  { id: 'streak-4', category: 'streak', tier: 'platinum', name: 'Inferno',        description: 'Maintain a 90-day habit streak',   icon: 'Flame',    threshold: 90,  tierIndex: 3 },
  { id: 'streak-5', category: 'streak', tier: 'diamond',  name: 'Eternal Flame',  description: 'Maintain a 365-day habit streak',  icon: 'Flame',    threshold: 365, tierIndex: 4 },

  // ── Task Badges ──
  { id: 'tasks-1', category: 'tasks', tier: 'bronze',   name: 'First Steps',     description: 'Complete 10 tasks',   icon: 'CheckSquare', threshold: 10,   tierIndex: 0 },
  { id: 'tasks-2', category: 'tasks', tier: 'silver',   name: 'Momentum',        description: 'Complete 30 tasks',   icon: 'CheckSquare', threshold: 30,   tierIndex: 1 },
  { id: 'tasks-3', category: 'tasks', tier: 'gold',     name: 'Taskmaster',      description: 'Complete 100 tasks',  icon: 'CheckSquare', threshold: 100,  tierIndex: 2 },
  { id: 'tasks-4', category: 'tasks', tier: 'platinum', name: 'Juggernaut',      description: 'Complete 500 tasks',  icon: 'CheckSquare', threshold: 500,  tierIndex: 3 },
  { id: 'tasks-5', category: 'tasks', tier: 'diamond',  name: 'Unstoppable',     description: 'Complete 1000 tasks', icon: 'CheckSquare', threshold: 1000, tierIndex: 4 },

  // ── Project Badges ──
  { id: 'projects-1', category: 'projects', tier: 'bronze',   name: 'Blueprint',      description: 'Create your first project',   icon: 'FolderKanban', threshold: 1,  tierIndex: 0 },
  { id: 'projects-2', category: 'projects', tier: 'silver',   name: 'Architect',      description: 'Create 3 projects',           icon: 'FolderKanban', threshold: 3,  tierIndex: 1 },
  { id: 'projects-3', category: 'projects', tier: 'gold',     name: 'Orchestrator',   description: 'Create 10 projects',          icon: 'FolderKanban', threshold: 10, tierIndex: 2 },
  { id: 'projects-4', category: 'projects', tier: 'platinum', name: 'Empire Builder', description: 'Create 25 projects',          icon: 'FolderKanban', threshold: 25, tierIndex: 3 },
  { id: 'projects-5', category: 'projects', tier: 'diamond',  name: 'Visionary',      description: 'Create 50 projects',          icon: 'FolderKanban', threshold: 50, tierIndex: 4 },

  // ── Goal Badges ──
  { id: 'goals-1', category: 'goals', tier: 'bronze',   name: 'Aim Set',          description: 'Create your first goal',    icon: 'Target', threshold: 1,  tierIndex: 0 },
  { id: 'goals-2', category: 'goals', tier: 'silver',   name: 'Pathfinder',       description: 'Achieve 3 goals',           icon: 'Target', threshold: 3,  tierIndex: 1 },
  { id: 'goals-3', category: 'goals', tier: 'gold',     name: 'Conqueror',        description: 'Achieve 10 goals',          icon: 'Target', threshold: 10, tierIndex: 2 },
  { id: 'goals-4', category: 'goals', tier: 'platinum', name: 'Summit Seeker',    description: 'Achieve 25 goals',          icon: 'Target', threshold: 25, tierIndex: 3 },
  { id: 'goals-5', category: 'goals', tier: 'diamond',  name: 'Legendary',        description: 'Achieve 50 goals',          icon: 'Target', threshold: 50, tierIndex: 4 },

  // ── Habit Badges (habits created) ──
  { id: 'habits-1', category: 'habits', tier: 'bronze',   name: 'Ritual',          description: 'Create your first habit',   icon: 'Repeat', threshold: 1,  tierIndex: 0 },
  { id: 'habits-2', category: 'habits', tier: 'silver',   name: 'Discipline',      description: 'Track 3 active habits',     icon: 'Repeat', threshold: 3,  tierIndex: 1 },
  { id: 'habits-3', category: 'habits', tier: 'gold',     name: 'Ironclad',        description: 'Track 7 active habits',     icon: 'Repeat', threshold: 7,  tierIndex: 2 },
  { id: 'habits-4', category: 'habits', tier: 'platinum', name: 'Machine',         description: 'Track 12 active habits',    icon: 'Repeat', threshold: 12, tierIndex: 3 },
  { id: 'habits-5', category: 'habits', tier: 'diamond',  name: 'Living System',   description: 'Track 20 active habits',    icon: 'Repeat', threshold: 20, tierIndex: 4 },

  // ── Notes Badges ──
  { id: 'notes-1', category: 'notes', tier: 'bronze',   name: 'Scribe',           description: 'Write 5 notes',           icon: 'PenLine', threshold: 5,   tierIndex: 0 },
  { id: 'notes-2', category: 'notes', tier: 'silver',   name: 'Chronicler',       description: 'Write 20 notes',          icon: 'PenLine', threshold: 20,  tierIndex: 1 },
  { id: 'notes-3', category: 'notes', tier: 'gold',     name: 'Sage',             description: 'Write 50 notes',          icon: 'PenLine', threshold: 50,  tierIndex: 2 },
  { id: 'notes-4', category: 'notes', tier: 'platinum', name: 'Philosopher',      description: 'Write 100 notes',         icon: 'PenLine', threshold: 100, tierIndex: 3 },
  { id: 'notes-5', category: 'notes', tier: 'diamond',  name: 'Oracle',           description: 'Write 250 notes',         icon: 'PenLine', threshold: 250, tierIndex: 4 },

  // ── Connection Badges (links) ──
  { id: 'links-1', category: 'links', tier: 'bronze',   name: 'Connector',        description: 'Create 5 item links',     icon: 'Link', threshold: 5,   tierIndex: 0 },
  { id: 'links-2', category: 'links', tier: 'silver',   name: 'Weaver',           description: 'Create 20 item links',    icon: 'Link', threshold: 20,  tierIndex: 1 },
  { id: 'links-3', category: 'links', tier: 'gold',     name: 'Network Mind',     description: 'Create 50 item links',    icon: 'Link', threshold: 50,  tierIndex: 2 },
  { id: 'links-4', category: 'links', tier: 'platinum', name: 'Synaptic',         description: 'Create 100 item links',   icon: 'Link', threshold: 100, tierIndex: 3 },
  { id: 'links-5', category: 'links', tier: 'diamond',  name: 'Hivemind',         description: 'Create 250 item links',   icon: 'Link', threshold: 250, tierIndex: 4 },
];

// ─── Category metadata ─────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  streak:   { label: 'Streaks',      icon: 'Flame' },
  tasks:    { label: 'Tasks',        icon: 'CheckSquare' },
  projects: { label: 'Projects',     icon: 'FolderKanban' },
  goals:    { label: 'Goals',        icon: 'Target' },
  habits:   { label: 'Habits',       icon: 'Repeat' },
  notes:    { label: 'Notes',        icon: 'PenLine' },
  links:    { label: 'Connections',  icon: 'Link' },
};

// ─── Compute current values ────────────────────────────────

function getCategoryValue(category: string, items: OrbitItem[]): number {
  switch (category) {
    case 'streak': {
      const habits = items.filter((i) => i.type === 'habit' && i.status === 'active');
      if (habits.length === 0) return 0;
      return Math.max(...habits.map((h) => calculateStreak(h)));
    }
    case 'tasks':
      return items.filter((i) => i.type === 'task' && (i.status === 'done' || i.status === 'archived') && i.completedAt).length;
    case 'projects':
      return items.filter((i) => i.type === 'project').length;
    case 'goals':
      return items.filter((i) => i.type === 'goal' && i.status === 'done').length;
    case 'habits':
      return items.filter((i) => i.type === 'habit' && i.status === 'active').length;
    case 'notes':
      return items.filter((i) => i.type === 'note' && i.status !== 'archived').length;
    case 'links': {
      let total = 0;
      items.forEach((i) => { total += (i.linkedIds?.length || 0); });
      return total;
    }
    default:
      return 0;
  }
}

// ─── Public API ────────────────────────────────────────────

export function computeBadges(items: OrbitItem[]): BadgeCategory[] {
  const categoryOrder = ['streak', 'tasks', 'projects', 'goals', 'habits', 'notes', 'links'];

  return categoryOrder.map((catId) => {
    const defs = BADGE_DEFS.filter((b) => b.category === catId);
    const currentValue = getCategoryValue(catId, items);
    const meta = CATEGORY_META[catId];

    const badges: EarnedBadge[] = defs.map((def) => ({
      ...def,
      earned: currentValue >= def.threshold,
      current: currentValue,
    }));

    // Find highest earned
    const earned = badges.filter((b) => b.earned);
    const highestEarned = earned.length > 0 ? earned[earned.length - 1] : null;

    return {
      id: catId,
      label: meta.label,
      icon: meta.icon,
      badges,
      highestEarned,
    };
  });
}

export function getTotalEarned(categories: BadgeCategory[]): number {
  return categories.reduce((sum, cat) => sum + cat.badges.filter((b) => b.earned).length, 0);
}

export function getTotalBadges(): number {
  return BADGE_DEFS.length;
}
