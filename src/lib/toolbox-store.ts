import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { saveToolData, ToolDataConflictError } from './firestore';
import { prepareScopedStorage } from './account-storage';
import { verifiedLocalStateStorage } from './verified-storage';
import { reportSyncRecovered, reportSyncWarning } from './sync-warning';

// ═══════════════════════════════════════════════════════════
// Threadmap — Toolbox Store
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
    name: 'The Vault',
    tagline: 'Curate your wants. Auction your priorities.',
    description:
      'A private collection vault for wishes. Add pieces, run head-to-head auctions to rank them with Elo ratings, track acquisitions, and discover what you truly want most.',
    icon: 'Gem',
    href: '/tools/wishlist',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10 dark:bg-amber-400/10',
  },
];

const VALID_TOOL_IDS = new Set<ToolId>(TOOLS.map((tool) => tool.id));

function sanitizeToolIds(value: unknown): ToolId[] {
  return Array.isArray(value)
    ? value.filter((id): id is ToolId => typeof id === 'string' && VALID_TOOL_IDS.has(id as ToolId))
    : [];
}

// ═══════════════════════════════════════════════════════════
// Sync
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _localRevision = 0;
let _cloudSnapshotReceived = false;
let _scopeGeneration = 0;

function scheduleSave(enabledTools: ToolId[]) {
  const scheduledUserId = _syncUserId;
  const scheduledGeneration = _scopeGeneration;
  if (!scheduledUserId) {
    useToolboxStore.setState({ cloudDirty: false });
    return;
  }
  if (_saveTimer) clearTimeout(_saveTimer);
  const revision = ++_localRevision;
  const persist = async () => {
    if (_syncUserId !== scheduledUserId
        || _scopeGeneration !== scheduledGeneration
        || revision !== _localRevision) return;
    try {
      await saveToolData(scheduledUserId, 'toolbox', { enabledTools });
      if (_syncUserId === scheduledUserId
          && _scopeGeneration === scheduledGeneration
          && revision === _localRevision) {
        useToolboxStore.setState({ cloudDirty: false });
        reportSyncRecovered({ key: 'tool:toolbox', userId: scheduledUserId });
      }
    } catch (error) {
      console.error('[THREADMAP] Failed to save Toolbox data:', error);
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration
          || revision !== _localRevision) return;
      if (error instanceof ToolDataConflictError) {
        useToolboxStore.setState({ cloudDirty: true });
        return;
      }
      reportSyncWarning({
        key: 'tool:toolbox',
        userId: scheduledUserId,
        toolId: 'toolbox',
        message: 'Toolbox changes are saved on this device, but cloud sync will retry.',
      });
      _saveTimer = setTimeout(() => void persist(), 5_000);
    }
  };
  _saveTimer = setTimeout(() => void persist(), 300);
}

interface ToolboxStore {
  enabledTools: ToolId[];
  cloudDirty: boolean;
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
      cloudDirty: false,

      enableTool: (id) => {
        const current = get().enabledTools;
        if (!current.includes(id)) {
          const next = [...current, id];
          set({ enabledTools: next, cloudDirty: Boolean(_syncUserId) });
          scheduleSave(next);
        }
      },

      disableTool: (id) => {
        const next = get().enabledTools.filter((t) => t !== id);
        set({ enabledTools: next, cloudDirty: Boolean(_syncUserId) });
        scheduleSave(next);
      },

      isToolEnabled: (id) => get().enabledTools.includes(id),

      getEnabledTools: () => {
        const enabled = get().enabledTools;
        return TOOLS.filter((t) => enabled.includes(t.id));
      },

      _setFromCloud: (enabledTools) => {
        const firstSnapshot = !_cloudSnapshotReceived;
        _cloudSnapshotReceived = true;
        if (get().cloudDirty) {
          if (firstSnapshot) scheduleSave(get().enabledTools);
          return;
        }
        set({ enabledTools: sanitizeToolIds(enabledTools), cloudDirty: false });
      },

      _setSyncUserId: (userId) => {
        if (_syncUserId !== userId) {
          _scopeGeneration += 1;
          if (_saveTimer) {
            clearTimeout(_saveTimer);
            _saveTimer = null;
          }
        }
        _syncUserId = userId;
        _localRevision = 0;
        _cloudSnapshotReceived = false;
      },
    }),
    {
      name: 'orbit-toolbox',
      partialize: (state) => ({ enabledTools: state.enabledTools, cloudDirty: state.cloudDirty }),
      merge: (persisted, current) => ({
        ...current,
        enabledTools: sanitizeToolIds((persisted as { enabledTools?: unknown } | undefined)?.enabledTools),
        cloudDirty: (persisted as { cloudDirty?: unknown } | undefined)?.cloudDirty === true,
      }),
      skipHydration: true,
      storage: createJSONStorage(() => verifiedLocalStateStorage),
    }
  )
);

const TOOLBOX_STORAGE_KEY = 'orbit-toolbox';

export async function scopeToolboxStore(userId: string | null): Promise<void> {
  useToolboxStore.getState()._setSyncUserId(null);
  const target = prepareScopedStorage(TOOLBOX_STORAGE_KEY, userId);
  useToolboxStore.persist.setOptions({ name: target.key });
  if (!target.hasPersistedState) useToolboxStore.setState({ enabledTools: [], cloudDirty: false });
  await useToolboxStore.persist.rehydrate();
}
