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
// Types
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

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;
const MIN_EVENT_HEIGHT = 22;
const TIME_GUTTER_WIDTH = 56;

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

/** Compute column layout for overlapping timed events */
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

/** Stacking layout for multi-day events in month view */
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

function getEventColor(item: OrbitItem) {
  if (item.type === 'task') return { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-500/30', accent: 'bg-amber-500' };
  if (item.calendarSynced) return { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/30', accent: 'bg-emerald-500' };
  if (item.endDate && item.endDate !== item.startDate) return { bg: 'bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-500/30', accent: 'bg-violet-500' };
  return { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-500/30', accent: 'bg-blue-500' };
}

// ═══════════════════════════════════════════════════════════
// Quick-Add Modal
// ═══════════════════════════════════════════════════════════

function QuickAddModal({ date, time, onClose, userId }: { date: Date; time?: string; onClose: () => void; userId: string }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} className="w-[380px] max-w-[90vw] rounded-2xl border border-border/60 bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold">{format(date, 'EEE, MMM d')}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-muted/60 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'event' ? t('calendar.untitledEvent') : 'Task title...'} className="w-full bg-transparent text-[15px] font-medium placeholder:text-muted-foreground/40 outline-none mb-4" />
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setType('event')} className={cn('flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-all border', type === 'event' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' : 'text-muted-foreground/60 border-border/40 hover:bg-muted/40')}>Event</button>
          <button type="button" onClick={() => setType('task')} className={cn('flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-all border', type === 'task' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' : 'text-muted-foreground/60 border-border/40 hover:bg-muted/40')}>Task</button>
        </div>
        {type === 'event' && (
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-muted/40 rounded-lg px-2.5 py-1.5 text-[12px] border border-border/40 outline-none focus:border-foreground/20" />
            <span className="text-muted-foreground/40 text-[12px]">–</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-muted/40 rounded-lg px-2.5 py-1.5 text-[12px] border border-border/40 outline-none focus:border-foreground/20" />
          </div>
        )}
        <button type="submit" disabled={!title.trim()} className={cn('w-full rounded-xl py-2.5 text-[13px] font-semibold transition-all', title.trim() ? 'bg-foreground text-background hover:opacity-90' : 'bg-muted text-muted-foreground/40 cursor-not-allowed')}>{t('common.create') || 'Create'}</button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Time Grid (shared by Week & Day views)
// ═══════════════════════════════════════════════════════════

function TimeGrid({
  days, items, is24h, locale: loc, onEventClick, onSlotClick, showWeekNumbers,
}: {
  days: Date[]; items: OrbitItem[]; is24h: boolean; locale: Locale; onEventClick: (id: string) => void; onSlotClick: (date: Date, time: string) => void; showWeekNumbers: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const { t } = useTranslation();

  useEffect(() => { gridRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT - 20 }); }, []);
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

  // Flatten all-day events across days for display
  const hasAllDay = useMemo(() => {
    for (const evts of allDayEvents.values()) {
      if (evts.length > 0) return true;
    }
    return false;
  }, [allDayEvents]);

  const isSingleDay = days.length === 1;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-border/60 rounded-xl lg:rounded-2xl bg-card overflow-hidden shadow-sm">
      {/* All-day section */}
      {hasAllDay && (
        <div className="border-b border-border/50 bg-muted/20 flex-shrink-0">
          <div className="flex">
            <div className="shrink-0 border-r border-border/30 flex items-center justify-center text-[10px] text-muted-foreground/40 uppercase font-medium" style={{ width: TIME_GUTTER_WIDTH }}>
              All day
            </div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
              {days.map((day, dayIdx) => {
                const evts = allDayEvents.get(dayIdx) || [];
                // Also show events from other days that span into this day
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
                  <div key={dayIdx} className={cn('px-1 py-1 min-h-[28px]', dayIdx > 0 && 'border-l border-border/20')}>
                    {allEvts.slice(0, 3).map((e) => {
                      const color = getEventColor(e.item);
                      return (
                        <button key={e.item.id} onClick={() => onEventClick(e.item.id)} className={cn('w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium mb-0.5 text-left transition-colors', color.bg, color.text, 'hover:opacity-80')} title={e.item.title}>
                          {e.item.title}
                        </button>
                      );
                    })}
                    {allEvts.length > 3 && <span className="text-[9px] text-muted-foreground/40 px-1">+{allEvts.length - 3}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Day headers (week view) */}
      {!isSingleDay && (
        <div className="flex border-b border-border/50 flex-shrink-0 bg-muted/20">
          <div className="shrink-0 border-r border-border/30" style={{ width: TIME_GUTTER_WIDTH }}>
            {showWeekNumbers && days.length >= 7 && (
              <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/30 font-medium">
                {t('calendar.wk')} {getISOWeek(days[0])}
              </div>
            )}
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day, i) => (
              <div key={i} className="text-center py-2.5 border-l border-border/15 first:border-l-0">
                <div className="text-[10px] text-muted-foreground/50 uppercase font-medium">{format(day, 'EEE', { locale: loc })}</div>
                <div className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-semibold mt-0.5 tabular-nums', isToday(day) ? 'bg-blue-500 text-white' : 'text-foreground')}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single day header */}
      {isSingleDay && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/20 flex-shrink-0">
          <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full text-[18px] font-bold tabular-nums', isToday(days[0]) ? 'bg-blue-500 text-white' : 'text-foreground')}>
            {format(days[0], 'd')}
          </div>
          <div>
            <div className="text-[13px] font-semibold">{format(days[0], 'EEEE', { locale: loc })}</div>
            <div className="text-[11px] text-muted-foreground/50">{format(days[0], 'MMMM yyyy', { locale: loc })}</div>
          </div>
        </div>
      )}

      {/* Time grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="flex relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Time gutter */}
          <div className="shrink-0 relative border-r border-border/30" style={{ width: TIME_GUTTER_WIDTH }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground/40 tabular-nums select-none" style={{ top: h * HOUR_HEIGHT }}>
                {h > 0 && formatHour(h, is24h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day, dayIdx) => (
              <div key={dayIdx} className="relative border-l border-border/15 first:border-l-0">
                {/* Hour lines */}
                {HOURS.map((h) => (
                  <React.Fragment key={h}>
                    <div className="absolute inset-x-0 border-t border-border/20" style={{ top: h * HOUR_HEIGHT }} />
                    <div className="absolute inset-x-0 border-t border-border/8" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  </React.Fragment>
                ))}

                {/* Clickable slots for quick-add */}
                {HOURS.map((h) => (
                  <button key={`slot-${h}`} className="absolute inset-x-0 hover:bg-blue-500/[0.04] transition-colors" style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }} onClick={() => onSlotClick(day, `${h.toString().padStart(2, '0')}:00`)} />
                ))}

                {/* Timed events */}
                {(timedLayouts.get(dayIdx) || []).map((slot) => {
                  const { event, column, totalColumns } = slot;
                  const top = (event.startMinute / 60) * HOUR_HEIGHT;
                  const height = Math.max(((event.endMinute - event.startMinute) / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
                  const color = getEventColor(event.item);
                  const colWidth = 100 / totalColumns;
                  const left = column * colWidth;
                  const isSmall = height < 36;

                  return (
                    <button
                      key={`${event.item.id}-${dayIdx}`}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event.item.id); }}
                      className={cn('absolute rounded-md border px-1.5 overflow-hidden text-left transition-all z-10', 'hover:opacity-90 hover:shadow-md hover:z-20', color.bg, color.border, color.text)}
                      style={{ top, height, left: `calc(${left}% + 2px)`, width: `calc(${colWidth}% - 4px)` }}
                      title={event.item.title}
                    >
                      {isSmall ? (
                        <div className="flex items-center gap-1 h-full">
                          <span className="truncate text-[10px] font-medium">{event.item.title}</span>
                        </div>
                      ) : (
                        <div className="py-1">
                          <div className="text-[11px] font-semibold leading-tight line-clamp-2">{event.item.title}</div>
                          <div className="text-[9px] opacity-70 mt-0.5">{formatTimeShort(event.startMinute, is24h)} – {formatTimeShort(event.endMinute, is24h)}</div>
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Now indicator */}
                {isToday(day) && (
                  <div className="absolute inset-x-0 z-30 pointer-events-none" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}>
                    <div className="relative">
                      <div className="absolute -left-1 -top-[5px] h-[10px] w-[10px] rounded-full bg-red-500" />
                      <div className="h-[2px] bg-red-500 w-full" />
                    </div>
                  </div>
                )}
              </div>
            ))}
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

  useEffect(() => { const i = setInterval(() => setLastSync(getLastSyncTime()), 1000); return () => clearInterval(i); }, []);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, -1));
  };
  const goNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate, weekStartsOn]);

  // Mobile: 3-day view when "week" is selected
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
      const start = parseISO(item.startDate + 'T12:00:00');
      const end = item.endDate ? parseISO(item.endDate + 'T12:00:00') : start;
      const daysSpan = differenceInDays(end, start) + 1;
      if (start <= calendarEnd && end >= calendarStart) {
        events.push({ item, startDate: start, endDate: end, daysSpan });
      }
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
          const ed = end?.date || end?.dateTime?.split('T')[0]; if (ed) newEvent.endDate = ed;
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
    return format(currentDate, 'EEEE, MMMM d, yyyy', { locale });
  }, [viewMode, currentDate, weekDays, mobileWeekDays, mobile, locale]);

  const handleEventClick = useCallback((id: string) => setSelectedItemId(id), [setSelectedItemId]);
  const handleSlotClick = useCallback((date: Date, time: string) => setQuickAdd({ date, time }), []);
  const handleMonthDayClick = useCallback((day: Date) => { setCurrentDate(day); setViewMode('day'); }, []);

  return (
    <div className="h-full flex flex-col p-3 lg:p-6">
      {/* Quick-Add Modal */}
      {quickAdd && (
        <QuickAddModal date={quickAdd.date} time={quickAdd.time} onClose={() => setQuickAdd(null)} userId={user?.uid || 'demo-user'} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-3 lg:mb-5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg lg:text-xl font-semibold tracking-tight truncate">{headerLabel}</h1>
          {isSyncRunning() && lastSync > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 shrink-0">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>Synced</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View switcher */}
          <div className="flex items-center bg-muted/40 rounded-lg border border-border/40 p-0.5">
            {([
              { mode: 'month' as ViewMode, icon: LayoutGrid, label: 'Month' },
              { mode: 'week' as ViewMode, icon: CalendarRange, label: 'Week' },
              { mode: 'day' as ViewMode, icon: CalendarDays, label: 'Day' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all', viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/60 hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg border border-border/40 p-0.5">
            <button onClick={goPrev} className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-background transition-all"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={goToday} className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-background transition-all">{t('common.today')}</button>
            <button onClick={goNext} className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-background transition-all"><ChevronRight className="h-4 w-4" /></button>
          </div>

          {/* Google Import */}
          <button onClick={handleImportFromGoogle} disabled={importing} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all flex items-center gap-1.5', 'bg-foreground/[0.06] hover:bg-foreground/[0.1] text-muted-foreground/70 hover:text-foreground', 'border border-border/40', importing && 'opacity-50 cursor-not-allowed')}>
            <RefreshCw className={cn('h-3 w-3', importing && 'animate-spin')} />
            <span className="hidden sm:inline">{importing ? t('calendar.importing') : t('calendar.importFromGoogle')}</span>
          </button>

          {/* Quick add */}
          <button onClick={() => setQuickAdd({ date: new Date() })} className="rounded-lg px-3 py-1.5 text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-all flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('common.create') || 'New'}</span>
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
        <div className="flex-1 min-h-0">
          <div className="h-full rounded-xl lg:rounded-2xl border border-border/60 overflow-hidden bg-card shadow-sm flex flex-col">
            {/* Day headers */}
            <div className={cn('grid border-b border-border/50 bg-muted/20 flex-shrink-0', showWeekNumbers ? 'grid-cols-8' : 'grid-cols-7')}>
              {showWeekNumbers && (
                <div className="px-1 py-2.5 text-center text-[9px] lg:text-[10px] font-medium uppercase tracking-wider text-muted-foreground/30">{t('calendar.wk')}</div>
              )}
              {Array.from({ length: 7 }, (_, i) => {
                const dayDate = addDays(calendarStart, i);
                return (
                  <div key={i} className="px-1 py-2.5 text-center text-[9px] lg:text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
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

                  const weekNumCell = showWeekNumbers && col === 0 ? (
                    <div key={`wk-${idx}`} className="flex items-start justify-center pt-2.5 border-b border-r border-border/20 text-[10px] text-muted-foreground/25 tabular-nums font-medium">
                      {getISOWeek(day)}
                    </div>
                  ) : null;

                  return (
                    <React.Fragment key={day.toISOString()}>
                      {weekNumCell}
                      <button onClick={() => handleMonthDayClick(day)} className={cn('relative border-b border-r border-border/20 p-1 lg:p-1.5 transition-all text-left group overflow-hidden', 'hover:bg-foreground/[0.015] active:bg-foreground/[0.03]', !isCurrentMonth && 'opacity-35', isTodayDate && 'bg-blue-500/[0.04]')}>
                        <div className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors', isTodayDate ? 'bg-blue-500 text-white font-semibold' : 'text-muted-foreground/50 group-hover:text-foreground')}>
                          {format(day, 'd')}
                        </div>
                        {lanesInRow > 0 && <div style={{ height: lanesInRow * 18 }} />}
                        <div className="hidden lg:block space-y-0.5 mt-0.5">
                          {singleDayItems.slice(0, maxVisible).map((item) => {
                            const color = getEventColor(item);
                            return (
                              <div key={item.id} onClick={(e) => { e.stopPropagation(); setSelectedItemId(item.id); }} className={cn('w-full truncate rounded px-1 py-px text-[10px] font-medium cursor-pointer transition-colors', color.bg, color.text, 'hover:opacity-80')} title={item.title}>
                                {item.startTime && <span className="mr-0.5 text-[9px] opacity-60">{item.startTime}</span>}
                                {item.title}
                              </div>
                            );
                          })}
                          {singleDayItems.length > maxVisible && <span className="text-[9px] text-muted-foreground/35 px-1">+{singleDayItems.length - maxVisible}</span>}
                        </div>
                        <div className="lg:hidden absolute top-1 right-1 flex gap-0.5">
                          {dayItems.slice(0, 3).map((item, i) => (<div key={item.id || i} className={cn('h-1.5 w-1.5 rounded-full', getEventColor(item).accent)} />))}
                          {dayItems.length > 3 && <span className="text-[7px] text-muted-foreground/30 ml-0.5">+{dayItems.length - 3}</span>}
                        </div>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Multi-day bars */}
              <div className="hidden lg:grid absolute inset-0 pointer-events-none" style={{ gridTemplateColumns: showWeekNumbers ? '1fr repeat(7, 1fr)' : 'repeat(7, 1fr)', gridTemplateRows: `repeat(${totalRows}, 1fr)` }}>
                {showWeekNumbers && Array.from({ length: totalRows }, (_, r) => (<div key={`s-${r}`} style={{ gridRow: r + 1, gridColumn: 1 }} />))}
                {multiDayLayout.map((seg, i) => {
                  const color = getEventColor(seg.item);
                  const colOff = showWeekNumbers ? 2 : 1;
                  return (
                    <div key={`${seg.item.id}-${i}`} className="pointer-events-auto cursor-pointer px-0.5" style={{ gridRow: seg.row + 1, gridColumn: `${seg.col + colOff} / span ${seg.span}`, alignSelf: 'start', marginTop: `${26 + seg.lane * 18}px` }} onClick={() => setSelectedItemId(seg.item.id)}>
                      <div className={cn('h-[16px] px-1.5 text-[9px] font-semibold leading-[16px] truncate transition-all hover:opacity-80', color.accent, 'text-white', seg.isStart && seg.isEnd && 'rounded', seg.isStart && !seg.isEnd && 'rounded-l', !seg.isStart && seg.isEnd && 'rounded-r', !seg.isStart && !seg.isEnd && 'rounded-none')} title={seg.item.title}>
                        {seg.isStart ? seg.item.title : `↳ ${seg.item.title}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile: Today list */}
          <div className="lg:hidden mt-3 space-y-2">
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/40 px-1">{t('common.today')}</h2>
            <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/20">
              {(() => {
                const todayItems = getItemsForDate(new Date()).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
                if (todayItems.length === 0) return <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/30">{t('calendar.noEventsOrTasks')}</p>;
                return todayItems.map((item) => {
                  const color = getEventColor(item);
                  return (
                    <button key={item.id} onClick={() => setSelectedItemId(item.id)} className="flex items-center gap-3 w-full px-3 py-2.5 text-left active:bg-foreground/[0.03] transition-colors">
                      <div className={cn('w-1 h-8 rounded-full shrink-0', color.accent)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium truncate block">{item.title}</span>
                        {item.startTime && <span className="text-[11px] text-muted-foreground/40">{item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}</span>}
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
  );
}