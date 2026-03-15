import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// ═══════════════════════════════════════════════════════════
// ORBIT — Circles: Multi-User Firestore Operations
// Real users, real connections, real shared habits.
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  friendCode: string;
  createdAt: number;
}

export interface Connection {
  id: string;
  users: [string, string]; // sorted UIDs
  status: 'pending' | 'accepted';
  initiator: string;
  createdAt: number;
  since?: number; // when accepted
  sharedHabits: SharedHabit[];
  // completions[uid][habitId][date] = true
  completions: Record<string, Record<string, Record<string, boolean>>>;
  personNotes: Record<string, string[]>;
  activity: Record<string, ActivityEntry[]>;
  linkedItems: LinkedItem[];
}

export interface SharedHabit {
  ownerUid: string;
  habitId: string;
  habitTitle: string;
}

export interface Nudge {
  id: string;
  from: string;
  to: string;
  connectionId: string;
  message?: string;
  read: boolean;
  createdAt: number;
}

export interface ActivityEntry {
  type: 'daily_summary';
  date: string;
  tasksDone: number;
  habitsDone: number;
}

export interface LinkedItem {
  ownerUid: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
}

// ─── Helpers ───────────────────────────────────────────────

function ok(): boolean {
  return db !== null;
}

function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function formatFriendCode(code: string): string {
  if (!code || code.length < 8) return code || '';
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ─── Profile ───────────────────────────────────────────────

export async function ensureUserProfile(
  uid: string,
  data: { displayName: string; email: string; photoURL: string | null },
): Promise<UserProfile> {
  if (!ok() || !db) throw new Error('Firebase not available');

  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    // Update mutable display fields
    const merged: UserProfile = {
      ...existing,
      uid,
      displayName: data.displayName || existing.displayName,
      email: data.email || existing.email,
      photoURL: data.photoURL ?? existing.photoURL,
    };
    await setDoc(ref, merged, { merge: true });
    return merged;
  }

  // Create new
  const profile: UserProfile = {
    uid,
    displayName: data.displayName || 'Orbit User',
    email: data.email || '',
    photoURL: data.photoURL,
    friendCode: generateFriendCode(),
    createdAt: Date.now(),
  };
  await setDoc(ref, profile);
  return profile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!ok() || !db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? ({ uid, ...snap.data() } as UserProfile) : null;
}

export async function lookupUserByCode(code: string): Promise<UserProfile | null> {
  if (!ok() || !db) return null;
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  if (normalized.length < 6) return null;
  const q = query(collection(db, 'users'), where('friendCode', '==', normalized));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() } as UserProfile;
}

// ─── Connections ───────────────────────────────────────────

export async function createConnectionRequest(fromUid: string, toUid: string): Promise<string> {
  if (!ok() || !db) throw new Error('Firebase not available');
  if (fromUid === toUid) throw new Error("You can't add yourself");

  // Check for existing connection between these two users
  const pair = sortedPair(fromUid, toUid);
  const q = query(collection(db, 'connections'), where('users', '==', pair));
  const existing = await getDocs(q);
  if (!existing.empty) throw new Error('Already connected');

  const ref = await addDoc(collection(db, 'connections'), {
    users: pair,
    status: 'pending',
    initiator: fromUid,
    createdAt: Date.now(),
    sharedHabits: [],
    completions: {},
  });
  return ref.id;
}

export async function acceptConnection(connectionId: string): Promise<void> {
  if (!ok() || !db) return;
  await updateDoc(doc(db, 'connections', connectionId), {
    status: 'accepted',
    since: Date.now(),
  });
}

export async function declineConnection(connectionId: string): Promise<void> {
  if (!ok() || !db) return;
  await deleteDoc(doc(db, 'connections', connectionId));
}

export async function removeConnection(connectionId: string): Promise<void> {
  if (!ok() || !db) return;
  await deleteDoc(doc(db, 'connections', connectionId));
}

export function subscribeToConnections(
  uid: string,
  callback: (connections: Connection[]) => void,
): () => void {
  if (!ok() || !db) return () => {};
  const q = query(collection(db, 'connections'), where('users', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const connections = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Connection));
      callback(connections);
    },
    (err) => {
      console.error('[ORBIT] Circles connection subscription error:', err);
    },
  );
}

// ─── Shared Habits ─────────────────────────────────────────

export async function addSharedHabit(connectionId: string, habit: SharedHabit): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as Connection;
  const existing = data.sharedHabits || [];
  if (existing.some((h) => h.habitId === habit.habitId && h.ownerUid === habit.ownerUid)) return;

  await updateDoc(ref, { sharedHabits: [...existing, habit] });
}

export async function removeSharedHabit(connectionId: string, habitId: string, ownerUid: string): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as Connection;
  await updateDoc(ref, {
    sharedHabits: (data.sharedHabits || []).filter(
      (h) => !(h.habitId === habitId && h.ownerUid === ownerUid),
    ),
  });
}

export async function syncHabitCompletions(
  connectionId: string,
  uid: string,
  habitId: string,
  completions: Record<string, boolean>,
): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);

  // Build dot-notation updates for last 14 days
  const updates: Record<string, boolean> = {};
  const now = new Date();
  for (let d = 0; d < 14; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    const key = dt.toISOString().slice(0, 10);
    updates[`completions.${uid}.${habitId}.${key}`] = !!completions[key];
  }
  await updateDoc(ref, updates);
}

// ─── Nudges ────────────────────────────────────────────────

export async function sendNudge(fromUid: string, toUid: string, connectionId: string, message?: string): Promise<void> {
  if (!ok() || !db) return;
  await addDoc(collection(db, 'nudges'), {
    from: fromUid,
    to: toUid,
    connectionId,
    ...(message ? { message } : {}),
    read: false,
    createdAt: Date.now(),
  });
}

export function subscribeToNudges(
  uid: string,
  callback: (nudges: Nudge[]) => void,
): () => void {
  if (!ok() || !db) return () => {};
  const q = query(collection(db, 'nudges'), where('to', '==', uid), where('read', '==', false));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Nudge)));
    },
    (err) => {
      console.error('[ORBIT] Circles nudge subscription error:', err);
    },
  );
}

export async function markNudgeRead(nudgeId: string): Promise<void> {
  if (!ok() || !db) return;
  await updateDoc(doc(db, 'nudges', nudgeId), { read: true });
}

// ─── Person Notes ──────────────────────────────────────────

export async function addPersonNote(connectionId: string, uid: string, note: string): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const notes = data.personNotes?.[uid] || [];
  await updateDoc(ref, { [`personNotes.${uid}`]: [...notes, note] });
}

export async function removePersonNote(connectionId: string, uid: string, index: number): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const notes = [...(data.personNotes?.[uid] || [])];
  notes.splice(index, 1);
  await updateDoc(ref, { [`personNotes.${uid}`]: notes });
}

// ─── Activity Sync ─────────────────────────────────────────

export async function syncActivity(
  connectionId: string,
  uid: string,
  entries: ActivityEntry[],
): Promise<void> {
  if (!ok() || !db) return;
  await updateDoc(doc(db, 'connections', connectionId), {
    [`activity.${uid}`]: entries.slice(0, 20),
  });
}

// ─── Linked Items ──────────────────────────────────────────

export async function addLinkedItem(connectionId: string, item: LinkedItem): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Connection;
  const existing = data.linkedItems || [];
  if (existing.some((l) => l.itemId === item.itemId && l.ownerUid === item.ownerUid)) return;
  await updateDoc(ref, { linkedItems: [...existing, item] });
}

export async function removeLinkedItem(connectionId: string, itemId: string, ownerUid: string): Promise<void> {
  if (!ok() || !db) return;
  const ref = doc(db, 'connections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Connection;
  await updateDoc(ref, {
    linkedItems: (data.linkedItems || []).filter(
      (l) => !(l.itemId === itemId && l.ownerUid === ownerUid),
    ),
  });
}
