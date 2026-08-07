'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  Trash2,
  Archive,
  RotateCcw,
  Check,
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Target,
  LayoutList,
  Sparkles,
  FileText,
  MoreVertical,
  Network,
  Paperclip,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem, deleteItem, ItemRevisionConflictError } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';

import {
  requestCalendarPermission,
  hasCalendarPermission,
  prepareGoogleCalendarPermission,
} from '@/lib/google-calendar';
import {
  flushPendingGoogleCalendarEvents,
  startGoogleCalendarSync,
} from '@/lib/google-calendar-sync';
import { LinkManager } from '@/components/items/link-manager';
import { LinkGraph } from '@/components/items/link-graph';
import { ProjectDashboard } from './project-dashboard';
import { FileUpload } from '@/components/files/file-upload';
import { getItemRelationships } from '@/lib/links';
import type { OrbitItem, ItemType, ItemStatus, Priority, ChecklistItem, GoalTimeframe, HabitFrequency, NoteSubtype } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { calculateStreak, isHabitScheduledForDate } from '@/lib/habits';
import { cn, fullTimestampPattern, getLocale } from '@/lib/utils';
import { format, isPast, isToday, isValid, parseISO } from 'date-fns';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { VersionedSaveQueue } from '@/components/notes/versioned-save-queue';
import {
  calendarEventScheduleFromItem,
  validateCalendarEventSchedule,
  type CalendarEventSchedule,
  type CalendarEventScheduleError,
} from '@/lib/calendar-event';
import {
  clearItemDetailDraft,
  itemDetailDraftFromItem,
  readItemDetailDraft,
  writeItemDetailDraft,
  type DurableItemDetailDraft,
  type RecoveredItemDetailDraft,
} from './item-detail-draft';

const STATUS_OPTIONS: ItemStatus[] = ['active', 'waiting', 'done', 'archived'];
const ITEM_TYPE_KEYS: Record<ItemType, TranslationKey> = {
  task: 'type.task',
  project: 'type.project',
  habit: 'type.habit',
  event: 'type.event',
  goal: 'type.goal',
  note: 'type.note',
};
const TYPE_OPTIONS: ItemType[] = ['task', 'project', 'habit', 'event', 'goal', 'note'];
const PRIORITY_OPTIONS: Priority[] = ['low', 'medium', 'high'];
const TIMEFRAME_OPTIONS: GoalTimeframe[] = ['quarterly', 'yearly', 'longterm'];
const FREQUENCY_OPTIONS: HabitFrequency[] = ['daily', 'weekly', 'custom'];
const NOTE_SUBTYPE_OPTIONS: NoteSubtype[] = ['general', 'idea', 'principle', 'plan', 'journal'];

// Icon mapping for each item type
const TYPE_ICONS: Record<ItemType, typeof CheckCircle2> = {
  task: CheckCircle2,
  project: LayoutList,
  habit: Target,
  event: CalendarIcon,
  goal: Target,
  note: FileText,
};
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function detailCopy(english: string, german: string): string {
  return useSettingsStore.getState().settings.language === 'de' ? german : english;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase">
      {children}
    </span>
  );
}

type DetailSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

function BufferedTextFields({
  item,
  draft,
  disabled,
  saveState,
  onChange,
  onSave,
}: {
  item: OrbitItem;
  draft: DurableItemDetailDraft;
  disabled: boolean;
  saveState: DetailSaveState;
  onChange: (updates: Partial<DurableItemDetailDraft>) => void;
  onSave: () => Promise<boolean>;
}) {
  const { t } = useTranslation();

  return (
    <>
      {item.type === 'goal' && (
        <div>
          <FieldLabel>{t('detail.successMetric')}</FieldLabel>
          <Textarea
            aria-label={t('detail.successMetric')}
            value={draft.metric}
            disabled={disabled}
            onChange={(event) => onChange({ metric: event.target.value })}
            onBlur={() => void onSave()}
            className="mt-1.5 text-[13px] min-h-20 resize-none"
            placeholder={t('detail.metricPlaceholder')}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>{t('detail.notes')}</FieldLabel>
          <div aria-live="polite" className="text-[10px] text-muted-foreground/60">
            {saveState === 'pending' && t('notes.unsavedChanges')}
            {saveState === 'saving' && t('notes.saving')}
            {saveState === 'saved' && t('common.saved')}
            {saveState === 'error' && (
              <button
                type="button"
                onClick={() => void onSave()}
                className="rounded-md px-2 py-1 font-medium text-destructive hover:bg-destructive/10"
              >
                {t('notes.saveFailedRetry')}
              </button>
            )}
          </div>
        </div>
        <Textarea
          aria-label={t('detail.notes')}
          value={draft.content}
          disabled={disabled}
          onChange={(event) => onChange({ content: event.target.value })}
          onBlur={() => void onSave()}
          className="mt-1.5 text-[14px] min-h-32 resize-none leading-relaxed"
          placeholder={t('detail.notesPlaceholder')}
        />
      </div>
    </>
  );
}

function editableSchedule(item: OrbitItem): Required<CalendarEventSchedule> {
  return {
    startDate: item.startDate || '',
    endDate: item.endDate || '',
    startTime: item.startTime || '',
    endTime: item.endTime || '',
  };
}

function eventScheduleErrorMessage(error: CalendarEventScheduleError, german: boolean): string {
  if (error === 'missing-start-date' || error === 'invalid-start-date') {
    return german ? 'Ein gültiges Startdatum ist erforderlich.' : 'A valid start date is required.';
  }
  if (error === 'invalid-end-date') {
    return german ? 'Das Enddatum ist ungültig.' : 'The end date is invalid.';
  }
  if (error === 'incomplete-time-range') {
    return german
      ? 'Gib sowohl Start- als auch Endzeit ein oder lasse beide für einen ganztägigen Termin leer.'
      : 'Enter both start and end times, or leave both empty for an all-day event.';
  }
  if (error === 'invalid-start-time' || error === 'invalid-end-time') {
    return german ? 'Gib gültige Start- und Endzeiten ein.' : 'Enter valid start and end times.';
  }
  return german ? 'Das Ende muss nach dem Start liegen.' : 'The end must be after the start.';
}

function EventScheduleFields({
  item,
  draft,
  disabled,
  dirty,
  saving,
  saveFailed,
  onChange,
  onSave,
}: {
  item: OrbitItem;
  draft: DurableItemDetailDraft;
  disabled: boolean;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  onChange: (updates: Partial<DurableItemDetailDraft>) => void;
  onSave: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const german = useSettingsStore((state) => state.settings.language === 'de');
  const schedule = useMemo<Required<CalendarEventSchedule>>(() => ({
    startDate: draft.startDate,
    endDate: draft.endDate,
    startTime: draft.startTime,
    endTime: draft.endTime,
  }), [draft.endDate, draft.endTime, draft.startDate, draft.startTime]);
  const validation = useMemo(() => validateCalendarEventSchedule(schedule), [schedule]);

  const updateField = useCallback((field: keyof CalendarEventSchedule, value: string) => {
    onChange({ [field]: value });
  }, [onChange]);

  const reset = () => {
    onChange(editableSchedule(item));
  };

  const validationMessage = validation.valid
    ? null
    : eventScheduleErrorMessage(validation.error, german);

  return (
    <fieldset aria-busy={saving} className="space-y-2 rounded-xl border border-border/50 p-3">
      <legend className="px-1 text-[11px] font-semibold uppercase text-muted-foreground/60">
        {german ? 'Terminzeit' : 'Event schedule'}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>{t('detail.startDate')}</FieldLabel>
          <Input
            aria-label={t('detail.startDate')}
            type="date"
            value={schedule.startDate}
            disabled={disabled}
            onChange={(event) => updateField('startDate', event.target.value)}
            className="mt-1 h-9 text-[13px]"
          />
        </div>
        <div>
          <FieldLabel>{t('detail.startTime')}</FieldLabel>
          <Input
            aria-label={t('detail.startTime')}
            type="time"
            value={schedule.startTime}
            disabled={disabled}
            onChange={(event) => updateField('startTime', event.target.value)}
            className="mt-1 h-9 text-[13px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>{t('detail.endDate')}</FieldLabel>
          <Input
            aria-label={t('detail.endDate')}
            type="date"
            value={schedule.endDate}
            disabled={disabled}
            onChange={(event) => updateField('endDate', event.target.value)}
            className="mt-1 h-9 text-[13px]"
          />
        </div>
        <div>
          <FieldLabel>{t('detail.endTime')}</FieldLabel>
          <Input
            aria-label={t('detail.endTime')}
            type="time"
            value={schedule.endTime}
            disabled={disabled}
            onChange={(event) => updateField('endTime', event.target.value)}
            className="mt-1 h-9 text-[13px]"
          />
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground/60">
        {german
          ? 'Für ganztägige Termine beide Zeitfelder leer lassen. Das Enddatum ist bei eintägigen Terminen optional.'
          : 'Leave both time fields empty for an all-day event. End date is optional for a single-day event.'}
      </p>
      {(validationMessage || saveFailed) && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {validationMessage || (german
            ? 'Der Terminzeitraum konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.'
            : 'The event schedule could not be saved. Your changes are still here.')}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        {dirty && (
          <button
            type="button"
            onClick={reset}
            disabled={disabled || saving}
            className="min-h-9 rounded-lg px-3 text-[11px] font-medium text-muted-foreground hover:bg-foreground/[0.05] disabled:opacity-50"
          >
            {german ? 'Zurücksetzen' : 'Reset'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={disabled || !dirty || saving || !validation.valid}
          className="min-h-9 rounded-lg bg-foreground px-3 text-[11px] font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (german ? 'Speichern…' : 'Saving…') : t('common.save')}
        </button>
      </div>
    </fieldset>
  );
}

export function DetailPanel() {
  const selectedItemId = useOrbitStore((state) => state.selectedItemId);
  const selectedItem = useOrbitStore((state) => (
    selectedItemId ? state.items.find((item) => item.id === selectedItemId) : undefined
  ));

  if (!selectedItem) return null;
  if (selectedItem.type === 'project') return <ProjectDashboard />;

  return <DetailPanelForItem key={selectedItem.id} initialItem={selectedItem} />;
}

function DetailPanelForItem({ initialItem }: { initialItem: OrbitItem }) {
  const { setSelectedItemId, detailPanelOpen, setDetailPanelOpen, items, getAllTags, setCompletionAnimation } = useOrbitStore();
  const item = items.find((candidate) => candidate.id === initialItem.id) || initialItem;
  const { t } = useTranslation();
  const initialCloudDraftRef = useRef(itemDetailDraftFromItem(initialItem));
  const recoveryLoadedRef = useRef(false);
  const detailDraftBaseRef = useRef({
    revision: Number(initialItem.revision || 0),
    updatedAt: initialItem.updatedAt,
  });
  const [detailDraft, setDetailDraft] = useState(initialCloudDraftRef.current);
  const [conflictingDetailDraft, setConflictingDetailDraft] = useState<RecoveredItemDetailDraft | null>(null);
  const [detailSaveState, setDetailSaveState] = useState<DetailSaveState>('idle');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [calendarAuthorizationReady, setCalendarAuthorizationReady] = useState(false);
  const [calendarAuthorizationLoading, setCalendarAuthorizationLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<ItemType | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const detailMountedRef = useRef(false);
  const detailSaveQueueRef = useRef<VersionedSaveQueue<DurableItemDetailDraft> | null>(null);
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasPanelOpenRef = useRef(false);
  const settings = useSettingsStore((state) => state.settings);
  const german = settings.language === 'de';
  const dayLabels = german ? DAY_LABELS_DE : DAY_LABELS;
  const scheduledHabitDays = item?.customDays?.length
    ? item.customDays
    : item?.frequency === 'weekly'
      ? [0]
      : [];

  useEffect(() => {
    if (!optionsOpen || item?.type !== 'event' || hasCalendarPermission()) {
      if (hasCalendarPermission()) setCalendarAuthorizationReady(true);
      return;
    }
    let cancelled = false;
    setCalendarAuthorizationLoading(true);
    void prepareGoogleCalendarPermission()
      .then(() => {
        if (!cancelled) setCalendarAuthorizationReady(true);
      })
      .catch(() => {
        if (!cancelled) setCalendarAuthorizationReady(false);
      })
      .finally(() => {
        if (!cancelled) setCalendarAuthorizationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.type, optionsOpen]);

  // Link graph state
  const [showLinkGraph, setShowLinkGraph] = useState(false);

  const allTags = getAllTags();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isMyDay = item?.myDay === todayStr;
  const parsedDueDate = item?.dueDate ? parseISO(item.dueDate) : null;
  const isAutoScheduledByDueDate =
    item?.type === 'task' &&
    item.status !== 'done' &&
    item.status !== 'archived' &&
    Boolean(parsedDueDate && isValid(parsedDueDate) && (isToday(parsedDueDate) || isPast(parsedDueDate)));
  const canToggleToday =
    item?.type === 'task' &&
    item.status !== 'done' &&
    item.status !== 'archived' &&
    !isAutoScheduledByDueDate;
  const isCurrentComplete = item?.type === 'habit'
    ? Boolean(item.completions?.[todayStr])
    : item?.status === 'done';
  const isHabitScheduledToday = item?.type !== 'habit'
    || isHabitScheduledForDate(item, new Date());
  const canToggleCompletion = item?.type !== 'habit'
    || isHabitScheduledToday
    || isCurrentComplete;

  const detailSchedule = useMemo<Required<CalendarEventSchedule>>(() => ({
    startDate: detailDraft.startDate,
    endDate: detailDraft.endDate,
    startTime: detailDraft.startTime,
    endTime: detailDraft.endTime,
  }), [detailDraft.endDate, detailDraft.endTime, detailDraft.startDate, detailDraft.startTime]);
  const detailScheduleValidation = useMemo(
    () => validateCalendarEventSchedule(detailSchedule),
    [detailSchedule],
  );
  const detailDraftIsValid = detailDraft.title.trim().length > 0
    && (item.type !== 'event' || detailScheduleValidation.valid);

  if (!detailSaveQueueRef.current) {
    detailSaveQueueRef.current = new VersionedSaveQueue(
      initialCloudDraftRef.current,
      async (value, version) => {
        if (detailMountedRef.current) setDetailSaveState('saving');
        const expectedBase = { ...detailDraftBaseRef.current };
        const latestItem = useOrbitStore.getState().items.find(
          (candidate) => candidate.id === initialItem.id,
        );
        if (!latestItem || latestItem.userId !== initialItem.userId) {
          throw new Error('The item is no longer available in this account.');
        }
        if (!value.title.trim()) throw new Error('A title is required.');

        const scheduleValidation = validateCalendarEventSchedule({
          startDate: value.startDate,
          endDate: value.endDate,
          startTime: value.startTime,
          endTime: value.endTime,
        });
        if (latestItem.type === 'event' && !scheduleValidation.valid) {
          throw new Error('The event schedule is invalid.');
        }

        const shouldPushCalendarEdit = latestItem.type === 'event'
          && Boolean(latestItem.googleCalendarId);
        const updates: Partial<OrbitItem> = {
          title: value.title.trim(),
          content: value.content,
          ...(latestItem.type === 'goal' ? { metric: value.metric } : {}),
          ...(latestItem.type === 'event' && scheduleValidation.valid
            ? {
                startDate: scheduleValidation.schedule.startDate,
                endDate: scheduleValidation.schedule.endDate,
                startTime: scheduleValidation.schedule.startTime,
                endTime: scheduleValidation.schedule.endTime,
              }
            : {}),
          ...(shouldPushCalendarEdit ? { calendarSynced: false } : {}),
        };

        try {
          await updateItem(initialItem.id, updates, {
            expectedRevision: expectedBase.revision,
            expectedUpdatedAt: expectedBase.updatedAt,
          });
          const savedItem = useOrbitStore.getState().items.find(
            (candidate) => candidate.id === initialItem.id,
          );
          detailDraftBaseRef.current = {
            revision: expectedBase.revision + 1,
            updatedAt: savedItem?.updatedAt ?? expectedBase.updatedAt,
          };
          const latestSnapshot = detailSaveQueueRef.current?.getLatest();
          try {
            if ((latestSnapshot?.version ?? version) === version) {
              clearItemDetailDraft(initialItem);
            } else if (latestSnapshot) {
              // A newer keystroke arrived while this save was in flight. Move
              // its recovery record onto the newly acknowledged base before
              // the next serialized save starts.
              writeItemDetailDraft(
                savedItem || initialItem,
                latestSnapshot.value,
                detailDraftBaseRef.current,
              );
            }
          } catch {
            // An old record remains conflict-safe and can be resolved on load.
          }
          if (shouldPushCalendarEdit) {
            void flushPendingGoogleCalendarEvents(initialItem.userId);
          }
          if (detailMountedRef.current) {
            const latestVersion = detailSaveQueueRef.current?.getLatest().version ?? version;
            setDetailSaveState(latestVersion === version ? 'saved' : 'pending');
          }
        } catch (error) {
          if (detailMountedRef.current) {
            setDetailSaveState('error');
            if (error instanceof ItemRevisionConflictError) {
              setConflictingDetailDraft({
                draft: value,
                baseRevision: expectedBase.revision,
                baseUpdatedAt: expectedBase.updatedAt,
                safeToRestore: false,
                matchesCurrent: false,
              });
            }
          }
          throw error;
        }
      },
    );
  }
  const detailSaveQueue = detailSaveQueueRef.current;

  const persistUpdateForItem = useCallback(async (
    targetItem: OrbitItem,
    updates: Partial<OrbitItem>,
  ): Promise<boolean> => {
    const shouldPushCalendarEdit = targetItem.type === 'event' && Boolean(targetItem.googleCalendarId);
    try {
      await updateItem(targetItem.id, shouldPushCalendarEdit
        ? { ...updates, calendarSynced: false }
        : updates);
      if (shouldPushCalendarEdit) {
        void flushPendingGoogleCalendarEvents(targetItem.userId);
      }
      return true;
    } catch {
      toast.error(detailCopy('Could not save your changes.', 'Deine Änderungen konnten nicht gespeichert werden.'));
      return false;
    }
  }, []);

  const applyDetailDraft = useCallback((updates: Partial<DurableItemDetailDraft>) => {
    if (conflictingDetailDraft) return;
    const next = { ...detailSaveQueue.getLatest().value, ...updates };
    try {
      // The verified journal write happens in the same input event. A closed
      // tab cannot cancel it along with the debounced cloud save.
      writeItemDetailDraft(initialItem, next, detailDraftBaseRef.current);
    } catch {
      toast.error(detailCopy(
        'This edit could not be stored in your browser. Free space and try again.',
        'Diese Änderung konnte nicht im Browser gespeichert werden. Gib Speicherplatz frei und versuche es erneut.',
      ));
      return;
    }
    detailSaveQueue.update(next);
    setDetailDraft(next);
    setDetailSaveState('pending');
  }, [conflictingDetailDraft, detailSaveQueue, initialItem]);

  const flushEditableFields = useCallback(async (): Promise<boolean> => {
    if (conflictingDetailDraft) return false;
    if (!detailSaveQueue.isDirty()) return true;
    if (!detailDraft.title.trim()) {
      toast.error(detailCopy('A title is required.', 'Ein Titel ist erforderlich.'));
      titleInputRef.current?.focus();
      return false;
    }
    if (item.type === 'event' && !detailScheduleValidation.valid) {
      toast.error(eventScheduleErrorMessage(detailScheduleValidation.error, german));
      return false;
    }
    try {
      await detailSaveQueue.flushLatest();
      setDetailSaveState(detailSaveQueue.isDirty() ? 'pending' : 'saved');
      return !detailSaveQueue.isDirty();
    } catch {
      setDetailSaveState('error');
      return false;
    }
  }, [conflictingDetailDraft, detailDraft.title, detailSaveQueue, detailScheduleValidation, german, item.type]);

  const handleUpdate = useCallback(
    async (updates: Partial<OrbitItem>): Promise<boolean> => {
      if (!(await flushEditableFields())) return false;
      const latestItem = useOrbitStore.getState().items.find(
        (candidate) => candidate.id === initialItem.id,
      );
      return latestItem ? persistUpdateForItem(latestItem, updates) : false;
    },
    [flushEditableFields, initialItem.id, persistUpdateForItem]
  );

  useEffect(() => {
    if (Date.now() - initialItem.createdAt > 3_000) return;
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [initialItem.createdAt]);

  useEffect(() => {
    const opening = detailPanelOpen && !wasPanelOpenRef.current;
    const closing = !detailPanelOpen && wasPanelOpenRef.current;
    if (opening && typeof document !== 'undefined') {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement ? active : null;
      const timer = window.setTimeout(() => {
        if (window.matchMedia('(min-width: 1024px)').matches) {
          const isNew = Boolean(item && Date.now() - item.createdAt <= 3_000);
          (isNew ? titleInputRef.current : desktopPanelRef.current)?.focus({ preventScroll: true });
        }
      }, 0);
      wasPanelOpenRef.current = true;
      return () => window.clearTimeout(timer);
    }
    if (closing) {
      const target = returnFocusRef.current;
      window.setTimeout(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      }, 0);
      returnFocusRef.current = null;
    }
    wasPanelOpenRef.current = detailPanelOpen;
  }, [detailPanelOpen, item]);

  useEffect(() => {
    if (recoveryLoadedRef.current) return;
    recoveryLoadedRef.current = true;
    const latestItem = useOrbitStore.getState().items.find(
      (candidate) => candidate.id === initialItem.id,
    ) || initialItem;
    const recovered = readItemDetailDraft(latestItem);
    if (!recovered) return;
    if (recovered.matchesCurrent) {
      try {
        clearItemDetailDraft(latestItem);
      } catch {
        // A matching record is harmless and can be retried next time.
      }
      return;
    }
    if (!recovered.safeToRestore) {
      setConflictingDetailDraft(recovered);
      return;
    }
    detailDraftBaseRef.current = {
      revision: recovered.baseRevision,
      updatedAt: recovered.baseUpdatedAt,
    };
    detailSaveQueue.update(recovered.draft);
    setDetailDraft(recovered.draft);
    setDetailSaveState('pending');
  }, [detailSaveQueue, initialItem]);

  useEffect(() => {
    detailMountedRef.current = true;
    const flushBestEffort = () => {
      if (!detailSaveQueue.isDirty()) return;
      void detailSaveQueue.flushLatest().catch(() => {
        // The synchronous browser journal remains the recovery source.
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushBestEffort();
    };
    window.addEventListener('pagehide', flushBestEffort);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      detailMountedRef.current = false;
      flushBestEffort();
      window.removeEventListener('pagehide', flushBestEffort);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [detailSaveQueue]);

  useEffect(() => {
    if (!detailSaveQueue.isDirty()
        || conflictingDetailDraft
        || !detailDraftIsValid) return;
    const timer = window.setTimeout(() => {
      void detailSaveQueue.saveLatest().catch(() => {
        // Error and conflict controls remain visible; the journal is durable.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [conflictingDetailDraft, detailDraft, detailDraftIsValid, detailSaveQueue]);

  useEffect(() => {
    const next = itemDetailDraftFromItem(item);
    if (detailSaveQueue.adopt(next)) {
      detailDraftBaseRef.current = {
        revision: Number(item.revision || 0),
        updatedAt: item.updatedAt,
      };
      setDetailDraft(next);
    }
  }, [detailSaveQueue, item]);

  const restoreAndRebaseDetailDraft = useCallback(() => {
    if (!conflictingDetailDraft) return;
    const latestItem = useOrbitStore.getState().items.find(
      (candidate) => candidate.id === initialItem.id,
    );
    if (!latestItem || latestItem.userId !== initialItem.userId) return;
    const base = {
      revision: Number(latestItem.revision || 0),
      updatedAt: latestItem.updatedAt,
    };
    try {
      writeItemDetailDraft(latestItem, conflictingDetailDraft.draft, base);
    } catch {
      toast.error(detailCopy(
        'The browser draft could not be restored because local storage is unavailable.',
        'Der Browser-Entwurf konnte nicht wiederhergestellt werden, weil der lokale Speicher nicht verfügbar ist.',
      ));
      return;
    }
    detailDraftBaseRef.current = base;
    detailSaveQueue.update(conflictingDetailDraft.draft);
    setDetailDraft(conflictingDetailDraft.draft);
    setConflictingDetailDraft(null);
    setDetailSaveState('pending');
  }, [conflictingDetailDraft, detailSaveQueue, initialItem.id, initialItem.userId]);

  const discardDetailDraft = useCallback(() => {
    const latestItem = useOrbitStore.getState().items.find(
      (candidate) => candidate.id === initialItem.id,
    );
    if (!latestItem || latestItem.userId !== initialItem.userId) return;
    try {
      clearItemDetailDraft(initialItem);
    } catch {
      toast.error(detailCopy(
        'The browser draft could not be discarded because local storage is unavailable.',
        'Der Browser-Entwurf konnte nicht verworfen werden, weil der lokale Speicher nicht verfügbar ist.',
      ));
      return;
    }
    const cloudDraft = itemDetailDraftFromItem(latestItem);
    detailSaveQueue.resolveWithExternal(cloudDraft);
    detailDraftBaseRef.current = {
      revision: Number(latestItem.revision || 0),
      updatedAt: latestItem.updatedAt,
    };
    setDetailDraft(cloudDraft);
    setConflictingDetailDraft(null);
    setDetailSaveState('saved');
  }, [detailSaveQueue, initialItem]);

  const requestClose = useCallback(() => {
    void (async () => {
      if (!(await flushEditableFields())) {
        toast.error(detailCopy(
          'Save failed. The detail panel is staying open so your edits are not lost.',
          'Speichern fehlgeschlagen. Das Detailpanel bleibt geöffnet, damit deine Änderungen nicht verloren gehen.',
        ));
        return;
      }
      setDetailPanelOpen(false);
    })();
  }, [flushEditableFields, setDetailPanelOpen]);

  const navigateToItem = useCallback((targetItemId: string) => {
    void (async () => {
      if (!(await flushEditableFields())) return;
      setSelectedItemId(targetItemId);
    })();
  }, [flushEditableFields, setSelectedItemId]);

  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({
    onClose: requestClose,
  });

  const handleSyncToGoogleCalendar = async () => {
    if (!item || item.type !== 'event') return;
    if (!settings.calendar.googleCalendarSync) {
      toast.error(detailCopy(
        'Enable Google Calendar sync in Settings first.',
        'Aktiviere zuerst die Google-Kalender-Synchronisierung in den Einstellungen.',
      ));
      return;
    }
    setSyncingCalendar(true);
    try {
      if (!hasCalendarPermission()) {
        if (!calendarAuthorizationReady) {
          await prepareGoogleCalendarPermission();
          setCalendarAuthorizationReady(true);
          toast.info(detailCopy(
            'Google is ready. Select Sync to Google again.',
            'Google ist bereit. Wähle „Mit Google synchronisieren“ jetzt erneut.',
          ));
          return;
        }
        // This call must remain before any awaited save so the OAuth popup is
        // a direct consequence of the user's click.
        await requestCalendarPermission();
      }
      if (!(await flushEditableFields())) return;
      const latestItem = useOrbitStore.getState().items.find((candidate) => candidate.id === item.id);
      if (!latestItem || latestItem.type !== 'event') {
        throw new Error('The event is no longer available.');
      }
      const scheduleValidation = validateCalendarEventSchedule(
        calendarEventScheduleFromItem(latestItem),
      );
      if (!scheduleValidation.valid) {
        toast.error(eventScheduleErrorMessage(scheduleValidation.error, german));
        return;
      }
      startGoogleCalendarSync(latestItem.userId);
      if (latestItem.calendarSynced !== false) {
        await updateItem(item.id, { calendarSynced: false });
      }
      const pendingItem = useOrbitStore.getState().items.find((candidate) => candidate.id === item.id)
        || { ...latestItem, calendarSynced: false };
      const result = await flushPendingGoogleCalendarEvents(latestItem.userId, [pendingItem]);
      if (!result.success) throw new Error('Google Calendar sync did not finish.');
    } catch {
      toast.error(detailCopy('Failed to sync with Google Calendar.', 'Google Kalender konnte nicht synchronisiert werden.'));
    } finally {
      setSyncingCalendar(false);
    }
  };

  const performDelete = async (): Promise<boolean> => {
    if (!item) return false;
    try {
      if (settings.archiveInsteadOfDelete) {
        if (!(await flushEditableFields())) return false;
        await updateItem(item.id, { status: 'archived' });
      } else {
        await deleteItem(item.id);
      }
      try {
        clearItemDetailDraft(item);
      } catch {
        // The deleted item cannot be overwritten by a leftover scoped draft.
      }
      setSelectedItemId(null);
      return true;
    } catch {
      toast.error(detailCopy('Could not delete this item.', 'Dieser Eintrag konnte nicht gelöscht werden.'));
      return false;
    }
  };

  const handleDelete = () => {
    if (settings.confirmBeforeDelete) setDeleteDialogOpen(true);
    else void performDelete();
  };

  const handleArchive = () => {
    void (async () => {
      if (!(await flushEditableFields())) return;
      await handleUpdate({ status: 'archived' });
    })();
  };
  const handleRestore = () => handleUpdate({ status: 'active' });

  const handleComplete = async () => {
    if (!item) return;

    if (item.type === 'habit') {
      if (!canToggleCompletion) {
        toast.info(detailCopy('This habit is not scheduled for today.', 'Diese Gewohnheit ist heute nicht geplant.'));
        return;
      }
      const wasCompleted = Boolean(item.completions?.[todayStr]);
      const completions = { ...(item.completions || {}) };
      if (wasCompleted) delete completions[todayStr];
      else completions[todayStr] = true;

      if (!(await handleUpdate({ completions }))) return;
      if (!wasCompleted) {
        setCompletionAnimation({
          type: 'habit',
          streak: calculateStreak({ ...item, completions }),
        });
      }
      return;
    }

    const newStatus = item?.status === 'done' ? 'active' : 'done';
    
    const saved = await handleUpdate({
      status: newStatus,
      completedAt: newStatus === 'done' ? Date.now() : undefined,
    });
    if (saved && newStatus === 'done' && item.type === 'task') {
      setCompletionAnimation({ type: 'task' });
    }
  };

  const handleAddToToday = () => {
    if (!item || !canToggleToday) return;
    
    if (isMyDay) {
      handleUpdate({ myDay: undefined });
    } else {
      handleUpdate({ myDay: todayStr });
    }
  };

  const addChecklistItem = async () => {
    if (!newChecklistText.trim() || !item || checklistSaving) return;
    const submittedText = newChecklistText.trim();
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: submittedText,
      done: false,
    };
    setChecklistSaving(true);
    try {
      if (await handleUpdate({ checklist: [...(item.checklist || []), newItem] })) {
        setNewChecklistText((current) => current.trim() === submittedText ? '' : current);
      }
    } finally {
      setChecklistSaving(false);
    }
  };

  const toggleChecklistItem = (checkId: string) => {
    if (!item) return;
    const updated = (item.checklist || []).map((c) =>
      c.id === checkId ? { ...c, done: !c.done } : c
    );
    handleUpdate({ checklist: updated });
  };

  const toggleTag = (tag: string) => {
    if (!item) return;
    const tags = item.tags || [];
    const updated = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    handleUpdate({ tags: updated });
  };

  // Filter item tags to only show valid tags (remove deleted custom tags)
  const validItemTags = (item?.tags || []).filter(tag => allTags.includes(tag));

  // Compute parent/relations before early return (hooks can't be after returns)
  const parentItem = item?.parentId ? items.find(i => i.id === item.parentId) : undefined;

  // Milestone selector: find the owning project and its milestones
  const owningProject = useMemo(() => {
    if (!parentItem) return undefined;
    if (parentItem.type === 'project') return parentItem;
    if (parentItem.type === 'goal' && parentItem.parentId) {
      const grandParent = items.find(i => i.id === parentItem.parentId);
      if (grandParent?.type === 'project') return grandParent;
    }
    return undefined;
  }, [parentItem, items]);

  const projectMilestones = useMemo(() => {
    if (!owningProject) return [];
    return items.filter(i => i.parentId === owningProject.id && i.type === 'goal' && i.status !== 'archived');
  }, [owningProject, items]);

  if (!item) return null;

  // Project Dashboard View — extracted to dedicated component
  if (item.type === 'project') {
    return <ProjectDashboard />;
  }

  // Regular detail panel for non-project items
  const childItems = items.filter((i) => i.parentId === item.id);
  const relationships = getItemRelationships(item, items);
  const linkedItems = [
    ...relationships.linked,
    ...relationships.reverseLinked,
  ].filter((linkedItem, index, arr) => arr.findIndex((i) => i.id === linkedItem.id) === index);

  // Current milestone: if parent is a goal under the project
  const currentMilestoneId = (parentItem?.type === 'goal' && owningProject) ? parentItem.id : '';

  const handleMilestoneChange = (milestoneId: string) => {
    if (!owningProject) return;
    const newParentId = milestoneId === 'none' ? owningProject.id : milestoneId;
    handleUpdate({ parentId: newParentId });
  };

  const handleTypeChange = (nextType: ItemType) => {
    if (nextType !== item.type) setPendingTypeChange(nextType);
  };

  const performTypeChange = async (): Promise<boolean> => {
    const nextType = pendingTypeChange;
    if (!nextType || nextType === item.type) {
      setPendingTypeChange(null);
      return true;
    }
    if (!(await flushEditableFields())) return false;

    try {
      if (item.googleCalendarId && nextType !== 'event') {
        // The Google event is deliberately preserved. Type conversion only
        // detaches this Threadmap item so future imports/cancellations cannot
        // overwrite or delete its new non-event workflow.
        await updateItem(item.id, {
          type: nextType,
          googleCalendarId: undefined,
          calendarSynced: undefined,
        });
      } else if (nextType === 'event') {
        if (!(await handleUpdate({
          type: 'event',
          startDate: todayStr,
          endDate: undefined,
          startTime: undefined,
          endTime: undefined,
        }))) {
          return false;
        }
      } else if (!(await handleUpdate({ type: nextType }))) {
        return false;
      }
      setPendingTypeChange(null);
      return true;
    } catch {
      toast.error(detailCopy('Could not change the item type.', 'Der Eintragstyp konnte nicht geändert werden.'));
      return false;
    }
  };

  const content = (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-border/50 bg-background/80 px-4 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {(item.type === 'task' || item.type === 'habit') && (
            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={!canToggleCompletion}
              aria-label={!canToggleCompletion
                ? (german ? 'Gewohnheit ist heute nicht geplant' : 'Habit not scheduled for today')
                : isCurrentComplete
                  ? (german ? 'Als nicht erledigt markieren' : 'Mark as incomplete')
                  : (german ? 'Als erledigt markieren' : 'Mark as complete')}
              aria-pressed={isCurrentComplete}
              title={!canToggleCompletion
                ? (german ? 'Diese Gewohnheit ist heute nicht geplant.' : 'This habit is not scheduled for today.')
                : undefined}
              className={cn(
                'relative flex h-6 w-6 items-center justify-center rounded-full border transition-all shadow-[var(--shadow-hairline)] disabled:cursor-not-allowed disabled:opacity-40',
                'focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0',
                'before:absolute before:inset-[-10px]',
                isCurrentComplete
                  ? 'border-green-600 bg-green-600'
                  : 'border-transparent bg-background/70 hover:border-foreground/25'
              )}
            >
              {isCurrentComplete && <Check className="h-3 w-3 text-white" />}
            </button>
          )}
          <span className="text-[11px] text-muted-foreground/50 capitalize">{t(ITEM_TYPE_KEYS[item.type])}</span>
          {isCurrentComplete && (
            <>
              <span className="text-[11px] text-muted-foreground/30">·</span>
              <span className="text-[11px] text-green-600/80">{t('status.done')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Link Graph Button */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowLinkGraph(true);
            }}
            aria-label={t('detail.viewLinkGraph')}
            className="orbit-pressable flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/50 outline-none hover:text-foreground hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-8 lg:w-8"
            title={t('detail.viewLinkGraph')}
            type="button"
          >
            <Network className="h-4 w-4" />
          </button>
          
          {/* Keyboard-safe settings popover */}
          <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="orbit-pressable flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/50 outline-none hover:text-foreground hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-8 lg:w-8"
                aria-label={t('common.moreOptions')}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label={t('common.moreOptions')}
              className="max-h-[min(75vh,640px)] w-72 overflow-y-auto p-1"
            >
              {/* Change Type */}
              <div className="px-2 py-2">
                <FieldLabel>{t('detail.changeType')}</FieldLabel>
                <Select value={item.type} onValueChange={(v) => {
                  handleTypeChange(v as ItemType);
                  setOptionsOpen(false);
                }}>
                  <SelectTrigger aria-label={t('detail.changeType')} className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type} className="text-[12px]">{t(ITEM_TYPE_KEYS[type])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div aria-hidden="true" className="my-1 h-px bg-border" />

              {/* Change Status */}
              <div className="px-2 py-2">
                <FieldLabel>{t('detail.changeStatus')}</FieldLabel>
                <Select value={item.status} onValueChange={(v) => handleUpdate({ status: v as ItemStatus, completedAt: v === 'done' ? Date.now() : undefined })}>
                  <SelectTrigger aria-label={t('detail.changeStatus')} className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize text-[12px]">{t(`status.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div aria-hidden="true" className="my-1 h-px bg-border" />

              {/* Links & Relations */}
              <div className="px-2 py-2">
                <FieldLabel>{t('detail.linksRelations')}</FieldLabel>
                <div className="mt-2">
                  <LinkManager
                    item={item}
                    allItems={items}
                    onUpdate={handleUpdate}
                  />
                </div>
              </div>

              {/* Habit Settings */}
              {item.type === 'habit' && (
                <>
                  <div aria-hidden="true" className="my-1 h-px bg-border" />
                  <div className="px-2 py-2">
                    <FieldLabel>{t('detail.frequency')}</FieldLabel>
                    <Select
                      value={item.frequency || 'daily'}
                      onValueChange={(value) => {
                        const frequency = value as HabitFrequency;
                        handleUpdate({
                          frequency,
                          ...(frequency === 'weekly'
                            ? {
                                customDays: [
                                  item.frequency === 'custom' && item.customDays?.length
                                    ? item.customDays[0]
                                    : settings.weekStart === 'sunday' ? 6 : 0,
                                ],
                              }
                            : {}),
                        });
                      }}
                    >
                      <SelectTrigger aria-label={t('detail.frequency')} className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((frequency) => (
                          <SelectItem key={frequency} value={frequency} className="text-[12px]">{t(`frequency.${frequency}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {(item.frequency === 'weekly' || item.frequency === 'custom') && (
                      <div className="mt-2">
                        <p className="mb-1.5 text-[10px] text-muted-foreground/60">
                          {item.frequency === 'weekly'
                            ? (german ? 'Geplanter Tag' : 'Scheduled day')
                            : (german ? 'Geplante Tage' : 'Scheduled days')}
                        </p>
                        <div className="grid grid-cols-4 gap-1">
                          {dayLabels.map((label, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (item.frequency === 'weekly') {
                                  handleUpdate({ customDays: [idx] });
                                  return;
                                }
                                const days = new Set(item.customDays || []);
                                if (days.has(idx)) {
                                  days.delete(idx);
                                } else {
                                  days.add(idx);
                                }
                                handleUpdate({ customDays: Array.from(days) });
                              }}
                              aria-label={`${label}: ${scheduledHabitDays.includes(idx)
                                ? (german ? 'geplant' : 'scheduled')
                                : (german ? 'nicht geplant' : 'not scheduled')}`}
                              aria-pressed={scheduledHabitDays.includes(idx)}
                              className={cn(
                                'flex min-h-10 w-full items-center justify-center rounded text-[10px] font-medium',
                                scheduledHabitDays.includes(idx)
                                  ? 'bg-foreground text-background'
                                  : 'bg-foreground/[0.05] text-muted-foreground'
                              )}
                            >
                              {label.slice(0, 2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-2">
                      <Input aria-label={german ? 'Erinnerungszeit der Gewohnheit' : 'Habit reminder time'} type="time" value={item.habitTime || ''} onChange={(e) => handleUpdate({ habitTime: e.target.value || undefined })} className="h-9 text-[11px]" placeholder={t('detail.timePlaceholder')} />
                    </div>


                  </div>
                </>
              )}

              {/* Goal Settings */}
              {item.type === 'goal' && (
                <>
                  <div aria-hidden="true" className="my-1 h-px bg-border" />
                  <div className="px-2 py-2">
                    <FieldLabel>{t('detail.timeframe')}</FieldLabel>
                    <Select value={item.timeframe || 'quarterly'} onValueChange={(v) => handleUpdate({ timeframe: v as GoalTimeframe })}>
                      <SelectTrigger aria-label={t('detail.timeframe')} className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEFRAME_OPTIONS.map((timeframe) => (
                          <SelectItem key={timeframe} value={timeframe} className="text-[12px]">{t(`timeframe.${timeframe}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Note Category */}
              {item.type === 'note' && (
                <>
                  <div aria-hidden="true" className="my-1 h-px bg-border" />
                  <div className="px-2 py-2">
                    <FieldLabel>{t('detail.category')}</FieldLabel>
                    <Select value={item.noteSubtype || 'general'} onValueChange={(v) => handleUpdate({ noteSubtype: v as NoteSubtype })}>
                      <SelectTrigger aria-label={t('detail.category')} className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NOTE_SUBTYPE_OPTIONS.map((subtype) => (
                          <SelectItem key={subtype} value={subtype} className="text-[12px]">{t(`noteSubtype.${subtype}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Event Calendar Sync */}
              {item.type === 'event' && (
                <>
                  <div aria-hidden="true" className="my-1 h-px bg-border" />
                  <div className="px-2 py-2">
                    <button
                      type="button"
                      onClick={handleSyncToGoogleCalendar}
                      disabled={syncingCalendar || calendarAuthorizationLoading}
                      className={cn(
                        'flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-colors',
                        item.calendarSynced
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-foreground/[0.05] text-foreground',
                        (syncingCalendar || calendarAuthorizationLoading) && 'opacity-50'
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {calendarAuthorizationLoading
                        ? (german ? 'Google wird vorbereitet…' : 'Preparing Google…')
                        : syncingCalendar
                        ? t('detail.syncing')
                        : item.calendarSynced
                          ? t('detail.syncedToCalendar')
                          : item.googleCalendarId
                            ? (german ? 'Google-Kalender-Sync erneut versuchen' : 'Retry Google Calendar sync')
                            : t('detail.syncToGoogle')}
                    </button>
                  </div>
                </>
              )}

              <div aria-hidden="true" className="my-1 h-px bg-border" />

              {/* Archive/Restore */}
              {item.status === 'archived' ? (
                <button
                  type="button"
                  onClick={() => {
                    setOptionsOpen(false);
                    void handleRestore();
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  {t('common.restore')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOptionsOpen(false);
                    handleArchive();
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25"
                >
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  {t('common.archive')}
                </button>
              )}

              {/* Delete */}
              <button
                type="button"
                onClick={() => {
                  setOptionsOpen(false);
                  handleDelete();
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-red-600 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                {t('common.delete')}
              </button>
            </PopoverContent>
          </Popover>
          
          {/* Close button - Desktop only */}
          <button onClick={requestClose} aria-label={t('common.closePanel')} className="orbit-pressable hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50 outline-none hover:text-foreground hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25 lg:flex">
            <X className="h-4 w-4" />
          </button>
          
          {/* Close button - Mobile only */}
          <button onClick={requestClose} aria-label={t('common.closePanel')} className="orbit-pressable flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/50 outline-none hover:text-foreground hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {conflictingDetailDraft && (
        <div role="alert" className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            {german ? 'Dieser Browser-Entwurf basiert auf einer älteren Version.' : 'This browser draft is based on an older version.'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            {german
              ? 'Stelle ihn wieder her und setze ihn ausdrücklich auf die neueste Cloud-Version auf, oder verwirf ihn und behalte die Cloud-Version.'
              : 'Restore and explicitly rebase it onto the latest cloud version, or discard it and keep the cloud version.'}
          </p>
          <details className="mt-2 text-xs text-amber-950 dark:text-amber-100">
            <summary className="cursor-pointer font-medium">
              {german ? 'Browser-Entwurf ansehen' : 'Preview browser draft'}
            </summary>
            <div className="mt-2 max-h-28 overflow-auto rounded-lg bg-background/60 p-2">
              <p className="font-medium">{conflictingDetailDraft.draft.title || (german ? 'Ohne Titel' : 'Untitled')}</p>
              {conflictingDetailDraft.draft.content && (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{conflictingDetailDraft.draft.content}</p>
              )}
            </div>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restoreAndRebaseDetailDraft}
              className="min-h-11 rounded-lg bg-foreground px-3 text-xs font-medium text-background"
            >
              {german ? 'Wiederherstellen & neu aufsetzen' : 'Restore & rebase'}
            </button>
            <button
              type="button"
              onClick={discardDetailDraft}
              className="min-h-11 rounded-lg px-3 text-xs font-medium hover:bg-foreground/[0.06]"
            >
              {german ? 'Entwurf verwerfen' : 'Discard draft'}
            </button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4" data-slot="detail-body">
        {/* Title - Large and prominent */}
        <input
          aria-label={german ? 'Titel des Eintrags' : 'Item title'}
          ref={titleInputRef}
          value={detailDraft.title}
          disabled={Boolean(conflictingDetailDraft)}
          aria-invalid={!detailDraft.title.trim()}
          onChange={(event) => applyDetailDraft({ title: event.target.value })}
          onBlur={() => void flushEditableFields()}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void flushEditableFields();
          }}
          className="w-full rounded-lg bg-transparent px-1 py-1 text-lg font-semibold leading-snug outline-none placeholder:text-muted-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/25"
          placeholder={t('detail.titlePlaceholder')}
        />

        {/* Quick Actions Bar - Most important stuff first */}
        <div className="flex flex-wrap gap-2">
          {/* Priority (Task) */}
          {item.type === 'task' && (
            <Select value={item.priority || 'none'} onValueChange={(v) => handleUpdate({ priority: v === 'none' ? undefined : v as Priority })}>
              <SelectTrigger aria-label={t('detail.priority')} className="h-9 text-[13px] w-auto min-w-[100px]">
                <SelectValue placeholder={t('detail.priority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-[12px]">{t('priority.none')}</SelectItem>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p} className="text-[12px]">{t(`priority.${p}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Due Date (Task) */}
          {item.type === 'task' && (
            <div className="relative">
              <Input
                aria-label={german ? 'Fälligkeitsdatum' : 'Due date'}
                type="date"
                value={item.dueDate || ''}
                onChange={(e) => handleUpdate({ dueDate: e.target.value || undefined })}
                className="h-9 text-[13px] w-auto min-w-[140px]"
              />
              {item.dueDate && (
                <button
                  type="button"
                  onClick={() => handleUpdate({ dueDate: undefined })}
                  aria-label={german ? 'Fälligkeitsdatum entfernen' : 'Clear due date'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25"
                >
                  <X className="h-3 w-3 text-muted-foreground/50" />
                </button>
              )}
            </div>
          )}

          {/* Add to Today (Task) */}
          {canToggleToday && (
            <button
              type="button"
              onClick={handleAddToToday}
              aria-pressed={isMyDay}
              className="surface-card orbit-pressable flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none hover:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:ring-ring/25"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isMyDay ? t('itemRow.removeBtn') : t('detail.addToToday')}
            </button>
          )}
          {isAutoScheduledByDueDate && (
            <span className="surface-card flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground/70" title={german ? 'Fällige und überfällige Aufgaben erscheinen automatisch auf deinem Dashboard.' : 'Due and overdue tasks appear on your dashboard automatically.'}>
              <Sparkles className="h-3.5 w-3.5" />
              {german ? 'Automatisch enthalten' : 'Included automatically'}
            </span>
          )}
        </div>

        {/* Event Date & Time Fields */}
        {item.type === 'event' && (
          <EventScheduleFields
          item={item}
          draft={detailDraft}
          disabled={Boolean(conflictingDetailDraft)}
          dirty={detailSaveQueue.isDirty()}
          saving={detailSaveState === 'saving'}
          saveFailed={!conflictingDetailDraft && detailSaveState === 'error'}
            onChange={applyDetailDraft}
            onSave={flushEditableFields}
          />
        )}

        {/* Checklist (Task) - Prominent position */}
        {item.type === 'task' && (
          <div>
            <FieldLabel>{t('detail.checklist')}</FieldLabel>
            <div className="mt-2 space-y-1">
              {(item.checklist || []).map((check) => (
                <div key={check.id} className="group flex min-h-9 items-center gap-2.5 rounded-lg px-1.5">
                  <Checkbox
                    checked={check.done}
                    onCheckedChange={() => toggleChecklistItem(check.id)}
                    aria-label={`${check.done
                      ? (german ? 'Als nicht erledigt markieren' : 'Mark incomplete')
                      : (german ? 'Als erledigt markieren' : 'Mark complete')}: ${check.text}`}
                    className="h-4 w-4"
                  />
                  <span className={cn('text-[14px] flex-1', check.done && 'text-muted-foreground/40 line-through')}>
                    {check.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (item.checklist || []).filter(c => c.id !== check.id);
                      handleUpdate({ checklist: updated });
                    }}
                    aria-label={`${german ? 'Checklistenpunkt löschen' : 'Delete checklist item'}: ${check.text}`}
                    className="rounded-md p-1 opacity-100 transition-opacity hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <X className="h-3 w-3 text-muted-foreground/50" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  aria-label={german ? 'Neuer Checklistenpunkt' : 'New checklist item'}
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addChecklistItem();
                    }
                  }}
                  placeholder={t('detail.checklistPlaceholder')}
                  className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 transition-colors focus:border-border/70 focus:bg-background/50"
                />
                <button type="button" onClick={() => void addChecklistItem()} disabled={!newChecklistText.trim() || checklistSaving} aria-busy={checklistSaving} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:text-foreground hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-40" aria-label={german ? 'Checklistenpunkt hinzufügen' : 'Add checklist item'}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <BufferedTextFields
          item={item}
          draft={detailDraft}
          disabled={Boolean(conflictingDetailDraft)}
          saveState={conflictingDetailDraft ? 'idle' : detailSaveState}
          onChange={applyDetailDraft}
          onSave={flushEditableFields}
        />

        {/* Tags */}
        <div>
          <FieldLabel>{t('detail.tags')}</FieldLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={validItemTags.includes(tag)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[12px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
                  validItemTags.includes(tag)
                    ? 'bg-foreground text-background shadow-[var(--shadow-soft)]'
                    : 'bg-foreground/[0.06] text-muted-foreground/70 hover:bg-foreground/[0.1]'
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* ── Relations ── */}
        {(parentItem || linkedItems.length > 0 || childItems.length > 0) && (
          <div className="space-y-3">
            {/* Parent */}
            {parentItem && (
              <div>
                <FieldLabel>{t('detail.parent')}</FieldLabel>
                <div className="mt-2">
                  <button
                    onClick={() => navigateToItem(parentItem.id)}
                    className="surface-card orbit-pressable flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none hover:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:ring-ring/25 group"
                  >
                    {(() => {
                      const Icon = TYPE_ICONS[parentItem.type];
                      return <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" />;
                    })()}
                    <span className="text-[13px] flex-1 text-foreground/90 group-hover:text-foreground">
                      {parentItem.emoji && `${parentItem.emoji} `}{parentItem.title}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Milestone selector for tasks under a project */}
            {item.type === 'task' && owningProject && projectMilestones.length > 0 && (
              <div>
                <FieldLabel>{german ? 'Meilenstein' : 'Milestone'}</FieldLabel>
                <Select value={currentMilestoneId || 'none'} onValueChange={handleMilestoneChange}>
                  <SelectTrigger aria-label={german ? 'Meilenstein auswählen' : 'Select milestone'} className="mt-1.5 h-8 text-[12px]">
                    <SelectValue placeholder={german ? 'Kein Meilenstein' : 'No milestone'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-[12px]">{german ? 'Kein Meilenstein' : 'No milestone'}</SelectItem>
                    {projectMilestones.map((ms) => (
                      <SelectItem key={ms.id} value={ms.id} className="text-[12px]">
                        {ms.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Linked Items */}
            {linkedItems.length > 0 && (
              <div>
                <FieldLabel>{german ? 'Verknüpfte Einträge' : 'Linked Items'} ({linkedItems.length})</FieldLabel>
                <div className="mt-2 space-y-1">
                  {linkedItems.map((linked) => {
                    const Icon = TYPE_ICONS[linked.type];
                    const isDone = linked.status === 'done';
                    
                    return (
                      <button
                        key={linked.id}
                        onClick={() => navigateToItem(linked.id)}
                        className="surface-card orbit-pressable flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none hover:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:ring-ring/25 group"
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isDone ? 'text-muted-foreground/30' : 'text-muted-foreground/50')} />
                        <span className={cn("text-[13px] flex-1", isDone ? 'line-through text-muted-foreground/40' : 'text-foreground/90 group-hover:text-foreground')}>
                          {linked.emoji && `${linked.emoji} `}{linked.title}
                        </span>
                        {isDone && <Check className="h-3.5 w-3.5 text-green-600/50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Child Items */}
            {childItems.length > 0 && (
              <div>
                <FieldLabel>{german ? 'Enthält' : 'Contains'} ({childItems.length})</FieldLabel>
                <div className="mt-2 space-y-1">
                  {childItems.map((child) => {
                    const Icon = TYPE_ICONS[child.type];
                    const isDone = child.status === 'done';
                    
                    return (
                      <button
                        key={child.id}
                        onClick={() => navigateToItem(child.id)}
                        className="surface-card orbit-pressable flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none hover:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:ring-ring/25 group"
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isDone ? 'text-muted-foreground/30' : 'text-muted-foreground/50')} />
                        <span className={cn("text-[13px] flex-1", isDone ? 'line-through text-muted-foreground/40' : 'text-foreground/90 group-hover:text-foreground')}>
                          {child.emoji && `${child.emoji} `}{child.title}
                        </span>
                        {isDone && <Check className="h-3.5 w-3.5 text-green-600/50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Attachments — on every type. `files` lives on the universal item,
            but only the project dashboard ever rendered an uploader, so a task
            or a note could not hold one. Projects keep theirs on the project
            dashboard. */}
        <div className="pt-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
            <FieldLabel>{t('detail.attachments')}</FieldLabel>
          </div>
          <FileUpload item={item} />
        </div>

        {/* Metadata - Collapsed at bottom */}
        <div className="pt-2 pb-4">
          <div className="h-px bg-border/30 mb-3" />
          <div className="space-y-0.5 text-[11px] text-muted-foreground/40">
            <p>{t('common.createdAt', { date: format(new Date(item.createdAt), fullTimestampPattern(settings.dateFormat, settings.timeFormat), { locale: getLocale(settings.language) }) })}</p>
            <p>{t('common.updatedAt', { date: format(new Date(item.updatedAt), fullTimestampPattern(settings.dateFormat, settings.timeFormat), { locale: getLocale(settings.language) }) })}</p>
            {item.completedAt && <p>{german ? 'Erledigt am' : 'Completed'} {format(new Date(item.completedAt), fullTimestampPattern(settings.dateFormat, settings.timeFormat), { locale: getLocale(settings.language) })}</p>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className={cn(
        'hidden lg:block border-l border-border/50 bg-background shadow-[var(--shadow-panel)] transition-[width] duration-200 ease-[var(--ease-standard)]',
        detailPanelOpen ? 'w-96' : 'w-0 overflow-hidden'
      )}
        ref={desktopPanelRef}
        role="region"
        aria-label={t('detail.itemDetails')}
        tabIndex={detailPanelOpen ? -1 : undefined}
      >
        {content}
      </div>

      {/* Mobile — full-screen sheet */}
      <div className="lg:hidden">
        <Sheet
          open={detailPanelOpen}
          onOpenChange={(open) => {
            if (!open) requestClose();
          }}
        >
          <SheetContent
            side="bottom"
            className="mobile-sheet-height rounded-t-2xl p-0 border-0"
            showCloseButton={false}
            style={swipeStyles}
          >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('detail.itemDetails')}</SheetTitle>
          </SheetHeader>
          {/* Swipe Handle */}
          <div
            className="absolute top-0 left-0 right-0 flex justify-center pt-4 pb-8 cursor-grab active:cursor-grabbing z-10"
            {...swipeHandlers}
          >
            <div className={cn(
              "w-10 h-1 rounded-full bg-muted-foreground/20 transition-all",
              isDragging && "bg-muted-foreground/40 w-12"
            )} />
          </div>
          <div className="h-full overflow-hidden pt-14">
            {content}
          </div>
        </SheetContent>
      </Sheet>
      </div>
      
      {/* Link Graph */}
      {item && (
        <LinkGraph
          open={showLinkGraph}
          onClose={() => setShowLinkGraph(false)}
          currentItem={item}
          allItems={items}
          onNavigate={(itemId) => {
            void (async () => {
              if (!(await flushEditableFields())) return;
              setSelectedItemId(itemId);
              setShowLinkGraph(false);
            })();
          }}
        />
      )}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={settings.archiveInsteadOfDelete
          ? (german ? `„${item.title}“ archivieren?` : `Archive “${item.title}”?`)
          : (german ? `„${item.title}“ löschen?` : `Delete “${item.title}”?`)}
        description={settings.archiveInsteadOfDelete
          ? (german ? 'Du kannst den Eintrag später aus dem Archiv wiederherstellen.' : 'You can restore it later from Archive.')
          : (german ? 'Dadurch wird der Eintrag dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.' : 'This permanently removes the item and cannot be undone.')}
        confirmLabel={settings.archiveInsteadOfDelete ? t('common.archive') : t('common.delete')}
        onConfirm={performDelete}
      />
      <ConfirmDialog
        open={pendingTypeChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTypeChange(null);
        }}
        title={settings.language === 'de'
          ? `Typ von „${item.title}“ ändern?`
          : `Change the type of “${item.title}”?`}
        description={settings.language === 'de'
          ? item.googleCalendarId && pendingTypeChange !== 'event'
            ? `Der Eintrag wird von ${t(ITEM_TYPE_KEYS[item.type])} zu ${pendingTypeChange ? t(ITEM_TYPE_KEYS[pendingTypeChange]) : ''}. Der Google-Kalendertermin bleibt bestehen, wird aber sicher von diesem Eintrag getrennt.`
            : `Der Eintrag wird von ${t(ITEM_TYPE_KEYS[item.type])} zu ${pendingTypeChange ? t(ITEM_TYPE_KEYS[pendingTypeChange]) : ''}. Gemeinsame Inhalte und Verknüpfungen bleiben erhalten.`
          : item.googleCalendarId && pendingTypeChange !== 'event'
            ? `This changes the item from ${t(ITEM_TYPE_KEYS[item.type])} to ${pendingTypeChange ? t(ITEM_TYPE_KEYS[pendingTypeChange]) : ''}. The Google Calendar event will remain, but it will be safely detached from this item.`
            : `This changes the item from ${t(ITEM_TYPE_KEYS[item.type])} to ${pendingTypeChange ? t(ITEM_TYPE_KEYS[pendingTypeChange]) : ''}. Shared content and links will be preserved.`}
        confirmLabel={settings.language === 'de' ? 'Typ ändern' : 'Change type'}
        onConfirm={performTypeChange}
      />
    </>
  );
}
