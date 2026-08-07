'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  clearToolConflicts,
  exportToolConflicts,
  listToolConflicts,
  removeToolConflict,
  TOOL_CONFLICT_LIMIT,
  type ToolConflictRecovery,
} from '@/lib/tool-conflict-recovery';
import { saveToolData } from '@/lib/firestore';
import { useTranslation } from '@/lib/i18n';
import { getLocale } from '@/lib/utils';

interface ConflictRecoveryPanelProps {
  userId: string | null;
  onDownload: (data: unknown, filename: string) => void;
}

/**
 * The other half of tool conflict recovery.
 *
 * `preserveToolConflict` wrote records that nothing in the app could read,
 * resolve or delete — while the conflict toast told the user their browser
 * copy "was preserved" and that they could "reload to choose which version to
 * keep". There was no such path. Records piled up until the cap, at which
 * point preserving threw. This is the screen those promises referred to.
 */
export function ConflictRecoveryPanel({ userId, onDownload }: ConflictRecoveryPanelProps) {
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const [conflicts, setConflicts] = useState<ToolConflictRecovery[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!userId) {
      setConflicts([]);
      return;
    }
    try {
      setConflicts(listToolConflicts(userId));
    } catch {
      setConflicts([]);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    // A conflict raised while this screen is open should appear on it.
    const onConflict = () => refresh();
    window.addEventListener('threadmap:sync-conflict', onConflict);
    return () => window.removeEventListener('threadmap:sync-conflict', onConflict);
  }, [refresh]);

  if (!userId || conflicts.length === 0) return null;

  const keepLocal = async (record: ToolConflictRecovery) => {
    setBusyId(record.id);
    try {
      await saveToolData(record.userId, record.toolId, record.localData);
      removeToolConflict(record.userId, record.id);
      toast.success(t('conflicts.keptLocal', { tool: record.toolId }));
      refresh();
    } catch {
      toast.error(t('conflicts.keepLocalError'));
    } finally {
      setBusyId(null);
    }
  };

  const discard = (record: ToolConflictRecovery) => {
    try {
      removeToolConflict(record.userId, record.id);
      toast.success(t('conflicts.discarded'));
      refresh();
    } catch {
      toast.error(t('conflicts.discardError'));
    }
  };

  const downloadAll = () => {
    onDownload(exportToolConflicts(userId), `threadmap-conflicts-${format(new Date(), 'yyyy-MM-dd')}.json`);
  };

  const discardAll = () => {
    const removed = clearToolConflicts(userId);
    toast.success(t('conflicts.discardedAll', { count: removed }));
    refresh();
  };

  const nearLimit = conflicts.length >= TOOL_CONFLICT_LIMIT - 5;

  return (
    <section className="mb-6" aria-labelledby="conflict-recovery-heading">
      <h3
        id="conflict-recovery-heading"
        className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-foreground/80"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
        {t('conflicts.title')}
      </h3>
      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground/70">
        {t('conflicts.description')}
      </p>

      {nearLimit && (
        <p role="alert" className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          {t('conflicts.nearLimit', { count: conflicts.length, limit: TOOL_CONFLICT_LIMIT })}
        </p>
      )}

      <ul className="divide-y divide-border/20 overflow-hidden rounded-2xl border border-border/40">
        {conflicts.map((record) => (
          <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground/85">{record.toolId}</p>
              <p className="text-[11px] text-muted-foreground/60">
                {format(new Date(record.createdAt), 'PPp', { locale })}
                {' · '}
                {t('conflicts.revisions', {
                  base: record.baseRevision ?? '—',
                  server: record.serverRevision,
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void keepLocal(record)}
                disabled={busyId === record.id}
                aria-busy={busyId === record.id}
                className="flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                <Upload className="h-3 w-3" aria-hidden="true" />
                {t('conflicts.keepLocal')}
              </button>
              <button
                type="button"
                onClick={() => onDownload(record, `threadmap-conflict-${record.toolId}-${record.id}.json`)}
                aria-label={t('conflicts.downloadOne', { tool: record.toolId })}
                className="rounded-lg border border-border/60 p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => discard(record)}
                aria-label={t('conflicts.discardOne', { tool: record.toolId })}
                className="rounded-lg border border-border/60 p-1.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={downloadAll}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted/50"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          {t('conflicts.downloadAll')}
        </button>
        <button
          type="button"
          onClick={discardAll}
          className="rounded-lg border border-border/60 px-3 py-1.5 text-[12px] font-medium text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          {t('conflicts.discardAll')}
        </button>
      </div>
    </section>
  );
}
