'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  ArrowLeft,
  Copy,
  Check,
  X,
  Hand,
  Trash2,
  Share2,
  UserPlus,
  Loader2,
  CalendarDays,
  FolderOpen,
  FileText,
  Target,
  Repeat,
  CheckSquare,
  Link2,
} from 'lucide-react';
import {
  useCirclesStore,
  formatFriendCode,
  type Connection,
  type UserProfile,
} from '@/lib/circles-store';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════
// Circles — Your People in Orbit
// ═══════════════════════════════════════════════════════════

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function initial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function calculateInteractionScore(conn: Connection, myUid: string): number {
  let score = 0;
  score += (conn.sharedHabits?.length || 0) * 5;
  const completions = conn.completions || {};
  for (const uid of Object.keys(completions)) {
    for (const habitId of Object.keys(completions[uid])) {
      score += Object.values(completions[uid][habitId]).filter(Boolean).length * 0.5;
    }
  }
  score += ((conn.linkedItems || []).length) * 3;
  if ((conn.personNotes?.[myUid] || []).length > 0) score += 2;
  const activity = conn.activity || {};
  for (const uid of Object.keys(activity)) {
    score += (activity[uid]?.length || 0) * 0.5;
  }
  if (conn.since) {
    score += Math.min((Date.now() - conn.since) / 604800000, 20);
  }
  return score;
}

function relativeDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  const diff = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
  if (diff < 7) return `${diff}d ago`;
  return format(new Date(dateStr + 'T12:00:00'), 'MMM d');
}

const ITEM_TYPE_ICONS: Record<string, typeof CalendarDays> = {
  event: CalendarDays,
  project: FolderOpen,
  note: FileText,
  goal: Target,
  habit: Repeat,
  task: CheckSquare,
};

// ─── Orbit Map ───────────────────────────────────────────

const ORBIT_COLORS = [
  'rgba(244,63,94,0.55)',   // rose
  'rgba(168,85,247,0.55)',  // purple
  'rgba(59,130,246,0.55)',  // blue
  'rgba(16,185,129,0.55)',  // emerald
  'rgba(245,158,11,0.55)',  // amber
  'rgba(236,72,153,0.55)',  // pink
  'rgba(99,102,241,0.55)',  // indigo
  'rgba(20,184,166,0.55)',  // teal
];

function OrbitMap({
  friends,
  myProfile,
  selectedId,
  onSelect,
}: {
  friends: { connection: Connection; profile: UserProfile | undefined; score: number }[];
  myProfile: UserProfile;
  selectedId: string | null;
  onSelect: (connectionId: string) => void;
}) {
  const size = 500;
  const cx = size / 2;
  const cy = size / 2;
  const rings = [80, 130, 185];
  const maxScore = Math.max(...friends.map((f) => f.score), 1);

  // Assign each friend a stable orbit ring + angle with slow animation
  const nodes = useMemo(() => {
    const count = friends.length;
    return friends.map((f, i) => {
      const norm = f.score / maxScore;
      // Inner ring for high score, outer for low
      const ringRadius = rings[2] - norm * (rings[2] - rings[0]);
      // Evenly spread friends around the circle, offset by golden angle for visual interest
      const baseAngle = count === 1
        ? -Math.PI / 2
        : (2 * Math.PI * i) / count - Math.PI / 2;
      const nodeR = 24 + norm * 10;
      // Orbit animation: each friend gets a different speed & direction
      const duration = 45 + i * 12 + (1 - norm) * 30;
      const direction = i % 2 === 0 ? 1 : -1;
      const color = ORBIT_COLORS[i % ORBIT_COLORS.length];
      return {
        ...f,
        ringRadius,
        baseAngle,
        nodeR,
        duration,
        direction,
        color,
      };
    });
  }, [friends, maxScore]);

  return (
    <div className="relative w-full max-w-[460px] mx-auto">
      {/* CSS keyframes for orbital rotation */}
      <style>{`
        @keyframes orbit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orbit-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes center-pulse { 0%,100% { r: 30; opacity: 0.06; } 50% { r: 34; opacity: 0.1; } }
        @keyframes node-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      `}</style>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Orbit map">
        <defs>
          {/* Subtle radial gradient for the field */}
          <radialGradient id="orbit-field" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.03} />
            <stop offset="70%" stopColor="currentColor" stopOpacity={0.01} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </radialGradient>
          {/* Glow filter for selected node */}
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background field */}
        <circle cx={cx} cy={cy} r={220} fill="url(#orbit-field)" />

        {/* Orbit rings — solid, more visible */}
        {rings.map((r, ri) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={ri === 0 ? 1.5 : 1}
            opacity={ri === 0 ? 0.1 : ri === 1 ? 0.07 : 0.05}
          />
        ))}
        {/* Dashed tick marks on each ring */}
        {rings.map((r) =>
          Array.from({ length: 24 }).map((_, ti) => {
            const a = (2 * Math.PI * ti) / 24;
            return (
              <circle
                key={`tick-${r}-${ti}`}
                cx={cx + r * Math.cos(a)}
                cy={cy + r * Math.sin(a)}
                r={1}
                fill="currentColor"
                opacity={0.06}
              />
            );
          })
        )}

        {/* Connection lines from center to each friend's orbit ring */}
        {nodes.map((n) => {
          const isSelected = n.connection.id === selectedId;
          if (!isSelected) return null;
          return (
            <circle
              key={`ring-hl-${n.connection.id}`}
              cx={cx}
              cy={cy}
              r={n.ringRadius}
              fill="none"
              stroke={n.color}
              strokeWidth={1.5}
              opacity={0.2}
              strokeDasharray="6 4"
            />
          );
        })}

        {/* Center pulse */}
        <circle cx={cx} cy={cy} r={30} fill="currentColor" opacity={0.06}>
          <animate attributeName="r" values="30;34;30" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.06;0.1;0.06" dur="4s" repeatCount="indefinite" />
        </circle>

        {/* Orbiting friend nodes — each wrapped in a rotating group */}
        {nodes.map((n) => {
          const isSelected = n.connection.id === selectedId;
          const name = n.profile?.displayName || '?';
          const firstName = name.split(' ')[0];
          const angleDeg = (n.baseAngle * 180) / Math.PI;
          const anim = n.direction === 1 ? 'orbit-spin' : 'orbit-spin-rev';
          return (
            <g
              key={n.connection.id}
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                animation: `${anim} ${n.duration}s linear infinite`,
              }}
            >
              {/* Position at the orbit radius from center */}
              <g
                transform={`translate(${cx + n.ringRadius * Math.cos(n.baseAngle)}, ${cy + n.ringRadius * Math.sin(n.baseAngle)})`}
                onClick={() => onSelect(n.connection.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                style={{
                  // Counter-rotate text/circle so they stay upright
                  transformOrigin: '0 0',
                  animation: `${n.direction === 1 ? 'orbit-spin-rev' : 'orbit-spin'} ${n.duration}s linear infinite`,
                }}
              >
                {/* Tap target */}
                <circle cx={0} cy={0} r={n.nodeR + 14} fill="transparent" />
                {/* Selected glow */}
                {isSelected && (
                  <circle cx={0} cy={0} r={n.nodeR + 6} fill={n.color} opacity={0.12} filter="url(#node-glow)" />
                )}
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={0} cy={0} r={n.nodeR + 4} fill="none" stroke={n.color} strokeWidth={2} opacity={0.35} />
                )}
                {/* Node body */}
                <circle cx={0} cy={0} r={n.nodeR} fill={n.color} opacity={isSelected ? 0.22 : 0.12} />
                <circle cx={0} cy={0} r={n.nodeR} fill="none" stroke={n.color} strokeWidth={1.2} opacity={isSelected ? 0.4 : 0.2} />
                {/* Initial */}
                <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={n.nodeR * 0.55} fontWeight={700} fill="currentColor" opacity={isSelected ? 0.75 : 0.5}>
                  {name.charAt(0).toUpperCase()}
                </text>
                {/* Name label below */}
                <text x={0} y={n.nodeR + 16} textAnchor="middle" fontSize={11} fontWeight={500} fill="currentColor" opacity={isSelected ? 0.5 : 0.3} className="pointer-events-none select-none">
                  {firstName.length > 9 ? firstName.slice(0, 8) + '\u2026' : firstName}
                </text>
              </g>
            </g>
          );
        })}

        {/* Center node */}
        <circle cx={cx} cy={cy} r={32} fill="currentColor" opacity={0.04} />
        <circle cx={cx} cy={cy} r={28} fill="currentColor" opacity={0.08} stroke="currentColor" strokeWidth={1.5} strokeOpacity={0.15} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="currentColor" opacity={0.5}>
          You
        </text>
      </svg>
      {friends.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[12px] text-muted-foreground/30 mt-24">
            Share your code to grow your orbit
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Friend Code Card ────────────────────────────────────

function FriendCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  if (!code) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4">
      <p className="text-[11px] text-muted-foreground/50 mb-1.5">Your friend code</p>
      <div className="flex items-center justify-between">
        <span className="text-[20px] font-mono font-semibold tracking-[0.15em]">
          {formatFriendCode(code)}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/30 mt-2">
        Share this code so friends can add you to their orbit
      </p>
    </div>
  );
}

// ─── Nudge Banner ────────────────────────────────────────

function NudgeBanner({
  nudges,
  friendProfiles,
  onDismiss,
}: {
  nudges: { id: string; from: string; createdAt: number }[];
  friendProfiles: Record<string, UserProfile>;
  onDismiss: (id: string) => void;
}) {
  if (nudges.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {nudges.map((n) => {
        const from = friendProfiles[n.from];
        return (
          <div
            key={n.id}
            className="flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <Hand className="h-4 w-4 text-foreground/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium">
                {from?.displayName || 'Someone'} nudged you
              </p>
              <p className="text-[11px] text-muted-foreground/40">{timeAgo(n.createdAt)}</p>
            </div>
            <button
              onClick={() => onDismiss(n.id)}
              className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Pending Requests ────────────────────────────────────

function PendingRequests({
  pending,
  myUid,
  friendProfiles,
  onAccept,
  onDecline,
}: {
  pending: Connection[];
  myUid: string;
  friendProfiles: Record<string, UserProfile>;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  // Only show requests sent TO me (i.e., I'm not the initiator)
  const incoming = pending.filter((c) => c.initiator !== myUid);
  const outgoing = pending.filter((c) => c.initiator === myUid);

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div>
      {incoming.length > 0 && (
        <>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2 px-1">
            Requests ({incoming.length})
          </p>
          <div className="space-y-1.5">
            {incoming.map((c) => {
              const friendUid = c.users.find((u) => u !== myUid)!;
              const profile = friendProfiles[friendUid];
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-foreground/[0.02] px-4 py-3"
                >
                  <div className="h-9 w-9 rounded-full bg-foreground/[0.08] flex items-center justify-center text-[13px] font-semibold shrink-0">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      initial(profile?.displayName || '?')
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">
                      {profile?.displayName || 'Orbit User'}
                    </p>
                    <p className="text-[11px] text-muted-foreground/40">wants to connect</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => onAccept(c.id)} className="h-7 text-[11px] px-3">
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDecline(c.id)}
                      className="h-7 text-[11px] px-2"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {outgoing.length > 0 && (
        <div className={cn(incoming.length > 0 && 'mt-3')}>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2 px-1">
            Sent
          </p>
          {outgoing.map((c) => {
            const friendUid = c.users.find((u) => u !== myUid)!;
            const profile = friendProfiles[friendUid];
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-foreground/[0.02] px-4 py-2.5"
              >
                <div className="h-7 w-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[11px] font-medium shrink-0">
                  {initial(profile?.displayName || '?')}
                </div>
                <span className="text-[12px] text-muted-foreground/50 truncate flex-1">
                  {profile?.displayName || 'Orbit User'} — pending
                </span>
                <button
                  onClick={() => onDecline(c.id)}
                  className="text-muted-foreground/30 hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Person Detail ───────────────────────────────────────

function PersonDetail({
  connection,
  myUid,
  profile,
  myItems,
  onClose,
  onNudge,
  onShareHabit,
  onUnshareHabit,
  onRemove,
  onAddNote,
  onRemoveNote,
  onLinkItem,
  onUnlinkItem,
}: {
  connection: Connection;
  myUid: string;
  profile: UserProfile | undefined;
  myItems: { id: string; title: string; type: string; completions?: Record<string, boolean> }[];
  onClose: () => void;
  onNudge: () => void;
  onShareHabit: () => void;
  onUnshareHabit: (habitId: string) => void;
  onRemove: () => void;
  onAddNote: (note: string) => void;
  onRemoveNote: (index: number) => void;
  onLinkItem: () => void;
  onUnlinkItem: (itemId: string) => void;
}) {
  const friendUid = connection.users.find((u) => u !== myUid)!;
  const sharedHabits = connection.sharedHabits || [];
  const completions = connection.completions || {};
  const myNotes = connection.personNotes?.[myUid] || [];
  const friendActivity = (connection.activity?.[friendUid] || []).slice(0, 15);
  const linkedItems = connection.linkedItems || [];
  const [noteInput, setNoteInput] = useState('');

  // Build last 7 days
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-[440px] max-h-[85vh] bg-card border border-border/50 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-semibold">{profile?.displayName || 'Friend'}</span>
          <div className="w-4" />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {/* Profile */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-foreground/[0.06] text-2xl font-semibold overflow-hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                initial(profile?.displayName || '?')
              )}
            </div>
            <h2 className="text-[15px] font-semibold mt-2">{profile?.displayName}</h2>
            {connection.since && (
              <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                Connected since {format(connection.since, 'MMMM yyyy')}
              </p>
            )}
          </div>

          {/* Quick Notes */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2">Notes</p>
            {myNotes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {myNotes.map((note, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px]">
                    {note}
                    <button onClick={() => onRemoveNote(i)} className="text-muted-foreground/30 hover:text-muted-foreground ml-0.5">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && noteInput.trim()) { onAddNote(noteInput.trim()); setNoteInput(''); } }}
                placeholder="Add a note..."
                className="flex-1 rounded-lg border border-border/30 bg-background/50 px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-foreground/20"
                maxLength={100}
              />
              <button
                onClick={() => { if (noteInput.trim()) { onAddNote(noteInput.trim()); setNoteInput(''); } }}
                disabled={!noteInput.trim()}
                className="rounded-lg bg-foreground/[0.06] px-2.5 py-1.5 hover:bg-foreground/[0.1] transition-colors disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Their Activity */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2">
              {profile?.displayName?.split(' ')[0]}&apos;s Activity
            </p>
            {friendActivity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30 py-2">No recent activity yet. Nudge them!</p>
            ) : (
              <div className="space-y-1">
                {friendActivity.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', a.type === 'habit_done' ? 'bg-foreground/40' : 'bg-foreground/25')} />
                    <span className="text-[12px] truncate flex-1">{a.title}</span>
                    <span className="text-[10px] text-muted-foreground/30 shrink-0">{relativeDate(a.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shared Habits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
                Shared Habits
              </p>
              <button
                onClick={onShareHabit}
                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Share
              </button>
            </div>
            {sharedHabits.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30 py-2">
                No shared habits yet. Share one to see each other&apos;s progress.
              </p>
            ) : (
              <div className="space-y-2">
                {sharedHabits.map((sh) => {
                  const isMyHabit = sh.ownerUid === myUid;
                  const ownerCompletions =
                    completions[sh.ownerUid]?.[sh.habitId] || {};
                  // If it's my habit, show my completions from items store instead (fresher)
                  const myHabit = isMyHabit
                    ? myItems.find((i) => i.id === sh.habitId)
                    : null;
                  const myCompletions = myHabit?.completions || ownerCompletions;
                  const theirCompletions = isMyHabit
                    ? {} // Friend's habits not shown as "theirs" if I own it
                    : ownerCompletions;

                  return (
                    <div
                      key={`${sh.ownerUid}-${sh.habitId}`}
                      className="rounded-lg bg-foreground/[0.03] px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-medium truncate">{sh.habitTitle}</span>
                        {isMyHabit && (
                          <button
                            onClick={() => onUnshareHabit(sh.habitId)}
                            className="text-muted-foreground/30 hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {/* My progress */}
                      {isMyHabit && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] text-muted-foreground/40 w-8 shrink-0">You</span>
                          <div className="flex gap-0.5">
                            {last7.map((d) => (
                              <div
                                key={d}
                                className={cn(
                                  'w-3 h-3 rounded-[3px]',
                                  myCompletions[d]
                                    ? 'bg-foreground/60'
                                    : 'bg-foreground/[0.06]',
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-muted-foreground/30 ml-auto">
                            {last7.filter((d) => myCompletions[d]).length}/7
                          </span>
                        </div>
                      )}
                      {/* Friend's progress */}
                      {!isMyHabit && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground/40 w-8 shrink-0 truncate">
                            {profile?.displayName?.split(' ')[0] || 'Them'}
                          </span>
                          <div className="flex gap-0.5">
                            {last7.map((d) => (
                              <div
                                key={d}
                                className={cn(
                                  'w-3 h-3 rounded-[3px]',
                                  theirCompletions[d]
                                    ? 'bg-foreground/60'
                                    : 'bg-foreground/[0.06]',
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-muted-foreground/30 ml-auto">
                            {last7.filter((d) => theirCompletions[d]).length}/7
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Linked Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">Linked Items</p>
              <button onClick={onLinkItem} className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
                <Plus className="h-3 w-3" /> Link
              </button>
            </div>
            {linkedItems.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30 py-2">Link events, projects, or notes.</p>
            ) : (
              <div className="space-y-1">
                {linkedItems.map((li) => {
                  const Icon = ITEM_TYPE_ICONS[li.itemType] || FileText;
                  const isMine = li.ownerUid === myUid;
                  return (
                    <div key={`${li.ownerUid}-${li.itemId}`} className="flex items-center gap-2.5 py-1.5 rounded-lg px-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      <span className="text-[12px] truncate flex-1">{li.itemTitle}</span>
                      {!isMine && <span className="text-[10px] text-muted-foreground/30">{profile?.displayName?.split(' ')[0]}</span>}
                      {isMine && (
                        <button onClick={() => onUnlinkItem(li.itemId)} className="text-muted-foreground/30 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-border/30 px-4 py-3 flex items-center gap-2">
          <button
            onClick={onNudge}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-foreground text-background py-2 text-[12px] font-medium hover:bg-foreground/90 transition-colors"
          >
            <Hand className="h-3.5 w-3.5" />
            Nudge
          </button>
          <button
            onClick={onShareHabit}
            className="flex items-center justify-center h-9 px-3 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors gap-1.5"
            title="Share a habit"
          >
            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Share</span>
          </button>
          <button
            onClick={onRemove}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-destructive/10 transition-colors"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground/40" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Friend Dialog ───────────────────────────────────

function AddFriendDialog({
  myCode,
  onAdd,
  onClose,
}: {
  myCode: string;
  onAdd: (code: string) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;
    setError('');
    setLoading(true);
    const result = await onAdd(code.trim());
    setLoading(false);
    if (result.success) {
      toast.success('Friend request sent');
      onClose();
    } else {
      setError(result.error || 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="relative w-full sm:w-[400px] bg-card border border-border/50 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="text-[13px] font-semibold">Add Friend</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-5 space-y-4">
          <div>
            <p className="text-[11px] text-muted-foreground/50 mb-1.5">Enter their friend code</p>
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError('');
              }}
              placeholder="XXXX-XXXX"
              maxLength={10}
              className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2.5 text-[15px] font-mono tracking-widest text-center outline-none focus:ring-1 focus:ring-foreground/20"
            />
            {error && <p className="text-[11px] text-destructive mt-1.5">{error}</p>}
          </div>

          <div className="rounded-lg bg-foreground/[0.02] px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground/40 mb-1">Your code</p>
            <p className="text-[13px] font-mono font-medium tracking-widest">{formatFriendCode(myCode)}</p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border/30 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-[12px]">
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-[12px]" disabled={code.replace(/[-\s]/g, '').length < 6 || loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send Request'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Share Habit Picker ──────────────────────────────────

function ShareHabitPicker({
  connectionId,
  existingHabitIds,
  myHabits,
  onShare,
  onClose,
}: {
  connectionId: string;
  existingHabitIds: string[];
  myHabits: { id: string; title: string }[];
  onShare: (connectionId: string, habitId: string, title: string) => void;
  onClose: () => void;
}) {
  const available = myHabits.filter((h) => !existingHabitIds.includes(h.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-[400px] bg-card border border-border/50 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="text-[13px] font-semibold">Share a Habit</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {available.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-muted-foreground/40">
              {myHabits.length === 0
                ? 'No habits yet. Create one first.'
                : 'All your habits are already shared.'}
            </p>
          ) : (
            <div className="py-1">
              {available.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    onShare(connectionId, h.id, h.title);
                    onClose();
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-foreground/[0.04] transition-colors flex items-center gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-foreground/20 shrink-0" />
                  <span className="text-[13px]">{h.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Link Item Picker ────────────────────────────────────

function LinkItemPicker({
  connectionId,
  existingItemIds,
  items,
  onLink,
  onClose,
}: {
  connectionId: string;
  existingItemIds: string[];
  items: { id: string; title: string; type: string }[];
  onLink: (connectionId: string, itemId: string, title: string, type: string) => void;
  onClose: () => void;
}) {
  const available = items.filter((i) => !existingItemIds.includes(i.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-[400px] bg-card border border-border/50 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="text-[13px] font-semibold">Link an Item</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {available.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-muted-foreground/40">
              {items.length === 0 ? 'No items to link.' : 'All items are already linked.'}
            </p>
          ) : (
            <div className="py-1">
              {available.map((item) => {
                const Icon = ITEM_TYPE_ICONS[item.type] || FileText;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onLink(connectionId, item.id, item.title, item.type);
                      onClose();
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-foreground/[0.04] transition-colors flex items-center gap-3"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    <span className="text-[13px] truncate">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground/30 ml-auto">{item.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function CirclesPage() {
  const { isDemo } = useAuth();
  const myProfile = useCirclesStore((s) => s.myProfile);
  const connections = useCirclesStore((s) => s.connections);
  const nudges = useCirclesStore((s) => s.nudges);
  const friendProfiles = useCirclesStore((s) => s.friendProfiles);
  const loading = useCirclesStore((s) => s.loading);
  const addFriend = useCirclesStore((s) => s.addFriend);
  const acceptRequest = useCirclesStore((s) => s.acceptRequest);
  const declineRequest = useCirclesStore((s) => s.declineRequest);
  const removeFriend = useCirclesStore((s) => s.removeFriend);
  const nudgeFriend = useCirclesStore((s) => s.nudgeFriend);
  const shareHabit = useCirclesStore((s) => s.shareHabit);
  const unshareHabit = useCirclesStore((s) => s.unshareHabit);
  const syncMyCompletions = useCirclesStore((s) => s.syncMyCompletions);
  const dismissNudge = useCirclesStore((s) => s.dismissNudge);
  const addNote = useCirclesStore((s) => s.addNote);
  const removeNote = useCirclesStore((s) => s.removeNote);
  const syncMyActivity = useCirclesStore((s) => s.syncMyActivity);
  const linkItem = useCirclesStore((s) => s.linkItem);
  const unlinkItem = useCirclesStore((s) => s.unlinkItem);

  const items = useOrbitStore((s) => s.items);

  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [shareForConnId, setShareForConnId] = useState<string | null>(null);
  const [linkForConnId, setLinkForConnId] = useState<string | null>(null);

  const pending = useMemo(() => connections.filter((c) => c.status === 'pending'), [connections]);
  const accepted = useMemo(() => connections.filter((c) => c.status === 'accepted'), [connections]);
  const selectedConn = selectedConnId ? connections.find((c) => c.id === selectedConnId) : null;

  const myHabits = useMemo(
    () => items.filter((i) => i.type === 'habit' && i.status === 'active').map((i) => ({ id: i.id, title: i.title })),
    [items],
  );

  const myItems = useMemo(
    () =>
      items
        .filter((i) => i.type === 'habit')
        .map((i) => ({ id: i.id, title: i.title, type: i.type, completions: i.completions })),
    [items],
  );

  const linkableItems = useMemo(
    () => items
      .filter((i) => ['event', 'project', 'note', 'goal'].includes(i.type) && i.status === 'active')
      .map((i) => ({ id: i.id, title: i.title, type: i.type })),
    [items],
  );

  const scoredFriends = useMemo(() => {
    if (!myProfile) return [];
    return accepted.map((conn) => {
      const friendUid = conn.users.find((u) => u !== myProfile.uid)!;
      return {
        connection: conn,
        profile: friendProfiles[friendUid],
        score: calculateInteractionScore(conn, myProfile.uid),
      };
    }).sort((a, b) => b.score - a.score);
  }, [accepted, friendProfiles, myProfile]);

  // Sync completions when habits change
  useEffect(() => {
    if (myProfile && accepted.length > 0) {
      syncMyCompletions(myItems);
    }
  }, [myProfile, accepted.length, myItems, syncMyCompletions]);

  // Sync activity feed once on page load
  const activitySyncedRef = useRef(false);
  useEffect(() => {
    if (!activitySyncedRef.current && myProfile && accepted.length > 0) {
      activitySyncedRef.current = true;
      syncMyActivity(items.map((i) => ({ type: i.type, title: i.title, status: i.status, completions: i.completions, completedAt: i.completedAt })));
    }
  }, [myProfile, accepted.length, items, syncMyActivity]);

  // Demo mode
  if (isDemo) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl mx-auto" data-slot="page-content">
        <h1 className="text-xl font-semibold tracking-tight">Circles</h1>
        <div className="mt-12 text-center">
          <UserPlus className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground/50">Sign in to connect with other Orbit users</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-5" data-slot="page-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Circles</h1>
          <p className="text-[13px] text-muted-foreground/50 mt-0.5">
            {accepted.length === 0
              ? 'Your people in orbit'
              : `${accepted.length} ${accepted.length === 1 ? 'friend' : 'friends'} in orbit`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1.5 text-[12px]">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Orbital Visualization */}
      {myProfile && (
        <OrbitMap
          friends={scoredFriends}
          myProfile={myProfile}
          selectedId={selectedConnId}
          onSelect={(id) => setSelectedConnId(selectedConnId === id ? null : id)}
        />
      )}

      {/* Friend Code */}
      {myProfile?.friendCode && <FriendCodeCard code={myProfile.friendCode} />}

      {/* Nudge Banner */}
      <NudgeBanner nudges={nudges} friendProfiles={friendProfiles} onDismiss={dismissNudge} />

      {/* Pending Requests */}
      {myProfile && (
        <PendingRequests
          pending={pending}
          myUid={myProfile.uid}
          friendProfiles={friendProfiles}
          onAccept={acceptRequest}
          onDecline={declineRequest}
        />
      )}

      {/* Empty state */}
      {!loading && accepted.length === 0 && pending.length === 0 && (
        <div className="text-center py-6">
          <UserPlus className="h-10 w-10 text-muted-foreground/15 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground/40">No friends yet</p>
          <p className="text-[11px] text-muted-foreground/25 mt-1">
            Share your code or add someone with theirs
          </p>
        </div>
      )}

      {loading && accepted.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
        </div>
      )}

      {/* Person Detail Panel */}
      {selectedConn && selectedConn.status === 'accepted' && myProfile && (
        <PersonDetail
          connection={selectedConn}
          myUid={myProfile.uid}
          profile={friendProfiles[selectedConn.users.find((u) => u !== myProfile.uid)!]}
          myItems={myItems}
          onClose={() => setSelectedConnId(null)}
          onNudge={() => {
            nudgeFriend(selectedConn.id);
            toast.success('Nudge sent');
          }}
          onShareHabit={() => setShareForConnId(selectedConn.id)}
          onUnshareHabit={(habitId) => unshareHabit(selectedConn.id, habitId)}
          onRemove={() => {
            if (confirm('Remove this friend from your orbit?')) {
              removeFriend(selectedConn.id);
              setSelectedConnId(null);
            }
          }}
          onAddNote={(note) => addNote(selectedConn.id, note)}
          onRemoveNote={(index) => removeNote(selectedConn.id, index)}
          onLinkItem={() => setLinkForConnId(selectedConn.id)}
          onUnlinkItem={(itemId) => unlinkItem(selectedConn.id, itemId)}
        />
      )}

      {/* Add Friend Dialog */}
      {showAddDialog && myProfile && (
        <AddFriendDialog
          myCode={myProfile.friendCode}
          onAdd={addFriend}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Share Habit Picker */}
      {shareForConnId && myProfile && (
        <ShareHabitPicker
          connectionId={shareForConnId}
          existingHabitIds={
            (connections.find((c) => c.id === shareForConnId)?.sharedHabits || [])
              .filter((h) => h.ownerUid === myProfile.uid)
              .map((h) => h.habitId)
          }
          myHabits={myHabits}
          onShare={shareHabit}
          onClose={() => setShareForConnId(null)}
        />
      )}

      {/* Link Item Picker */}
      {linkForConnId && myProfile && (
        <LinkItemPicker
          connectionId={linkForConnId}
          existingItemIds={
            (connections.find((c) => c.id === linkForConnId)?.linkedItems || [])
              .filter((l) => l.ownerUid === myProfile.uid)
              .map((l) => l.itemId)
          }
          items={linkableItems}
          onLink={linkItem}
          onClose={() => setLinkForConnId(null)}
        />
      )}
    </div>
  );
}
