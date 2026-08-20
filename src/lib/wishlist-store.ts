import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mergeToolData } from './firestore';
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
  updatedAt?: number; // timestamp used for cross-device reconciliation
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
let _scopeGeneration = 0;
let _flushGeneration: number | null = null;

export interface WishlistCloudData extends Record<string, unknown> {
  items: VaultItem[];
  duels: AuctionDuel[];
  deletedItems?: Record<string, number>;
}

interface NormalizedWishlistCloudData extends Record<string, unknown> {
  items: VaultItem[];
  duels: AuctionDuel[];
  deletedItems: Record<string, number>;
}

const WISHLIST_MUTABLE_FIELDS = [
  'name',
  'price',
  'priceEstimated',
  'currency',
  'url',
  'imageUrl',
  'category',
  'notes',
  'acquiredAt',
  'removedAt',
] as const satisfies ReadonlyArray<keyof VaultItem>;

type WishlistMutableField = typeof WISHLIST_MUTABLE_FIELDS[number];

type WishlistMutation =
  | { id: string; type: 'add'; at: number; item: VaultItem }
  | {
      id: string;
      type: 'update';
      at: number;
      itemId: string;
      values: Partial<Pick<VaultItem, WishlistMutableField>>;
      unset: WishlistMutableField[];
    }
  | { id: string; type: 'delete'; at: number; itemId: string }
  | { id: string; type: 'duel'; at: number; duel: AuctionDuel };

const WISHLIST_MUTABLE_FIELD_SET = new Set<string>(WISHLIST_MUTABLE_FIELDS);
const MAX_PENDING_WISHLIST_MUTATIONS = 5_000;

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
    updatedAt: optionalTimestamp(item.updatedAt)
      || optionalTimestamp(item.removedAt)
      || optionalTimestamp(item.acquiredAt)
      || optionalTimestamp(item.addedAt)
      || Date.now(),
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

const MAX_DELETION_TOMBSTONES = 1_000;

function sanitizeDeletedItems(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([id, deletedAt]) => id.length > 0
        && id.length <= 160
        && typeof deletedAt === 'number'
        && Number.isFinite(deletedAt)
        && deletedAt > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, MAX_DELETION_TOMBSTONES)
  );
}

function validWishlistId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160;
}

function sanitizeWishlistMutations(value: unknown): WishlistMutation[] {
  if (!Array.isArray(value)) return [];
  const mutations: WishlistMutation[] = [];
  const seen = new Set<string>();

  for (const candidate of value.slice(-MAX_PENDING_WISHLIST_MUTATIONS)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const raw = candidate as Record<string, unknown>;
    if (!validWishlistId(raw.id) || seen.has(raw.id)) continue;
    const at = optionalTimestamp(raw.at);
    if (!at) continue;

    if (raw.type === 'add') {
      const item = sanitizeVaultItem(raw.item);
      if (!item) continue;
      mutations.push({ id: raw.id, type: 'add', at, item });
      seen.add(raw.id);
      continue;
    }

    if (raw.type === 'update' && validWishlistId(raw.itemId)) {
      const values = raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values)
        ? Object.fromEntries(
            Object.entries(raw.values as Record<string, unknown>)
              .filter(([key, fieldValue]) => WISHLIST_MUTABLE_FIELD_SET.has(key) && fieldValue !== undefined)
          ) as Partial<Pick<VaultItem, WishlistMutableField>>
        : {};
      const unset = Array.isArray(raw.unset)
        ? [...new Set(raw.unset.filter(
            (field): field is WishlistMutableField => typeof field === 'string' && WISHLIST_MUTABLE_FIELD_SET.has(field)
          ))]
        : [];
      if (Object.keys(values).length === 0 && unset.length === 0) continue;
      mutations.push({ id: raw.id, type: 'update', at, itemId: raw.itemId, values, unset });
      seen.add(raw.id);
      continue;
    }

    if (raw.type === 'delete' && validWishlistId(raw.itemId)) {
      mutations.push({ id: raw.id, type: 'delete', at, itemId: raw.itemId });
      seen.add(raw.id);
      continue;
    }

    if (raw.type === 'duel' && raw.duel && typeof raw.duel === 'object') {
      const duel = raw.duel as Partial<AuctionDuel>;
      if (
        validWishlistId(duel.id)
        && validWishlistId(duel.itemA)
        && validWishlistId(duel.itemB)
        && duel.itemA !== duel.itemB
        && (duel.winnerId === duel.itemA || duel.winnerId === duel.itemB)
      ) {
        mutations.push({
          id: raw.id,
          type: 'duel',
          at,
          duel: {
            id: duel.id,
            itemA: duel.itemA,
            itemB: duel.itemB,
            winnerId: duel.winnerId,
            timestamp: optionalTimestamp(duel.timestamp) || at,
          },
        });
        seen.add(raw.id);
      }
    }
  }

  return mutations;
}

function createUpdateMutation(
  itemId: string,
  updates: Partial<VaultItem>,
  at: number,
): WishlistMutation | null {
  const values: Partial<Pick<VaultItem, WishlistMutableField>> = {};
  const unset: WishlistMutableField[] = [];
  for (const field of WISHLIST_MUTABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    const value = updates[field];
    if (value === undefined) unset.push(field);
    else Object.assign(values, { [field]: value });
  }
  if (Object.keys(values).length === 0 && unset.length === 0) return null;
  return { id: crypto.randomUUID(), type: 'update', at, itemId, values, unset };
}

function normalizeWishlistCloudData(data: WishlistCloudData): NormalizedWishlistCloudData {
  const deletedItems = sanitizeDeletedItems(data.deletedItems);
  const items = cleanItems(Array.isArray(data.items) ? data.items : [])
    .filter((item) => !deletedItems[item.id])
    .slice(0, MAX_WISHLIST_ITEMS);
  return {
    items,
    duels: sanitizeDuels(data.duels, new Set(items.map((item) => item.id))),
    deletedItems,
  };
}

function itemVersion(item: VaultItem): number {
  return Math.max(item.updatedAt || 0, item.removedAt || 0, item.acquiredAt || 0, item.addedAt);
}

function applyWishlistMutations(
  data: WishlistCloudData,
  pendingMutations: WishlistMutation[],
): NormalizedWishlistCloudData {
  let current = normalizeWishlistCloudData(data);

  for (const mutation of pendingMutations) {
    if (mutation.type === 'add') {
      if (current.deletedItems[mutation.item.id] || current.items.some((item) => item.id === mutation.item.id)) continue;
      current = normalizeWishlistCloudData({
        ...current,
        items: [...current.items, mutation.item],
      });
      continue;
    }

    if (mutation.type === 'update') {
      const itemIndex = current.items.findIndex((item) => item.id === mutation.itemId);
      if (itemIndex < 0 || current.deletedItems[mutation.itemId]) continue;
      const existing = current.items[itemIndex];
      const candidate = { ...existing, ...mutation.values } as VaultItem;
      for (const field of mutation.unset) delete candidate[field];
      candidate.id = existing.id;
      candidate.addedAt = existing.addedAt;
      candidate.updatedAt = Math.max(itemVersion(existing), mutation.at);
      const updated = sanitizeVaultItem(candidate);
      if (!updated) continue;
      const items = [...current.items];
      items[itemIndex] = updated;
      current = { ...current, items };
      continue;
    }

    if (mutation.type === 'delete') {
      const items = current.items.filter((item) => item.id !== mutation.itemId);
      const duels = current.duels.filter((duel) => duel.itemA !== mutation.itemId && duel.itemB !== mutation.itemId);
      current = {
        items,
        duels,
        deletedItems: sanitizeDeletedItems({
          ...current.deletedItems,
          [mutation.itemId]: Math.max(current.deletedItems[mutation.itemId] || 0, mutation.at),
        }),
      };
      continue;
    }

    if (current.duels.some((duel) => duel.id === mutation.duel.id)) continue;
    const winner = current.items.find((item) => item.id === mutation.duel.winnerId);
    const loserId = mutation.duel.itemA === mutation.duel.winnerId ? mutation.duel.itemB : mutation.duel.itemA;
    const loser = current.items.find((item) => item.id === loserId);
    if (!winner || !loser) continue;
    const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);
    const items = current.items.map((item) => {
      if (item.id === winner.id) {
        return {
          ...item,
          elo: newWinnerElo,
          duelsPlayed: item.duelsPlayed + 1,
          duelsWon: item.duelsWon + 1,
          updatedAt: Math.max(itemVersion(item), mutation.at),
        };
      }
      if (item.id === loser.id) {
        return {
          ...item,
          elo: newLoserElo,
          duelsPlayed: item.duelsPlayed + 1,
          updatedAt: Math.max(itemVersion(item), mutation.at),
        };
      }
      return item;
    });
    current = normalizeWishlistCloudData({
      ...current,
      items,
      duels: [...current.duels, mutation.duel].slice(-MAX_DUEL_HISTORY),
    });
  }

  return current;
}

function wishlistDataEqual(left: WishlistCloudData, right: WishlistCloudData): boolean {
  return JSON.stringify(normalizeWishlistCloudData(left)) === JSON.stringify(normalizeWishlistCloudData(right));
}

/** Merge independently edited Wishlist documents without dropping either device's additions. */
export function mergeWishlistCloudData(
  localData: WishlistCloudData,
  cloudData: WishlistCloudData,
): NormalizedWishlistCloudData {
  const local = normalizeWishlistCloudData(localData);
  const cloud = normalizeWishlistCloudData(cloudData);
  const deletedItems = sanitizeDeletedItems({ ...cloud.deletedItems, ...local.deletedItems });
  for (const [id, deletedAt] of Object.entries(cloud.deletedItems)) {
    deletedItems[id] = Math.max(deletedItems[id] || 0, deletedAt);
  }

  const order = [...local.items.map((item) => item.id)];
  for (const item of cloud.items) {
    if (!order.includes(item.id)) order.push(item.id);
  }

  const itemsById = new Map(cloud.items.map((item) => [item.id, item]));
  for (const localItem of local.items) {
    const cloudItem = itemsById.get(localItem.id);
    if (!cloudItem || itemVersion(localItem) >= itemVersion(cloudItem)) {
      itemsById.set(localItem.id, localItem);
    }
  }

  const items = order
    .map((id) => itemsById.get(id))
    .filter((item): item is VaultItem => Boolean(item))
    // Wishlist IDs are immutable UUIDs and hard deletion has no restore action.
    // Once an ID has a tombstone, stale or clock-skewed clients must never revive it.
    .filter((item) => !deletedItems[item.id])
    .slice(0, MAX_WISHLIST_ITEMS);
  const itemIds = new Set(items.map((item) => item.id));

  return {
    items,
    duels: sanitizeDuels([...cloud.duels, ...local.duels], itemIds),
    deletedItems,
  };
}

function currentWishlistCloudData(): NormalizedWishlistCloudData {
  const state = useWishlistStore.getState();
  return normalizeWishlistCloudData({
    items: state.items,
    duels: state.duels,
    deletedItems: state.deletedItems,
  });
}

function scheduleSave() {
  if (!_syncUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  const scheduledUserId = _syncUserId;
  const scheduledGeneration = _scopeGeneration;
  const revision = ++_localRevision;
  const persist = async () => {
    _saveTimer = null;
    if (_syncUserId !== scheduledUserId
        || _scopeGeneration !== scheduledGeneration
        || revision !== _localRevision) return;
    if (_flushGeneration === scheduledGeneration) {
      _saveTimer = setTimeout(() => void persist(), 250);
      return;
    }
    const state = useWishlistStore.getState();
    if (!state.cloudDirty) return;
    const pendingMutations = sanitizeWishlistMutations(state.pendingMutations);
    const acknowledgedIds = new Set(pendingMutations.map((mutation) => mutation.id));
    const clean = sanitizeForFirestore(currentWishlistCloudData());
    _flushGeneration = scheduledGeneration;
    try {
      const merged = await mergeToolData(
        scheduledUserId,
        'wishlist',
        clean,
        (pending, remote) => pendingMutations.length > 0
          ? applyWishlistMutations(
              remote || { items: [], duels: [], deletedItems: {} },
              pendingMutations,
            )
          : mergeWishlistCloudData(
              pending,
              remote || { items: [], duels: [], deletedItems: {} },
            ),
      );
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration) return;
      const latest = useWishlistStore.getState();
      const remainingMutations = sanitizeWishlistMutations(latest.pendingMutations)
        .filter((mutation) => !acknowledgedIds.has(mutation.id));
      const optimistic = applyWishlistMutations(merged, remainingMutations);
      useWishlistStore.setState({
        ...optimistic,
        pendingMutations: remainingMutations,
        cloudDirty: remainingMutations.length > 0,
      });
    } catch {
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration) return;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
          detail: { message: 'Wishlist changes are saved on this device, but cloud sync will retry.' },
        }));
      }
      if (revision === _localRevision) _saveTimer = setTimeout(() => void persist(), 5_000);
    } finally {
      if (_flushGeneration === scheduledGeneration) _flushGeneration = null;
      if (_syncUserId === scheduledUserId
          && _scopeGeneration === scheduledGeneration
          && useWishlistStore.getState().cloudDirty
          && !_saveTimer) {
        scheduleSave();
      }
    }
  };
  _saveTimer = setTimeout(() => void persist(), 500);
}

interface WishlistState {
  items: VaultItem[];
  duels: AuctionDuel[];
  deletedItems: Record<string, number>;
  pendingMutations: WishlistMutation[];
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
      deletedItems: {},
      pendingMutations: [],
      cloudDirty: false,

      addItem: (itemData) => {
        if (get().items.length >= MAX_WISHLIST_ITEMS) {
          return false;
        }
        const now = Date.now();
        const item: VaultItem = cleanItem({
          ...itemData,
          id: crypto.randomUUID(),
          elo: ELO_DEFAULT,
          duelsPlayed: 0,
          duelsWon: 0,
          addedAt: now,
          updatedAt: now,
        });
        const mutation: WishlistMutation = { id: crypto.randomUUID(), type: 'add', at: now, item };
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
        return true;
      },

      updateItem: (id, updates) => {
        if (!get().items.some((item) => item.id === id)) return;
        const mutation = createUpdateMutation(id, updates, Date.now());
        if (!mutation) return;
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
      },

      acquireItem: (id) => {
        const now = Date.now();
        const mutation = createUpdateMutation(id, { acquiredAt: now, removedAt: undefined }, now);
        if (!mutation || !get().items.some((item) => item.id === id)) return;
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
      },

      removeItem: (id) => {
        const now = Date.now();
        const mutation = createUpdateMutation(id, { removedAt: now, acquiredAt: undefined }, now);
        if (!mutation || !get().items.some((item) => item.id === id)) return;
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
      },

      restoreItem: (id) => {
        const mutation = createUpdateMutation(id, { acquiredAt: undefined, removedAt: undefined }, Date.now());
        if (!mutation || !get().items.some((item) => item.id === id)) return;
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
      },

      deleteItem: (id) => {
        if (!get().items.some((item) => item.id === id)) return;
        const now = Date.now();
        const mutation: WishlistMutation = { id: crypto.randomUUID(), type: 'delete', at: now, itemId: id };
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
      },

      recordDuel: (winnerId, loserId) => {
        const items = get().items;
        const winner = items.find((i) => i.id === winnerId);
        const loser = items.find((i) => i.id === loserId);
        if (!winner || !loser) return;

        const now = Date.now();
        const duel: AuctionDuel = {
          id: crypto.randomUUID(),
          itemA: winnerId,
          itemB: loserId,
          winnerId,
          timestamp: now,
        };
        const mutation: WishlistMutation = { id: crypto.randomUUID(), type: 'duel', at: now, duel };
        const next = applyWishlistMutations(currentWishlistCloudData(), [mutation]);
        const pendingMutations = _syncUserId
          ? [...get().pendingMutations, mutation].slice(-MAX_PENDING_WISHLIST_MUTATIONS)
          : get().pendingMutations;
        set({ ...next, pendingMutations, cloudDirty: Boolean(_syncUserId) });
        scheduleSave();
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
          const cloud = normalizeWishlistCloudData(data);
          const local = get();
          const pendingMutations = sanitizeWishlistMutations(local.pendingMutations);
          if (pendingMutations.length > 0) {
            const optimistic = applyWishlistMutations(cloud, pendingMutations);
            set({ ...optimistic, pendingMutations, cloudDirty: true });
            return;
          }
          if (local.cloudDirty) {
            const merged = mergeWishlistCloudData({
              items: local.items,
              duels: local.duels,
              deletedItems: local.deletedItems,
            }, cloud);
            if (wishlistDataEqual(merged, cloud)) {
              set({ ...cloud, cloudDirty: false });
            } else {
              set({ ...merged, cloudDirty: true });
            }
            return;
          }
          set({ ...cloud, cloudDirty: false });
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
          _flushGeneration = null;
        }
        _syncUserId = userId;
        _localRevision = 0;
        if (userId && get().cloudDirty) scheduleSave();
      },
    }),
    {
      name: 'orbit-wishlist',
      partialize: (state) => ({
        items: state.items,
        duels: state.duels,
        deletedItems: state.deletedItems,
        pendingMutations: state.pendingMutations,
        cloudDirty: state.cloudDirty,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<WishlistState> | undefined;
        const deletedItems = sanitizeDeletedItems(saved?.deletedItems);
        const items = cleanItems(Array.isArray(saved?.items) ? saved.items : [])
          .filter((item) => !deletedItems[item.id])
          .slice(0, MAX_WISHLIST_ITEMS);
        return {
          ...current,
          items,
          duels: sanitizeDuels(saved?.duels, new Set(items.map((item) => item.id))),
          deletedItems,
          pendingMutations: sanitizeWishlistMutations(saved?.pendingMutations),
          cloudDirty: saved?.cloudDirty === true,
        };
      },
      skipHydration: true,
      storage: createJSONStorage(() => verifiedLocalStateStorage),
      onRehydrateStorage: () => (state) => {
        // Clean HTML entities from any previously saved items
        if (state) {
          const cleaned = cleanItems(state.items).slice(0, MAX_WISHLIST_ITEMS);
          state.items = cleaned.filter((item) => !state.deletedItems[item.id]);
          state.duels = sanitizeDuels(state.duels, new Set(cleaned.map((item) => item.id)));
          state.pendingMutations = sanitizeWishlistMutations(state.pendingMutations);
        }
      },
    }
  )
);

const WISHLIST_STORAGE_KEY = 'orbit-wishlist';

export async function scopeWishlistStore(userId: string | null): Promise<void> {
  const target = prepareScopedStorage(WISHLIST_STORAGE_KEY, userId);
  useWishlistStore.persist.setOptions({ name: target.key });
  useWishlistStore.getState()._setSyncUserId(null);
  if (!target.hasPersistedState) {
    useWishlistStore.setState({ items: [], duels: [], deletedItems: {}, pendingMutations: [], cloudDirty: false });
  }
  await useWishlistStore.persist.rehydrate();
}
