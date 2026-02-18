import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// ORBIT — The Vault: Wishlist Engine
// Wishes as rare collectibles in a private collection vault.
// Auction Ring duels for Elo-ranked prioritisation.
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────

export type VaultCategory =
  | 'tech'
  | 'fashion'
  | 'experience'
  | 'home'
  | 'creative'
  | 'wellness'
  | 'education'
  | 'other';

export const VAULT_CATEGORIES: { id: VaultCategory; label: string; wing: string; icon: string }[] = [
  { id: 'tech', label: 'Tech', wing: 'Tech Wing', icon: 'Cpu' },
  { id: 'fashion', label: 'Fashion', wing: 'Fashion Gallery', icon: 'Shirt' },
  { id: 'experience', label: 'Experiences', wing: 'Experience Hall', icon: 'Compass' },
  { id: 'home', label: 'Home', wing: 'Living Quarters', icon: 'Home' },
  { id: 'creative', label: 'Creative', wing: 'Atelier', icon: 'Palette' },
  { id: 'wellness', label: 'Wellness', wing: 'Wellness Suite', icon: 'Heart' },
  { id: 'education', label: 'Education', wing: 'Library', icon: 'BookOpen' },
  { id: 'other', label: 'Other', wing: 'Open Vault', icon: 'Package' },
];

export type VaultRarity = 'fresh' | 'seasoned' | 'vintage' | 'heirloom';

export interface VaultItem {
  id: string;
  name: string;
  price?: number;
  currency: string;
  url?: string;
  imageUrl?: string;
  category: VaultCategory;
  notes?: string;
  elo: number; // Elo rating for auction-based ranking
  duelsPlayed: number;
  duelsWon: number;
  addedAt: number; // timestamp
  acquiredAt?: number; // timestamp — moved to acquired shelf
  removedAt?: number; // timestamp — removed/deaccessioned
}

export interface AuctionDuel {
  id: string;
  itemA: string; // VaultItem id
  itemB: string; // VaultItem id
  winnerId: string;
  timestamp: number;
}

export interface VaultStats {
  totalItems: number;
  totalValue: number;
  acquiredCount: number;
  acquiredValue: number;
  removedCount: number;
  duelCount: number;
  oldestItem: VaultItem | null;
  topRated: VaultItem | null;
  categoryBreakdown: Record<VaultCategory, number>;
}

// ─── Elo Rating ────────────────────────────────────────────

const ELO_K = 32; // K-factor for sensitivity
const ELO_DEFAULT = 1200;

function calculateElo(
  winnerElo: number,
  loserElo: number
): { newWinnerElo: number; newLoserElo: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
  return {
    newWinnerElo: Math.round(winnerElo + ELO_K * (1 - expectedWinner)),
    newLoserElo: Math.round(loserElo + ELO_K * (0 - expectedLoser)),
  };
}

// ─── Rarity Based on Age ───────────────────────────────────

export function getItemRarity(item: VaultItem): VaultRarity {
  const age = Date.now() - item.addedAt;
  const days = age / (1000 * 60 * 60 * 24);
  if (days < 7) return 'fresh';
  if (days < 30) return 'seasoned';
  if (days < 90) return 'vintage';
  return 'heirloom';
}

export function getRarityLabel(rarity: VaultRarity): string {
  switch (rarity) {
    case 'fresh': return 'Fresh Arrival';
    case 'seasoned': return 'Seasoned';
    case 'vintage': return 'Vintage';
    case 'heirloom': return 'Heirloom';
  }
}

export function getRarityColor(rarity: VaultRarity): string {
  switch (rarity) {
    case 'fresh': return 'text-emerald-500';
    case 'seasoned': return 'text-sky-500';
    case 'vintage': return 'text-amber-500';
    case 'heirloom': return 'text-purple-500';
  }
}

// ─── Duel Pair Selection ───────────────────────────────────

export function pickDuelPair(items: VaultItem[]): [VaultItem, VaultItem] | null {
  const active = items.filter((i) => !i.acquiredAt && !i.removedAt);
  if (active.length < 2) return null;

  // Prefer items with fewer duels (ensure coverage)
  const sorted = [...active].sort((a, b) => a.duelsPlayed - b.duelsPlayed);
  const pool = sorted.slice(0, Math.max(4, Math.ceil(sorted.length * 0.5)));

  // Pick two random from pool, ensuring they aren't the same
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

// ─── Stats Calculator ──────────────────────────────────────

export function getVaultStats(items: VaultItem[], duels: AuctionDuel[]): VaultStats {
  const active = items.filter((i) => !i.acquiredAt && !i.removedAt);
  const acquired = items.filter((i) => i.acquiredAt);
  const removed = items.filter((i) => i.removedAt);

  const totalValue = active.reduce((sum, i) => sum + (i.price || 0), 0);
  const acquiredValue = acquired.reduce((sum, i) => sum + (i.price || 0), 0);

  const categoryBreakdown = {} as Record<VaultCategory, number>;
  for (const cat of VAULT_CATEGORIES) categoryBreakdown[cat.id] = 0;
  for (const item of active) categoryBreakdown[item.category]++;

  const oldest = active.length > 0
    ? active.reduce((o, i) => (i.addedAt < o.addedAt ? i : o))
    : null;

  const topRated = active.length > 0
    ? active.reduce((t, i) => (i.elo > t.elo ? i : t))
    : null;

  return {
    totalItems: active.length,
    totalValue,
    acquiredCount: acquired.length,
    acquiredValue,
    removedCount: removed.length,
    duelCount: duels.length,
    oldestItem: oldest,
    topRated,
    categoryBreakdown,
  };
}

// ─── Format Helpers ────────────────────────────────────────

export function formatPrice(amount: number | undefined, currency: string): string {
  if (amount === undefined || amount === null) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// ═══════════════════════════════════════════════════════════
// Zustand Store with Firestore Sync
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingSave = false;

interface WishlistCloudData {
  items: VaultItem[];
  duels: AuctionDuel[];
}

/** Strip `undefined` values from objects — Firestore rejects them */
function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function scheduleSave(items: VaultItem[], duels: AuctionDuel[]) {
  if (!_syncUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _pendingSave = true;
  _saveTimer = setTimeout(() => {
    if (!_syncUserId) return;
    _pendingSave = false;
    const clean = sanitizeForFirestore({ items, duels } satisfies WishlistCloudData);
    saveToolData(_syncUserId, 'wishlist', clean).catch(
      (err) => {
        console.error('[ORBIT] Failed to save Vault data:', err);
      }
    );
  }, 500);
}

interface WishlistState {
  items: VaultItem[];
  duels: AuctionDuel[];

  // CRUD
  addItem: (item: Omit<VaultItem, 'id' | 'elo' | 'duelsPlayed' | 'duelsWon' | 'addedAt'>) => void;
  updateItem: (id: string, updates: Partial<VaultItem>) => void;
  acquireItem: (id: string) => void;
  removeItem: (id: string) => void;
  restoreItem: (id: string) => void;
  deleteItem: (id: string) => void;

  // Auction
  recordDuel: (winnerId: string, loserId: string) => void;

  // Getters (not reactive — use selectors)
  getActiveItems: () => VaultItem[];
  getAcquiredItems: () => VaultItem[];
  getRemovedItems: () => VaultItem[];
  getRankedItems: () => VaultItem[];

  // Sync
  _setFromCloud: (data: WishlistCloudData) => void;
  _setSyncUserId: (userId: string | null) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      duels: [],

      addItem: (itemData) => {
        const item: VaultItem = {
          ...itemData,
          id: crypto.randomUUID(),
          elo: ELO_DEFAULT,
          duelsPlayed: 0,
          duelsWon: 0,
          addedAt: Date.now(),
        };
        const items = [...get().items, item];
        set({ items });
        scheduleSave(items, get().duels);
      },

      updateItem: (id, updates) => {
        const items = get().items.map((i) => (i.id === id ? { ...i, ...updates } : i));
        set({ items });
        scheduleSave(items, get().duels);
      },

      acquireItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, acquiredAt: Date.now() } : i
        );
        set({ items });
        scheduleSave(items, get().duels);
      },

      removeItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, removedAt: Date.now() } : i
        );
        set({ items });
        scheduleSave(items, get().duels);
      },

      restoreItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, acquiredAt: undefined, removedAt: undefined } : i
        );
        set({ items });
        scheduleSave(items, get().duels);
      },

      deleteItem: (id) => {
        const items = get().items.filter((i) => i.id !== id);
        const duels = get().duels.filter((d) => d.itemA !== id && d.itemB !== id);
        set({ items, duels });
        scheduleSave(items, duels);
      },

      recordDuel: (winnerId, loserId) => {
        const items = get().items;
        const winner = items.find((i) => i.id === winnerId);
        const loser = items.find((i) => i.id === loserId);
        if (!winner || !loser) return;

        const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);

        const updatedItems = items.map((i) => {
          if (i.id === winnerId) {
            return { ...i, elo: newWinnerElo, duelsPlayed: i.duelsPlayed + 1, duelsWon: i.duelsWon + 1 };
          }
          if (i.id === loserId) {
            return { ...i, elo: newLoserElo, duelsPlayed: i.duelsPlayed + 1 };
          }
          return i;
        });

        const duel: AuctionDuel = {
          id: crypto.randomUUID(),
          itemA: winnerId,
          itemB: loserId,
          winnerId,
          timestamp: Date.now(),
        };

        const duels = [...get().duels, duel];
        set({ items: updatedItems, duels });
        scheduleSave(updatedItems, duels);
      },

      getActiveItems: () => get().items.filter((i) => !i.acquiredAt && !i.removedAt),
      getAcquiredItems: () => get().items.filter((i) => i.acquiredAt).sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0)),
      getRemovedItems: () => get().items.filter((i) => i.removedAt).sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0)),
      getRankedItems: () =>
        get()
          .items.filter((i) => !i.acquiredAt && !i.removedAt)
          .sort((a, b) => b.elo - a.elo),

      _setFromCloud: (data) => {
        if (_pendingSave) return;
        set({
          items: Array.isArray(data.items) ? data.items : [],
          duels: Array.isArray(data.duels) ? data.duels : [],
        });
      },

      _setSyncUserId: (userId) => {
        _syncUserId = userId;
      },
    }),
    {
      name: 'orbit-wishlist',
      partialize: (state) => ({ items: state.items, duels: state.duels }),
      skipHydration: true,
    }
  )
);
