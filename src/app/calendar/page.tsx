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
  getISOWeek,
} from 'date-fns';
import type { Locale } from 'date-fns';
import {
  fetchGoogleEvents,
  hasCalendarPermission,
  requestCalendarPermission,
} from '@/lib/google-calendar';
import { getLastSyncTime, isSyncRunning } from '@/lib/google-calendar-sync';
import { createItem } from '@/lib/firestore';
import { isMobile } from '@/lib/mobile';
import type { OrbitItem } from '@/lib/types';

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

function getRelativeDayLabel(date: Date, loc: Locale): string | null {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isTomorrow(date)) return 'Tomorrow';
  return null;
}

// ═══════════════════════════════════════════════════════════
// Quick-Add Modal
// ═══════════════════════════════════════════════════════════

function QuickAddModal({ date, time, onClose, userId, locale: loc }: { date: Date; time?: string; onClose: () => void; userId: string; locale: Locale }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'event' | 'task'>('event');
  const [startTime, setStartTime] = useState(time || '09:00');
  const [endTime, setEndTime] = useState(() => {
    if (!time) return '10:00';
    const [h, m] = time.split(':').map(Number);
    return `${Math.min((h || 0) + 1, 23).toString().padStart(2, '0')}:${(m || 0).toString().padStart(2, '0')}`;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const now = Date.now();
    if (type === 'event') {
      await createItem({ type: 'event', title: trimmed, status: 'active', startDate: dateStr, startTime, endTime, userId, createdAt: now, updatedAt: now, tags: [], linkedIds: [] });
    } else {
      await createItem({ type: 'task', title: trimmed, status: 'active', dueDate: dateStr, userId, createdAt: now, updatedAt: now, tags: [], linkedIds: [] });
    }
    onClose();
  };

  const relLabel = getRelativeDayLabel(date, loc);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className={cn(
          'relative w-full sm:w-[420px] sm:max-w-[92vw] bg-card border border-border/50 shadow-2xl',
          'rounded-t-3xl sm:rounded-2xl p-6 sm:p-6',
          'animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in-0 duration-200'
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              {relLabel || format(date, 'EEEE', { locale: loc })}
            </p>
            <p className="text-[16px] font-semibold mt-0.5">{format(date, 'MMMM d, yyyy', { locale: loc })}</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors">
            <X className="h-4 w-4 text-muted-foreground/50" />
          </button>
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === 'event' ? t('calendar.untitledEvent') : 'Task title...'}
          className="w-full bg-muted/30 rounded-xl px-4 py-3 text-[15px] font-medium placeholder:text-muted-foreground/30 outline-none border border-border/30 focus:border-foreground/15 transition-colors mb-4"
        />

        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setType('event')} className={cn(
            'flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all border-2',
            type === 'event' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25' : 'text-muted-foreground/40 border-transparent bg-muted/30 hover:bg-muted/50'
          )}>
            <CalendarDays className="h-3.5 w-3.5 mx-auto mb-1 opacity-70" />
            Event
          </button>
          <button type="button" onClick={() => setType('task')} className={cn(
            'flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all border-2',
            type === 'task' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' : 'text-muted-foreground/40 border-transparent bg-muted/30 hover:bg-muted/50'
          )}>
            <MapPin className="h-3.5 w-3.5 mx-auto mb-1 opacity-70" />
            Task
          </button>
        </div>

        {type === 'event' && (
          <div className="flex items-center gap-3 mb-5 bg-muted/20 rounded-xl px-4 py-3 border border-border/20">
            <Clock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-transparent text-[13px] font-medium outline-none tabular-nums w-[70px]" />
            <ArrowRight className="h-3 w-3 text-muted-foreground/25 shrink-0" />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-transparent text-[13px] font-medium outline-none tabular-nums w-[70px]" />
          </div>
        )}

        <button
          type="submit"
          disabled={!title.trim()}
          className={cn(
            'w-full rounded-xl py-3 text-[13px] font-bold tracking-wide transition-all uppercase',
            title.trim()
              ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
              : 'bg-muted/60 text-muted-foreground/25 cursor-not-allowed'
          )}
        >
          {t('common.create') || 'Create'}
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Time Grid (Week & Day views)
// ═══════════════════════════════════════════════════════════

function TimeGrid({
  days, items, is24h, locale: loc, onEventClick, onSlotClick, showWeekNumbers,
}: {
  days: Date[]; items: OrbitItem[]; is24h: boolean; locale: Locale; onEventClick: (id: string) => void; onSlotClick: (date: Date, time: string) => void; showWeekNumbers: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const { t } = useTranslation();

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
          const matchesSingle = item.startDate === dateStr;
          const matchesMulti = item.startDate && item.endDate && item.startDate <= dateStr && dateStr <= item.endDate;
          if (!matchesSingle && !matchesMulti) continue;

          const isMultiDay = item.endDate && item.endDate !== item.startDate;
          const isAllDay = !item.startTime || !!isMultiDay;
          if (isAllDay) {
            const key = `allday-${item.id}`;
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
                W{getISOWeek(days[0])}
              </div>
            )}
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day, i) => {
              const today = isToday(day);
              const relLabel = getRelativeDayLabel(day, loc);
              return (
                <div key={i} className={cn(
                  'text-center py-3 lg:py-3.5 transition-colors',
                  i > 0 && 'border-l border-border/15',
                  today && 'bg-blue-500/[0.03]'
                )}>
                  <div className="text-[10px] text-muted-foreground/40 uppercase font-semibold tracking-wider">
                    {relLabel || format(day, 'EEE', { locale: loc })}
                  </div>
                  <div className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold mt-1 tabular-nums transition-all',
                    today ? 'bg-foreground text-background' : 'text-foreground/80'
                  )}>
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single day header */}
      {isSingleDay && (
        <div className="flex items-center gap-4 px-5 py-4 border-b border-border/30 flex-shrink-0">
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
        </div>
      )}

      {/* All-day section */}
      {hasAllDay && (
        <div className="border-b border-border/25 flex-shrink-0">
          <div className="flex">
            <div className="shrink-0 flex items-center justify-center text-[9px] text-muted-foreground/30 uppercase font-bold tracking-wider" style={{ width: TIME_GUTTER_WIDTH }}>
              All day
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
                        <button key={e.item.id} onClick={() => onEventClick(e.item.id)} className={cn(
                          'w-full truncate rounded-lg px-2 py-0.5 text-[10px] font-semibold mb-0.5 text-left transition-all',
                          color.bg, color.text, 'hover:brightness-95 active:scale-[0.98]'
                        )} title={e.item.title}>
                          {e.item.title}
                        </button>
                      );
                    })}
                    {allEvts.length > 3 && <div className="text-[9px] text-muted-foreground/30 font-medium px-2">+{allEvts.length - 3}</div>}
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

                  {/* Clickable half-hour slots */}
                  {HOURS.map((h) => (
                    <React.Fragment key={`slot-${h}`}>
                      <button
                        className="absolute inset-x-0 hover:bg-blue-500/[0.04] active:bg-blue-500/[0.07] transition-colors"
                        style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT / 2 }}
                        onClick={() => onSlotClick(day, `${h.toString().padStart(2, '0')}:00`)}
                      />
                      <button
                        className="absolute inset-x-0 hover:bg-blue-500/[0.04] active:bg-blue-500/[0.07] transition-colors"
                        style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2, height: HOUR_HEIGHT / 2 }}
                        onClick={() => onSlotClick(day, `${h.toString().padStart(2, '0')}:30`)}
                      />
                    </React.Fragment>
                  ))}

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
                        key={`${event.item.id}-${dayIdx}`}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event.item.id); }}
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
  const { items, setSelectedItemId } = useOrbitStore();
  const { weekStart, language, timeFormat } = useSettingsStore((s) => s.settings);
  const { showWeekNumbers } = useSettingsStore((s) => s.settings.calendar);
  const weekStartsOn = getWeekStartsOn(weekStart);
  const locale = getLocale(language);
  const is24h = timeFormat === '24h';
  const { t } = useTranslation();
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(isMobile());
    const mql = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [importing, setImporting] = useState(false);
  const [lastSync, setLastSync] = useState<number>(0);
  const [quickAdd, setQuickAdd] = useState<{ date: Date; time?: string } | null>(null);
  const [selectedMobileDay, setSelectedMobileDay] = useState<Date | null>(null);

  useEffect(() => { const i = setInterval(() => setLastSync(getLastSyncTime()), 1000); return () => clearInterval(i); }, []);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') {
      if (mobile) setCurrentDate(addDays(currentDate, -3));
      else setCurrentDate(subWeeks(currentDate, 1));
    } else setCurrentDate(addDays(currentDate, -1));
  };
  const goNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') {
      if (mobile) setCurrentDate(addDays(currentDate, 3));
      else setCurrentDate(addWeeks(currentDate, 1));
    } else setCurrentDate(addDays(currentDate, 1));
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
    return items.filter((i) => i.status !== 'archived' && ((i.type === 'event' && (i.startDate === dateStr || (i.startDate && i.endDate && i.startDate <= dateStr && dateStr <= i.endDate))) || (i.type === 'task' && i.dueDate === dateStr)));
  }, [items]);

  const handleImportFromGoogle = async () => {
    if (!user) return;
    setImporting(true);
    try {
      if (!hasCalendarPermission()) await requestCalendarPermission();
      const googleEvents = await fetchGoogleEvents(monthStart.toISOString(), monthEnd.toISOString());
      let count = 0;
      for (const gcalEvent of googleEvents) {
        const d: Record<string, unknown> = gcalEvent as Record<string, unknown>;
        const start = d.start as Record<string, string> | undefined;
        const end = d.end as Record<string, string> | undefined;
        if (!items.some((i) => i.googleCalendarId === d.id) && d.id) {
          const newEvent: Record<string, unknown> = { type: 'event', title: (d.summary as string) || t('calendar.untitledEvent'), status: 'active', googleCalendarId: d.id, calendarSynced: true, userId: user.uid, createdAt: Date.now(), updatedAt: Date.now(), tags: [], linkedIds: [] };
          if (d.description) newEvent.content = d.description;
          const sd = start?.date || start?.dateTime?.split('T')[0]; if (sd) newEvent.startDate = sd;
          let ed = end?.date || end?.dateTime?.split('T')[0];
          if (ed && start?.date && !start?.dateTime) {
            const [ey, em, eday] = ed.split('-').map(Number);
            const endObj = new Date(Date.UTC(ey, em - 1, eday));
            endObj.setUTCDate(endObj.getUTCDate() - 1);
            ed = `${endObj.getUTCFullYear()}-${String(endObj.getUTCMonth() + 1).padStart(2, '0')}-${String(endObj.getUTCDate()).padStart(2, '0')}`;
          }
          if (ed && ed !== sd) newEvent.endDate = ed;
          const st = start?.dateTime?.split('T')[1]?.substring(0, 5); if (st) newEvent.startTime = st;
          const et = end?.dateTime?.split('T')[1]?.substring(0, 5); if (et) newEvent.endTime = et;
          await createItem(newEvent as Omit<OrbitItem, 'id'>);
          count++;
        }
      }
      console.log(`[ORBIT] Imported ${count} events from Google Calendar`);
    } catch (err) {
      console.error('[ORBIT] Import failed:', err);
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
  const handleSlotClick = useCallback((date: Date, time: string) => setQuickAdd({ date, time }), []);
  const handleMonthDayClick = useCallback((day: Date) => {
    if (mobile) {
      setSelectedMobileDay((prev) => prev && isSameDay(prev, day) ? null : day);
    } else {
      setCurrentDate(day);
      setViewMode('day');
    }
  }, [mobile]);

  // Mobile day sheet items
  const mobileDayItems = useMemo(() => {
    if (!selectedMobileDay) return [];
    return getItemsForDate(selectedMobileDay).sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'));
  }, [selectedMobileDay, getItemsForDate]);

  return (
    <div className="h-full flex flex-col p-3 lg:p-6 lg:pr-6">
      {/* Quick-Add Modal */}
      {quickAdd && (
        <QuickAddModal date={quickAdd.date} time={quickAdd.time} onClose={() => setQuickAdd(null)} userId={user?.uid || 'demo-user'} locale={locale} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 lg:mb-5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Navigation arrows + label */}
          <div className="flex items-center gap-1.5">
            <button onClick={goPrev} className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all active:scale-95">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={goToday} className="hidden sm:block">
              <h1 className="text-[17px] lg:text-[19px] font-bold tracking-tight hover:text-foreground/80 transition-colors">
                {headerLabel}
              </h1>
            </button>
            <h1 className="sm:hidden text-[17px] font-bold tracking-tight">{headerLabel}</h1>
            <button onClick={goNext} className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all active:scale-95">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {isSyncRunning() && lastSync > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground/30 shrink-0">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Synced</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 lg:gap-2">
          {/* View switcher */}
          <div className="flex items-center bg-muted/30 rounded-xl p-[3px] border border-border/30">
            {([
              { mode: 'month' as ViewMode, icon: LayoutGrid, label: 'Month' },
              { mode: 'week' as ViewMode, icon: CalendarRange, label: 'Week' },
              { mode: 'day' as ViewMode, icon: CalendarDays, label: 'Day' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 lg:px-3 py-1.5 text-[11px] font-semibold transition-all',
                  viewMode === mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Google Import */}
          <button onClick={handleImportFromGoogle} disabled={importing} className={cn(
            'hidden sm:flex h-8 w-8 lg:w-auto lg:px-3 items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium transition-all',
            'text-muted-foreground/50 hover:text-foreground hover:bg-muted/40',
            importing && 'opacity-40 pointer-events-none'
          )}>
            <RefreshCw className={cn('h-3.5 w-3.5', importing && 'animate-spin')} />
            <span className="hidden lg:inline">{importing ? t('calendar.importing') : t('calendar.importFromGoogle')}</span>
          </button>

          {/* Quick add FAB */}
          <button
            onClick={() => setQuickAdd({ date: viewMode === 'day' ? currentDate : new Date() })}
            className="h-8 w-8 lg:h-8 lg:w-auto lg:px-3.5 rounded-xl bg-foreground text-background flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            <span className="hidden lg:inline text-[11px] font-semibold">{t('common.create') || 'New'}</span>
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
                      <button
                        onClick={() => handleMonthDayClick(day)}
                        className={cn(
                          'relative border-b border-r border-border/[0.08] p-1 lg:p-1.5 transition-all text-left group overflow-hidden',
                          'hover:bg-foreground/[0.02] active:bg-foreground/[0.04]',
                          !isCurrentMonth && 'opacity-30',
                          isTodayDate && 'bg-blue-500/[0.04]',
                          isMobileSelected && 'bg-foreground/[0.06] ring-1 ring-foreground/10 ring-inset'
                        )}
                      >
                        {/* Date number */}
                        <div className={cn(
                          'inline-flex h-6 w-6 lg:h-7 lg:w-7 items-center justify-center rounded-full text-[11px] lg:text-[12px] font-semibold tabular-nums transition-all',
                          isTodayDate ? 'bg-foreground text-background' : 'text-muted-foreground/40 group-hover:text-foreground/70',
                        )}>
                          {format(day, 'd')}
                        </div>

                        {/* Space for multi-day lane bars */}
                        {lanesInRow > 0 && <div style={{ height: lanesInRow * 20 }} />}

                        {/* Desktop: event chips */}
                        <div className="hidden lg:block space-y-0.5 mt-0.5">
                          {singleDayItems.slice(0, maxVisible).map((item) => {
                            const color = getEventColor(item);
                            return (
                              <div
                                key={item.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedItemId(item.id); }}
                                className={cn(
                                  'w-full truncate rounded-md px-1.5 py-[2px] text-[10px] font-semibold cursor-pointer transition-all',
                                  color.bg, color.text, 'hover:brightness-95'
                                )}
                                title={item.title}
                              >
                                {item.startTime && <span className="mr-0.5 text-[8px] opacity-50 tabular-nums">{item.startTime}</span>}
                                {item.title}
                              </div>
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
                      </button>
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
                    <div key={`${seg.item.id}-${i}`} className="pointer-events-auto cursor-pointer px-[2px]" style={{ gridRow: seg.row + 1, gridColumn: `${seg.col + colOff} / span ${seg.span}`, alignSelf: 'start', marginTop: `${28 + seg.lane * 20}px` }} onClick={() => setSelectedItemId(seg.item.id)}>
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
                    </div>
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
                    <button onClick={() => setQuickAdd({ date: selectedMobileDay })} className="h-8 w-8 rounded-xl bg-foreground text-background flex items-center justify-center active:scale-95 transition-all">
                      <Plus className="h-4 w-4" />
                    </button>
                    <button onClick={() => setSelectedMobileDay(null)} className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/40 hover:bg-muted/40 transition-all">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Events list */}
                <div className="max-h-[35vh] overflow-y-auto">
                  {mobileDayItems.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-[13px] text-muted-foreground/25 font-medium">{t('calendar.noEventsOrTasks')}</p>
                      <button onClick={() => setQuickAdd({ date: selectedMobileDay })} className="mt-3 text-[12px] font-semibold text-foreground/60 hover:text-foreground transition-colors">
                        + Add something
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
                                  {item.startTime ? `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ''}` : item.type === 'task' ? 'Task' : ''}
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
                  <p className="text-[15px] font-bold mt-1">{format(new Date(), 'MMMM d', { locale })}</p>
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