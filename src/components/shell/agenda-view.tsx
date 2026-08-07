'use client';

import { useMemo } from 'react';
import { addDays, format, isSameDay, isToday, startOfDay } from 'date-fns';
import type { Locale } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { eventOccursOnDate } from '@/lib/dashboard';
import { formatHabitTime } from '@/lib/habit-reminders';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import type { OrbitItem } from '@/lib/types';

interface AgendaViewProps {
  items: OrbitItem[];
  start: Date;
  /** How many days forward to list. */
  days: number;
  is24h: boolean;
  locale: Locale;
  onItemClick: (id: string) => void;
}

/**
 * A list of what is next.
 *
 * The calendar had month, week and day grids only — no way to scan forward
 * without stepping through a grid a screen at a time.
 */
export function AgendaView({ items, start, days, is24h, locale, onItemClick }: AgendaViewProps) {
  const { t } = useTranslation();

  const sections = useMemo(() => {
    const from = startOfDay(start);
    return Array.from({ length: days }, (_, offset) => addDays(from, offset))
      .map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayItems = items
          .filter((item) => item.status !== 'archived' && (
            (item.type === 'event' && eventOccursOnDate(item, dateKey))
            || (item.type === 'task' && item.dueDate === dateKey)
          ))
          .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
        return { day, dateKey, items: dayItems };
      })
      .filter((section) => section.items.length > 0);
  }, [days, items, start]);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/40 bg-card py-20 text-center">
        <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/20" strokeWidth={1} />
        <p className="text-[13px] text-muted-foreground/50">{t('calendar.agendaEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto rounded-2xl border border-border/40 bg-card p-4">
      {sections.map((section) => (
        <section key={section.dateKey} aria-label={format(section.day, 'PPPP', { locale })}>
          <h3
            className={cn(
              'mb-1.5 text-[11px] font-semibold uppercase tracking-wider',
              isToday(section.day) ? 'text-foreground' : 'text-muted-foreground/45'
            )}
          >
            {isToday(section.day)
              ? `${t('common.today')} · ${format(section.day, 'd MMM', { locale })}`
              : format(section.day, 'EEEE d MMM', { locale })}
          </h3>
          <ul className="space-y-px">
            {section.items.map((item) => (
              <li key={`${section.dateKey}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => onItemClick(item.id)}
                  className="flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="w-14 shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
                    {item.startTime
                      ? formatHabitTime(item.startTime, is24h) ?? item.startTime
                      : t('calendar.allDay')}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13px]',
                      item.status === 'done' && 'text-muted-foreground/50 line-through'
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/35">
                    {t(`type.${item.type}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Days an agenda covers from its start date. */
export const AGENDA_DAYS = 30;

export function isAgendaStart(day: Date, other: Date): boolean {
  return isSameDay(day, other);
}
