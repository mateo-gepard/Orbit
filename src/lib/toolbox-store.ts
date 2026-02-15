import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════
// ORBIT — Toolbox Store
// Tools are high-quality extensions that behave like native tabs.
// ═══════════════════════════════════════════════════════════

export type ToolId = 'flight' | 'dispatch' | 'briefing';

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
];

interface ToolboxStore {
  enabledTools: ToolId[];
  enableTool: (id: ToolId) => void;
  disableTool: (id: ToolId) => void;
  isToolEnabled: (id: ToolId) => boolean;
  getEnabledTools: () => ToolDefinition[];
}

export const useToolboxStore = create<ToolboxStore>()(
  persist(
    (set, get) => ({
      enabledTools: [],

      enableTool: (id) => {
        const current = get().enabledTools;
        if (!current.includes(id)) {
          set({ enabledTools: [...current, id] });
        }
      },

      disableTool: (id) => {
        set({ enabledTools: get().enabledTools.filter((t) => t !== id) });
      },

      isToolEnabled: (id) => get().enabledTools.includes(id),

      getEnabledTools: () => {
        const enabled = get().enabledTools;
        return TOOLS.filter((t) => enabled.includes(t.id));
      },
    }),
    {
      name: 'orbit-toolbox',
      partialize: (state) => ({ enabledTools: state.enabledTools }),
    }
  )
);
