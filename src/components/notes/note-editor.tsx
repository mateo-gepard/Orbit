'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, MoreVertical, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useThreadmapStore } from '@/lib/store';
import { deleteItem, ItemRevisionConflictError, updateItem } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';
import type { NoteSubtype, ThreadmapItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLinks } from '@/lib/hooks/use-links';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/responsive-action-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { VersionedSaveQueue } from './versioned-save-queue';
import { clearNoteDraft, readNoteDraft, writeNoteDraft, type DurableNoteDraft } from './note-draft';
import { useTranslation } from '@/lib/i18n';
import { hasOutstandingItemMutation } from '@/lib/item-mutation-outbox';

interface NoteEditorProps {
  note: ThreadmapItem;
  onClose: () => void;
}

type NoteDraft = DurableNoteDraft;

const NOTE_SUBTYPE_OPTIONS: NoteSubtype[] = ['general', 'idea', 'principle', 'plan', 'journal'];

function initialDraft(note: ThreadmapItem): NoteDraft {
  return {
    title: note.title,
    content: note.content || '',
    tags: [...(note.tags || [])],
    noteSubtype: note.noteSubtype || 'general',
  };
}

export function NoteEditor({ note, onClose }: NoteEditorProps) {
  const { t, tp } = useTranslation();
  const items = useThreadmapStore((state) => state.items);
  const getAllTags = useThreadmapStore((state) => state.getAllTags);
  const { confirmBeforeDelete, archiveInsteadOfDelete } = useSettingsStore((state) => state.settings);
  const baseDraftRef = useRef<NoteDraft>(initialDraft(note));
  const recoveredDraftRef = useRef<ReturnType<typeof readNoteDraft> | undefined>(undefined);
  if (recoveredDraftRef.current === undefined) recoveredDraftRef.current = readNoteDraft(note);
  const firstDraftRef = useRef<NoteDraft>(
    recoveredDraftRef.current?.safeToRestore ? recoveredDraftRef.current.draft : baseDraftRef.current,
  );
  const draftBaseRef = useRef(
    recoveredDraftRef.current?.safeToRestore && !recoveredDraftRef.current.matchesCurrent
      ? {
          revision: recoveredDraftRef.current.baseRevision,
          updatedAt: recoveredDraftRef.current.baseUpdatedAt,
        }
      : { revision: Number(note.revision || 0), updatedAt: note.updatedAt },
  );
  const [draft, setDraft] = useState(firstDraftRef.current);
  const [conflictingDraft, setConflictingDraft] = useState<NoteDraft | null>(
    recoveredDraftRef.current && !recoveredDraftRef.current.safeToRestore
      ? recoveredDraftRef.current.draft
      : null,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [hasSaveError, setHasSaveError] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);
  const actionPendingRef = useRef(false);
  const saveQueueRef = useRef<VersionedSaveQueue<NoteDraft> | null>(null);

  if (!saveQueueRef.current) {
    saveQueueRef.current = new VersionedSaveQueue(baseDraftRef.current, async (value, version) => {
      if (mountedRef.current) {
        setSaveState('saving');
        setHasSaveError(false);
      }

      try {
        const expectedBase = { ...draftBaseRef.current };
        const outcome = await updateItem(note.id, {
          title: value.title,
          content: value.content,
          tags: value.tags,
          noteSubtype: value.noteSubtype,
        }, {
          expectedRevision: expectedBase.revision,
          expectedUpdatedAt: expectedBase.updatedAt,
        });
        if (outcome === 'rejected') {
          throw new Error('The cloud rejected this note revision. The browser draft was preserved.');
        }
        if (outcome === 'pending') {
          if (mountedRef.current) {
            setSaveState('pending');
            setHasSaveError(false);
          }
          return;
        }
        const savedItem = useThreadmapStore.getState().items.find((item) => item.id === note.id);
        if (savedItem) {
          draftBaseRef.current = {
            revision: Number(savedItem.revision || 0),
            updatedAt: savedItem.updatedAt,
          };
        }
        if ((saveQueueRef.current?.getLatest().version ?? version) === version) {
          clearNoteDraft(note);
        }
        if (mountedRef.current) {
          const latestVersion = saveQueueRef.current?.getLatest().version ?? version;
          setSaveState(latestVersion === version ? 'saved' : 'pending');
          setHasSaveError(false);
        }
      } catch (error) {
        if (mountedRef.current) {
          setSaveState('error');
          setHasSaveError(true);
          if (error instanceof ItemRevisionConflictError) setConflictingDraft(value);
        }
        throw error;
      }
    });
    if (recoveredDraftRef.current?.safeToRestore) {
      saveQueueRef.current.update(recoveredDraftRef.current.draft);
    }
  }

  const saveQueue = saveQueueRef.current;
  const allTags = getAllTags();

  useEffect(() => {
    mountedRef.current = true;
    const flushBestEffort = () => {
      if (saveQueueRef.current?.isDirty()) {
        void saveQueueRef.current.flushLatest().catch(() => {
          // The synchronous draft journal remains the recovery source.
        });
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flushBestEffort();
    };
    window.addEventListener('pagehide', flushBestEffort);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      flushBestEffort();
      window.removeEventListener('pagehide', flushBestEffort);
      document.removeEventListener('visibilitychange', visibility);
      mountedRef.current = false;
    };
  }, []);

  const applyDraft = useCallback((updater: (current: NoteDraft) => NoteDraft) => {
    const queue = saveQueueRef.current;
    if (!queue) return;
    const next = updater(queue.getLatest().value);
    try {
      // This verified write happens in the same input event. Navigation can
      // cancel the debounce timer without losing the edit.
      writeNoteDraft(note, next, draftBaseRef.current);
    } catch {
      toast.error(t('notes.draftStorageError'));
      return;
    }
    queue.update(next);
    setDraft(next);
    setSaveState('pending');
    setHasSaveError(false);
  }, [note, t]);

  useEffect(() => {
    const next = initialDraft(note);
    if (hasOutstandingItemMutation(note.userId, note.id)) return;
    if (saveQueue.adopt(next)) {
      draftBaseRef.current = { revision: Number(note.revision || 0), updatedAt: note.updatedAt };
      setDraft(next);
    }
  }, [note, note.updatedAt, saveQueue]);

  useEffect(() => {
    if (!saveQueue.isDirty()) return;

    const timer = window.setTimeout(() => {
      void saveQueue.saveLatest().catch(() => {
        // The persistent error state provides an explicit retry path.
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draft, saveQueue]);

  const links = useLinks({
    item: note,
    allItems: items,
    onUpdate: async (updates) => {
      await updateItem(note.id, updates);
    },
  });
  const visibleLinkedItems = [
    ...links.relationships.linked,
    ...links.relationships.reverseLinked,
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
  const linkPickerItems = [
    ...visibleLinkedItems,
    ...links.linkableItems,
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);

  const flushChanges = useCallback(async (): Promise<boolean> => {
    try {
      await saveQueue.flushLatest();
      return true;
    } catch {
      toast.error(t('notes.closeSaveError'));
      return false;
    }
  }, [saveQueue, t]);

  const runExclusive = useCallback(async (action: () => Promise<boolean>): Promise<boolean> => {
    if (actionPendingRef.current) return false;
    actionPendingRef.current = true;
    setActionPending(true);
    try {
      return await action();
    } finally {
      actionPendingRef.current = false;
      if (mountedRef.current) setActionPending(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    void runExclusive(async () => {
      if (!(await flushChanges())) return false;
      onClose();
      return true;
    });
  }, [flushChanges, onClose, runExclusive]);

  const archiveNote = useCallback((): Promise<boolean> => runExclusive(async () => {
    if (!(await flushChanges())) return false;
    try {
      await updateItem(note.id, { status: 'archived' });
      onClose();
      return true;
    } catch {
      toast.error(t('notes.archiveError'));
      return false;
    }
  }), [flushChanges, note.id, onClose, runExclusive, t]);

  const performDelete = async (): Promise<boolean> => {
    if (archiveInsteadOfDelete) return archiveNote();

    return runExclusive(async () => {
      try {
        await deleteItem(note.id);
        onClose();
        return true;
      } catch {
        toast.error(t('notes.deleteError'));
        return false;
      }
    });
  };

  const handleDelete = () => {
    if (confirmBeforeDelete) setDeleteDialogOpen(true);
    else void performDelete();
  };

  const toggleTag = (tag: string) => {
    applyDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((currentTag) => currentTag !== tag)
        : [...current.tags, tag],
    }));
  };

  const handleContentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;

    const textarea = event.currentTarget;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = draft.content.substring(0, cursorPosition);
    const textAfterCursor = draft.content.substring(cursorPosition);
    const currentLine = textBeforeCursor.split('\n').pop() || '';
    const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
    const bulletMatch = currentLine.match(/^(\s*)([-•*])\s/);
    let insertion: string | null = null;

    if (numberedMatch) {
      insertion = `\n${numberedMatch[1]}${Number.parseInt(numberedMatch[2], 10) + 1}. `;
    } else if (bulletMatch) {
      insertion = `\n${bulletMatch[1]}${bulletMatch[2]} `;
    }

    if (!insertion) return;
    event.preventDefault();
    applyDraft((current) => ({
      ...current,
      content: textBeforeCursor + insertion + textAfterCursor,
    }));
    window.setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = cursorPosition + insertion.length;
    }, 0);
  };

  const retrySave = () => {
    void saveQueue.flushLatest().catch(() => {
      toast.error(t('notes.retrySaveError'));
    });
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          showCloseButton={false}
          aria-busy={actionPending || saveState === 'saving'}
          className="fixed inset-0 left-0 top-0 z-[100] flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[calc(100dvh-3rem)] lg:max-h-[900px] lg:w-[calc(100%-3rem)] lg:max-w-4xl lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border lg:border-border/60 lg:shadow-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('notes.editTitle', { title: draft.title || t('notes.untitled') })}</DialogTitle>
            <DialogDescription>
              {t('notes.editorDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="pt-safe flex min-h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between border-b border-border/40 px-4 lg:min-h-14 lg:px-6 lg:pt-0">
            <button
              type="button"
              onClick={handleClose}
              disabled={actionPending}
              aria-label={t('common.close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:cursor-wait disabled:opacity-50 sm:w-auto sm:px-2"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">{t('common.close')}</span>
            </button>

            <div className="flex items-center gap-3">
              <div aria-live="polite" className="flex items-center gap-2 text-[11px]">
                {saveState === 'pending' && <span className="text-muted-foreground">{t('notes.unsavedChanges')}</span>}
                {saveState === 'saving' && <span className="text-muted-foreground">{t('notes.saving')}</span>}
                {saveState === 'saved' && <span className="text-muted-foreground/70">{t('common.saved')}</span>}
                {saveState === 'error' && (
                  <button
                    type="button"
                    onClick={retrySave}
                    disabled={actionPending}
                    className="rounded-md px-2 py-1 font-medium text-destructive hover:bg-destructive/10"
                  >
                    {t('notes.saveFailedRetry')}
                  </button>
                )}
              </div>

              <Popover
                open={showSettings}
                onOpenChange={setShowSettings}
              >
                <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t('notes.options')}
                    disabled={actionPending}
                    className="orbit-pressable flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-50"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  aria-label={t('notes.options')}
                  className="max-h-[min(75vh,640px)] w-[min(280px,calc(100vw-1rem))] overflow-y-auto p-1"
                >
                  <div className="px-2 py-1.5">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {t('detail.category')}
                    </p>
                    <Select
                      value={draft.noteSubtype}
                      onValueChange={(value) => applyDraft((current) => ({
                        ...current,
                        noteSubtype: value as NoteSubtype,
                      }))}
                    >
                      <SelectTrigger aria-label={t('detail.category')} className="h-9 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTE_SUBTYPE_OPTIONS.map((type) => (
                          <SelectItem key={type} value={type} className="text-[12px] capitalize">
                            {t(`noteSubtype.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div role="separator" className="my-1 h-px bg-border" />

                  <div className="px-2 py-1.5">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {t('common.tags')}
                    </p>
                    <div className="flex max-h-[120px] flex-wrap gap-1 overflow-y-auto">
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          aria-pressed={draft.tags.includes(tag)}
                          className={cn(
                            'min-h-9 rounded-md px-2 py-1 text-[10px] font-medium transition-all',
                            draft.tags.includes(tag)
                              ? 'bg-foreground text-background'
                              : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div role="separator" className="my-1 h-px bg-border" />

                  <div className="px-2 py-1.5">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {tp(
                        'notes.linkedItems.one',
                        'notes.linkedItems.other',
                        visibleLinkedItems.length
                      )}
                    </p>
                    <div className="flex max-h-[160px] flex-col gap-1 overflow-y-auto">
                      {linkPickerItems.map((item: ThreadmapItem) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            void (links.isLinked(item.id)
                              ? links.handleRemoveLink(item.id)
                              : links.handleAddLink(item.id));
                          }}
                          aria-pressed={links.isLinked(item.id)}
                          className={cn(
                            'flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-all',
                            links.isLinked(item.id)
                              ? 'bg-foreground/10 font-medium text-foreground'
                              : 'text-muted-foreground/60 hover:bg-foreground/[0.04]'
                          )}
                        >
                          <span className="text-[10px]">
                            {item.emoji || (item.type === 'project' ? '📁' : '🎯')}
                          </span>
                          <span className="flex-1 truncate">{item.title}</span>
                          {links.isLinked(item.id) && <span className="text-[10px]">✓</span>}
                        </button>
                      ))}
                      {linkPickerItems.length === 0 && (
                        <p className="py-2 text-center text-[10px] text-muted-foreground/40">
                          {t('notes.noItemsToLink')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div role="separator" className="my-1 h-px bg-border" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(false);
                      void archiveNote();
                    }}
                    disabled={actionPending}
                    className="flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    {t('common.archive')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(false);
                      handleDelete();
                    }}
                    disabled={actionPending}
                    className="flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm text-red-600 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-ring/30 dark:text-red-400"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {t('common.delete')}
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {hasSaveError && (
            <div role="alert" className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive lg:px-8">
              {t('notes.saveError')}
            </div>
          )}

          {conflictingDraft && (
            <div role="alert" className="flex flex-col gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm lg:flex-row lg:items-center lg:px-8">
              <p className="min-w-0 flex-1 text-amber-950 dark:text-amber-100">
                {t('notes.recoveredDraftConflict')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const recovered = conflictingDraft;
                    draftBaseRef.current = {
                      revision: Number(note.revision || 0),
                      updatedAt: note.updatedAt,
                    };
                    applyDraft(() => recovered);
                    setConflictingDraft(null);
                  }}
                  className="min-h-11 rounded-lg bg-foreground px-3 font-medium text-background"
                >
                  {t('notes.restoreDraft')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearNoteDraft(note);
                    const cloudDraft = initialDraft(note);
                    saveQueue.resolveWithExternal(cloudDraft);
                    draftBaseRef.current = {
                      revision: Number(note.revision || 0),
                      updatedAt: note.updatedAt,
                    };
                    setDraft(cloudDraft);
                    setSaveState('saved');
                    setHasSaveError(false);
                    setConflictingDraft(null);
                  }}
                  className="min-h-11 rounded-lg px-3 font-medium hover:bg-foreground/[0.06]"
                >
                  {t('notes.discardDraft')}
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-3xl space-y-4">
              <input
                aria-label={t('notes.titleLabel')}
                type="text"
                value={draft.title}
                onChange={(event) => applyDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder={t('notes.titlePlaceholder')}
                readOnly={actionPending}
                className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/30 lg:text-3xl"
              />

              <textarea
                aria-label={t('notes.contentLabel')}
                ref={contentRef}
                value={draft.content}
                onChange={(event) => applyDraft((current) => ({ ...current, content: event.target.value }))}
                onKeyDown={handleContentKeyDown}
                placeholder={t('notes.startWriting')}
                readOnly={actionPending}
                className="min-h-[60vh] w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/30 lg:text-lg"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t(archiveInsteadOfDelete ? 'notes.archiveTitle' : 'notes.deleteTitle')}
        description={archiveInsteadOfDelete
          ? t('notes.archiveDescription')
          : t('notes.deleteDescription')}
        confirmLabel={t(archiveInsteadOfDelete ? 'common.archive' : 'common.delete')}
        onConfirm={performDelete}
      />
    </>
  );
}
