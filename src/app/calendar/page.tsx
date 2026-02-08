'use client';

import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  isSameDay,
  differenceInDays,
  parseISO,
} from 'date-fns';
import { 
  fetchGoogleEvents, 
  hasCalendarPermission, 
  requestCalendarPermission 
} from '@/lib/google-calendar';
import { 
  syncGoogleCalendar, 
  getLastSyncTime, 
  isSyncRunning 
} from '@/lib/google-calendar-sync';
import { createItem } from '@/lib/firestore';
import type { OrbitItem } from '@/lib/types';

type ViewMode = 'month' | 'day';

export default function CalendarPage() {
  const { user } = useAuth();
  const { items, setSelectedItemId } = useOrbitStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [importing, setImporting] = useState(false);
  const [lastSync, setLastSync] = useState<number>(0);

  // Update last sync time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLastSync(getLastSyncTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [calendarStart, calendarEnd]);

  const getItemsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return items.filter(
      (i) =>
        i.status !== 'archived' &&
        ((i.type === 'event' && (
          // Show event if date is on startDate OR between startDate and endDate
          i.startDate === dateStr ||
          (i.startDate && i.endDate && i.startDate <= dateStr && dateStr <= i.endDate)
        )) ||
          (i.type === 'task' && i.dueDate === dateStr))
    );
  };

  // Get multi-day events for rendering as bars
  const getMultiDayEvents = () => {
    const events: Array<{
      item: OrbitItem;
      startDate: Date;
      endDate: Date;
      daysSpan: number;
    }> = [];

    items
      .filter(i => i.type === 'event' && i.status !== 'archived' && i.startDate)
      .forEach(item => {
        const start = parseISO(item.startDate + 'T12:00:00');
        const end = item.endDate ? parseISO(item.endDate + 'T12:00:00') : start;
        const daysSpan = differenceInDays(end, start) + 1;

        // Only include events visible in current month view
        if (start <= calendarEnd && end >= calendarStart) {
          events.push({
            item,
            startDate: start,
            endDate: end,
            daysSpan,
          });
        }
      });

    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  };

  const multiDayEvents = useMemo(() => getMultiDayEvents(), [items, calendarStart, calendarEnd]);

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    setViewMode('day');
  };

  const handleBackToMonth = () => {
    setViewMode('month');
    setSelectedDay(null);
  };

  const handleImportFromGoogle = async () => {
    if (!user) return;
    setImporting(true);
    try {
      if (!hasCalendarPermission()) {
        await requestCalendarPermission();
      }

      const timeMin = monthStart.toISOString();
      const timeMax = monthEnd.toISOString();
      
      const googleEvents = await fetchGoogleEvents(timeMin, timeMax);
      
      // Import events that don't already exist
      let importedCount = 0;
      for (const gcalEvent of googleEvents) {
        const eventData: any = gcalEvent;
        // Check if already imported
        const alreadyExists = items.some(
          i => i.googleCalendarId === eventData.id
        );
        if (!alreadyExists && eventData.id) {
          // Convert and import
          const startDate = eventData.start?.date || eventData.start?.dateTime?.split('T')[0];
          const endDate = eventData.end?.date || eventData.end?.dateTime?.split('T')[0];
          const startTime = eventData.start?.dateTime?.split('T')[1]?.substring(0, 5);
          const endTime = eventData.end?.dateTime?.split('T')[1]?.substring(0, 5);

          const newEvent: any = {
            type: 'event',
            title: eventData.summary || 'Untitled Event',
            status: 'active',
            googleCalendarId: eventData.id,
            calendarSynced: true,
            userId: user.uid,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          // Only add fields if they have values
          if (eventData.description) newEvent.content = eventData.description;
          if (startDate) newEvent.startDate = startDate;
          if (endDate) newEvent.endDate = endDate;
          if (startTime) newEvent.startTime = startTime;
          if (endTime) newEvent.endTime = endTime;

          await createItem(newEvent);
          importedCount++;
        }
      }
      
      console.log(`[ORBIT] Imported ${importedCount} events from Google Calendar`);
      alert(`Imported ${importedCount} event(s) from Google Calendar`);
    } catch (err) {
      console.error('[ORBIT] Import failed:', err);
      alert('Failed to import from Google Calendar. Check console for details.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 lg:p-6">
      {/* Header */}
      <div className="space-y-3 lg:space-y-0 lg:flex lg:items-center lg:justify-between mb-4 lg:mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          {viewMode === 'day' && (
            <button
              onClick={handleBackToMonth}
              className="rounded-xl lg:rounded-lg p-2 lg:p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
            >
              <ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl lg:text-[22px] font-semibold tracking-tight">
              {viewMode === 'day' && selectedDay
                ? format(selectedDay, 'EEEE, MMMM d, yyyy')
                : 'Calendar'}
            </h1>
            {isSyncRunning() && lastSync > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>
                  Synced {Math.floor((Date.now() - lastSync) / 1000)}s ago
                </span>
              </div>
            )}
          </div>
        </div>
        
        {viewMode === 'month' && (
          <div className="flex items-center justify-between lg:gap-3">
            <button
              onClick={handleImportFromGoogle}
              disabled={importing}
              className={cn(
                'rounded-xl lg:rounded-lg px-3 py-2 lg:px-3.5 lg:py-2 text-[12px] font-medium transition-all flex items-center gap-2',
                'bg-foreground/[0.06] hover:bg-foreground/[0.1] text-foreground',
                'border border-border/40',
                importing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('h-3 w-3 lg:h-3.5 lg:w-3.5', importing && 'animate-spin')} />
              <span className="hidden sm:inline">{importing ? 'Importing...' : 'Import from Google'}</span>
              <span className="sm:hidden">{importing ? '...' : 'Import'}</span>
            </button>
            <div className="flex items-center gap-1 lg:gap-2 bg-muted/40 rounded-xl lg:rounded-lg border border-border/40 p-1">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="rounded-lg lg:rounded-md p-2 lg:p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-background transition-all"
              >
                <ChevronLeft className="h-5 w-5 lg:h-4 lg:w-4" />
              </button>
              <button
                onClick={() => setCurrentMonth(new Date())}
                className="rounded-lg lg:rounded-md px-2 py-1 lg:px-3 lg:py-1.5 text-[12px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-background transition-all"
              >
                Today
              </button>
              <span className="text-[13px] lg:text-[14px] font-semibold min-w-[120px] lg:min-w-[140px] text-center tabular-nums">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="rounded-lg lg:rounded-md p-2 lg:p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-background transition-all"
              >
                <ChevronRight className="h-5 w-5 lg:h-4 lg:w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="flex-1 min-h-0">
          <div className="h-full rounded-xl lg:rounded-2xl border border-border/60 overflow-hidden bg-card shadow-sm flex flex-col">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border/50 bg-muted/40 flex-shrink-0">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="px-1 lg:px-2 py-3 text-center text-[9px] lg:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <span className="lg:hidden">{d.charAt(0)}</span>
                  <span className="hidden lg:inline">{d}</span>
                </div>
              ))}
            </div>

            {/* Calendar grid + multi-day overlay wrapper */}
            <div className="relative flex-1">
              <div className="grid grid-cols-7 h-full">{calendarDays.map((day) => {
                  const dayItems = getItemsForDate(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isTodayDate = isToday(day);
                  const tasks = dayItems.filter(i => i.type === 'task');
                  const singleDayEvents = dayItems.filter(i =>
                    i.type === 'event' &&
                    (!i.endDate || i.endDate === i.startDate)
                  );

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        'relative min-h-[70px] lg:min-h-[100px] xl:min-h-[120px] border-b border-r border-border/30 p-2 lg:p-2.5 transition-all text-left group',
                        'hover:bg-foreground/[0.02] active:bg-foreground/[0.04]',
                        !isCurrentMonth && 'opacity-40',
                        isTodayDate && 'bg-blue-500/[0.04] hover:bg-blue-500/[0.06]'
                      )}
                    >
                      <div
                        className={cn(
                          'inline-flex h-7 w-7 lg:h-6 lg:w-6 items-center justify-center rounded-full text-[12px] lg:text-[11px] font-medium mb-1 tabular-nums transition-colors',
                          isTodayDate
                            ? 'bg-blue-500 text-white font-semibold'
                            : 'text-muted-foreground/60 group-hover:text-foreground'
                        )}
                      >
                        {format(day, 'd')}
                      </div>

                      {/* Mobile: dots indicator */}
                      <div className="lg:hidden absolute top-1.5 right-1.5 flex gap-0.5">
                        {dayItems.length > 0 && (
                          <div className="flex items-center gap-0.5">
                            {dayItems.slice(0, 3).map((item, i) => (
                              <div
                                key={item.id || i}
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  item.type === 'event' ? 'bg-blue-500' : 'bg-amber-500'
                                )}
                              />
                            ))}
                            {dayItems.length > 3 && (
                              <span className="text-[8px] text-muted-foreground/40 ml-0.5">
                                +{dayItems.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Desktop: show items */}
                      <div className="hidden lg:block space-y-1">
                        {singleDayEvents.slice(0, 2).map((item) => (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItemId(item.id);
                            }}
                            className={cn(
                              'w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
                              'bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
                            )}
                          >
                            {item.startTime && (
                              <span className="mr-1 text-[9px] opacity-60">{item.startTime}</span>
                            )}
                            {item.title}
                          </div>
                        ))}
                        {tasks.slice(0, 2 - singleDayEvents.length).map((item) => (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItemId(item.id);
                            }}
                            className={cn(
                              'w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
                              'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                            )}
                          >
                            {item.title}
                          </div>
                        ))}
                        {dayItems.length > 2 && (
                          <span className="text-[9px] text-muted-foreground/40 px-1">
                            +{dayItems.length - 2} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Multi-day events overlay — absolutely positioned over the grid */}
              {(() => {
                const totalRows = Math.ceil(calendarDays.length / 7);
                return (
                  <div
                    className="hidden lg:grid absolute inset-0 pointer-events-none"
                    style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${totalRows}, 1fr)` }}
                  >
                    {multiDayEvents
                      .filter(({ daysSpan }) => daysSpan > 1)
                      .flatMap(({ item, startDate, endDate, daysSpan }) => {
                        const startIndex = calendarDays.findIndex(d => isSameDay(d, startDate));
                        if (startIndex === -1) return [];

                        // Generate segments for each row the event spans
                        const segments: Array<{ row: number; col: number; span: number; isStart: boolean; isEnd: boolean }> = [];
                        let remaining = daysSpan;
                        let currentRow = Math.floor(startIndex / 7);
                        let currentCol = startIndex % 7;

                        while (remaining > 0 && currentRow < totalRows) {
                          const spanInRow = Math.min(remaining, 7 - currentCol);
                          segments.push({
                            row: currentRow,
                            col: currentCol,
                            span: spanInRow,
                            isStart: segments.length === 0,
                            isEnd: remaining - spanInRow <= 0,
                          });
                          remaining -= spanInRow;
                          currentRow++;
                          currentCol = 0;
                        }

                        return segments.map((seg, segIdx) => (
                          <div
                            key={`${item.id}-seg-${segIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItemId(item.id);
                            }}
                            className="pointer-events-auto cursor-pointer pt-8 px-0.5"
                            style={{
                              gridRow: seg.row + 1,
                              gridColumn: `${seg.col + 1} / span ${seg.span}`,
                            }}
                          >
                            <div className={cn(
                              'px-2 py-1 text-[10px] font-medium bg-purple-500/90 text-white hover:bg-purple-600 transition-colors shadow-sm border border-purple-400/20',
                              seg.isStart && seg.isEnd && 'rounded-md',
                              seg.isStart && !seg.isEnd && 'rounded-l-md rounded-r-none',
                              !seg.isStart && seg.isEnd && 'rounded-r-md rounded-l-none',
                              !seg.isStart && !seg.isEnd && 'rounded-none',
                            )}>
                              <div className="truncate">
                                {seg.isStart ? item.title : `↳ ${item.title}`}
                              </div>
                              {seg.isStart && (
                                <div className="text-[9px] opacity-80">
                                  {format(startDate, 'd')}–{format(endDate, 'd')} {format(startDate, 'MMM')}
                                </div>
                              )}
                            </div>
                          </div>
                        ));
                      })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Mobile: Event list */}
          <div className="lg:hidden space-y-2">
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50 px-1">
              Events this month
            </h2>
            <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/30">
              {(() => {
                const monthEvents = items
                  .filter(
                    (i) =>
                      i.status !== 'archived' &&
                      i.type === 'event' &&
                      i.startDate &&
                      i.startDate >= format(monthStart, 'yyyy-MM-dd') &&
                      i.startDate <= format(monthEnd, 'yyyy-MM-dd')
                  )
                  .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

                if (monthEvents.length === 0) {
                  return (
                    <p className="px-4 py-6 text-center text-[12px] text-muted-foreground/40">
                      No events this month
                    </p>
                  );
                }

                return monthEvents.map((event) => {
                  const start = event.startDate ? parseISO(event.startDate + 'T12:00:00') : null;
                  const end = event.endDate ? parseISO(event.endDate + 'T12:00:00') : start;
                  const isMultiDay = event.endDate && event.endDate !== event.startDate;

                  return (
                    <button
                      key={event.id}
                      onClick={() => setSelectedItemId(event.id)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors"
                    >
                      <div className="flex flex-col items-center shrink-0 min-w-[48px]">
                        {isMultiDay && start && end ? (
                          <>
                            <span className="text-[10px] text-muted-foreground/40 uppercase">
                              {format(start, 'EEE')}
                            </span>
                            <span className="text-[14px] font-semibold tabular-nums">
                              {format(start, 'd')}–{format(end, 'd')}
                            </span>
                          </>
                        ) : start ? (
                          <>
                            <span className="text-[10px] text-muted-foreground/40 uppercase">
                              {format(start, 'EEE')}
                            </span>
                            <span className="text-[16px] font-semibold tabular-nums">
                              {format(start, 'd')}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <div className="h-8 w-px bg-foreground/10 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-medium truncate block">{event.title}</span>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                          {event.startTime && (
                            <span>
                              {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
                            </span>
                          )}
                          {isMultiDay && (
                            <span className="text-purple-500 dark:text-purple-400 font-medium">
                              Multi-day
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Day View */}
      {viewMode === 'day' && selectedDay && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-4">
          {/* Day summary */}
          <div className="rounded-xl lg:rounded-2xl border border-border/60 bg-card p-4 lg:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[12px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  {isToday(selectedDay) ? 'Today' : format(selectedDay, 'EEEE')}
                </h3>
                <p className="text-[20px] lg:text-2xl font-bold mt-1">{format(selectedDay, 'MMMM d, yyyy')}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-muted-foreground/60">
                  {getItemsForDate(selectedDay).length} item{getItemsForDate(selectedDay).length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Day items */}
          <div className="space-y-3">
            {(() => {
              const dayItems = getItemsForDate(selectedDay);
              const events = dayItems.filter(i => i.type === 'event');
              const tasks = dayItems.filter(i => i.type === 'task');

              if (dayItems.length === 0) {
                return (
                  <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
                    <p className="text-muted-foreground/40">No events or tasks for this day</p>
                  </div>
                );
              }

              return (
                <>
                  {events.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50 px-1 mb-2">
                        Events · {events.length}
                      </h3>
                      <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/30">
                        {events.map(event => {
                          const isMultiDay = event.endDate && event.endDate !== event.startDate;
                          return (
                            <button
                              key={event.id}
                              onClick={() => setSelectedItemId(event.id)}
                              className="w-full px-4 py-3 text-left hover:bg-foreground/[0.02] active:bg-foreground/[0.04] transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "shrink-0 w-1 h-full rounded-full",
                                  isMultiDay ? "bg-purple-500" : "bg-blue-500"
                                )} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[15px] font-semibold">{event.title}</p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[12px] text-muted-foreground/60">
                                    {event.startTime && (
                                      <span className="font-medium">
                                        {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
                                      </span>
                                    )}
                                    {isMultiDay && event.startDate && event.endDate && (
                                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-medium">
                                        {format(parseISO(event.startDate + 'T12:00:00'), 'MMM d')} – {format(parseISO(event.endDate + 'T12:00:00'), 'MMM d')}
                                      </span>
                                    )}
                                  </div>
                                  {event.content && (
                                    <p className="text-[13px] text-muted-foreground/50 mt-2 line-clamp-2">
                                      {event.content}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50 px-1 mb-2">
                        Tasks · {tasks.length}
                      </h3>
                      <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/30">
                        {tasks.map(task => (
                          <button
                            key={task.id}
                            onClick={() => setSelectedItemId(task.id)}
                            className="w-full px-4 py-3 text-left hover:bg-foreground/[0.02] active:bg-foreground/[0.04] transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="shrink-0 w-1 h-full rounded-full bg-amber-500" />
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-[15px] font-semibold",
                                  task.status === 'done' && "line-through text-muted-foreground/40"
                                )}>{task.title}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-[12px] text-muted-foreground/60">
                                  <span className="capitalize">{task.status}</span>
                                  {task.priority && (
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-md text-[11px] font-medium",
                                      task.priority === 'high' && "bg-red-500/10 text-red-600 dark:text-red-400",
                                      task.priority === 'medium' && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                      task.priority === 'low' && "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    )}>
                                      {task.priority}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}