import {
  collection,
  addDoc,
  writeBatch,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  type Firestore,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AnalyticsEvent, AnalyticsAction, OrbitItem } from './types';

// ═══════════════════════════════════════════════════════════
// ORBIT Analytics — Lightweight Event Tracker
// ═══════════════════════════════════════════════════════════
//
// Design principles:
// 1. Fire-and-forget — never blocks the UI
// 2. Batched writes — collects events, flushes every N seconds
// 3. Dual storage — Firestore when online, localStorage always
// 4. Minimal payload — only fields relevant to the action
// 5. Idempotent — safe to call multiple times
//
// ═══════════════════════════════════════════════════════════

const ANALYTICS_COLLECTION = 'analytics';
const LOCAL_ANALYTICS_KEY = 'orbit-analytics';
const BATCH_INTERVAL_MS = 10_000; // Flush every 10s
const MAX_BATCH_SIZE = 25;        // Firestore batch limit is 500, keep small
const MAX_LOCAL_EVENTS = 5_000;   // Cap local storage

// ═══════════════════════════════════════════════════════════
// Session tracking
// ═══════════════════════════════════════════════════════════

let _sessionId: string | null = null;
let _userId: string | null = null;
let _eventQueue: Omit<AnalyticsEvent, 'id'>[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _sessionStart: number | null = null;
let _handleUnload: (() => void) | null = null;
let _handleVisibilityChange: (() => void) | null = null;

function localAnalyticsKey(userId: string): string {
  return `${LOCAL_ANALYTICS_KEY}:${encodeURIComponent(userId)}`;
}

function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return _sessionId;
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/**
 * Initialize analytics for the current user.
 * Call once when the user authenticates.
 */
export function initAnalytics(userId: string): void {
  if (_userId === userId && _flushTimer) return;
  if (_userId && _userId !== userId) stopAnalytics();
  _userId = userId;
  _sessionStart = Date.now();

  // Track session start
  trackEvent('session_start');

  // Start periodic flush
  if (!_flushTimer) {
    _flushTimer = setInterval(flushEvents, BATCH_INTERVAL_MS);
  }

  // Flush on page unload
  if (typeof window !== 'undefined') {
    _handleUnload = () => {
      if (_sessionStart) {
        trackEvent('session_end', {
          durationMs: Date.now() - _sessionStart,
        });
      }
      flushEventsSync(); // Synchronous flush for unload
    };
    window.addEventListener('beforeunload', _handleUnload);
    // Also handle visibility change (mobile browsers)
    _handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushEvents();
      }
    };
    document.addEventListener('visibilitychange', _handleVisibilityChange);
  }
}

/** Apply the user's explicit analytics preference. */
export function configureAnalytics(userId: string | null, enabled: boolean): void {
  if (!userId || !enabled) {
    stopAnalytics();
    return;
  }
  initAnalytics(userId);
}

/**
 * Track an analytics event. Non-blocking, fire-and-forget.
 */
export function trackEvent(
  action: AnalyticsAction,
  data?: Partial<Pick<AnalyticsEvent, 'itemId' | 'itemType' | 'itemTitle' | 'parentId' | 'tags' | 'priority' | 'dueDate' | 'durationMs'>>
): void {
  if (!_userId) return;

  const now = Date.now();
  const dateObj = new Date(now);

  const event: Omit<AnalyticsEvent, 'id'> = {
    userId: _userId,
    action,
    timestamp: now,
    date: dateObj.toISOString().slice(0, 10), // YYYY-MM-DD
    hour: dateObj.getHours(),
    sessionId: getSessionId(),
    ...data,
  };

  // Clean undefined values
  const cleaned = Object.fromEntries(
    Object.entries(event).filter(([, v]) => v !== undefined)
  ) as Omit<AnalyticsEvent, 'id'>;

  _eventQueue.push(cleaned);

  // Auto-flush if queue is getting large
  if (_eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents();
  }
}

/**
 * Convenience: track an action on an OrbitItem.
 * Extracts all relevant fields automatically.
 */
export function trackItemEvent(
  action: AnalyticsAction,
  item: OrbitItem | Partial<OrbitItem>,
  extra?: { durationMs?: number }
): void {
  trackEvent(action, {
    itemType: item.type,
    priority: item.priority,
    durationMs: extra?.durationMs,
  });
}

// ═══════════════════════════════════════════════════════════
// Flush logic — batched Firestore writes
// ═══════════════════════════════════════════════════════════

async function flushEvents(): Promise<void> {
  if (_eventQueue.length === 0) return;

  // Grab the current batch and clear queue
  const batch = _eventQueue.splice(0, MAX_BATCH_SIZE);

  // Always persist to localStorage (fast, reliable)
  appendToLocalStorage(batch);

  // Try Firestore
  if (db) {
    try {
      await writeToFirestore(batch);
    } catch (err) {
      console.warn('[Analytics] Firestore flush failed, events safe in localStorage:', err);
      // Events are already in localStorage, no data loss
    }
  }
}

/** Synchronous flush for beforeunload — uses sendBeacon pattern */
function flushEventsSync(): void {
  if (_eventQueue.length === 0) return;
  const batch = _eventQueue.splice(0);
  appendToLocalStorage(batch);
  // Can't do async Firestore write on unload, localStorage is enough
}

async function writeToFirestore(events: Omit<AnalyticsEvent, 'id'>[]): Promise<void> {
  if (!db) return;
  const firestore = db as Firestore;

  if (events.length === 1) {
    // Single write — no batch overhead
    await addDoc(collection(firestore, ANALYTICS_COLLECTION), events[0]);
    return;
  }

  // Batched write
  const batch = writeBatch(firestore);
  for (const event of events) {
    const ref = doc(collection(firestore, ANALYTICS_COLLECTION));
    batch.set(ref, event);
  }
  await batch.commit();
}

// ═══════════════════════════════════════════════════════════
// Local Storage — always-available backup
// ═══════════════════════════════════════════════════════════

function appendToLocalStorage(events: Omit<AnalyticsEvent, 'id'>[]): void {
  if (typeof window === 'undefined') return;
  const byUser = new Map<string, Omit<AnalyticsEvent, 'id'>[]>();
  for (const event of events) {
    const bucket = byUser.get(event.userId) || [];
    bucket.push(event);
    byUser.set(event.userId, bucket);
  }
  for (const [userId, userEvents] of byUser) {
    try {
      const existing = loadLocalAnalytics(userId);
      const updated = [...existing, ...userEvents];

      // Cap to prevent storage bloat
      const capped = updated.length > MAX_LOCAL_EVENTS
        ? updated.slice(updated.length - MAX_LOCAL_EVENTS)
        : updated;

      localStorage.setItem(localAnalyticsKey(userId), JSON.stringify(capped));
    } catch {
      // Storage full or unavailable — analytics must never break the app.
    }
  }
}

function loadLocalAnalytics(userId: string): Omit<AnalyticsEvent, 'id'>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(localAnalyticsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// Query helpers — for future analytics dashboard
// ═══════════════════════════════════════════════════════════

/**
 * Get analytics events for a user within a date range.
 * Returns from Firestore if available, otherwise localStorage.
 */
export async function getAnalyticsEvents(
  userId: string,
  startDate: string,
  endDate: string,
  maxResults = 500
): Promise<AnalyticsEvent[]> {
  // Try Firestore first
  if (db) {
    try {
      const q = query(
        collection(db as Firestore, ANALYTICS_COLLECTION),
        where('userId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc'),
        orderBy('timestamp', 'desc'),
        limit(maxResults)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AnalyticsEvent));
    } catch (err) {
      console.warn('[Analytics] Firestore query failed, using localStorage:', err);
    }
  }

  // Fallback: localStorage
  const local = loadLocalAnalytics(userId);
  return local
    .filter((e) => e.userId === userId && e.date >= startDate && e.date <= endDate)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxResults)
    .map((e, i) => ({ ...e, id: `local_${i}` } as AnalyticsEvent));
}

/**
 * Get summary stats from local analytics (fast, no network).
 * Useful for widgets and dashboard cards.
 */
export function getLocalAnalyticsSummary(userId: string, days = 30) {
  const events = loadLocalAnalytics(userId).filter((e) => e.userId === userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = events.filter((e) => e.date >= cutoffStr);

  // Tasks completed per day
  const completedByDay = new Map<string, number>();
  // Items created per day
  const createdByDay = new Map<string, number>();
  // Habits checked per day
  const habitsCheckedByDay = new Map<string, number>();
  // Active hours
  const hourCounts = new Array(24).fill(0);
  // Sessions
  const sessions = new Set<string>();
  // Task cycle times
  const cycleTimes: number[] = [];

  for (const e of recent) {
    if (e.action === 'item_completed') {
      completedByDay.set(e.date, (completedByDay.get(e.date) || 0) + 1);
      if (e.durationMs) cycleTimes.push(e.durationMs);
    }
    if (e.action === 'item_created') {
      createdByDay.set(e.date, (createdByDay.get(e.date) || 0) + 1);
    }
    if (e.action === 'habit_checked') {
      habitsCheckedByDay.set(e.date, (habitsCheckedByDay.get(e.date) || 0) + 1);
    }
    hourCounts[e.hour]++;
    if (e.sessionId) sessions.add(e.sessionId);
  }

  const avgCycleTimeMs = cycleTimes.length > 0
    ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
    : 0;

  return {
    totalEvents: recent.length,
    totalCompleted: Array.from(completedByDay.values()).reduce((a, b) => a + b, 0),
    totalCreated: Array.from(createdByDay.values()).reduce((a, b) => a + b, 0),
    totalHabitsChecked: Array.from(habitsCheckedByDay.values()).reduce((a, b) => a + b, 0),
    totalSessions: sessions.size,
    completedByDay: Object.fromEntries(completedByDay),
    createdByDay: Object.fromEntries(createdByDay),
    habitsCheckedByDay: Object.fromEntries(habitsCheckedByDay),
    hourCounts,
    avgCycleTimeMs,
    peakHour: hourCounts.indexOf(Math.max(...hourCounts)),
  };
}

/**
 * Cleanup: stop analytics flush timer.
 */
export function stopAnalytics(): void {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  if (_userId && _sessionStart) {
    trackEvent('session_end', { durationMs: Date.now() - _sessionStart });
  }
  flushEventsSync();
  if (typeof window !== 'undefined' && _handleUnload) {
    window.removeEventListener('beforeunload', _handleUnload);
  }
  if (typeof document !== 'undefined' && _handleVisibilityChange) {
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
  }
  _handleUnload = null;
  _handleVisibilityChange = null;
  _userId = null;
  _sessionId = null;
  _sessionStart = null;
}
