import { create } from 'zustand';
import {
  type UserProfile,
  type Connection,
  type Nudge,
  type SharedHabit,
  ensureUserProfile,
  lookupUserByCode,
  getUserProfile,
  createConnectionRequest,
  acceptConnection as acceptConn,
  declineConnection as declineConn,
  removeConnection as removeConn,
  sendNudge as sendNudgeFn,
  addSharedHabit,
  removeSharedHabit,
  syncHabitCompletions,
  subscribeToConnections,
  subscribeToNudges,
  markNudgeRead as markRead,
} from './circles';

// Re-export types the page needs
export type { UserProfile, Connection, Nudge, SharedHabit };
export { formatFriendCode } from './circles';

// ═══════════════════════════════════════════════════════════
// ORBIT — Circles Store (Real Users)
// ═══════════════════════════════════════════════════════════

interface CirclesState {
  myProfile: UserProfile | null;
  connections: Connection[];
  nudges: Nudge[];
  friendProfiles: Record<string, UserProfile>;
  loading: boolean;

  // Actions
  addFriend: (code: string) => Promise<{ success: boolean; error?: string }>;
  acceptRequest: (connectionId: string) => Promise<void>;
  declineRequest: (connectionId: string) => Promise<void>;
  removeFriend: (connectionId: string) => Promise<void>;
  nudgeFriend: (connectionId: string) => Promise<void>;
  shareHabit: (connectionId: string, habitId: string, habitTitle: string) => Promise<void>;
  unshareHabit: (connectionId: string, habitId: string) => Promise<void>;
  syncMyCompletions: (items: { id: string; completions?: Record<string, boolean> }[]) => Promise<void>;
  dismissNudge: (nudgeId: string) => Promise<void>;

  // Lifecycle (called by data-provider)
  _setSyncUserId: (
    uid: string | null,
    profile?: { displayName: string; email: string; photoURL: string | null },
  ) => void;
  _cleanup: () => void;
}

let _unsubs: (() => void)[] = [];

export const useCirclesStore = create<CirclesState>()((set, get) => ({
  myProfile: null,
  connections: [],
  nudges: [],
  friendProfiles: {},
  loading: false,

  // ─── Add friend by code ────────────────────────────────
  addFriend: async (code) => {
    const me = get().myProfile;
    if (!me) return { success: false, error: 'Not signed in' };

    try {
      const target = await lookupUserByCode(code);
      if (!target) return { success: false, error: 'No user found with that code' };
      if (target.uid === me.uid) return { success: false, error: "That's your own code" };

      // Check existing connection
      const existing = get().connections.find((c) => c.users.includes(target.uid));
      if (existing) return { success: false, error: 'Already connected' };

      await createConnectionRequest(me.uid, target.uid);
      return { success: true };
    } catch (err) {
      console.error('[ORBIT] Circles: add friend failed:', err);
      return { success: false, error: (err as Error).message || 'Failed to send request' };
    }
  },

  // ─── Accept / Decline / Remove ─────────────────────────
  acceptRequest: async (connectionId) => {
    try {
      await acceptConn(connectionId);
    } catch (err) {
      console.error('[ORBIT] Circles: accept failed:', err);
    }
  },

  declineRequest: async (connectionId) => {
    try {
      await declineConn(connectionId);
    } catch (err) {
      console.error('[ORBIT] Circles: decline failed:', err);
    }
  },

  removeFriend: async (connectionId) => {
    try {
      await removeConn(connectionId);
    } catch (err) {
      console.error('[ORBIT] Circles: remove failed:', err);
    }
  },

  // ─── Nudge ─────────────────────────────────────────────
  nudgeFriend: async (connectionId) => {
    const me = get().myProfile;
    if (!me) return;

    const conn = get().connections.find((c) => c.id === connectionId);
    if (!conn || conn.status !== 'accepted') return;

    const friendUid = conn.users.find((u) => u !== me.uid);
    if (!friendUid) return;

    try {
      await sendNudgeFn(me.uid, friendUid, connectionId);
    } catch (err) {
      console.error('[ORBIT] Circles: nudge failed:', err);
    }
  },

  // ─── Shared Habits ────────────────────────────────────
  shareHabit: async (connectionId, habitId, habitTitle) => {
    const me = get().myProfile;
    if (!me) return;
    try {
      await addSharedHabit(connectionId, { ownerUid: me.uid, habitId, habitTitle });
    } catch (err) {
      console.error('[ORBIT] Circles: share habit failed:', err);
    }
  },

  unshareHabit: async (connectionId, habitId) => {
    const me = get().myProfile;
    if (!me) return;
    try {
      await removeSharedHabit(connectionId, habitId, me.uid);
    } catch (err) {
      console.error('[ORBIT] Circles: unshare habit failed:', err);
    }
  },

  // Sync my habit completions to all connections that share them
  syncMyCompletions: async (items) => {
    const me = get().myProfile;
    if (!me) return;
    const accepted = get().connections.filter((c) => c.status === 'accepted');

    for (const conn of accepted) {
      const myHabits = (conn.sharedHabits || []).filter((h) => h.ownerUid === me.uid);
      for (const sh of myHabits) {
        const item = items.find((i) => i.id === sh.habitId);
        if (!item) continue;
        try {
          await syncHabitCompletions(conn.id, me.uid, sh.habitId, item.completions || {});
        } catch {
          // Non-critical, silently skip
        }
      }
    }
  },

  // ─── Nudge dismiss ────────────────────────────────────
  dismissNudge: async (nudgeId) => {
    try {
      await markRead(nudgeId);
    } catch (err) {
      console.error('[ORBIT] Circles: dismiss nudge failed:', err);
    }
  },

  // ─── Lifecycle ─────────────────────────────────────────
  _setSyncUserId: (uid, profile) => {
    // Cleanup previous
    get()._cleanup();

    if (!uid || !profile) {
      set({ myProfile: null, connections: [], nudges: [], friendProfiles: {}, loading: false });
      return;
    }

    set({ loading: true });

    // Ensure profile exists in Firestore
    ensureUserProfile(uid, profile)
      .then((prof) => set({ myProfile: prof }))
      .catch((err) => {
        console.error('[ORBIT] Circles: profile init failed:', err);
        // Still set a local profile so the page can show friend code
        set({
          myProfile: {
            uid,
            displayName: profile.displayName,
            email: profile.email,
            photoURL: profile.photoURL,
            friendCode: '',
            createdAt: Date.now(),
          },
        });
      });

    // Subscribe to connections
    const unsubConn = subscribeToConnections(uid, async (connections) => {
      set({ connections, loading: false });

      // Fetch friend profiles for all connections
      const profiles = { ...get().friendProfiles };
      const friendUids = connections
        .flatMap((c) => c.users)
        .filter((u) => u !== uid && !profiles[u]);

      const unique = [...new Set(friendUids)];
      const fetched = await Promise.all(unique.map((u) => getUserProfile(u)));
      for (const p of fetched) {
        if (p) profiles[p.uid] = p;
      }
      set({ friendProfiles: profiles });
    });

    // Subscribe to nudges
    const unsubNudge = subscribeToNudges(uid, (nudges) => {
      set({ nudges });
    });

    _unsubs = [unsubConn, unsubNudge];
  },

  _cleanup: () => {
    for (const unsub of _unsubs) unsub();
    _unsubs = [];
  },
}));

