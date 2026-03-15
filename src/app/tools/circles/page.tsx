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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Circles â€” Your People in Orbit
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
    const act = activity[uid] || [];
    score += act.reduce((s: number, e: { tasksDone?: number; habitsDone?: number }) => s + (e.tasksDone || 0) + (e.habitsDone || 0), 0) * 0.5;
  }
  if (conn.since) {
    // conn.since may come back as a Firestore Timestamp; coerce to number safely
    const sinceMs = typeof conn.since === 'number' ? conn.since : (conn.since as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
    if (sinceMs > 0) score += Math.min((Date.now() - sinceMs) / 604800000, 20);
  }
  return isNaN(score) ? 0 : score;
}

const ITEM_TYPE_ICONS: Record<string, typeof CalendarDays> = {
  event: CalendarDays,
  project: FolderOpen,
  note: FileText,
  goal: Target,
  habit: Repeat,
  task: CheckSquare,
};

// â”€â”€â”€ Orbit Map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  // viewBox 300x300, center 150,150
  // safe bound: ring 112 + nodeR 18 + label 11 + anim 3 = 144 < 150 ✓
  const cx = 150;
  const cy = 150;
  const rings = [60, 90, 112];
  const maxOrbit = 112;
  const minOrbit = 60;
  // Use a fixed scale so a lone friend with few interactions stays far out.
  // ~30 pts = inner ring (shared habits + regular completions).
  const SCORE_SCALE = 30;

  // Per-node float keyframes (SVG units, small deltas so we stay in bounds)
  const FLOAT_KEYFRAMES = [
    '0,0; 3,-2; -2,-3; -3,2; 2,3; 0,0',
    '0,0; -3,3; 2,-3; 3,-2; -2,3; 0,0',
    '0,0; 2,3; -3,2; -2,-3; 3,-2; 0,0',
    '0,0; -2,-3; 3,2; -3,3; 2,-2; 0,0',
  ];

  const nodes = useMemo(() => {
    const count = friends.length;
    return friends.map((f, i) => {
      const norm = Math.min(f.score / SCORE_SCALE, 1);
      const ringRadius = maxOrbit - norm * (maxOrbit - minOrbit);
      const baseAngle = count === 1
        ? -Math.PI / 2
        : (2 * Math.PI * i) / count - Math.PI / 2;
      const nodeR = 16 + norm * 5;
      const color = ORBIT_COLORS[i % ORBIT_COLORS.length];
      const nx = cx + ringRadius * Math.cos(baseAngle);
      const ny = cy + ringRadius * Math.sin(baseAngle);
      const floatDur = 9 + i * 4;
      const floatKf = FLOAT_KEYFRAMES[i % FLOAT_KEYFRAMES.length];
      return { ...f, nx, ny, nodeR, color, floatDur, floatKf };
    });
  }, [friends, maxScore]);

  return (
    <div className="relative w-full max-w-[340px] mx-auto">
      <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label="Orbit map">
        <defs>
          <radialGradient id="orbit-field" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.04} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </radialGradient>
          <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={140} fill="url(#orbit-field)" />

        {rings.map((r, ri) => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="currentColor"
            strokeWidth={ri === 0 ? 1.5 : 1}
            opacity={ri === 0 ? 0.12 : ri === 1 ? 0.08 : 0.05} />
        ))}

        {nodes.map((n) => {
          if (n.connection.id !== selectedId) return null;
          const ringR = Math.round(Math.sqrt((n.nx - cx) ** 2 + (n.ny - cy) ** 2));
          return (
            <circle key={`hl-${n.connection.id}`} cx={cx} cy={cy} r={ringR}
              fill="none" stroke={n.color} strokeWidth={1.5} opacity={0.25} strokeDasharray="5 3" />
          );
        })}

        <circle cx={cx} cy={cy} r={20} fill="currentColor" opacity={0.06}>
          <animate attributeName="r" values="20;23;20" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.06;0.1;0.06" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={16} fill="currentColor" opacity={0.09} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
          fontSize={9} fontWeight={700} fill="currentColor" opacity={0.5}>
          You
        </text>

        {nodes.map((n) => {
          const isSelected = n.connection.id === selectedId;
          const name = n.profile?.displayName || '?';
          const firstName = name.split(' ')[0];
          return (
            <g key={n.connection.id}
              transform={`translate(${n.nx},${n.ny})`}
              onClick={() => onSelect(n.connection.id)}
              className="cursor-pointer" role="button" tabIndex={0}>
              {/* SVG-native float — additive="sum" adds tiny offsets to the base translate,
                  stays entirely within SVG coordinate space, can never escape the viewBox */}
              <animateTransform attributeName="transform" type="translate"
                values={n.floatKf} dur={`${n.floatDur}s`}
                repeatCount="indefinite" additive="sum" />
              <circle cx={0} cy={0} r={n.nodeR + 10} fill="transparent" />
              {isSelected && (
                <circle cx={0} cy={0} r={n.nodeR + 5} fill={n.color} opacity={0.15} filter="url(#node-glow)" />
              )}
              {isSelected && (
                <circle cx={0} cy={0} r={n.nodeR + 3} fill="none" stroke={n.color} strokeWidth={1.5} opacity={0.4} />
              )}
              {isSelected && (
                <circle cx={0} cy={0} r={n.nodeR} fill="none" stroke={n.color} strokeWidth={1} opacity={0.3}>
                  <animate attributeName="r" values={`${n.nodeR};${n.nodeR + 4};${n.nodeR}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={0} cy={0} r={n.nodeR} fill={n.color} opacity={isSelected ? 0.22 : 0.12} />
              <circle cx={0} cy={0} r={n.nodeR} fill="none" stroke={n.color} strokeWidth={1} opacity={isSelected ? 0.45 : 0.22} />
              <text x={0} y={1} textAnchor="middle" dominantBaseline="central"
                fontSize={n.nodeR * 0.65} fontWeight={700} fill="currentColor"
                opacity={isSelected ? 0.8 : 0.55} className="pointer-events-none select-none">
                {name.charAt(0).toUpperCase()}
              </text>
              <text x={0} y={n.nodeR + 11} textAnchor="middle" fontSize={9} fontWeight={500}
                fill="currentColor" opacity={isSelected ? 0.55 : 0.32} className="pointer-events-none select-none">
                {firstName.length > 9 ? firstName.slice(0, 8) + '\u2026' : firstName}
              </text>
            </g>
          );
        })}
      </svg>
      {friends.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[12px] text-muted-foreground/30">Share your code to grow your orbit</p>
        </div>
      )}
    </div>
  );
}
// --- Friend Code Card ---

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

// â”€â”€â”€ Nudge Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Pending Requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                  {profile?.displayName || 'Orbit User'} â€” pending
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

// â”€â”€â”€ Person Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[440px] bg-card border border-border/50 shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        style={{ maxHeight: 'min(85vh, calc(100dvh - 32px))' }}
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-5">
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

          {/* Their Activity â€” compact summary */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2">
              {profile?.displayName?.split(' ')[0]}&apos;s Activity
            </p>
            {friendActivity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30 py-2">No recent activity yet. Nudge them!</p>
            ) : (() => {
              const totalTasks = friendActivity.reduce((s, a) => s + a.tasksDone, 0);
              const totalHabits = friendActivity.reduce((s, a) => s + a.habitsDone, 0);
              const todayStr = new Date().toISOString().slice(0, 10);
              const todayEntry = friendActivity.find((a) => a.date === todayStr);
              const todayTasks = todayEntry?.tasksDone || 0;
              const todayHabits = todayEntry?.habitsDone || 0;
              const todayTotal = todayTasks + todayHabits;
              const weekTotal = totalTasks + totalHabits;
              return (
                <div className="rounded-lg bg-foreground/[0.03] px-3 py-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[20px] font-semibold tabular-nums">{todayTotal}</span>
                    <span className="text-[11px] text-muted-foreground/40">today</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                    {todayTasks > 0 && `${todayTasks} task${todayTasks > 1 ? 's' : ''}`}
                    {todayTasks > 0 && todayHabits > 0 && ', '}
                    {todayHabits > 0 && `${todayHabits} habit${todayHabits > 1 ? 's' : ''}`}
                    {todayTotal === 0 && 'Nothing yet'}
                    {todayTotal > 0 && ' done'}
                  </p>
                  <div className="mt-2 pt-2 border-t border-border/20 flex items-baseline justify-between">
                    <span className="text-[11px] text-muted-foreground/40">{weekTotal} done this week</span>
                  </div>
                </div>
              );
            })()}
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

// â”€â”€â”€ Add Friend Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
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

// â”€â”€â”€ Share Habit Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
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

// â”€â”€â”€ Link Item Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Main Page
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
      syncMyActivity(items.map((i) => ({ type: i.type, status: i.status, completions: i.completions, completedAt: i.completedAt })));
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


