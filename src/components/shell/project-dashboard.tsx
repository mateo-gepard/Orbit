'use client';

import { useEffect, useState, useRef } from 'react';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  Trash2,
  Archive,
  RotateCcw,
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  Target,
  LayoutList,
  FileText,
  MoreVertical,
  Files,
  Network,
  ChevronDown,
  GanttChart,
} from 'lucide-react';
import { useThreadmapStore } from '@/lib/store';
import { updateItem, deleteItem, createItem } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';
import { useAuth } from '@/components/providers/auth-provider';
import { LinkGraph } from '@/components/items/link-graph';
import { ProjectRoadmap } from '@/components/items/project-roadmap';
import type { ThreadmapItem, ItemStatus, ProjectTier } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/responsive-action-menu';
import { FileUpload } from '@/components/files/file-upload';
import { cn, fullTimestampPattern, getLocale, shortDatePattern } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { format, isValid, parseISO } from 'date-fns';

const STATUS_OPTIONS: ItemStatus[] = ['active', 'waiting', 'done', 'archived'];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
      {children}
    </span>
  );
}

type OptionsMenuState = {
  optionsOpen: boolean;
  setOptionsOpen: (open: boolean) => void;
};

export function ProjectDashboard() {
  const { selectedItemId, setSelectedItemId, detailPanelOpen, setDetailPanelOpen, items, getAllTags } = useThreadmapStore();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const item = selectedItemId ? items.find(i => i.id === selectedItemId) : undefined;
  const itemId = item?.id;
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.content || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLinkGraph, setShowLinkGraph] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [optionsOpenDesktop, setOptionsOpenDesktop] = useState(false);
  const [optionsOpenMobile, setOptionsOpenMobile] = useState(false);
  const [doneCollapsed, setDoneCollapsed] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { confirmBeforeDelete, archiveInsteadOfDelete, dateFormat, timeFormat } = useSettingsStore((state) => state.settings);

  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({
    onClose: () => setDetailPanelOpen(false),
  });

  const allTags = getAllTags();

  const projectMilestones = itemId ? items.filter((i) => i.parentId === itemId && i.type === 'goal' && i.status !== 'archived') : [];
  const milestoneIds = new Set(projectMilestones.map((m) => m.id));
  const directProjectTasks = itemId ? items.filter((i) => i.parentId === itemId && i.type === 'task' && i.status !== 'archived') : [];
  const nestedProjectTasks = milestoneIds.size > 0
    ? items.filter((i) => i.type === 'task' && i.status !== 'archived' && milestoneIds.has(i.parentId!))
    : [];
  const projectTasks = [...directProjectTasks, ...nestedProjectTasks];

  // Sync title when item changes
  useEffect(() => {
    if (!item || isEditingTitle) return;
    const frame = requestAnimationFrame(() => setTitle(item.title));
    return () => cancelAnimationFrame(frame);
  }, [item, isEditingTitle]);

  useEffect(() => {
    if (!item || isEditingDescription) return;
    const frame = requestAnimationFrame(() => setDescription(item.content || ''));
    return () => cancelAnimationFrame(frame);
  }, [item, isEditingDescription]);

  useEffect(() => {
    setOptionsOpenDesktop(false);
    setOptionsOpenMobile(false);
  }, [item?.id]);

  useEffect(() => {
    if (detailPanelOpen) return;
    setOptionsOpenDesktop(false);
    setOptionsOpenMobile(false);
  }, [detailPanelOpen]);

  if (!item || item.type !== 'project') return null;

  const projectNotes = items.filter((i) => i.parentId === item.id && i.type === 'note' && i.status !== 'archived');

  const handleUpdate = async (updates: Partial<ThreadmapItem>) => {
    try {
      await updateItem(item.id, updates);
    } catch {
      toast.error(t('projects.saveError'));
    }
  };

  const performDelete = async (): Promise<boolean> => {
    try {
      if (archiveInsteadOfDelete) {
        await updateItem(item.id, { status: 'archived' });
      } else {
        await deleteItem(item.id);
      }
      setSelectedItemId(null);
      return true;
    } catch {
      toast.error(t('projects.deleteError'));
      return false;
    }
  };

  const handleDelete = () => {
    if (confirmBeforeDelete) setDeleteDialogOpen(true);
    else void performDelete();
  };

  const handleArchive = () => handleUpdate({ status: 'archived' });
  const handleRestore = () => handleUpdate({ status: 'active' });

  const validItemTags = (item.tags || []).filter(tag => allTags.includes(tag));

  const toggleTag = (tag: string) => {
    const tags = item.tags || [];
    const updated = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    handleUpdate({ tags: updated });
  };

  const handleNewTask = async (projectId: string, status: ItemStatus = 'active') => {
    if (!user) return;
    // This callback is only invoked by user interactions, never during render.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const id = await createItem({
      type: 'task',
      status,
      title: t('projects.newTaskTitle'),
      parentId: projectId,
      tags: [],
      userId: user.uid,
      createdAt: now,
      updatedAt: now,
    });
    setSelectedItemId(id);
  };

  const handleNewMilestone = async (projectId: string) => {
    if (!user) return;
    const id = await createItem({
      type: 'goal',
      status: 'active',
      title: t('projects.newMilestoneTitle'),
      parentId: projectId,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

  const handleNewNote = async (projectId: string) => {
    if (!user) return;
    try {
      const now = Date.now();
      const id = await createItem({
        type: 'note',
        status: 'active',
        title: t('projects.newNoteTitle'),
        parentId: projectId,
        tags: [],
        userId: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      setSelectedItemId(id);
    } catch {
      toast.error(t('projects.noteCreateError'));
    }
  };

  const stats = {
    total: projectTasks.length,
    done: projectTasks.filter((t) => t.status === 'done').length,
    active: projectTasks.filter((t) => t.status === 'active').length,
    waiting: projectTasks.filter((t) => t.status === 'waiting').length,
    progress: 0,
  };
  stats.progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const tasksByStatus = {
    active: projectTasks.filter((t) => t.status === 'active'),
    waiting: projectTasks.filter((t) => t.status === 'waiting'),
    done: projectTasks.filter((t) => t.status === 'done'),
  };

  const formatDueDate = (value: string) => {
    const date = parseISO(value);
    return isValid(date)
      ? format(date, shortDatePattern(dateFormat), { locale })
      : t('common.dateUnavailable');
  };

  const formatProjectTimestamp = (timestamp: number) => format(
    new Date(timestamp),
    fullTimestampPattern(dateFormat, timeFormat),
    { locale }
  );

  const renderContent = ({ optionsOpen, setOptionsOpen }: OptionsMenuState) => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="text-xl">{item.emoji || '📁'}</span>
          <span className="text-[13px] font-semibold">{title || t('type.project')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowRoadmap(true); }}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground active:scale-95 lg:h-8 lg:w-8"
            title={t('projects.viewRoadmap')}
            aria-label={t('projects.viewRoadmap')}
            type="button"
          >
            <GanttChart className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowLinkGraph(true); }}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground active:scale-95 lg:h-8 lg:w-8"
            title={t('projects.viewLinkGraph')}
            aria-label={t('projects.viewLinkGraph')}
            type="button"
          >
            <Network className="h-4 w-4" />
          </button>

          <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground lg:h-8 lg:w-8"
                aria-label={t('common.moreOptions')}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label={t('projects.settings')}
              className="max-h-[min(75vh,640px)] w-[min(280px,calc(100vw-1rem))] overflow-y-auto p-1"
            >
              <div className="px-2 py-2">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                  {t('projects.settings')}
                </p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground/50 block mb-1">{t('common.emoji')}</label>
                    <Input
                      aria-label={t('common.emoji')}
                      value={item.emoji || ''}
                      onChange={(e) => handleUpdate({ emoji: e.target.value })}
                      className="h-9 text-[12px]"
                      placeholder="📁"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground/50 block mb-1">{t('common.color')}</label>
                    <Input
                      aria-label={t('common.color')}
                      type="color"
                      value={item.color || '#6366f1'}
                      onChange={(e) => handleUpdate({ color: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-[10px] text-muted-foreground/50 block mb-1">{t('common.status')}</label>
                  <Select value={item.status} onValueChange={(v) => handleUpdate({ status: v as ItemStatus })}>
                    <SelectTrigger aria-label={t('common.status')} className="h-9 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize text-[11px]">{t(`status.${s}`)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mb-3">
                  <label className="text-[10px] text-muted-foreground/50 block mb-1">{t('projects.tier')}</label>
                  <div className="flex gap-1">
                    {([1, 2, 3] as ProjectTier[]).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => handleUpdate({ tier })}
                        aria-pressed={(item.tier ?? 3) === tier}
                        aria-label={t('projects.tierLabel', { tier })}
                        className={cn(
                          'h-9 flex-1 rounded-md text-[11px] font-medium transition-all',
                          (item.tier ?? 3) === tier
                            ? tier === 1
                              ? 'bg-foreground text-background'
                              : tier === 2
                                ? 'bg-foreground/80 text-background'
                                : 'bg-foreground/60 text-background'
                            : 'bg-foreground/[0.06] text-muted-foreground/60 hover:bg-foreground/[0.1]'
                        )}
                      >
                        T{tier}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground/50 block mb-1">{t('common.tags')}</label>
                  <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={validItemTags.includes(tag)}
                        className={cn(
                          'min-h-9 rounded-md px-2 py-1 text-[10px] font-medium transition-all',
                          validItemTags.includes(tag)
                            ? 'bg-foreground text-background'
                            : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div role="separator" className="my-1 h-px bg-border" />

              {item.status === 'archived' ? (
                <button type="button" onClick={() => { setOptionsOpen(false); void handleRestore(); }} className="flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/30">
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  {t('common.restore')}
                </button>
              ) : (
                <button type="button" onClick={() => { setOptionsOpen(false); void handleArchive(); }} className="flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/30">
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  {t('common.archive')}
                </button>
              )}
              <button type="button" onClick={() => { setOptionsOpen(false); handleDelete(); }} className="flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm text-red-600 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-ring/30 dark:text-red-400">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                {t('common.delete')}
              </button>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            onClick={() => setDetailPanelOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground lg:h-8 lg:w-8"
            aria-label={t('common.closePanel')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
        {/* Project Name - Editable */}
        <div className="px-4 pt-4 pb-3">
          <input
            aria-label={t('projects.name')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsEditingTitle(true)}
            onBlur={() => {
              setIsEditingTitle(false);
              handleUpdate({ title });
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleUpdate({ title })}
            className="w-full bg-transparent text-[20px] font-bold leading-tight outline-none placeholder:text-muted-foreground/30"
            placeholder={t('projects.namePlaceholder')}
          />
        </div>

        {/* Stats Cards */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border/40 bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-3">
              <div className="text-[10px] font-medium text-blue-600/70 dark:text-blue-400/70 uppercase tracking-wider mb-0.5">{t('common.progress')}</div>
              <div className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{stats.progress}%</div>
            </div>
            <div className="rounded-lg border border-border/40 bg-gradient-to-br from-green-500/5 to-green-500/10 p-3">
              <div className="text-[10px] font-medium text-green-600/70 dark:text-green-400/70 uppercase tracking-wider mb-0.5">{t('status.done')}</div>
              <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{stats.done}</div>
            </div>
            <div className="rounded-lg border border-border/40 bg-gradient-to-br from-orange-500/5 to-orange-500/10 p-3">
              <div className="text-[10px] font-medium text-orange-600/70 dark:text-orange-400/70 uppercase tracking-wider mb-0.5">{t('status.active')}</div>
              <div className="text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{stats.active}</div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-4 pb-4">
          <label htmlFor="project-description" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {t('common.description')}
          </label>
          <textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onFocus={() => setIsEditingDescription(true)}
            onBlur={() => {
              setIsEditingDescription(false);
              handleUpdate({ content: description });
            }}
            placeholder={t('projects.contextPlaceholder')}
            rows={3}
            className="w-full resize-y rounded-lg border border-border/50 bg-card px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/35 focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>

        {/* Quick Actions */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              onClick={() => handleNewTask(item.id, 'active')}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[12px] font-medium hover:bg-foreground/[0.02] hover:border-border transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('projects.addTask')}
            </button>
            <button
              onClick={() => handleNewMilestone(item.id)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[12px] font-medium hover:bg-foreground/[0.02] hover:border-border transition-colors"
            >
              <Target className="h-4 w-4" />
              {t('projects.milestones')}
            </button>
            <button
              type="button"
              onClick={() => handleNewNote(item.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[12px] font-medium transition-colors hover:border-border hover:bg-foreground/[0.02]"
            >
              <FileText className="h-4 w-4" />
              {t('projects.addNote')}
            </button>
          </div>
        </div>

        {/* Milestones */}
        {projectMilestones.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Target className="h-3.5 w-3.5 text-muted-foreground/50" />
              <FieldLabel>{t('projects.milestonesCount', { count: projectMilestones.length })}</FieldLabel>
            </div>
            <div className="space-y-1.5">
              {projectMilestones.map((milestone) => (
                <button
                  key={milestone.id}
                  onClick={() => setSelectedItemId(milestone.id)}
                  className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                >
                  <CheckCircle2 className={cn(
                    "h-4 w-4 shrink-0",
                    milestone.status === 'done' ? 'text-green-500' : 'text-muted-foreground/30'
                  )} />
                  <span className={cn(
                    "text-[13px] font-medium flex-1",
                    milestone.status === 'done' ? 'text-muted-foreground/60 line-through' : 'text-foreground/90 group-hover:text-foreground'
                  )}>
                    {milestone.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Kanban Board */}
        <div className="px-4">
          <div className="flex items-center gap-1.5 mb-3">
            <LayoutList className="h-3.5 w-3.5 text-muted-foreground/50" />
            <FieldLabel>{t('projects.tasksCount', { count: stats.total })}</FieldLabel>
          </div>
          <div className="space-y-4">
            {/* Active */}
            {(tasksByStatus.active.length > 0 || stats.total === 0) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{t('kanban.inProgress')}</h4>
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">{tasksByStatus.active.length}</span>
                </div>
                <div className="space-y-1">
                  {tasksByStatus.active.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedItemId(task.id)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Circle className="h-2 w-2 text-blue-500 fill-blue-500" />
                        <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground flex-1">
                          {task.title}
                        </p>
                      </div>
                      {task.dueDate && (
                        <p className="text-[11px] text-muted-foreground/40 mt-0.5 ml-4">{t('projects.due', { date: formatDueDate(task.dueDate) })}</p>
                      )}
                    </button>
                  ))}
                  {tasksByStatus.active.length === 0 && (
                    <button
                      onClick={() => handleNewTask(item.id, 'active')}
                      className="w-full px-3 py-2 rounded-lg border border-dashed border-border/40 hover:border-border hover:bg-foreground/[0.02] transition-colors text-[12px] text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1.5"
                    >
                      <Plus className="h-3 w-3" />
                      {t('projects.addTask')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Waiting */}
            {tasksByStatus.waiting.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{t('status.waiting')}</h4>
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">{tasksByStatus.waiting.length}</span>
                </div>
                <div className="space-y-1">
                  {tasksByStatus.waiting.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedItemId(task.id)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-amber-500" />
                        <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground flex-1">
                          {task.title}
                        </p>
                      </div>
                      {task.dueDate && (
                        <p className="text-[11px] text-muted-foreground/40 mt-0.5 ml-5">{t('projects.due', { date: formatDueDate(task.dueDate) })}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Done — Collapsible */}
            {tasksByStatus.done.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDoneCollapsed(!doneCollapsed)}
                  aria-expanded={!doneCollapsed}
                  className="flex items-center justify-between w-full mb-1.5 group"
                >
                  <div className="flex items-center gap-1">
                    <ChevronDown className={cn(
                      "h-3 w-3 text-muted-foreground/40 transition-transform duration-200",
                      doneCollapsed && "-rotate-90"
                    )} />
                    <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{t('status.done')}</h4>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">{tasksByStatus.done.length}</span>
                </button>
                {!doneCollapsed && (
                  <div className="space-y-1">
                    {tasksByStatus.done.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedItemId(task.id)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-foreground/30" />
                          <p className="text-[13px] font-medium text-muted-foreground/40 line-through flex-1">
                            {task.title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="px-4 pb-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
              <FieldLabel>{t('projects.notesCount', { count: projectNotes.length })}</FieldLabel>
              </div>
              <button type="button" onClick={() => handleNewNote(item.id)} className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground">
                {t('projects.addNote')}
              </button>
            </div>
            {projectNotes.length > 0 ? <div className="space-y-1.5">
              {projectNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setSelectedItemId(note.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-medium text-foreground/90 group-hover:text-foreground flex-1">
                      {note.title}
                    </p>
                    {note.noteSubtype && note.noteSubtype !== 'general' && (
                      <span className="text-[10px] text-muted-foreground/40 capitalize shrink-0">
                        {t(`noteSubtype.${note.noteSubtype}`)}
                      </span>
                    )}
                  </div>
                  {note.content && (
                    <p className="text-[11px] text-muted-foreground/50 mt-1 line-clamp-2">
                      {note.content.replace(/<[^>]*>/g, '')}
                    </p>
                  )}
                </button>
              ))}
            </div> : <p className="rounded-lg border border-dashed border-border/50 px-3 py-4 text-center text-[12px] text-muted-foreground/50">{t('projects.noNotes')}</p>}
          </div>

        {/* Files */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Files className="h-3.5 w-3.5 text-muted-foreground/50" />
            <FieldLabel>{t('projects.files')}</FieldLabel>
          </div>
          <FileUpload item={item} />
        </div>

        {/* Meta */}
        <div className="h-px bg-border/40 mx-4 mt-2" />
        <div className="px-4 py-4 space-y-0.5 text-[11px] text-muted-foreground/40">
          <p>{t('common.createdAt', { date: formatProjectTimestamp(item.createdAt) })}</p>
          <p>{t('common.updatedAt', { date: formatProjectTimestamp(item.updatedAt) })}</p>
        </div>
      </div>

      {/* Link Graph */}
      {showLinkGraph && (
        <LinkGraph
          open={showLinkGraph}
          onClose={() => setShowLinkGraph(false)}
          currentItem={item}
          allItems={items}
          onNavigate={(id) => setSelectedItemId(id)}
        />
      )}

      {/* Roadmap */}
      {showRoadmap && (
        <ProjectRoadmap
          open={showRoadmap}
          onClose={() => setShowRoadmap(false)}
          project={item}
          allItems={items}
          onNavigate={(id) => { setSelectedItemId(id); setShowRoadmap(false); }}
        />
      )}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className={cn(
        'hidden lg:block border-l border-border/60 bg-background transition-all duration-200',
        detailPanelOpen ? 'w-96' : 'w-0 overflow-hidden'
      )}>
        {renderContent({
          optionsOpen: optionsOpenDesktop,
          setOptionsOpen: setOptionsOpenDesktop,
        })}
      </div>

      {/* Mobile */}
      <div className="lg:hidden">
        <Sheet open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
          <SheetContent
            side="bottom"
            className="mobile-sheet-height rounded-t-2xl p-0 border-0"
            showCloseButton={false}
            style={swipeStyles}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t('projects.dashboard')}</SheetTitle>
            </SheetHeader>
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
              {renderContent({
                optionsOpen: optionsOpenMobile,
                setOptionsOpen: setOptionsOpenMobile,
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t(archiveInsteadOfDelete ? 'projects.archiveTitle' : 'projects.deleteTitle')}
        description={t(archiveInsteadOfDelete ? 'projects.archiveDescription' : 'projects.deleteDescription')}
        confirmLabel={t(archiveInsteadOfDelete ? 'common.archive' : 'common.delete')}
        onConfirm={performDelete}
      />
    </>
  );
}
