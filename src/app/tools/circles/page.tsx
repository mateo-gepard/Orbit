'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format, differenceInDays, isPast, parseISO } from 'date-fns';
import {
  Plus,
  ArrowLeft,
  Phone,
  MessageCircle,
  Users as UsersIcon,
  Hand,
  Pencil,
  Trash2,
  X,
  Target,
  ChevronRight,
} from 'lucide-react';
import {
  useCirclesStore,
  computeGravity,
  getRecency,
  type CirclePerson,
  type CircleInteraction,
  type InteractionType,
} from '@/lib/circles-store';
import { useOrbitStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ═══════════════════════════════════════════════════════════
// Circles — Relationship Gravity Map
// ═══════════════════════════════════════════════════════════

const EMOJIS = ['👩', '👨', '👧', '👦', '👶', '👵', '👴', '🧑', '💃', '🕺', '🐱', '🐶', '❤️', '⭐', '🌙', '🌸'];

const INTERACTION_META: Record<InteractionType, { label: string; icon: typeof Phone }> = {
  nudge: { label: 'Nudged', icon: Hand },
  called: { label: 'Called', icon: Phone },
  texted: { label: 'Texted', icon: MessageCircle },
  met: { label: 'Met up', icon: UsersIcon },
  habit_done: { label: 'Habit', icon: Target },
  note: { label: 'Note', icon: Pencil },
};

// ─── Helpers ───────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function birthdayLabel(bday: string): string | null {
  const thisYear = new Date().getFullYear();
  const next = parseISO(`${thisYear}-${bday.slice(5)}`);
  if (isPast(next)) next.setFullYear(thisYear + 1);
  const days = differenceInDays(next, new Date());
  if (days === 0) return '🎂 Today!';
  if (days === 1) return '🎂 Tomorrow';
  if (days <= 14) return `🎂 in ${days} days`;
  return null;
}

function gravityLabel(score: number): string {
  if (score >= 15) return 'Very close';
  if (score >= 8) return 'Close';
  if (score >= 3) return 'Warm';
  if (score >= 1) return 'Distant';
  return 'Drifting';
}

// ─── Orbital Position Computation ──────────────────────────

const CX = 200;
const CY = 200;
const MIN_R = 45;
const MAX_R = 165;

interface PersonPosition {
  person: CirclePerson;
  x: number;
  y: number;
  score: number;
  recency: number;
}

function getPositions(
  people: CirclePerson[],
  interactions: CircleInteraction[],
  habitLinks: { habitId: string; personId: string }[],
): PersonPosition[] {
  if (people.length === 0) return [];

  const scores = people.map((p) => ({
    person: p,
    score: computeGravity(p.id, interactions, habitLinks),
    recency: getRecency(p.id, interactions),
  }));

  const maxScore = Math.max(...scores.map((s) => s.score), 1);

  return scores.map((s, i) => {
    const angle = (i / people.length) * 2 * Math.PI - Math.PI / 2;
    const normalized = s.score / maxScore;
    const r = MAX_R - normalized * (MAX_R - MIN_R);

    return {
      person: s.person,
      x: CX + r * Math.cos(angle),
      y: CY + r * Math.sin(angle),
      score: s.score,
      recency: s.recency,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// Orbital Map (SVG)
// ═══════════════════════════════════════════════════════════

function OrbitalMap({
  positions,
  habitLinks,
  onSelect,
  nudgingId,
}: {
  positions: PersonPosition[];
  habitLinks: { habitId: string; personId: string }[];
  onSelect: (id: string) => void;
  nudgingId: string | null;
}) {
  // Find the nudge target position for the ripple animation
  const nudgeTarget = nudgingId ? positions.find((p) => p.person.id === nudgingId) : null;

  return (
    <div className="relative w-full aspect-square max-w-[500px] mx-auto">
      <svg viewBox="0 0 400 400" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 40px rgba(255,255,255,0.02))' }}>
        <defs>
          <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <filter id="soft-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background glow */}
        <circle cx={CX} cy={CY} r="190" fill="url(#center-glow)" />

        {/* Guide rings */}
        {[60, 110, 160].map((r) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity={0.06}
            strokeDasharray="3 6"
          />
        ))}

        {/* Connection lines for shared habits */}
        {positions
          .filter((p) => habitLinks.some((l) => l.personId === p.person.id))
          .map((p) => (
            <line
              key={`line-${p.person.id}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="currentColor"
              strokeWidth="0.5"
              opacity={0.08}
              strokeDasharray="2 6"
            />
          ))}

        {/* People */}
        {positions.map((p) => {
          const isNudging = nudgingId === p.person.id;
          const glowOpacity = Math.max(0.04, p.recency * 0.15);
          const dotOpacity = 0.12 + p.recency * 0.25;

          return (
            <g
              key={p.person.id}
              onClick={() => onSelect(p.person.id)}
              className="cursor-pointer"
              style={{
                transition: 'transform 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
            >
              {/* Glow halo */}
              <circle cx={p.x} cy={p.y} r="20" fill="currentColor" opacity={glowOpacity} filter="url(#soft-glow)" />
              {/* Background dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r="14"
                fill="currentColor"
                opacity={dotOpacity}
                className={cn(isNudging && 'animate-pulse')}
              />
              {/* Emoji */}
              <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central" fontSize="13" className="select-none pointer-events-none">
                {p.person.emoji}
              </text>
              {/* Name */}
              <text x={p.x} y={p.y + 24} textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.4" className="pointer-events-none">
                {p.person.name}
              </text>
            </g>
          );
        })}

        {/* Center — You */}
        <circle cx={CX} cy={CY} r="16" fill="currentColor" opacity="0.1">
          <animate attributeName="opacity" values="0.1;0.16;0.1" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx={CX} cy={CY} r="12" fill="currentColor" opacity="0.06" />
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="central" fontSize="8" fill="currentColor" opacity="0.5" className="select-none">
          You
        </text>

        {/* Nudge ripple animation */}
        {nudgeTarget && (
          <>
            <circle cx={CX} cy={CY} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0">
              <animate attributeName="r" from="16" to={MAX_R} dur="0.7s" fill="freeze" />
              <animate attributeName="opacity" from="0.25" to="0" dur="0.7s" fill="freeze" />
            </circle>
            <circle cx={CX} cy={CY} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0">
              <animate attributeName="r" from="16" to={MAX_R} dur="0.7s" begin="0.15s" fill="freeze" />
              <animate attributeName="opacity" from="0.15" to="0" dur="0.7s" begin="0.15s" fill="freeze" />
            </circle>
          </>
        )}
      </svg>

      {/* Empty state */}
      {positions.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-8">
            <p className="text-[13px] text-muted-foreground/50">Add someone to your orbit</p>
            <p className="text-[11px] text-muted-foreground/30 mt-1">They&apos;ll appear here, drawn closer by your interactions</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Person Detail Panel
// ═══════════════════════════════════════════════════════════

function PersonPanel({
  person,
  interactions,
  sharedHabits,
  onClose,
  onNudge,
  onLog,
  onEdit,
  onDelete,
}: {
  person: CirclePerson;
  interactions: CircleInteraction[];
  sharedHabits: { id: string; title: string; completions: Record<string, boolean> }[];
  onClose: () => void;
  onNudge: () => void;
  onLog: (type: InteractionType) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const personInteractions = interactions
    .filter((i) => i.personId === person.id)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  const score = computeGravity(person.id, interactions, []);
  const bday = person.birthday ? birthdayLabel(person.birthday) : null;

  // Build last 7 days for habit dots
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return format(d, 'yyyy-MM-dd');
  });

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
          <span className="text-[13px] font-semibold">{person.name}</span>
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Profile */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-foreground/[0.06] text-3xl">
              {person.emoji}
            </div>
            <h2 className="text-[15px] font-semibold mt-2">{person.name}</h2>
            {bday && <p className="text-[12px] text-muted-foreground/60 mt-0.5">{bday}</p>}
            {person.birthday && !bday && (
              <p className="text-[11px] text-muted-foreground/40 mt-0.5">🎂 {format(parseISO(person.birthday), 'MMM d')}</p>
            )}
            <p className="text-[11px] text-muted-foreground/40 mt-1">{gravityLabel(score)}</p>
          </div>

          {/* Quick Notes */}
          {person.notes && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-1.5">Notes</p>
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed whitespace-pre-wrap">{person.notes}</p>
            </div>
          )}

          {/* Shared Habits */}
          {sharedHabits.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2">Shared Habits</p>
              <div className="space-y-2">
                {sharedHabits.map((habit) => (
                  <div key={habit.id} className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2">
                    <span className="text-[12px] font-medium truncate flex-1">{habit.title}</span>
                    <div className="flex gap-0.5 ml-2">
                      {last7Days.map((d) => (
                        <div
                          key={d}
                          className={cn(
                            'w-2.5 h-2.5 rounded-full',
                            habit.completions[d] ? 'bg-foreground/70' : 'bg-foreground/[0.08]'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2">Timeline</p>
            {personInteractions.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/30">No interactions yet</p>
            ) : (
              <div className="space-y-1.5">
                {personInteractions.map((i) => {
                  const meta = INTERACTION_META[i.type];
                  const Icon = meta.icon;
                  return (
                    <div key={i.id} className="flex items-center gap-2 text-[12px] text-muted-foreground/60">
                      <Icon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                      <span>{meta.label}{i.label ? ` — ${i.label}` : ''}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/30 shrink-0">{timeAgo(i.timestamp)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-t border-border/30 px-4 py-3 flex items-center gap-2">
          <button
            onClick={onNudge}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-foreground text-background py-2 text-[12px] font-medium hover:bg-foreground/90 transition-colors"
          >
            <Hand className="h-3.5 w-3.5" />
            Nudge
          </button>
          <button
            onClick={() => onLog('called')}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors"
            title="Called"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onLog('texted')}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors"
            title="Texted"
          >
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onLog('met')}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors"
            title="Met up"
          >
            <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-destructive/10 transition-colors"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-destructive" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Add / Edit Person Dialog
// ═══════════════════════════════════════════════════════════

function PersonDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: CirclePerson;
  onSave: (data: { name: string; emoji: string; notes: string; birthday?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [emoji, setEmoji] = useState(initial?.emoji || '🧑');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [birthday, setBirthday] = useState(initial?.birthday || '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji, notes, birthday: birthday || undefined });
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
          <span className="text-[13px] font-semibold">{initial ? 'Edit Person' : 'Add to Orbit'}</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Emoji picker */}
          <div>
            <p className="text-[11px] text-muted-foreground/50 mb-1.5">Avatar</p>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all',
                    emoji === e ? 'bg-foreground/[0.1] ring-1 ring-foreground/20 scale-110' : 'bg-foreground/[0.03] hover:bg-foreground/[0.07]'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <p className="text-[11px] text-muted-foreground/50 mb-1">Name</p>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who are they?"
              className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>

          {/* Birthday */}
          <div>
            <p className="text-[11px] text-muted-foreground/50 mb-1">Birthday</p>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>

          {/* Notes */}
          <div>
            <p className="text-[11px] text-muted-foreground/50 mb-1">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Things to remember..."
              className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20 resize-none"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border/30 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-[12px]">
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-[12px]" disabled={!name.trim()}>
            {initial ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// People List (below the map, quick-scan)
// ═══════════════════════════════════════════════════════════

function PeopleList({
  positions,
  interactions,
  onSelect,
}: {
  positions: PersonPosition[];
  interactions: CircleInteraction[];
  onSelect: (id: string) => void;
}) {
  if (positions.length === 0) return null;

  // Sort by gravity (closest first)
  const sorted = [...positions].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-0.5">
      {sorted.map((p) => {
        const lastInteraction = interactions
          .filter((i) => i.personId === p.person.id)
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        return (
          <button
            key={p.person.id}
            onClick={() => onSelect(p.person.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-foreground/[0.04] transition-colors text-left"
          >
            <span className="text-lg shrink-0">{p.person.emoji}</span>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium block truncate">{p.person.name}</span>
              <span className="text-[11px] text-muted-foreground/40 block truncate">
                {lastInteraction ? `${INTERACTION_META[lastInteraction.type].label} · ${timeAgo(lastInteraction.timestamp)}` : 'No interactions yet'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Gravity dots */}
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    i < Math.min(5, Math.ceil(p.score / 3))
                      ? 'bg-foreground/40'
                      : 'bg-foreground/[0.08]'
                  )}
                />
              ))}
              <ChevronRight className="h-3 w-3 text-muted-foreground/20 ml-1" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function CirclesPage() {
  const people = useCirclesStore((s) => s.people);
  const interactions = useCirclesStore((s) => s.interactions);
  const habitLinks = useCirclesStore((s) => s.habitLinks);
  const addPerson = useCirclesStore((s) => s.addPerson);
  const updatePerson = useCirclesStore((s) => s.updatePerson);
  const removePerson = useCirclesStore((s) => s.removePerson);
  const logInteraction = useCirclesStore((s) => s.logInteraction);
  const items = useOrbitStore((s) => s.items);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPerson, setEditingPerson] = useState<CirclePerson | null>(null);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positions = useMemo(() => getPositions(people, interactions, habitLinks), [people, interactions, habitLinks]);

  const selectedPerson = selectedId ? people.find((p) => p.id === selectedId) : null;

  // Get shared habits for selected person
  const sharedHabits = useMemo(() => {
    if (!selectedId) return [];
    const linkedHabitIds = habitLinks.filter((l) => l.personId === selectedId).map((l) => l.habitId);
    return items
      .filter((item) => linkedHabitIds.includes(item.id) && item.type === 'habit')
      .map((item) => ({
        id: item.id,
        title: item.title,
        completions: item.completions || {},
      }));
  }, [selectedId, habitLinks, items]);

  const handleNudge = useCallback((personId: string) => {
    logInteraction(personId, 'nudge');
    setNudgingId(personId);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudgingId(null), 900);
  }, [logInteraction]);

  const handleLog = useCallback((personId: string, type: InteractionType) => {
    logInteraction(personId, type);
  }, [logInteraction]);

  const handleAddPerson = useCallback((data: { name: string; emoji: string; notes: string; birthday?: string }) => {
    const id = addPerson(data.name, data.emoji);
    updatePerson(id, { notes: data.notes, birthday: data.birthday });
    setShowAdd(false);
  }, [addPerson, updatePerson]);

  const handleEditPerson = useCallback((data: { name: string; emoji: string; notes: string; birthday?: string }) => {
    if (!editingPerson) return;
    updatePerson(editingPerson.id, data);
    setEditingPerson(null);
  }, [editingPerson, updatePerson]);

  const handleDeletePerson = useCallback((id: string) => {
    if (confirm('Remove this person from your orbit?')) {
      removePerson(id);
      setSelectedId(null);
    }
  }, [removePerson]);

  // Upcoming birthdays
  const upcomingBirthdays = useMemo(() => {
    return people
      .filter((p) => p.birthday)
      .map((p) => ({ person: p, label: birthdayLabel(p.birthday!) }))
      .filter((b) => b.label !== null)
      .sort((a, b) => {
        const daysA = parseInt(a.label!.match(/\d+/)?.[0] || '0');
        const daysB = parseInt(b.label!.match(/\d+/)?.[0] || '0');
        return daysA - daysB;
      });
  }, [people]);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6" data-slot="page-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Circles</h1>
          <p className="text-[13px] text-muted-foreground/50 mt-0.5">
            {people.length === 0 ? 'Your personal orbit' : `${people.length} ${people.length === 1 ? 'person' : 'people'} in orbit`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 text-[12px]">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Birthday alerts */}
      {upcomingBirthdays.length > 0 && (
        <div className="space-y-1">
          {upcomingBirthdays.map((b) => (
            <button
              key={b.person.id}
              onClick={() => setSelectedId(b.person.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground/[0.03] hover:bg-foreground/[0.05] transition-colors text-left"
            >
              <span className="text-sm">{b.person.emoji}</span>
              <span className="text-[12px] text-muted-foreground/60">{b.person.name}</span>
              <span className="text-[11px] text-muted-foreground/40 ml-auto">{b.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Orbital Map */}
      <OrbitalMap positions={positions} habitLinks={habitLinks} onSelect={setSelectedId} nudgingId={nudgingId} />

      {/* People List */}
      {people.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 mb-2 px-1">People</p>
          <PeopleList positions={positions} interactions={interactions} onSelect={setSelectedId} />
        </div>
      )}

      {/* Person Detail Panel */}
      {selectedPerson && (
        <PersonPanel
          person={selectedPerson}
          interactions={interactions}
          sharedHabits={sharedHabits}
          onClose={() => setSelectedId(null)}
          onNudge={() => handleNudge(selectedPerson.id)}
          onLog={(type) => handleLog(selectedPerson.id, type)}
          onEdit={() => {
            setEditingPerson(selectedPerson);
            setSelectedId(null);
          }}
          onDelete={() => handleDeletePerson(selectedPerson.id)}
        />
      )}

      {/* Add Person Dialog */}
      {showAdd && <PersonDialog onSave={handleAddPerson} onClose={() => setShowAdd(false)} />}

      {/* Edit Person Dialog */}
      {editingPerson && <PersonDialog initial={editingPerson} onSave={handleEditPerson} onClose={() => setEditingPerson(null)} />}
    </div>
  );
}
