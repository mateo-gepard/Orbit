import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// ORBIT — Circles: Relationship Gravity Map
// People orbit around you. Interactions pull them closer.
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────

export interface CirclePerson {
  id: string;
  name: string;
  emoji: string;
  notes: string;
  birthday?: string; // YYYY-MM-DD
  createdAt: number;
}

export type InteractionType = 'nudge' | 'met' | 'called' | 'texted' | 'habit_done' | 'note';

export interface CircleInteraction {
  id: string;
  personId: string;
  type: InteractionType;
  label?: string;
  timestamp: number;
}

export interface HabitLink {
  habitId: string;
  personId: string;
}

interface CirclesCloudData {
  people: CirclePerson[];
  interactions: CircleInteraction[];
  habitLinks: HabitLink[];
}

// ─── Gravity Computation ───────────────────────────────────

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function computeGravity(
  personId: string,
  interactions: CircleInteraction[],
  habitLinks: HabitLink[],
): number {
  const now = Date.now();
  let score = 0;

  for (const i of interactions) {
    if (i.personId !== personId) continue;
    const age = now - i.timestamp;
    if (age < SEVEN_DAYS) score += 3;
    else if (age < THIRTY_DAYS) score += 1;
  }

  // Each shared habit adds gravity
  score += habitLinks.filter((l) => l.personId === personId).length * 4;

  return score;
}

/** Recency from 0 (no interaction) to 1 (just now), exponential decay */
export function getRecency(personId: string, interactions: CircleInteraction[]): number {
  const last = interactions
    .filter((i) => i.personId === personId)
    .reduce((max, i) => Math.max(max, i.timestamp), 0);
  if (!last) return 0;
  const days = (Date.now() - last) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.exp(-days / 10));
}

// ─── Helpers ───────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function sanitize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Sync ──────────────────────────────────────────────────

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(data: CirclesCloudData) {
  if (!_syncUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!_syncUserId) return;
    try {
      await saveToolData(_syncUserId, 'circles', sanitize(data) as unknown as Record<string, unknown>);
    } catch (err) {
      console.error('[ORBIT] Circles: cloud save failed:', err);
    }
  }, 500);
}

// ─── Store ─────────────────────────────────────────────────

interface CirclesState {
  people: CirclePerson[];
  interactions: CircleInteraction[];
  habitLinks: HabitLink[];

  addPerson: (name: string, emoji: string) => string;
  updatePerson: (id: string, updates: Partial<Omit<CirclePerson, 'id' | 'createdAt'>>) => void;
  removePerson: (id: string) => void;

  logInteraction: (personId: string, type: InteractionType, label?: string) => void;

  linkHabit: (habitId: string, personId: string) => void;
  unlinkHabit: (habitId: string) => void;

  _setSyncUserId: (uid: string | null) => void;
  _setFromCloud: (data: CirclesCloudData) => void;
}

export const useCirclesStore = create<CirclesState>()(
  persist(
    (set, get) => ({
      people: [],
      interactions: [],
      habitLinks: [],

      addPerson: (name, emoji) => {
        const id = uid();
        const person: CirclePerson = { id, name, emoji, notes: '', createdAt: Date.now() };
        set((s) => {
          const people = [...s.people, person];
          scheduleSave({ people, interactions: s.interactions, habitLinks: s.habitLinks });
          return { people };
        });
        return id;
      },

      updatePerson: (id, updates) => {
        set((s) => {
          const people = s.people.map((p) => (p.id === id ? { ...p, ...updates } : p));
          scheduleSave({ people, interactions: s.interactions, habitLinks: s.habitLinks });
          return { people };
        });
      },

      removePerson: (id) => {
        set((s) => {
          const people = s.people.filter((p) => p.id !== id);
          const interactions = s.interactions.filter((i) => i.personId !== id);
          const habitLinks = s.habitLinks.filter((l) => l.personId !== id);
          scheduleSave({ people, interactions, habitLinks });
          return { people, interactions, habitLinks };
        });
      },

      logInteraction: (personId, type, label) => {
        set((s) => {
          const interaction: CircleInteraction = {
            id: uid(),
            personId,
            type,
            label,
            timestamp: Date.now(),
          };
          // Keep last 500 interactions to prevent unbounded growth
          const interactions = [...s.interactions, interaction].slice(-500);
          scheduleSave({ people: s.people, interactions, habitLinks: s.habitLinks });
          return { interactions };
        });
      },

      linkHabit: (habitId, personId) => {
        set((s) => {
          // Replace existing link for this habit
          const habitLinks = [...s.habitLinks.filter((l) => l.habitId !== habitId), { habitId, personId }];
          scheduleSave({ people: s.people, interactions: s.interactions, habitLinks });
          return { habitLinks };
        });
      },

      unlinkHabit: (habitId) => {
        set((s) => {
          const habitLinks = s.habitLinks.filter((l) => l.habitId !== habitId);
          scheduleSave({ people: s.people, interactions: s.interactions, habitLinks });
          return { habitLinks };
        });
      },

      _setSyncUserId: (uid) => {
        _syncUserId = uid;
      },

      _setFromCloud: (data) => {
        if (data) {
          set({
            people: data.people || [],
            interactions: data.interactions || [],
            habitLinks: data.habitLinks || [],
          });
        }
      },
    }),
    { name: 'orbit-circles' },
  ),
);
