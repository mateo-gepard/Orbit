import { CheckCircle2, Target, Calendar, FileText, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ItemType } from '@/lib/types';

export interface ItemTypeConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  nodeColor: string;
  nodeBorder: string;
}

export const ITEM_TYPE_CONFIG: Record<ItemType, ItemTypeConfig> = {
  task: {
    icon: CheckCircle2,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Task',
    nodeColor: '#dbeafe',
    nodeBorder: '#93c5fd',
  },
  project: {
    icon: Target,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    label: 'Project',
    nodeColor: '#f3e8ff',
    nodeBorder: '#c084fc',
  },
  event: {
    icon: Calendar,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Event',
    nodeColor: '#dcfce7',
    nodeBorder: '#86efac',
  },
  goal: {
    icon: Target,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    label: 'Goal',
    nodeColor: '#ffedd5',
    nodeBorder: '#fdba74',
  },
  note: {
    icon: FileText,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    label: 'Note',
    nodeColor: '#fef9c3',
    nodeBorder: '#fde047',
  },
  habit: {
    icon: Zap,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50 dark:bg-pink-950/30',
    borderColor: 'border-pink-200 dark:border-pink-800',
    label: 'Habit',
    nodeColor: '#fce7f3',
    nodeBorder: '#f9a8d4',
  },
};
