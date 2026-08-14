'use client';

import { useState, type ComponentType } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export interface BulkAction {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Ask before running — for anything the user cannot undo. */
  confirm?: string;
  destructive?: boolean;
  run: (ids: string[]) => Promise<void>;
}

interface BulkActionBarProps {
  count: number;
  allSelected: boolean;
  selectedIds: string[];
  actions: BulkAction[];
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
}

/** The action bar for a multi-select, shown while rows are selected. */
export function BulkActionBar({
  count,
  allSelected,
  selectedIds,
  actions,
  onSelectAll,
  onClear,
  onDone,
}: BulkActionBarProps) {
  const { t } = useTranslation();
  const [running, setRunning] = useState<string | null>(null);
  const [pending, setPending] = useState<BulkAction | null>(null);

  const perform = async (action: BulkAction) => {
    setRunning(action.key);
    try {
      await action.run(selectedIds);
      onClear();
    } finally {
      setRunning(null);
      setPending(null);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label={t('bulk.toolbar')}
      className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-sm lg:mx-0 lg:rounded-xl lg:border"
    >
      <span aria-live="polite" className="text-[12px] font-medium tabular-nums">
        {t('bulk.selected', { count })}
      </span>

      <button
        type="button"
        onClick={allSelected ? onClear : onSelectAll}
        className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        {allSelected ? t('bulk.clear') : t('bulk.selectAll')}
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {actions.map((action) => {
          const Icon = action.icon;
          const busy = running === action.key;
          const armed = pending?.key === action.key;
          return (
            <button
              key={action.key}
              type="button"
              disabled={count === 0 || running !== null}
              aria-busy={busy}
              onClick={() => {
                if (action.confirm && !armed) {
                  setPending(action);
                  return;
                }
                void perform(action);
              }}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40',
                armed
                  ? 'bg-destructive text-white'
                  : action.destructive
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'bg-foreground/[0.05] hover:bg-foreground/[0.1]'
              )}
            >
              <Icon className="h-3 w-3" />
              {armed ? action.confirm : action.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onDone}
          aria-label={t('bulk.exit')}
          className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
