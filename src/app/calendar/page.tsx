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
    <div className="p-4 lg:p-8 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportFromGoogle}
            disabled={importing}
            className={cn(
              'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors flex items-center gap-1.5',
              'bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.1]',
              importing && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('h-3 w-3', importing && 'animate-spin')} />
            {importing ? 'Importing...' : 'Import from Google'}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
            >
              Today
            </button>
            <span className="text-[13px] font-semibold min-w-[130px] text-center tabular-nums">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/40">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const dayItems = getItemsForDate(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-[80px] lg:min-h-[100px] border-b border-r border-border/30 p-1.5 transition-colors',
                  !isCurrentMonth && 'opacity-30',
                  isTodayDate && 'bg-foreground/[0.02]'
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium mb-1 tabular-nums',
                    isTodayDate
                      ? 'bg-foreground text-background text-[10px] font-semibold'
                      : 'text-muted-foreground/60'
                  )}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
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
    </div>
  );
}
