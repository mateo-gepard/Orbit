'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// ORBIT — Wishlist Store
// Smart wishlist with ELO ranking, URL scraping, price tracking
// ═══════════════════════════════════════════════════════════

export interface WishlistItem {
  id: string;
  title: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  category?: string;
  elo: number; // ELO rating for "This or That" ranking
  matchesPlayed: number;
  createdAt: number;
  updatedAt: number;
  purchased?: boolean;
  purchasedAt?: number;
  archived?: boolean;
  notes?: string;
  priceHistory?: { price: number; date: string }[];
  tags?: string[];
}

export interface DuelResult {
  winnerId: string;
  loserId: string;
  timestamp: number;
}

interface WishlistState {
  items: WishlistItem[];
  duelHistory: DuelResult[];
  categories: string[];

  // CRUD
  addItem: (item: Omit<WishlistItem, 'id' | 'elo' | 'matchesPlayed' | 'createdAt' | 'updatedAt'>) => WishlistItem;
  updateItem: (id: string, updates: Partial<WishlistItem>) => void;
  removeItem: (id: string) => void;
  purchaseItem: (id: string) => void;
  archiveItem: (id: string) => void;
  unarchiveItem: (id: string) => void;

  // Dueling (This or That)
  recordDuel: (winnerId: string, loserId: string) => void;
  getDuelPair: () => [WishlistItem, WishlistItem] | null;

  // Categories
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;

  // Sync
  _setFromCloud: (data: { items: WishlistItem[]; duelHistory: DuelResult[]; categories: string[] }) => void;
  _setSyncUserId: (userId: string | null) => void;
}

// ═══════════════════════════════════════════════════════════
// ELO Rating System
// ═══════════════════════════════════════════════════════════

const BASE_ELO = 1200;
const K_FACTOR = 32;

function calculateElo(
  winnerElo: number,
  loserElo: number,
): { newWinnerElo: number; newLoserElo: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
  return {
    newWinnerElo: Math.round(winnerElo + K_FACTOR * (1 - expectedWinner)),
    newLoserElo: Math.round(loserElo + K_FACTOR * (0 - expectedLoser)),
  };
}

// ═══════════════════════════════════════════════════════════
// Sync
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(state: { items: WishlistItem[]; duelHistory: DuelResult[]; categories: string[] }) {
  if (!_syncUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (!_syncUserId) return;
    saveToolData(_syncUserId, 'wishlist', state).catch((err) => {
      console.error('[ORBIT] Failed to save Wishlist data:', err);
    });
  }, 500);
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      duelHistory: [],
      categories: [],

      addItem: (item) => {
        const newItem: WishlistItem = {
          ...item,
          id: crypto.randomUUID(),
          elo: BASE_ELO,
          matchesPlayed: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const items = [...get().items, newItem];
        set({ items });
        scheduleSave({ items, duelHistory: get().duelHistory, categories: get().categories });
        return newItem;
      },

      updateItem: (id, updates) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i
        );
        set({ items });
        scheduleSave({ items, duelHistory: get().duelHistory, categories: get().categories });
      },

      removeItem: (id) => {
        const items = get().items.filter((i) => i.id !== id);
        const duelHistory = get().duelHistory.filter((d) => d.winnerId !== id && d.loserId !== id);
        set({ items, duelHistory });
        scheduleSave({ items, duelHistory, categories: get().categories });
      },

      purchaseItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, purchased: true, purchasedAt: Date.now(), updatedAt: Date.now() } : i
        );
        set({ items });
        scheduleSave({ items, duelHistory: get().duelHistory, categories: get().categories });
      },

      archiveItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, archived: true, updatedAt: Date.now() } : i
        );
        set({ items });
        scheduleSave({ items, duelHistory: get().duelHistory, categories: get().categories });
      },

      unarchiveItem: (id) => {
        const items = get().items.map((i) =>
          i.id === id ? { ...i, archived: false, updatedAt: Date.now() } : i
        );
        set({ items });
        scheduleSave({ items, duelHistory: get().duelHistory, categories: get().categories });
      },

      recordDuel: (winnerId, loserId) => {
        const items = get().items;
        const winner = items.find((i) => i.id === winnerId);
        const loser = items.find((i) => i.id === loserId);
        if (!winner || !loser) return;

        const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);

        const updated = items.map((i) => {
          if (i.id === winnerId) return { ...i, elo: newWinnerElo, matchesPlayed: i.matchesPlayed + 1, updatedAt: Date.now() };
          if (i.id === loserId) return { ...i, elo: newLoserElo, matchesPlayed: i.matchesPlayed + 1, updatedAt: Date.now() };
          return i;
        });

        const duelResult: DuelResult = { winnerId, loserId, timestamp: Date.now() };
        const duelHistory = [...get().duelHistory, duelResult];

        set({ items: updated, duelHistory });
        scheduleSave({ items: updated, duelHistory, categories: get().categories });
      },

      getDuelPair: () => {
        const active = get().items.filter((i) => !i.purchased && !i.archived);
        if (active.length < 2) return null;

        // Prioritize items with fewer matches played (so new items get ranked fast)
        // Then add some randomness
        const sorted = [...active].sort((a, b) => a.matchesPlayed - b.matchesPlayed);
        const pool = sorted.slice(0, Math.max(4, Math.ceil(sorted.length * 0.6)));

        // Pick two random items from the pool, avoiding recent matchups
        const recentDuels = get().duelHistory.slice(-10);
        const recentPairs = new Set(
          recentDuels.map((d) => [d.winnerId, d.loserId].sort().join(':'))
        );

        let attempts = 0;
        while (attempts < 20) {
          const i = Math.floor(Math.random() * pool.length);
          let j = Math.floor(Math.random() * pool.length);
          if (i === j) j = (j + 1) % pool.length;
          if (i === j) break; // only 1 item in pool

          const pairKey = [pool[i].id, pool[j].id].sort().join(':');
          if (!recentPairs.has(pairKey) || attempts > 10) {
            return [pool[i], pool[j]];
          }
          attempts++;
        }

        // Fallback: just pick two random
        const i = Math.floor(Math.random() * active.length);
        let j = Math.floor(Math.random() * active.length);
        if (i === j) j = (j + 1) % active.length;
        return [active[i], active[j]];
      },

      addCategory: (name) => {
        const categories = [...new Set([...get().categories, name])];
        set({ categories });
        scheduleSave({ items: get().items, duelHistory: get().duelHistory, categories });
      },

      removeCategory: (name) => {
        const categories = get().categories.filter((c) => c !== name);
        set({ categories });
        scheduleSave({ items: get().items, duelHistory: get().duelHistory, categories });
      },

      _setFromCloud: (data) => {
        set({
          items: data.items ?? [],
          duelHistory: data.duelHistory ?? [],
          categories: data.categories ?? [],
        });
      },

      _setSyncUserId: (userId) => {
        _syncUserId = userId;
      },
    }),
    {
      name: 'orbit-wishlist',
      partialize: (state) => ({
        items: state.items,
        duelHistory: state.duelHistory,
        categories: state.categories,
      }),
      skipHydration: true,
    }
  )
);
