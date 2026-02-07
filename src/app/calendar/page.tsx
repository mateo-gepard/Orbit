'use client';

import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
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

export default function CalendarPage() {
  const { user } = useAuth();
  const { items, setSelectedItemId } = useOrbitStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
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
        ((i.type === 'event' && i.startDate === dateStr) ||
          (i.type === 'task' && i.dueDate === dateStr))
    );
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
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-5 max-w-5xl mx-auto">
      {/* Header — responsive layout */}
      <div className="space-y-3 lg:space-y-0 lg:flex lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          {isSyncRunning() && lastSync > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>
                Synced {Math.floor((Date.now() - lastSync) / 1000)}s ago
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between lg:gap-2">
          <button
            onClick={handleImportFromGoogle}
            disabled={importing}
            className={cn(
              'rounded-xl lg:rounded-md px-3 py-2 lg:py-1.5 text-[12px] font-medium transition-colors flex items-center gap-1.5',
              'bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.1] active:scale-95 transition-transform',
              importing && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('h-3 w-3', importing && 'animate-spin')} />
            <span className="hidden sm:inline">{importing ? 'Importing...' : 'Import from Google'}</span>
            <span className="sm:hidden">{importing ? '...' : 'Import'}</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="rounded-xl lg:rounded-md p-2 lg:p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors active:scale-90"
            >
              <ChevronLeft className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="rounded-xl lg:rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
            >
              Today
            </button>
            <span className="text-[13px] font-semibold min-w-[120px] lg:min-w-[130px] text-center tabular-nums">
              {format(currentMonth, 'MMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="rounded-xl lg:rounded-md p-2 lg:p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors active:scale-90"
            >
              <ChevronRight className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid — compact on mobile */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/40">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-1 lg:px-2 py-2 text-center text-[9px] lg:text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
              <span className="lg:hidden">{d.charAt(0)}</span>
              <span className="hidden lg:inline">{d}</span>
            </div>
          ))}
        </div>

        {/* Cells — taller on desktop, compact on mobile */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const dayItems = getItemsForDate(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-[52px] lg:min-h-[100px] border-b border-r border-border/30 p-1 lg:p-1.5 transition-colors',
                  !isCurrentMonth && 'opacity-30',
                  isTodayDate && 'bg-foreground/[0.02]'
                )}
              >
                <div
                  className={cn(
                    'flex h-6 w-6 lg:h-5 lg:w-5 items-center justify-center rounded-full text-[11px] font-medium mb-0.5 lg:mb-1 tabular-nums mx-auto lg:mx-0',
                    isTodayDate
                      ? 'bg-foreground text-background text-[10px] font-semibold'
                      : 'text-muted-foreground/60'
                  )}
                >
                  {format(day, 'd')}
                </div>
                {/* Mobile: just show dots */}
                <div className="flex gap-0.5 justify-center lg:hidden">
                  {dayItems.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        item.type === 'event' ? 'bg-foreground/30' : 'bg-foreground/15'
                      )}
                    />
                  ))}
                </div>
                {/* Desktop: show event names */}
                <div className="hidden lg:block space-y-0.5">
                  {dayItems.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={cn(
                        'w-full truncate rounded-md px-1 py-0.5 text-left text-[10px] font-medium transition-colors',
                        item.type === 'event'
                          ? 'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.1]'
                          : 'bg-foreground/[0.03] text-foreground/50 hover:bg-foreground/[0.06]'
                      )}
                    >
                      {item.startTime && (
                        <span className="mr-0.5 text-muted-foreground/40">{item.startTime}</span>
                      )}
                      {item.title}
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[9px] text-muted-foreground/30 px-1">
                      +{dayItems.length - 3}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: Event list for current month */}
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

            return monthEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedItemId(event.id)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-foreground/[0.03] transition-colors"
              >
                <div className="flex flex-col items-center shrink-0 w-10">
                  <span className="text-[10px] text-muted-foreground/40 uppercase">
                    {event.startDate ? format(new Date(event.startDate + 'T12:00:00'), 'EEE') : ''}
                  </span>
                  <span className="text-[16px] font-semibold tabular-nums">
                    {event.startDate ? format(new Date(event.startDate + 'T12:00:00'), 'd') : ''}
                  </span>
                </div>
                <div className="h-8 w-px bg-foreground/10 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-medium truncate block">{event.title}</span>
                  {event.startTime && (
                    <span className="text-[11px] text-muted-foreground/50">
                      {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
                    </span>
                  )}
                </div>
              </button>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}