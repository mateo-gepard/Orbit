// ═══════════════════════════════════════════════════════════
// ORBIT — Achievement Badges System
// ═══════════════════════════════════════════════════════════

import { OrbitItem } from './types';
import { calculateStreak } from './habits';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import { 
  Flame, Zap, Sparkles, Star, Trophy,
  CheckCircle, Target, Award, Shield, Crown,
  Rocket, FolderKanban, Building2, CircleCheckBig, Medal,
  Sprout, RefreshCw, Calendar,
  Compass, Mountain, FlagTriangleRight,
  Sunrise, Moon, Bolt, Grid3X3
} from 'lucide-react';

export type BadgeCategory = 'streak' | 'tasks' | 'projects' | 'habits' | 'goals' | 'special';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: BadgeCategory;
  requirement: number;
  isEarned: boolean;
  progress: number;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
}

// Badge definitions with creative names
const BADGE_DEFINITIONS: Omit<Badge, 'isEarned' | 'progress'>[] = [
  // Streak Badges
  {
    id: 'streak-10',
    name: 'Momentum Builder',
    description: 'Complete habits for 10 days straight',
    emoji: '🔥',
    category: 'streak',
    requirement: 10,
    tier: 'bronze',
  },
  {
    id: 'streak-30',
    name: 'Monthly Warrior',
    description: 'Complete habits for 30 days straight',
    emoji: '⚡',
    category: 'streak',
    requirement: 30,
    tier: 'silver',
  },
  {
    id: 'streak-90',
    name: 'Quarter Champion',
    description: 'Complete habits for 90 days straight',
    emoji: '💫',
    category: 'streak',
    requirement: 90,
    tier: 'gold',
  },
  {
    id: 'streak-180',
    name: 'Half-Year Hero',
    description: 'Complete habits for 180 days straight',
    emoji: '✨',
    category: 'streak',
    requirement: 180,
    tier: 'platinum',
  },
  {
    id: 'streak-365',
    name: 'Unstoppable Force',
    description: 'Complete habits for 365 days straight',
    emoji: '🌟',
    category: 'streak',
    requirement: 365,
    tier: 'diamond',
  },

  // Task Completion Badges
  {
    id: 'tasks-1',
    name: 'First Step',
    description: 'Complete your first task',
    emoji: '✅',
    category: 'tasks',
    requirement: 1,
  },
  {
    id: 'tasks-10',
    name: 'Getting Things Done',
    description: 'Complete 10 tasks',
    emoji: '📝',
    category: 'tasks',
    requirement: 10,
    tier: 'bronze',
  },
  {
    id: 'tasks-30',
    name: 'Task Master',
    description: 'Complete 30 tasks',
    emoji: '🎯',
    category: 'tasks',
    requirement: 30,
    tier: 'silver',
  },
  {
    id: 'tasks-100',
    name: 'Century Achiever',
    description: 'Complete 100 tasks',
    emoji: '💯',
    category: 'tasks',
    requirement: 100,
    tier: 'gold',
  },
  {
    id: 'tasks-250',
    name: 'Productivity Titan',
    description: 'Complete 250 tasks',
    emoji: '⚔️',
    category: 'tasks',
    requirement: 250,
    tier: 'platinum',
  },
  {
    id: 'tasks-500',
    name: 'Legendary Executor',
    description: 'Complete 500 tasks',
    emoji: '👑',
    category: 'tasks',
    requirement: 500,
    tier: 'diamond',
  },

  // Project Badges
  {
    id: 'projects-1',
    name: 'Project Pioneer',
    description: 'Create your first project',
    emoji: '🚀',
    category: 'projects',
    requirement: 1,
  },
  {
    id: 'projects-5',
    name: 'Multi-Tasker',
    description: 'Create 5 projects',
    emoji: '📁',
    category: 'projects',
    requirement: 5,
    tier: 'bronze',
  },
  {
    id: 'projects-10',
    name: 'Portfolio Builder',
    description: 'Create 10 projects',
    emoji: '🏗️',
    category: 'projects',
    requirement: 10,
    tier: 'silver',
  },
  {
    id: 'projects-complete-1',
    name: 'Finisher',
    description: 'Complete your first project (100% tasks done)',
    emoji: '🎉',
    category: 'projects',
    requirement: 1,
  },
  {
    id: 'projects-complete-5',
    name: 'Serial Achiever',
    description: 'Complete 5 projects',
    emoji: '🏆',
    category: 'projects',
    requirement: 5,
    tier: 'gold',
  },

  // Habit Badges
  {
    id: 'habits-1',
    name: 'Habit Starter',
    description: 'Create your first habit',
    emoji: '🌱',
    category: 'habits',
    requirement: 1,
  },
  {
    id: 'habits-5',
    name: 'Routine Builder',
    description: 'Create 5 habits',
    emoji: '🔄',
    category: 'habits',
    requirement: 5,
    tier: 'bronze',
  },
  {
    id: 'habits-perfect-week',
    name: 'Perfect Week',
    description: 'Complete all scheduled habits for 7 days',
    emoji: '📅',
    category: 'habits',
    requirement: 7,
    tier: 'silver',
  },

  // Goal Badges
  {
    id: 'goals-1',
    name: 'Visionary',
    description: 'Set your first goal',
    emoji: '🎯',
    category: 'goals',
    requirement: 1,
  },
  {
    id: 'goals-5',
    name: 'Ambitious',
    description: 'Set 5 goals',
    emoji: '🌠',
    category: 'goals',
    requirement: 5,
    tier: 'bronze',
  },
  {
    id: 'goals-complete-1',
    name: 'Goal Crusher',
    description: 'Complete your first goal',
    emoji: '🏅',
    category: 'goals',
    requirement: 1,
    tier: 'silver',
  },

  // Special Badges
  {
    id: 'special-early-bird',
    name: 'Early Bird',
    description: 'Complete a task before 6 AM',
    emoji: '🌅',
    category: 'special',
    requirement: 1,
  },
  {
    id: 'special-night-owl',
    name: 'Night Owl',
    description: 'Complete a task after 11 PM',
    emoji: '🦉',
    category: 'special',
    requirement: 1,
  },
  {
    id: 'special-week-warrior',
    name: 'Week Warrior',
    description: 'Complete 25+ tasks in one week',
    emoji: '⚡',
    category: 'special',
    requirement: 25,
    tier: 'gold',
  },
  {
    id: 'special-organizer',
    name: 'Master Organizer',
    description: 'Use all 5+ life area tags',
    emoji: '🗂️',
    category: 'special',
    requirement: 5,
  },
];

// Calculate earned badges based on user data
export function calculateBadges(items: OrbitItem[]): Badge[] {
  const completedTasks = items.filter((i) => i.type === 'task' && i.status === 'done');
  const allProjects = items.filter((i) => i.type === 'project');
  const completedProjects = allProjects.filter((p) => {
    const children = items.filter((i) => i.parentId === p.id);
    if (children.length === 0) return false;
    return children.every((c) => c.status === 'done');
  });
  const habits = items.filter((i) => i.type === 'habit');
  const goals = items.filter((i) => i.type === 'goal');
  const completedGoals = goals.filter((g) => g.status === 'done');

  // Calculate max streak across all habits
  const maxStreak = Math.max(0, ...habits.map((h) => calculateStreak(h)));

  // Check for perfect week (all scheduled habits completed for 7 consecutive days)
  const perfectWeekDays = calculatePerfectWeekStreak(items);

  // Check for early bird / night owl
  const hasEarlyBird = completedTasks.some((t) => {
    if (!t.completedAt) return false;
    const hour = new Date(t.completedAt).getHours();
    return hour < 6;
  });

  const hasNightOwl = completedTasks.some((t) => {
    if (!t.completedAt) return false;
    const hour = new Date(t.completedAt).getHours();
    return hour >= 23;
  });

  // Check for week warrior (25+ tasks in one week)
  const hasWeekWarrior = checkWeekWarrior(completedTasks);

  // Check for unique tags used
  const uniqueTags = new Set<string>();
  items.forEach((i) => {
    i.tags?.forEach((tag) => uniqueTags.add(tag));
  });

  return BADGE_DEFINITIONS.map((def) => {
    let isEarned = false;
    let progress = 0;

    switch (def.id) {
      // Streak badges
      case 'streak-10':
      case 'streak-30':
      case 'streak-90':
      case 'streak-180':
      case 'streak-365':
        progress = maxStreak;
        isEarned = maxStreak >= def.requirement;
        break;

      // Task badges
      case 'tasks-1':
      case 'tasks-10':
      case 'tasks-30':
      case 'tasks-100':
      case 'tasks-250':
      case 'tasks-500':
        progress = completedTasks.length;
        isEarned = completedTasks.length >= def.requirement;
        break;

      // Project badges
      case 'projects-1':
      case 'projects-5':
      case 'projects-10':
        progress = allProjects.length;
        isEarned = allProjects.length >= def.requirement;
        break;

      case 'projects-complete-1':
      case 'projects-complete-5':
        progress = completedProjects.length;
        isEarned = completedProjects.length >= def.requirement;
        break;

      // Habit badges
      case 'habits-1':
      case 'habits-5':
        progress = habits.length;
        isEarned = habits.length >= def.requirement;
        break;

      case 'habits-perfect-week':
        progress = perfectWeekDays;
        isEarned = perfectWeekDays >= 7;
        break;

      // Goal badges
      case 'goals-1':
      case 'goals-5':
        progress = goals.length;
        isEarned = goals.length >= def.requirement;
        break;

      case 'goals-complete-1':
        progress = completedGoals.length;
        isEarned = completedGoals.length >= 1;
        break;

      // Special badges
      case 'special-early-bird':
        isEarned = hasEarlyBird;
        progress = hasEarlyBird ? 1 : 0;
        break;

      case 'special-night-owl':
        isEarned = hasNightOwl;
        progress = hasNightOwl ? 1 : 0;
        break;

      case 'special-week-warrior':
        isEarned = hasWeekWarrior;
        progress = hasWeekWarrior ? 25 : 0;
        break;

      case 'special-organizer':
        progress = uniqueTags.size;
        isEarned = uniqueTags.size >= 5;
        break;
    }

    return {
      ...def,
      isEarned,
      progress,
    };
  });
}

// Helper: Calculate consecutive days with all habits completed
function calculatePerfectWeekStreak(items: OrbitItem[]): number {
  const habits = items.filter((i) => i.type === 'habit' && i.status === 'active');
  if (habits.length === 0) return 0;

  let streak = 0;
  let currentDate = new Date();
  
  for (let i = 0; i < 30; i++) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const allCompleted = habits.every((h) => {
      const completions = h.completions || {};
      return completions[dateStr] === true;
    });

    if (allCompleted) {
      streak++;
    } else {
      break;
    }

    currentDate.setDate(currentDate.getDate() - 1);
  }

  return streak;
}

// Helper: Check if user completed 25+ tasks in any single week
function checkWeekWarrior(completedTasks: OrbitItem[]): boolean {
  if (completedTasks.length < 25) return false;

  const tasksByWeek = new Map<string, number>();

  completedTasks.forEach((task) => {
    if (!task.completedAt) return;
    const date = new Date(task.completedAt);
    const weekKey = format(date, 'yyyy-ww');
    tasksByWeek.set(weekKey, (tasksByWeek.get(weekKey) || 0) + 1);
  });

  return Array.from(tasksByWeek.values()).some((count) => count >= 25);
}

// Get tier color
export function getTierColor(tier?: Badge['tier']): string {
  switch (tier) {
    case 'bronze':
      return 'from-amber-600/20 to-orange-600/20';
    case 'silver':
      return 'from-slate-400/20 to-zinc-400/20';
    case 'gold':
      return 'from-yellow-500/20 to-amber-500/20';
    case 'platinum':
      return 'from-cyan-400/20 to-blue-500/20';
    case 'diamond':
      return 'from-purple-500/20 to-pink-500/20';
    default:
      return 'from-foreground/5 to-foreground/10';
  }
}

export function getTierBorderColor(tier?: Badge['tier']): string {
  switch (tier) {
    case 'bronze':
      return 'border-amber-600/30';
    case 'silver':
      return 'border-slate-400/30';
    case 'gold':
      return 'border-yellow-500/40';
    case 'platinum':
      return 'border-cyan-400/40';
    case 'diamond':
      return 'border-purple-500/40';
    default:
      return 'border-border/60';
  }
}
