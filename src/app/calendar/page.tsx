'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  X,
  Clock,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import { getLocale, getWeekStartsOn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';
import { useTranslation } from '@/lib/i18n';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  isYesterday,
  isTomorrow,
  differenceInDays,
  parseISO,
  isValid,
  getISOWeek,
} from 'date-fns';
import type { Locale } from 'date-fns';
import {
  hasCalendarPermission,
} from '@/lib/google-calendar';
import {
  flushPendingGoogleCalendarEvents,
  getLastSyncTime,
  syncGoogleCalendar,
} from '@/lib/google-calendar-sync';
import { createItem } from '@/lib/firestore';
import { isMobile } from '@/lib/mobile';
import type { OrbitItem } from '@/lib/types';
import { eventOccursOnDate } from '@/lib/dashboard';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// ═══════════════════════════════════════════════════════════
// Types & Constants
// ═══════════════════════════════════════════════════════════

type ViewMode = 'month' | 'week' | 'day';

interface CalendarEvent {
  item: OrbitItem;
  startMinute: number;
  endMinute: number;
  isAllDay: boolean;
}

interface LayoutSlot {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 64;
const MIN_EVENT_HEIGHT = 24;
const TIME_GUTTER_WIDTH = 52;

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatHour(hour: number, is24h: boolean): string {
  if (is24h) return `${hour.toString().padStart(2, '0')}:00`;
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatTimeShort(minutes: number, is24h: boolean): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (is24h) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function layoutEvents(events: CalendarEvent[]): LayoutSlot[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  const slots: LayoutSlot[] = [];
  const columns: { end: number }[] = [];

  for (const event of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      if (event.startMinute >= columns[c].end) {
        columns[c].end = event.endMinute;
        slots.push({ event, column: c, totalColumns: 0 });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push({ end: event.endMinute });
      slots.push({ event, column: columns.length - 1, totalColumns: 0 });
    }
  }

  for (let i = 0; i < slots.length; i++) {
    const overlapping = slots.filter(
      (s) => s.event.startMinute < slots[i].event.endMinute && s.event.endMinute > slots[i].event.startMinute
    );
    const maxCol = Math.max(...overlapping.map((s) => s.column)) + 1;
    for (const s of overlapping) {
      s.totalColumns = Math.max(s.totalColumns, maxCol);
    }
  }
  return slots;
}

function getMonthMultiDayLayout(
  events: { item: OrbitItem; startDate: Date; endDate: Date; daysSpan: number }[],
  calendarDays: Date[],
  totalRows: number
) {
  const result: { item: OrbitItem; row: number; col: number; span: number; lane: number; isStart: boolean; isEnd: boolean }[] = [];
  const rowLanes: Map<number, number[][]> = new Map();

  for (let r = 0; r < totalRows; r++) {
    rowLanes.set(r, Array.from({ length: 7 }, () => []));
  }

  const sorted = [...events]
    .filter((e) => e.daysSpan > 1)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || b.daysSpan - a.daysSpan);

  for (const ev of sorted) {
    const startIdx = calendarDays.findIndex((d) => isSameDay(d, ev.startDate));
    if (startIdx === -1) continue;

    let remaining = ev.daysSpan;
    let currentRow = Math.floor(startIdx / 7);
    let currentCol = startIdx % 7;
    let isFirst = true;

    while (remaining > 0 && currentRow < totalRows) {
      const spanInRow = Math.min(remaining, 7 - currentCol);
      const lanes = rowLanes.get(currentRow)!;

      let lane = 0;
      let found = false;
      while (!found) {
        found = true;
        for (let d = currentCol; d < currentCol + spanInRow; d++) {
          if (lanes[d].includes(lane)) { found = false; lane++; break; }
        }
      }
      for (let d = currentCol; d < currentCol + spanInRow; d++) {
        lanes[d].push(lane);
      }

      result.push({ item: ev.item, row: currentRow, col: currentCol, span: spanInRow, lane, isStart: isFirst, isEnd: remaining - spanInRow <= 0 });
      remaining -= spanInRow;
      currentRow++;
      currentCol = 0;
      isFirst = false;
    }
  }
  return result;
}

function getEventColor(item: OrbitItem): { bg: string; text: string; border: string; accent: string; dot: string } {
  if (item.type === 'task') return { bg: 'bg-amber-500/10 dark:bg-amber-400/10', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-400/25', accent: 'bg-amber-500', dot: 'bg-amber-400' };
  if (item.calendarSynced) return { bg: 'bg-emerald-500/10 dark:bg-emerald-400/10', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-400/25', accent: 'bg-emerald-500', dot: 'bg-emerald-400' };
  if (item.endDate && item.endDate !== item.startDate) return { bg: 'bg-violet-500/10 dark:bg-violet-400/10', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-400/25', accent: 'bg-violet-500', dot: 'bg-violet-400' };
  return { bg: 'bg-blue-500/10 dark:bg-blue-400/10', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400/25', accent: 'bg-blue-500', dot: 'bg-blue-400' };
}

function getRelativeDayLabel(date: Date, locale?: Locale): string | null {
  const german = locale?.code?.startsWith('de');
  if (isToday(date)) return german ? 'Heute' : 'Today';
  if (isYesterday(date)) return german ? 'Gestern' : 'Yesterday';
  if (isTomorrow(date)) return german ? 'Morgen' : 'Tomorrow';
  return null;
}

function calendarCopy(german: boolean, english: string, deutsch: string): string {
  return german ? deutsch : english;
}

// ═══════════════════════════════════════════════════════════
// Quick-Add Modal
// ═══════════════════════════════════════════════════════════

function QuickAddModal({ date, time, onClose, userId, locale: loc }: { date: Date; time?: string; onClose: () => void; userId: string; locale: Locale }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'event' | 'task'>('event');
  const settings = useSettingsStore((state) => state.settings);
  const defaultDuration = settings.calendar.defaultEventDuration;
  const german = settings.language === 'de';
  const [startTime, setStartTime] = useState(time || '09:00');
  const [endTime, setEndTime] = useState(() => {
    const base = time || '09:00';
    const [h, m] = base.split(':').map(Number);
    const totalMin = Math.min((h || 0) * 60 + (m || 0) + (defaultDuration || 60), 1439);
    const endH = Math.floor(totalMin / 60);
    const endM = totalMin % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (type === 'event' && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setError(german ? 'Die Endzeit muss nach der Startzeit liegen.' : 'End time must be after start time.');
      return;
    }
    setSaving(true);
    setError(null);
    const dateStr = format(date, 'yyyy-MM-dd');
    const now = Date.now();
    try {
      if (type === 'event') {
        const newEvent: Omit<OrbitItem, 'id'> = {
          type: 'event',
          title: trimmed,
          status: 'active',
          startDate: dateStr,
          startTime,
          endTime,
          userId,
          createdAt: now,
          updatedAt: now,
          tags: [],
          linkedIds: [],
          ...(settings.calendar.googleCalendarSync && { calendarSynced: false }),
        };
        const itemId = await createItem(newEvent);
        // Quick Add is local-first. The false marker is a durable outbound
        // queue entry, so a Google failure never turns into a failed local
        // creation or a duplicate retry.
        if (settings.calendar.googleCalendarSync) {
          void flushPendingGoogleCalendarEvents(userId, [
            { ...newEvent, id: itemId } as OrbitItem,
          ]).then((result) => {
            if (!result.success) {
              toast.warning(german
                ? 'Termin lokal gespeichert. Die Google-Synchronisierung wird erneut versucht.'
                : 'Event saved locally. Google Calendar sync will retry.');
            }
          });
        }
      } else {
        await createItem({ type: 'task', title: trimmed, status: 'active', dueDate: dateStr, userId, createdAt: now, updatedAt: now, tags: [], linkedIds: [] });
      }
      onClose();
    } catch {
      setError(german
        ? `${type === 'event' ? 'Der Termin' : 'Die Aufgabe'} konnte nicht erstellt werden.`
        : `Could not create this ${type}.`);
    } finally {
      setSaving(false);
    }
  };

  const relLabel = getRelativeDayLabel(date, loc);

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !saving) onClose();
    }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
        className="bottom-0 top-auto max-w-none translate-y-0 gap-0 rounded-b-none rounded-t-3xl p-0 sm:bottom-auto sm:top-1/2 sm:max-w-[420px] sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogTitle id="calendar-quick-add-title" className="sr-only">
          {german ? 'Kalendereintrag erstellen' : 'Create calendar item'}
        </DialogTitle>
        <form onSubmit={handleSubmit} className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              {relLabel || format(date, 'EEEE', { locale: loc })}
            </p>
            <p className="text-[16px] font-semibold mt-0.5">{format(date, 'PPP', { locale: loc })}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={german ? 'Dialog schließen' : 'Close create dialog'} className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-muted/60 disabled:opacity-40 sm:h-8 sm:w-8">
            <X className="h-4 w-4 text-muted-foreground/50" />
          </button>
        </div>

        <input
          aria-label={type === 'event'
            ? (german ? 'Termintitel' : 'Event title')
            : (german ? 'Aufgabentitel' : 'Task title')}
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === 'event' ? t('calendar.untitledEvent') : (german ? 'Aufgabentitel…' : 'Task title…')}
          className="w-full bg-muted/30 rounded-xl px-4 py-3 text-[15px] font-medium placeholder:text-muted-foreground/30 outline-none border border-border/30 focus:border-foreground/15 transition-colors mb-4"
        />

        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setType('event')} aria-pressed={type === 'event'} className={cn(
            'flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all border-2',
            type === 'event' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25' : 'text-muted-foreground/40 border-transparent bg-muted/30 hover:bg-muted/50'
          )}>
            <CalendarDays className="h-3.5 w-3.5 mx-auto mb-1 opacity-70" />
            {t('type.event')}
          </button>
          <button type="button" onClick={() => setType('task')} aria-pressed={type === 'task'} className={cn(
            'flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all border-2',
            type === 'task' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' : 'text-muted-foreground/40 border-transparent bg-muted/30 hover:bg-muted/50'
          )}>
            <MapPin className="h-3.5 w-3.5 mx-auto mb-1 opacity-70" />
            {t('type.task')}
          </button>
        </div>

        {type === 'event' && (
          <div className="flex items-center gap-3 mb-5 bg-muted/20 rounded-xl px-4 py-3 border border-border/20">
            <Clock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <input aria-label={german ? 'Startzeit' : 'Start time'} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-transparent text-[13px] font-medium outline-none tabular-nums w-[70px]" />
            <ArrowRight className="h-3 w-3 text-muted-foreground/25 shrink-0" />
            <input aria-label={german ? 'Endzeit' : 'End time'} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-transparent text-[13px] font-medium outline-none tabular-nums w-[70px]" />
          </div>
        )}

        {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!title.trim() || saving}
          className={cn(
            'w-full rounded-xl py-3 text-[13px] font-bold tracking-wide transition-all uppercase',
            title.trim() && !saving
              ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
              : 'bg-muted/60 text-muted-foreground/25 cursor-not-allowed'
          )}
        >
          {saving ? (german ? 'Wird erstellt…' : 'Creating…') : t('common.create')}
        </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// Time Grid (Week & Day views)
// ═══════════════════════════════════════════════════════════

function AllDayOverflow({
  events,
  date,
  locale: loc,
  onEventClick,
}: {
  events: CalendarEvent[];
  date: Date;
  locale: Locale;
  onEventClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const german = loc.code.startsWith('de');
  const dateLabel = format(date, 'PPP', { locale: loc });
  const overflowLabel = calendarCopy(
    german,
    `${events.length} more all-day items on ${dateLabel}`,
    `${events.length} weitere ganztägige Einträge am ${dateLabel}`,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={overflowLabel}
          className="flex min-h-8 w-full items-center rounded-lg px-2 text-left text-[10px] font-semibold text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
        >
          +{events.length} {german ? 'weitere' : 'more'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={overflowLabel}
        className="w-[min(18rem,calc(100vw-1.5rem))] space-y-1 p-2"
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {german ? `Ganztägig · ${dateLabel}` : `All day · ${dateLabel}`}
        </p>
        {events.map((event) => {
          const color = getEventColor(event.item);
          return (
            <button
              key={event.item.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onEventClick(event.item.id);
              }}
              className={cn(
                'min-h-10 w-full truncate rounded-lg px-2.5 text-left text-[11px] font-semibold transition-all hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/25',
                color.bg,
                color.text,
              )}
              title={event.item.title}
            >
              {event.item.title}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function TimeGrid({
  days, items, is24h, locale: loc, onEventClick, onSlotClick, showWeekNumbers,
}: {
  days: Date[]; items: OrbitItem[]; is24h: boolean; locale: Locale; onEventClick: (id: string) => void; onSlotClick: (date: Date, time?: string) => void; showWeekNumbers: boolean;
}) {
  const german = loc.code.startsWith('de');
  const gridRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [hoveredSlot, setHoveredSlot] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  useEffect(() => {
    const target = Math.max(0, 7 * HOUR_HEIGHT - 40);
    gridRef.current?.scrollTo({ top: target, behavior: 'smooth' });
  }, []);
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(i); }, []);

  const { allDayEvents, timedLayouts } = useMemo(() => {
    const allDay: Map<number, CalendarEvent[]> = new Map();
    const timed: Map<number, CalendarEvent[]> = new Map();
    days.forEach((_, i) => { allDay.set(i, []); timed.set(i, []); });

    const seen = new Set<string>();

    items.filter((i) => i.status !== 'archived').forEach((item) => {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const dateStr = format(days[dayIdx], 'yyyy-MM-dd');

        if (item.type === 'event') {
          // Repeating events are one item plus a rule, so membership of a day
          // is a question for `eventOccursOnDate`, not a date comparison.
          if (!eventOccursOnDate(item, dateStr)) continue;

          const isMultiDay = item.endDate && item.endDate !== item.startDate;
          const isAllDay = !item.startTime || !!isMultiDay;
          if (isAllDay) {
            // A multi-day event is drawn once as a bar; a repeating one has to
            // land on each day it recurs on.
            const key = item.recurrence ? `allday-${item.id}-${dateStr}` : `allday-${item.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              allDay.get(dayIdx)!.push({ item, startMinute: 0, endMinute: 1440, isAllDay: true });
            }
          } else {
            const startMin = timeToMinutes(item.startTime!);
            const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + 60;
            timed.get(dayIdx)!.push({ item, startMinute: startMin, endMinute: Math.max(endMin, startMin + 15), isAllDay: false });
          }
        } else if (item.type === 'task' && item.dueDate === dateStr) {
          const key = `task-${item.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            allDay.get(dayIdx)!.push({ item, startMinute: 0, endMinute: 30, isAllDay: true });
          }
        }
      }
    });

    const layouts = new Map<number, LayoutSlot[]>();
    for (const [dayIdx, events] of timed.entries()) {
      layouts.set(dayIdx, layoutEvents(events));
    }
    return { allDayEvents: allDay, timedLayouts: layouts };
  }, [items, days]);

  const hasAllDay = useMemo(() => {
    for (const evts of allDayEvents.values()) {
      if (evts.length > 0) return true;
    }
    return false;
  }, [allDayEvents]);

  const isSingleDay = days.length === 1;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-card overflow-hidden border border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Day headers */}
      {!isSingleDay && (
        <div className="flex border-b border-border/30 flex-shrink-0">
          <div className="shrink-0" style={{ width: TIME_GUTTER_WIDTH }}>
            {showWeekNumbers && days.length >= 7 && (
              <div className="flex items-center justify-center h-full text-[9px] text-muted-foreground/25 font-semibold tabular-nums">
                {german ? 'KW' : 'W'}{getISOWeek(days[0])}
              </div>
            )}
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day, i) => {
              const today = isToday(day);
              const relLabel = getRelativeDayLabel(day, loc);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSlotClick(day)}
                  aria-label={calendarCopy(
                    german,
                    `Create an item on ${format(day, 'PPP', { locale: loc })}`,
                    `Eintrag am ${format(day, 'PPP', { locale: loc })} erstellen`,
                  )}
                  className={cn(
                    'text-center py-3 lg:py-3.5 transition-colors outline-none hover:bg-foreground/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30',
                    i > 0 && 'border-l border-border/15',
                    today && 'bg-blue-500/[0.03]'
                  )}
                >
                  <div className="text-[10px] text-muted-foreground/40 uppercase font-semibold tracking-wider">
                    {relLabel || format(day, 'EEE', { locale: loc })}
                  </div>
                  <div className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold mt-1 tabular-nums transition-all',
                    today ? 'bg-foreground text-background' : 'text-foreground/80'
                  )}>
                    {format(day, 'd')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Single day header */}
      {isSingleDay && (
        <button
          type="button"
          onClick={() => onSlotClick(days[0])}
          aria-label={calendarCopy(
            german,
            `Create an item on ${format(days[0], 'PPP', { locale: loc })}`,
            `Eintrag am ${format(days[0], 'PPP', { locale: loc })} erstellen`,
          )}
          className="flex flex-shrink-0 items-center gap-4 border-b border-border/30 px-5 py-4 text-left outline-none transition-colors hover:bg-foreground/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
        >
          <div className={cn(
            'inline-flex h-12 w-12 items-center justify-center rounded-2xl text-[20px] font-black tabular-nums transition-all',
            isToday(days[0]) ? 'bg-foreground text-background' : 'bg-muted/50 text-foreground'
          )}>
            {format(days[0], 'd')}
          </div>
          <div>
            <div className="text-[14px] font-semibold leading-tight">
              {getRelativeDayLabel(days[0], loc) || format(days[0], 'EEEE', { locale: loc })}
            </div>
            <div className="text-[12px] text-muted-foreground/40 mt-0.5">{format(days[0], 'MMMM yyyy', { locale: loc })}</div>
          </div>
        </button>
      )}

      {/* All-day section */}
      {hasAllDay && (
        <div className="border-b border-border/25 flex-shrink-0">
          <div className="flex">
            <div className="shrink-0 flex items-center justify-center text-[9px] text-muted-foreground/30 uppercase font-bold tracking-wider" style={{ width: TIME_GUTTER_WIDTH }}>
              {german ? 'Ganztägig' : 'All day'}
            </div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
              {days.map((day, dayIdx) => {
                const evts = allDayEvents.get(dayIdx) || [];
                const dateStr = format(day, 'yyyy-MM-dd');
                const extraEvts: CalendarEvent[] = [];
                for (const [otherIdx, otherEvts] of allDayEvents.entries()) {
                  if (otherIdx === dayIdx) continue;
                  for (const e of otherEvts) {
                    if (e.item.type === 'event' && e.item.startDate && e.item.endDate && e.item.startDate <= dateStr && dateStr <= e.item.endDate) {
                      if (!evts.some(x => x.item.id === e.item.id)) extraEvts.push(e);
                    }
                  }
                }
                const allEvts = [...evts, ...extraEvts];
                return (
                  <div key={dayIdx} className={cn('px-1 py-1.5 min-h-[32px]', dayIdx > 0 && 'border-l border-border/10')}>
                    {allEvts.slice(0, 3).map((e) => {
                      const color = getEventColor(e.item);
                      return (
                        <button key={e.item.id} type="button" onClick={() => onEventClick(e.item.id)} className={cn(
                          'w-full truncate rounded-lg px-2 py-0.5 text-[10px] font-semibold mb-0.5 text-left transition-all',
                          color.bg, color.text, 'hover:brightness-95 active:scale-[0.98]'
                        )} title={e.item.title}>
                          {e.item.title}
                        </button>
                      );
                    })}
                    {allEvts.length > 3 && (
                      <AllDayOverflow
                        events={allEvts.slice(3)}
                        date={day}
                        locale={loc}
                        onEventClick={onEventClick}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Time grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-thin">
        <div className="flex relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Time gutter */}
          <div className="shrink-0 relative" style={{ width: TIME_GUTTER_WIDTH }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute right-3 -translate-y-1/2 text-[10px] text-muted-foreground/30 tabular-nums select-none font-medium" style={{ top: h * HOUR_HEIGHT }}>
                {h > 0 && formatHour(h, is24h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day, dayIdx) => {
              const today = isToday(day);
              return (
                <div key={dayIdx} className={cn('relative', dayIdx > 0 && 'border-l border-border/10', today && 'bg-blue-500/[0.015]')}>
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <React.Fragment key={h}>
                      <div className="absolute inset-x-0 border-t border-border/[0.12]" style={{ top: h * HOUR_HEIGHT }} />
                      <div className="absolute inset-x-0 border-t border-border/[0.05]" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                    </React.Fragment>
                  ))}

                  {/* Pointer surface; the day header provides the concise keyboard creation path. */}
                  {hoveredSlot?.dayIndex === dayIdx && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bg-blue-500/[0.04] transition-colors"
                      style={{ top: hoveredSlot.slotIndex * HOUR_HEIGHT / 2, height: HOUR_HEIGHT / 2 }}
                    />
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="absolute inset-0"
                    onPointerMove={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const slotIndex = Math.max(0, Math.min(47, Math.floor((event.clientY - bounds.top) / (HOUR_HEIGHT / 2))));
                      setHoveredSlot((current) => current?.dayIndex === dayIdx && current.slotIndex === slotIndex
                        ? current
                        : { dayIndex: dayIdx, slotIndex });
                    }}
                    onPointerLeave={() => setHoveredSlot((current) => current?.dayIndex === dayIdx ? null : current)}
                    onClick={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const slotIndex = Math.max(0, Math.min(47, Math.floor((event.clientY - bounds.top) / (HOUR_HEIGHT / 2))));
                      const minutes = slotIndex * 30;
                      onSlotClick(day, `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`);
                    }}
                  />

                  {/* Timed events */}
                  {(timedLayouts.get(dayIdx) || []).map((slot) => {
                    const { event, column, totalColumns } = slot;
                    const top = (event.startMinute / 60) * HOUR_HEIGHT;
                    const height = Math.max(((event.endMinute - event.startMinute) / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
                    const color = getEventColor(event.item);
                    const colWidth = 100 / totalColumns;
                    const left = column * colWidth;
                    const isSmall = height < 38;

                    return (
                      <button
                        type="button"
                        key={`${event.item.id}-${dayIdx}`}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event.item.id); }}
                        aria-label={calendarCopy(
                          german,
                          `Open ${event.item.title}, ${formatTimeShort(event.startMinute, is24h)} to ${formatTimeShort(event.endMinute, is24h)}`,
                          `${event.item.title} öffnen, ${formatTimeShort(event.startMinute, is24h)} bis ${formatTimeShort(event.endMinute, is24h)}`,
                        )}
                        className={cn(
                          'absolute rounded-lg overflow-hidden text-left transition-all z-10 group',
                          'border-l-[3px] hover:shadow-lg hover:z-20 hover:brightness-[0.97] active:scale-[0.99]',
                          color.bg, color.border
                        )}
                        style={{ top: top + 1, height: height - 2, left: `calc(${left}% + 3px)`, width: `calc(${colWidth}% - 6px)`, borderLeftColor: `var(--event-accent)` }}
                      >
                        <style>{`button:has(.event-${event.item.id}) { --event-accent: ${event.item.type === 'task' ? '#f59e0b' : event.item.calendarSynced ? '#10b981' : event.item.endDate && event.item.endDate !== event.item.startDate ? '#8b5cf6' : '#3b82f6'}; }`}</style>
                        <div className={cn('h-full px-2', color.text)}>
                          {isSmall ? (
                            <div className="flex items-center gap-1.5 h-full">
                              <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', color.dot)} />
                              <span className="truncate text-[10px] font-semibold">{event.item.title}</span>
                            </div>
                          ) : (
                            <div className="py-1.5">
                              <div className="text-[11px] font-bold leading-snug line-clamp-2">{event.item.title}</div>
                              <div className="text-[9px] opacity-50 mt-1 font-medium tabular-nums">
                                {formatTimeShort(event.startMinute, is24h)} – {formatTimeShort(event.endMinute, is24h)}
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Now indicator */}
                  {today && (
                    <div className="absolute inset-x-0 z-30 pointer-events-none" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}>
                      <div className="relative flex items-center">
                        <div className="h-3 w-3 rounded-full bg-red-500 -ml-1.5 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                        <div className="flex-1 h-[2px] bg-gradient-to-r from-red-500 to-red-500/0" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Calendar Page
// ═══════════════════════════════════════════════════════════

export default function CalendarPage() {
  const { user } = useAuth();
  const items = useOrbitStore((state) => state.items);
  const setSelectedItemId = useOrbitStore((state) => state.setSelectedItemId);
  const settings = useSettingsStore((state) => state.settings);
  const { weekStart, language, timeFormat } = settings;
  const { googleCalendarSync, showWeekNumbers } = settings.calendar;
  const weekStartsOn = getWeekStartsOn(weekStart);
  const locale = getLocale(language);
  const german = language === 'de';
  const is24h = timeFormat === '24h';
  const { t } = useTranslation();
  const [mobile, setMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [importing, setImporting] = useState(false);
  const [lastSync, setLastSync] = useState<number>(() => getLastSyncTime(user?.uid ?? null));
  const [quickAdd, setQuickAdd] = useState<{ date: Date; time?: string } | null>(null);
  const [selectedMobileDay, setSelectedMobileDay] = useState<Date | null>(null);

  useEffect(() => {
    setMobile(isMobile());
    const mql = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => {
      setMobile(e.matches);
      if (!e.matches) setSelectedMobileDay(null);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const refreshLastSync = () => setLastSync(getLastSyncTime(user?.uid ?? null));
    refreshLastSync();
    const intervalId = window.setInterval(refreshLastSync, 30_000);
    return () => window.clearInterval(intervalId);
  }, [user?.uid]);

  const goToday = () => {
    setSelectedMobileDay(null);
    setCurrentDate(new Date());
  };
  const goPrev = () => {
    setSelectedMobileDay(null);
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') {
      if (mobile) setCurrentDate(addDays(currentDate, -3));
      else setCurrentDate(subWeeks(currentDate, 1));
    } else setCurrentDate(addDays(currentDate, -1));
  };
  const goNext = () => {
    setSelectedMobileDay(null);
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') {
      if (mobile) setCurrentDate(addDays(currentDate, 3));
      else setCurrentDate(addWeeks(currentDate, 1));
    } else setCurrentDate(addDays(currentDate, 1));
  };
  const changeViewMode = (mode: ViewMode) => {
    setSelectedMobileDay(null);
    setViewMode(mode);
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate, weekStartsOn]);

  const mobileWeekDays = useMemo(() => {
    return [addDays(currentDate, -1), currentDate, addDays(currentDate, 1)];
  }, [currentDate]);

  const effectiveWeekDays = mobile ? mobileWeekDays : weekDays;

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) { days.push(day); day = addDays(day, 1); }
    return days;
  }, [calendarStart, calendarEnd]);

  const totalRows = Math.ceil(calendarDays.length / 7);

  const multiDayEvents = useMemo(() => {
    const events: { item: OrbitItem; startDate: Date; endDate: Date; daysSpan: number }[] = [];
    items.filter((i) => i.type === 'event' && i.status !== 'archived' && i.startDate).forEach((item) => {
      const rawStart = parseISO(item.startDate + 'T12:00:00');
      const rawEnd = item.endDate ? parseISO(item.endDate + 'T12:00:00') : rawStart;
      if (!isValid(rawStart) || !isValid(rawEnd) || rawEnd < rawStart) return;
      if (rawStart > calendarEnd || rawEnd < calendarStart) return;
      const start = rawStart < calendarStart ? startOfDay(calendarStart) : rawStart;
      const end = rawEnd > calendarEnd ? startOfDay(calendarEnd) : rawEnd;
      const daysSpan = differenceInDays(end, start) + 1;
      events.push({ item, startDate: start, endDate: end, daysSpan });
    });
    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [items, calendarStart, calendarEnd]);

  const multiDayLayout = useMemo(() => getMonthMultiDayLayout(multiDayEvents, calendarDays, totalRows), [multiDayEvents, calendarDays, totalRows]);

  const maxLanesPerRow = useMemo(() => {
    const map = new Map<number, number>();
    for (const seg of multiDayLayout) { map.set(seg.row, Math.max(map.get(seg.row) || 0, seg.lane + 1)); }
    return map;
  }, [multiDayLayout]);

  const getItemsForDate = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return items.filter((i) => i.status !== 'archived' && (
      (i.type === 'event' && eventOccursOnDate(i, dateStr))
      || (i.type === 'task' && i.dueDate === dateStr)
    ));
  }, [items]);

  const handleImportFromGoogle = async () => {
    if (!user) return;
    if (!googleCalendarSync) {
      toast.warning(language === 'de'
        ? 'Aktiviere Google Calendar zuerst in den Einstellungen.'
        : 'Enable Google Calendar in Settings first.');
      return;
    }
    if (!hasCalendarPermission()) {
      toast.warning(language === 'de'
        ? 'Verbinde Google Calendar erneut in den Einstellungen.'
        : 'Reconnect Google Calendar in Settings first.');
      return;
    }
    setImporting(true);
    try {
      const result = await syncGoogleCalendar(user.uid);
      if (!result.success) {
        toast.error(language === 'de'
          ? 'Google Calendar konnte nicht vollständig synchronisiert werden. Lokale Änderungen bleiben vorgemerkt.'
          : 'Google Calendar could not finish syncing. Local changes remain queued.');
        return;
      }
      setLastSync(getLastSyncTime(user.uid));
      toast.success(language === 'de'
        ? result.imported > 0
          ? `${result.imported} Kalender${result.imported === 1 ? 'termin wurde' : 'termine wurden'} importiert`
          : 'Der Kalender ist bereits aktuell'
        : result.imported > 0
          ? `Imported ${result.imported} calendar ${result.imported === 1 ? 'event' : 'events'}`
          : 'Calendar is already up to date');
    } catch (err) {
      console.error('[THREADMAP] Import failed:', err);
      toast.error(language === 'de'
        ? 'Google-Calendar-Termine konnten nicht importiert werden'
        : 'Could not import Google Calendar events');
    } finally { setImporting(false); }
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy', { locale });
    if (viewMode === 'week') {
      const days = mobile ? mobileWeekDays : weekDays;
      const s = days[0], e = days[days.length - 1];
      if (isSameMonth(s, e)) return format(s, 'MMMM yyyy', { locale });
      if (s.getFullYear() === e.getFullYear()) return `${format(s, 'MMM', { locale })} – ${format(e, 'MMM yyyy', { locale })}`;
      return `${format(s, 'MMM yyyy', { locale })} – ${format(e, 'MMM yyyy', { locale })}`;
    }
    return format(currentDate, 'MMMM d, yyyy', { locale });
  }, [viewMode, currentDate, weekDays, mobileWeekDays, mobile, locale]);

  const handleEventClick = useCallback((id: string) => setSelectedItemId(id), [setSelectedItemId]);
  const handleSlotClick = useCallback((date: Date, time?: string) => setQuickAdd({ date, time }), []);
  const handleMonthDayClick = useCallback((day: Date) => {
    if (mobile) {
      setSelectedMobileDay((prev) => prev && isSameDay(prev, day) ? null : day);
    } else {
      setSelectedMobileDay(null);
      setCurrentDate(day);
      setViewMode('day');
    }
  }, [mobile]);

  // Mobile day sheet items
  const mobileDayItems = useMemo(() => {
    if (!selectedMobileDay) return [];
    return getItemsForDate(selectedMobileDay).sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'));
  }, [selectedMobileDay, getItemsForDate]);

  const viewLabels: Record<ViewMode, string> = german
    ? { month: 'Monat', week: 'Woche', day: 'Tag' }
    : { month: 'Month', week: 'Week', day: 'Day' };
  const previousViewLabel: Record<ViewMode, string> = german
    ? { month: 'Vorheriger Monat', week: 'Vorherige Woche', day: 'Vorheriger Tag' }
    : { month: 'Previous month', week: 'Previous week', day: 'Previous day' };
  const nextViewLabel: Record<ViewMode, string> = german
    ? { month: 'Nächster Monat', week: 'Nächste Woche', day: 'Nächster Tag' }
    : { month: 'Next month', week: 'Next week', day: 'Next day' };

  return (
    <div className="h-full flex flex-col p-3 lg:p-6 lg:pr-6">
      {/* Quick-Add Modal */}
      {quickAdd && user && (
        <QuickAddModal date={quickAdd.date} time={quickAdd.time} onClose={() => setQuickAdd(null)} userId={user?.uid || 'demo-user'} locale={locale} />
      )}

      {/* Header */}
      <div className="mb-4 flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:mb-5">
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
          {/* Navigation arrows + label */}
          <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
            <button type="button" onClick={goPrev} aria-label={previousViewLabel[viewMode]} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground/50 transition-all hover:bg-muted/50 hover:text-foreground active:scale-95 sm:h-8 sm:w-8">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={goToday} aria-label={german ? 'Zu heute wechseln' : 'Go to today'} className="hidden min-w-0 sm:block">
              <h1 className="truncate text-[17px] font-bold tracking-tight transition-colors hover:text-foreground/80 lg:text-[19px]">
                {headerLabel}
              </h1>
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold tracking-tight sm:hidden">{headerLabel}</h1>
            <button type="button" onClick={goNext} aria-label={nextViewLabel[viewMode]} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground/50 transition-all hover:bg-muted/50 hover:text-foreground active:scale-95 sm:h-8 sm:w-8">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {lastSync > 0 && !importing && (
            <div
              className="hidden shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground/45 sm:flex"
              title={german
                ? `Letzte Kalendersynchronisierung: ${format(new Date(lastSync), 'Pp', { locale })}`
                : `Last calendar sync: ${format(new Date(lastSync), 'Pp', { locale })}`}
            >
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{german ? 'Synchronisiert' : 'Synced'}</span>
            </div>
          )}
        </div>

        <div className="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-end lg:gap-2">
          {/* View switcher */}
          <div className="flex items-center bg-muted/30 rounded-xl p-[3px] border border-border/30" role="group" aria-label={german ? 'Kalenderansicht' : 'Calendar view'}>
            {([
              { mode: 'month' as ViewMode, icon: LayoutGrid },
              { mode: 'week' as ViewMode, icon: CalendarRange },
              { mode: 'day' as ViewMode, icon: CalendarDays },
            ]).map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeViewMode(mode)}
                aria-label={german ? `Ansicht: ${viewLabels[mode]}` : `${viewLabels[mode]} view`}
                aria-pressed={viewMode === mode}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 lg:px-3 py-1.5 text-[11px] font-semibold transition-all',
                  viewMode === mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{viewLabels[mode]}</span>
              </button>
            ))}
          </div>

          {/* Google Import */}
          <button type="button" onClick={handleImportFromGoogle} disabled={importing} aria-label={importing ? t('calendar.importing') : t('calendar.importFromGoogle')} className={cn(
            'flex h-8 w-8 lg:w-auto lg:px-3 items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium transition-all',
            'text-muted-foreground/50 hover:text-foreground hover:bg-muted/40',
            importing && 'opacity-40 pointer-events-none'
          )}>
            <RefreshCw className={cn('h-3.5 w-3.5', importing && 'animate-spin')} />
            <span className="hidden lg:inline">{importing ? t('calendar.importing') : t('calendar.importFromGoogle')}</span>
          </button>

          {/* Quick add FAB */}
          <button
            type="button"
            onClick={() => setQuickAdd({ date: currentDate })}
            aria-label={language === 'de' ? 'Kalendereintrag erstellen' : 'Create calendar item'}
            className="h-8 w-8 lg:h-8 lg:w-auto lg:px-3.5 rounded-xl bg-foreground text-background flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            <span className="hidden lg:inline text-[11px] font-semibold">{t('common.create')}</span>
          </button>
        </div>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <TimeGrid days={effectiveWeekDays} items={items} is24h={is24h} locale={locale} onEventClick={handleEventClick} onSlotClick={handleSlotClick} showWeekNumbers={!mobile && showWeekNumbers} />
      )}

      {/* Day View */}
      {viewMode === 'day' && (
        <TimeGrid days={[startOfDay(currentDate)]} items={items} is24h={is24h} locale={locale} onEventClick={handleEventClick} onSlotClick={handleSlotClick} showWeekNumbers={false} />
      )}

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-0">
          {/* Calendar grid card */}
          <div className={cn('flex-1 min-h-0 rounded-2xl border border-border/40 overflow-hidden bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col', mobile && selectedMobileDay && 'max-h-[55vh]')}>
            {/* Day names header */}
            <div className={cn('grid border-b border-border/25 flex-shrink-0', showWeekNumbers ? 'grid-cols-8' : 'grid-cols-7')}>
              {showWeekNumbers && (
                <div className="px-1 py-2.5 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground/20">{t('calendar.wk')}</div>
              )}
              {Array.from({ length: 7 }, (_, i) => {
                const dayDate = addDays(calendarStart, i);
                return (
                  <div key={i} className="px-1 py-2.5 text-center text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/35">
                    <span className="lg:hidden">{format(dayDate, 'EEEEE', { locale })}</span>
                    <span className="hidden lg:inline">{format(dayDate, 'EEE', { locale })}</span>
                  </div>
                );
              })}
            </div>

            {/* Calendar grid */}
            <div className="relative flex-1 min-h-0">
              <div className={cn('grid h-full', showWeekNumbers ? 'grid-cols-8' : 'grid-cols-7')} style={{ gridTemplateRows: `repeat(${totalRows}, 1fr)` }}>
                {calendarDays.map((day, idx) => {
                  const row = Math.floor(idx / 7);
                  const col = idx % 7;
                  const dayItems = getItemsForDate(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isTodayDate = isToday(day);
                  const lanesInRow = maxLanesPerRow.get(row) || 0;
                  const singleDayItems = dayItems.filter((i) => !(i.type === 'event' && i.endDate && i.endDate !== i.startDate));
                  const maxVisible = Math.max(1, 3 - lanesInRow);
                  const isMobileSelected = mobile && selectedMobileDay && isSameDay(day, selectedMobileDay);

                  const weekNumCell = showWeekNumbers && col === 0 ? (
                    <div key={`wk-${idx}`} className="flex items-start justify-center pt-2 border-b border-r border-border/10 text-[9px] text-muted-foreground/20 tabular-nums font-bold">
                      {getISOWeek(day)}
                    </div>
                  ) : null;

                  return (
                    <React.Fragment key={day.toISOString()}>
                      {weekNumCell}
                      <div
                        className={cn(
                          'relative border-b border-r border-border/[0.08] p-1 lg:p-1.5 transition-all text-left group overflow-hidden',
                          'hover:bg-foreground/[0.02] active:bg-foreground/[0.04]',
                          !isCurrentMonth && 'opacity-30',
                          isTodayDate && 'bg-blue-500/[0.04]',
                          isMobileSelected && 'bg-foreground/[0.06] ring-1 ring-foreground/10 ring-inset'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleMonthDayClick(day)}
                          aria-label={german
                            ? `${mobile ? 'Einträge anzeigen' : 'Tag öffnen'}: ${format(day, 'PPPP', { locale })}, ${dayItems.length} ${dayItems.length === 1 ? 'Eintrag' : 'Einträge'}`
                            : `${mobile ? 'Show items' : 'Open day'}: ${format(day, 'PPPP', { locale })}, ${dayItems.length} ${dayItems.length === 1 ? 'item' : 'items'}`}
                          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                        />
                        <div className="pointer-events-none relative z-[1] h-full">
                        {/* Date number */}
                        <div className={cn(
                          'inline-flex h-6 w-6 lg:h-7 lg:w-7 items-center justify-center rounded-full text-[11px] lg:text-[12px] font-semibold tabular-nums transition-all',
                          isTodayDate ? 'bg-foreground text-background' : 'text-muted-foreground/40 group-hover:text-foreground/70',
                        )}>
                          {format(day, 'd')}
                        </div>

                        {/* Space for multi-day lane bars */}
                        {lanesInRow > 0 && <div style={{ height: lanesInRow * 22 }} />}

                        {/* Desktop: event chips */}
                        <div className="hidden lg:block space-y-0.5 mt-0.5">
                          {singleDayItems.slice(0, maxVisible).map((item) => {
                            const color = getEventColor(item);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedItemId(item.id); }}
                                aria-label={german ? `${item.title} öffnen` : `Open ${item.title}`}
                                className={cn(
                                  'pointer-events-auto w-full truncate rounded-md px-1.5 py-[2px] text-left text-[10px] font-semibold cursor-pointer transition-all',
                                  color.bg, color.text, 'hover:brightness-95'
                                )}
                                title={item.title}
                              >
                                {item.startTime && <span className="mr-0.5 text-[8px] opacity-50 tabular-nums">{item.startTime}</span>}
                                {item.title}
                              </button>
                            );
                          })}
                          {singleDayItems.length > maxVisible && (
                            <span className="text-[9px] text-muted-foreground/25 font-semibold px-1.5">+{singleDayItems.length - maxVisible}</span>
                          )}
                        </div>

                        {/* Mobile: dot indicators */}
                        <div className="lg:hidden mt-0.5 flex items-center justify-center gap-[3px] flex-wrap">
                          {dayItems.slice(0, 4).map((item, i) => (
                            <div key={item.id || i} className={cn('h-[5px] w-[5px] rounded-full', getEventColor(item).dot)} />
                          ))}
                          {dayItems.length > 4 && <span className="text-[7px] text-muted-foreground/25 font-bold ml-0.5">+{dayItems.length - 4}</span>}
                        </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Multi-day bars overlay */}
              <div className={cn('hidden lg:grid absolute inset-0 pointer-events-none', showWeekNumbers ? 'grid-cols-8' : 'grid-cols-7')} style={{ gridTemplateRows: `repeat(${totalRows}, 1fr)` }}>
                {showWeekNumbers && Array.from({ length: totalRows }, (_, r) => (<div key={`s-${r}`} style={{ gridRow: r + 1, gridColumn: 1 }} />))}
                {multiDayLayout.map((seg, i) => {
                  const color = getEventColor(seg.item);
                  const colOff = showWeekNumbers ? 2 : 1;
                  return (
                    <button type="button" aria-label={german ? `${seg.item.title} öffnen` : `Open ${seg.item.title}`} key={`${seg.item.id}-${i}`} className="pointer-events-auto cursor-pointer px-[2px] text-left" style={{ gridRow: seg.row + 1, gridColumn: `${seg.col + colOff} / span ${seg.span}`, alignSelf: 'start', marginTop: `${38 + seg.lane * 22}px` }} onClick={() => setSelectedItemId(seg.item.id)}>
                      <div className={cn(
                        'h-[18px] px-2 text-[9px] font-bold leading-[18px] truncate transition-all hover:brightness-110',
                        color.accent, 'text-white shadow-sm',
                        seg.isStart && seg.isEnd && 'rounded-md',
                        seg.isStart && !seg.isEnd && 'rounded-l-md',
                        !seg.isStart && seg.isEnd && 'rounded-r-md',
                        !seg.isStart && !seg.isEnd && 'rounded-none',
                      )} title={seg.item.title}>
                        {seg.isStart ? seg.item.title : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile: Selected day sheet (slides up) */}
          {mobile && selectedMobileDay && (
            <div className="flex-shrink-0 animate-in slide-in-from-bottom-2 duration-200">
              <div className="rounded-2xl border border-border/40 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-10 w-10 rounded-xl flex items-center justify-center text-[16px] font-black tabular-nums',
                      isToday(selectedMobileDay) ? 'bg-foreground text-background' : 'bg-muted/40 text-foreground'
                    )}>
                      {format(selectedMobileDay, 'd')}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold leading-tight">
                        {getRelativeDayLabel(selectedMobileDay, locale) || format(selectedMobileDay, 'EEEE', { locale })}
                      </p>
                      <p className="text-[11px] text-muted-foreground/40">{format(selectedMobileDay, 'MMMM yyyy', { locale })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setQuickAdd({ date: selectedMobileDay })} aria-label={german ? `Eintrag am ${format(selectedMobileDay, 'PPPP', { locale })} erstellen` : `Create an item on ${format(selectedMobileDay, 'PPPP', { locale })}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background transition-all active:scale-95">
                      <Plus className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setSelectedMobileDay(null)} aria-label={german ? 'Ausgewählten Tag schließen' : 'Close selected day'} className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground/40 transition-all hover:bg-muted/40">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Events list */}
                <div className="max-h-[35vh] overflow-y-auto">
                  {mobileDayItems.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-[13px] text-muted-foreground/25 font-medium">{t('calendar.noEventsOrTasks')}</p>
                      <button type="button" onClick={() => setQuickAdd({ date: selectedMobileDay })} className="mt-3 text-[12px] font-semibold text-foreground/60 hover:text-foreground transition-colors">
                        {german ? '+ Eintrag hinzufügen' : '+ Add an item'}
                      </button>
                    </div>
                  ) : (
                    <div className="py-1">
                      {mobileDayItems.map((item) => {
                        const color = getEventColor(item);
                        return (
                          <button
                            key={item.id}
                            onClick={() => setSelectedItemId(item.id)}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors"
                          >
                            <div className={cn('w-[3px] self-stretch rounded-full shrink-0', color.accent)} />
                            <div className="flex-1 min-w-0">
                              <span className="text-[14px] font-semibold truncate block leading-tight">{item.title}</span>
                              {(item.startTime || item.type === 'task') && (
                                <span className="text-[11px] text-muted-foreground/35 mt-0.5 block font-medium">
                                  {item.startTime ? `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ''}` : item.type === 'task' ? t('type.task') : ''}
                                </span>
                              )}
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/15 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Desktop: Mini sidebar — today's agenda */}
          {!mobile && (
            <div className="hidden xl:flex flex-col w-[280px] ml-3 min-h-0">
              <div className="rounded-2xl border border-border/40 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="px-4 pt-4 pb-3 flex-shrink-0">
                  <p className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-wider">{t('common.today')}</p>
                  <p className="text-[15px] font-bold mt-1">{format(new Date(), 'PPP', { locale })}</p>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2">
                  {(() => {
                    const todayItems = getItemsForDate(new Date()).sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'));
                    if (todayItems.length === 0) return (
                      <div className="px-2 py-8 text-center">
                        <p className="text-[12px] text-muted-foreground/25 font-medium">{t('calendar.noEventsOrTasks')}</p>
                      </div>
                    );
                    return todayItems.map((item) => {
                      const color = getEventColor(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          className="flex items-start gap-2.5 w-full rounded-xl px-2.5 py-2 text-left hover:bg-foreground/[0.03] active:bg-foreground/[0.05] transition-colors"
                        >
                          <div className={cn('w-[3px] h-5 rounded-full shrink-0 mt-0.5', color.accent)} />
                          <div className="flex-1 min-w-0">
                            <span className="text-[12px] font-semibold truncate block leading-tight">{item.title}</span>
                            {item.startTime && (
                              <span className="text-[10px] text-muted-foreground/30 mt-0.5 block tabular-nums font-medium">
                                {item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
