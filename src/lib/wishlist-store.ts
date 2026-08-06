import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { saveToolData, ToolDataConflictError } from './firestore';
import { prepareScopedStorage } from './account-storage';
import { verifiedLocalStateStorage } from './verified-storage';

// ═══════════════════════════════════════════════════════════
// Threadmap — The Vault: Wishlist Engine
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
  priceEstimated?: boolean; // true when price was filled by search fallback
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
export const MAX_WISHLIST_ITEMS = 500;
const MAX_DUEL_HISTORY = 2_000;

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

/** How many rounds are recommended for a good ranking */
export function recommendedRounds(itemCount: number): number {
  // ~2× items gives every item ~4 duels on average — enough for solid ranking
  return Math.max(5, itemCount * 2);
}

/** Confidence: 0-100 based on how many duels have been played vs needed */
export function rankingConfidence(items: VaultItem[]): number {
  const active = items.filter((i) => !i.acquiredAt && !i.removedAt);
  if (active.length < 2) return 0;
  const target = recommendedRounds(active.length);
  const totalDuels = active.reduce((sum, i) => sum + i.duelsPlayed, 0) / 2; // each duel counted twice
  return Math.min(100, Math.round((totalDuels / target) * 100));
}

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
let _localRevision = 0;
let _syncedRevision = 0;
let _cloudSnapshotReceived = false;
let _scopeGeneration = 0;

interface WishlistCloudData {
  items: VaultItem[];
  duels: AuctionDuel[];
}

/** Strip `undefined` values from objects — Firestore rejects them */
function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const CATEGORY_IDS = new Set<VaultCategory>(VAULT_CATEGORIES.map((category) => category.id));

function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function optionalTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function sanitizeVaultItem(value: unknown): VaultItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<VaultItem>;
  if (typeof item.id !== 'string' || !item.id || item.id.length > 160) return null;
  if (typeof item.name !== 'string' || !item.name.trim()) return null;
  const category = CATEGORY_IDS.has(item.category as VaultCategory) ? item.category as VaultCategory : 'other';
  const price = typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 && item.price <= 1_000_000_000
    ? item.price
    : undefined;
  const notes = typeof item.notes === 'string' ? decodeEntities(item.notes).slice(0, 4_000) : undefined;
  return {
    id: item.id,
    name: decodeEntities(item.name).trim().slice(0, 500) || 'Untitled',
    ...(price !== undefined ? { price } : {}),
    ...(typeof item.priceEstimated === 'boolean' ? { priceEstimated: item.priceEstimated } : {}),
    currency: typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency.toUpperCase())
      ? item.currency.toUpperCase()
      : 'EUR',
    ...(safeExternalUrl(item.url) ? { url: safeExternalUrl(item.url) } : {}),
    ...(safeExternalUrl(item.imageUrl) ? { imageUrl: safeExternalUrl(item.imageUrl) } : {}),
    category,
    ...(notes ? { notes } : {}),
    elo: Math.round(finiteNumber(item.elo, ELO_DEFAULT, 0, 10_000)),
    duelsPlayed: Math.round(finiteNumber(item.duelsPlayed, 0, 0, 1_000_000)),
    duelsWon: Math.round(finiteNumber(item.duelsWon, 0, 0, 1_000_000)),
    addedAt: optionalTimestamp(item.addedAt) || Date.now(),
    ...(optionalTimestamp(item.acquiredAt) ? { acquiredAt: optionalTimestamp(item.acquiredAt) } : {}),
    ...(optionalTimestamp(item.removedAt) ? { removedAt: optionalTimestamp(item.removedAt) } : {}),
  };
}

function sanitizeDuels(value: unknown, itemIds: Set<string>): AuctionDuel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const duels: AuctionDuel[] = [];
  for (const candidate of value.slice(-MAX_DUEL_HISTORY)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const duel = candidate as Partial<AuctionDuel>;
    if (
      typeof duel.id !== 'string' || !duel.id || duel.id.length > 160 || seen.has(duel.id) ||
      typeof duel.itemA !== 'string' || typeof duel.itemB !== 'string' || duel.itemA === duel.itemB ||
      !itemIds.has(duel.itemA) || !itemIds.has(duel.itemB) ||
      (duel.winnerId !== duel.itemA && duel.winnerId !== duel.itemB)
    ) continue;
    seen.add(duel.id);
    duels.push({
      id: duel.id,
      itemA: duel.itemA,
      itemB: duel.itemB,
      winnerId: duel.winnerId,
      timestamp: optionalTimestamp(duel.timestamp) || Date.now(),
    });
  }
  return duels;
}

/** Decode HTML entities that may come from scraped metadata */
function decodeEntities(str: string | undefined | null): string {
  if (!str) return str ?? '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&auml;/g, 'ä').replace(/&Auml;/g, 'Ä')
    .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
    .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É')
    .replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
    .replace(/&acirc;/g, 'â').replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô')
    .replace(/&ccedil;/g, 'ç').replace(/&ntilde;/g, 'ñ')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú').replace(/&aacute;/g, 'á')
    .replace(/&euro;/g, '€').replace(/&pound;/g, '£').replace(/&yen;/g, '¥')
    .replace(/&trade;/g, '™').replace(/&copy;/g, '©').replace(/&reg;/g, '®');
}

/** Clean HTML entities from item text fields */
function cleanItem(item: VaultItem): VaultItem {
  return sanitizeVaultItem(item) || {
    id: crypto.randomUUID(),
    name: 'Untitled',
    currency: 'EUR',
    category: 'other',
    elo: ELO_DEFAULT,
    duelsPlayed: 0,
    duelsWon: 0,
    addedAt: Date.now(),
  };
}

function cleanItems(items: unknown[]): VaultItem[] {
  return items.map(sanitizeVaultItem).filter((item): item is VaultItem => item !== null);
}

function scheduleSave(items: VaultItem[], duels: AuctionDuel[]) {
  if (!_syncUserId) {
    useWishlistStore.setState({ cloudDirty: false });
    return;
  }
  if (_saveTimer) clearTimeout(_saveTimer);
  const scheduledUserId = _syncUserId;
  const scheduledGeneration = _scopeGeneration;
  const revision = ++_localRevision;
  const persist = async () => {
    if (_syncUserId !== scheduledUserId
        || _scopeGeneration !== scheduledGeneration
        || revision < _localRevision) return;
    const clean = sanitizeForFirestore({ items, duels } satisfies WishlistCloudData);
    try {
      await saveToolData(scheduledUserId, 'wishlist', clean);
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration
          || revision !== _localRevision) return;
      _syncedRevision = Math.max(_syncedRevision, revision);
      useWishlistStore.setState({ cloudDirty: false });
    } catch (error) {
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration
          || revision !== _localRevision) return;
      if (error instanceof ToolDataConflictError) {
        useWishlistStore.setState({ cloudDirty: true });
        return;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
          detail: { message: 'Wishlist changes are saved on this device, but cloud sync will retry.' },
        }));
      }
      _saveTimer = setTimeout(() => void persist(), 5_000);
    }
  };
  _saveTimer = setTimeout(() => void persist(), 500);
}

interface WishlistState {
  items: VaultItem[];
  duels: AuctionDuel[];
  cloudDirty: boolean;

  // CRUD
  addItem: (item: Omit<VaultItem, 'id' | 'elo' | 'duelsPlayed' | 'duelsWon' | 'addedAt'>) => boolean;
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
      cloudDirty: false,

      addItem: (itemData) => {
        if (get().items.length >= MAX_WISHLIST_ITEMS) {
          return false;
        }
        const item: VaultItem = cleanItem({
          ...itemData,
          id: crypto.randomUUID(),
          elo: ELO_DEFAULT,
          duelsPlayed: 0,
          duelsWon: 0,
          addedAt: Date.now(),
        });
        const items = [...get().items, item];
        set({ items, cloudDirty: Boolean(_syncUserId) });
        scheduleSave(items, get().duels);
        return true;
      },

      updateItem: (id, updates) => {
        const items = get().items.map((item) => {
          if (item.id !== id) return item;
          return sanitizeVaultItem({ ...item, ...updates, id: item.id }) || item;
        });
        set({ items, cloudDirty: Boolean(_syncUserId) });
        scheduleSave(items, get().duels);
      },

      acquireItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, acquiredAt: Date.now() } : i
        );
        set({ items, cloudDirty: Boolean(_syncUserId) });
        scheduleSave(items, get().duels);
      },

      removeItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, removedAt: Date.now() } : i
        );
        set({ items, cloudDirty: Boolean(_syncUserId) });
        scheduleSave(items, get().duels);
      },

      restoreItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, acquiredAt: undefined, removedAt: undefined } : i
        );
        set({ items, cloudDirty: Boolean(_syncUserId) });
        scheduleSave(items, get().duels);
      },

      deleteItem: (id) => {
        const items = get().items.filter((i) => i.id !== id);
        const duels = get().duels.filter((d) => d.itemA !== id && d.itemB !== id);
        set({ items, duels, cloudDirty: Boolean(_syncUserId) });
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

        const duels = [...get().duels, duel].slice(-MAX_DUEL_HISTORY);
        set({ items: updatedItems, duels, cloudDirty: Boolean(_syncUserId) });
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
        try {
          const firstSnapshot = !_cloudSnapshotReceived;
          _cloudSnapshotReceived = true;
          if (get().cloudDirty) {
            if (firstSnapshot) scheduleSave(get().items, get().duels);
            return;
          }
          // Ignore cloud echoes while a newer local revision remains unsynced.
          if (_syncedRevision < _localRevision) return;
          const rawItems = Array.isArray(data.items) ? data.items : [];
          const items = cleanItems(rawItems).slice(0, MAX_WISHLIST_ITEMS);
          const duels = sanitizeDuels(data.duels, new Set(items.map((item) => item.id)));
          set({ items, duels, cloudDirty: false });
          // If entity-cleaning changed any names, write back
          if (JSON.stringify(items) !== JSON.stringify(rawItems.slice(0, MAX_WISHLIST_ITEMS))) {
            scheduleSave(items, duels);
          }
        } catch {
        }
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
        _syncedRevision = 0;
        _cloudSnapshotReceived = false;
        if (!userId) {
          return;
        }
      },
    }),
    {
      name: 'orbit-wishlist',
      partialize: (state) => ({ items: state.items, duels: state.duels, cloudDirty: state.cloudDirty }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<WishlistState> | undefined),
        cloudDirty: (persisted as { cloudDirty?: unknown } | undefined)?.cloudDirty === true,
      }),
      skipHydration: true,
      storage: createJSONStorage(() => verifiedLocalStateStorage),
      onRehydrateStorage: () => (state) => {
        // Clean HTML entities from any previously saved items
        if (state && state.items.length > 0) {
          const cleaned = cleanItems(state.items).slice(0, MAX_WISHLIST_ITEMS);
          if (JSON.stringify(cleaned) !== JSON.stringify(state.items.slice(0, MAX_WISHLIST_ITEMS))) {
            state.items = cleaned;
          }
          state.duels = sanitizeDuels(state.duels, new Set(cleaned.map((item) => item.id)));
        }
      },
    }
  )
);

const WISHLIST_STORAGE_KEY = 'orbit-wishlist';

export async function scopeWishlistStore(userId: string | null): Promise<void> {
  useWishlistStore.getState()._setSyncUserId(null);
  const target = prepareScopedStorage(WISHLIST_STORAGE_KEY, userId);
  useWishlistStore.persist.setOptions({ name: target.key });
  if (!target.hasPersistedState) useWishlistStore.setState({ items: [], duels: [], cloudDirty: false });
  await useWishlistStore.persist.rehydrate();
}
