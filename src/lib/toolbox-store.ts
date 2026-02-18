import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// ORBIT — Toolbox Store
// Tools are high-quality extensions that behave like native tabs.
// ═══════════════════════════════════════════════════════════

export type ToolId = 'flight' | 'dispatch' | 'briefing' | 'abitur' | 'wishlist';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  tagline: string;
  description: string;
  icon: string; // Lucide icon name
  href: string;
  color: string; // Tailwind text color
  bgColor: string; // Tailwind bg color
}

export const TOOLS: ToolDefinition[] = [
  {
    id: 'flight',
    name: 'Cleared for Takeoff',
    tagline: 'Fly a deep-work session. Log it like a pro.',
    description:
      'Turn focus sessions into flights with routes, boarding passes, and a logbook. Track deep work with precision — from boarding to debrief.',
    icon: 'Plane',
    href: '/tools/flight',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-500/10 dark:bg-sky-400/10',
  },
  {
    id: 'dispatch',
    name: 'Dispatch',
    tagline: 'Turn tasks into a realistic route.',
    description:
      'Build your day from tasks and calendar events. Generate a route, schedule focus flights, and re-route when plans change.',
    icon: 'Route',
    href: '/tools/dispatch',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10 dark:bg-emerald-400/10',
  },
  {
    id: 'briefing',
    name: 'Briefing',
    tagline: 'Day Brief or Week Brief. Clarity in minutes.',
    description:
      'Start the day with priorities. End it with reflection. Weekly overviews keep the bigger picture sharp.',
    icon: 'FileBarChart',
    href: '/tools/briefing',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10 dark:bg-amber-400/10',
  },
  {
    id: 'abitur',
    name: 'Abitur Tracker',
    tagline: 'Your path to Abitur, calculated in real-time.',
    description:
      'Full Bavarian G9 Abitur calculator. Track semester grades, exam scores, Block I/II points, deficit warnings, and your projected final grade — all in one place.',
    icon: 'GraduationCap',
    href: '/tools/abitur',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 dark:bg-violet-400/10',
  },
  {
    id: 'wishlist',
    name: 'Wishlist',
    tagline: 'Rank your wants. Know your #1.',
    description:
      'Paste a URL or type a wish. Rank everything with quick "This or That" duels. ELO-powered leaderboard, price tracking, purchase history, and beautiful insights.',
    icon: 'Heart',
    href: '/tools/wishlist',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-500/10 dark:bg-rose-400/10',
  },
];

// ═══════════════════════════════════════════════════════════
// Sync
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;

function scheduleSave(enabledTools: ToolId[]) {
  if (!_syncUserId) return;
  saveToolData(_syncUserId, 'toolbox', { enabledTools }).catch((err) => {
    console.error('[ORBIT] Failed to save Toolbox data:', err);
  });
}

interface ToolboxStore {
  enabledTools: ToolId[];
  enableTool: (id: ToolId) => void;
  disableTool: (id: ToolId) => void;
  isToolEnabled: (id: ToolId) => boolean;
  getEnabledTools: () => ToolDefinition[];
  _setFromCloud: (enabledTools: ToolId[]) => void;
  _setSyncUserId: (userId: string | null) => void;
}

export const useToolboxStore = create<ToolboxStore>()(
  persist(
    (set, get) => ({
      enabledTools: [],

      enableTool: (id) => {
        const current = get().enabledTools;
        if (!current.includes(id)) {
          const next = [...current, id];
          set({ enabledTools: next });
          scheduleSave(next);
        }
      },

      disableTool: (id) => {
        const next = get().enabledTools.filter((t) => t !== id);
        set({ enabledTools: next });
        scheduleSave(next);
      },

      isToolEnabled: (id) => get().enabledTools.includes(id),

      getEnabledTools: () => {
        const enabled = get().enabledTools;
        return TOOLS.filter((t) => enabled.includes(t.id));
      },

      _setFromCloud: (enabledTools) => set({ enabledTools }),

      _setSyncUserId: (userId) => {
        _syncUserId = userId;
      },
    }),
    {
      name: 'orbit-toolbox',
      partialize: (state) => ({ enabledTools: state.enabledTools }),
      skipHydration: true,
    }
  )
);
