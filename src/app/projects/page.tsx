"use client";
import { useMemo, useState, useRef } from "react";
import {
  FolderKanban,
  Plus,
  LayoutGrid,
  LayoutList,
  Circle,
  Clock,
  Target,
  ChevronRight,
  ChevronDown,
  Star,
  Layers,
  Archive,
} from "lucide-react";
import { useOrbitStore } from "@/lib/store";
import { useAuth } from "@/components/providers/auth-provider";
import { createItem } from "@/lib/firestore";
import { cn, getLocale, shortDatePattern } from "@/lib/utils";
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import type { OrbitItem, ProjectTier } from "@/lib/types";
import { useSettingsStore } from '@/lib/settings-store';
import { format, isValid, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type ViewMode = "grid" | "kanban";

const TIER_CONFIG = {
  1: { labelKey: 'projects.tier.focus', icon: Star },
  2: { labelKey: 'projects.tier.active', icon: Layers },
  3: { labelKey: 'projects.tier.backlog', icon: Archive },
} as const satisfies Record<ProjectTier, { labelKey: TranslationKey; icon: typeof Star }>;

function getTimestamp() {
  return Date.now();
}

export default function ProjectsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const { t, tp, lang } = useTranslation();
  const dateFormat = useSettingsStore((state) => state.settings.dateFormat);
  const locale = getLocale(lang);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const createInFlightRef = useRef(false);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [discardProjectDraftOpen, setDiscardProjectDraftOpen] = useState(false);
  const taskCreateInFlightRef = useRef(false);
  const [creatingTaskKey, setCreatingTaskKey] = useState<string | null>(null);
  const [taskCreateError, setTaskCreateError] = useState<{
    projectId: string;
    status: 'active' | 'waiting' | 'done';
    message: string;
  } | null>(null);

  const projects = useMemo(
    () => items.filter((i) => i.type === "project" && i.status !== "archived"),
    [items],
  );

  const projectsByTier = useMemo(() => {
    const grouped: Record<number, OrbitItem[]> = { 1: [], 2: [], 3: [] };
    for (const p of projects) {
      const tier = p.tier ?? 3;
      grouped[tier].push(p);
    }
    return grouped;
  }, [projects]);

  const toggleTier = (tier: number) => {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const getProjectMilestones = (projectId: string) => {
    return items.filter((i) => i.parentId === projectId && i.type === "goal" && i.status !== "archived");
  };

  // Collect all tasks: direct children + tasks under milestones
  const getAllProjectTasks = (projectId: string) => {
    const direct = items.filter((i) => i.parentId === projectId && i.type === "task" && i.status !== "archived");
    const milestoneIds = new Set(getProjectMilestones(projectId).map((m) => m.id));
    const nested = milestoneIds.size > 0
      ? items.filter((i) => i.type === "task" && i.status !== "archived" && milestoneIds.has(i.parentId!))
      : [];
    return [...direct, ...nested];
  };

  const getProjectStats = (projectId: string) => {
    const tasks = getAllProjectTasks(projectId);
    const total = tasks.length;
    const done = tasks.filter((i) => i.status === "done").length;
    const inProgress = tasks.filter((i) => i.status === "active").length;
    const waiting = tasks.filter((i) => i.status === "waiting").length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, waiting, progress };
  };

  const handleNewProject = async (tier: ProjectTier = 3) => {
    if (createInFlightRef.current) return;
    if (!user) {
      setProjectCreateError(lang === 'de'
        ? 'Deine Sitzung ist nicht mehr aktiv. Melde dich erneut an und versuche es noch einmal.'
        : 'Your session is no longer active. Sign in again and retry.');
      return;
    }

    createInFlightRef.current = true;
    setProjectSubmitting(true);
    setProjectCreateError(null);
    const now = getTimestamp();
    const title = newTitle.trim() || t('projects.untitledProject');
    const content = newDescription.trim() || undefined;

    try {
      const id = await createItem({
        type: "project",
        status: "active",
        title,
        content,
        emoji: "\ud83d\ude80",
        color: "#6366f1",
        tier,
        tags: [],
        userId: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      setIsCreating(false);
      setDiscardProjectDraftOpen(false);
      setNewTitle('');
      setNewDescription('');
      setSelectedItemId(id);
    } catch (cause) {
      console.error('[THREADMAP] Project creation failed:', cause);
      setProjectCreateError(lang === 'de'
        ? 'Das Projekt konnte nicht erstellt werden. Dein Entwurf wurde beibehalten. Versuche es erneut.'
        : 'The project could not be created. Your draft is still here. Please retry.');
    } finally {
      createInFlightRef.current = false;
      setProjectSubmitting(false);
    }
  };

  const handleStartCreating = () => {
    setProjectCreateError(null);
    setIsCreating(true);
  };

  const closeProjectCreator = () => {
    if (createInFlightRef.current) return;
    setIsCreating(false);
    setDiscardProjectDraftOpen(false);
    setNewTitle('');
    setNewDescription('');
    setProjectCreateError(null);
  };

  const handleCancelCreating = () => {
    if (createInFlightRef.current) return;
    if (newTitle.trim() || newDescription.trim()) {
      setDiscardProjectDraftOpen(true);
      return;
    }
    closeProjectCreator();
  };

  const handleNewTask = async (
    projectId: string,
    status: "active" | "waiting" | "done" = "active",
  ) => {
    if (taskCreateInFlightRef.current) return;
    const taskKey = `${projectId}:${status}`;
    if (!user) {
      setTaskCreateError({
        projectId,
        status,
        message: lang === 'de'
          ? 'Deine Sitzung ist nicht mehr aktiv. Melde dich erneut an und versuche es noch einmal.'
          : 'Your session is no longer active. Sign in again and retry.',
      });
      return;
    }

    taskCreateInFlightRef.current = true;
    setCreatingTaskKey(taskKey);
    setTaskCreateError(null);
    const now = getTimestamp();
    try {
      const id = await createItem({
        type: "task",
        status,
        ...(status === 'done' ? { completedAt: now } : {}),
        title: t('projects.newTaskTitle'),
        parentId: projectId,
        tags: [],
        userId: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      setSelectedItemId(id);
    } catch (cause) {
      console.error('[THREADMAP] Project task creation failed:', cause);
      setTaskCreateError({
        projectId,
        status,
        message: lang === 'de'
          ? 'Die Aufgabe konnte nicht erstellt werden. Versuche es erneut.'
          : 'The task could not be created. Please retry.',
      });
    } finally {
      taskCreateInFlightRef.current = false;
      setCreatingTaskKey(null);
    }
  };

  const getProjectTasks = (projectId: string, status?: string) => {
    const all = getAllProjectTasks(projectId);
    return status ? all.filter((i) => i.status === status) : all;
  };

  const formatDueDate = (value: string) => {
    const date = parseISO(value);
    return isValid(date)
      ? format(date, shortDatePattern(dateFormat), { locale })
      : t('common.dateUnavailable');
  };

  // ═══ Tier 1 Card — Large & Prominent ═══
  const renderTier1Card = (project: OrbitItem) => {
    const stats = getProjectStats(project.id);
    const milestones = getProjectMilestones(project.id);

    return (
      <button
        key={project.id}
        onClick={() => setSelectedItemId(project.id)}
        className="w-full text-left rounded-xl lg:rounded-2xl border border-foreground/15 bg-card overflow-hidden hover:border-foreground/25 transition-all hover:shadow-lg group"
      >
        {/* Color accent top bar */}
        <div className="h-1 w-full" style={{ backgroundColor: project.color || '#6366f1' }} />

        <div className="p-4 lg:p-5">
          <div className="flex items-start gap-3">
            <span className="text-3xl leading-none mt-0.5">{project.emoji || "📁"}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-[16px] lg:text-[17px] font-bold truncate group-hover:text-foreground transition-colors">
                {project.title}
              </h3>
              {project.content && (
                <p className="text-[12px] text-muted-foreground/50 mt-1 line-clamp-2">
                  {project.content}
                </p>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground/60 font-medium">
                {tp('projects.taskProgress.one', 'projects.taskProgress.other', stats.total, { done: stats.done, total: stats.total })}
              </span>
              <span className="text-foreground/80 font-bold tabular-nums">{stats.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${stats.progress}%`,
                  backgroundColor: project.color || '#6366f1',
                  opacity: 0.7,
                }}
              />
            </div>
          </div>

          {/* Task & Milestone stats row */}
          <div className="mt-3 flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <Circle className="h-2.5 w-2.5" />
              <span>{tp('projects.active.one', 'projects.active.other', stats.inProgress)}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <Clock className="h-2.5 w-2.5" />
              <span>{tp('projects.waiting.one', 'projects.waiting.other', stats.waiting)}</span>
            </div>
            {milestones.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground/50">
                <Target className="h-2.5 w-2.5" />
                <span>{tp('projects.milestoneProgress.one', 'projects.milestoneProgress.other', milestones.length, {
                  done: milestones.filter(m => m.status === 'done').length,
                  total: milestones.length,
                })}</span>
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  // ═══ Tier 2 Card — Standard ═══
  const renderTier2Card = (project: OrbitItem) => {
    const stats = getProjectStats(project.id);
    const milestones = getProjectMilestones(project.id);

    return (
      <button
        key={project.id}
        onClick={() => setSelectedItemId(project.id)}
        className="w-full text-left rounded-xl lg:rounded-2xl border border-border/60 bg-card overflow-hidden hover:border-border/80 transition-all hover:shadow-md group"
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5">{project.emoji || "📁"}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold truncate group-hover:text-foreground transition-colors">
                {project.title}
              </h3>
              {project.content && (
                <p className="text-[12px] text-muted-foreground/50 mt-0.5 line-clamp-2">
                  {project.content}
                </p>
              )}
            </div>
          </div>

          {/* Compact progress */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground/50">
                {tp('projects.taskProgress.one', 'projects.taskProgress.other', stats.total, { done: stats.done, total: stats.total })}
              </span>
              <span className="text-muted-foreground/50 tabular-nums">{stats.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/20 transition-all"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <Circle className="h-2.5 w-2.5" />
              <span>{tp('projects.active.one', 'projects.active.other', stats.inProgress)}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <Clock className="h-2.5 w-2.5" />
              <span>{tp('projects.waiting.one', 'projects.waiting.other', stats.waiting)}</span>
            </div>
          </div>

          {milestones.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Target className="h-3 w-3" />
                <span>{tp('projects.milestoneProgress.one', 'projects.milestoneProgress.other', milestones.length, {
                  done: milestones.filter(m => m.status === 'done').length,
                  total: milestones.length,
                })}</span>
              </div>
            </div>
          )}
        </div>
      </button>
    );
  };

  // ═══ Tier 3 Row — Compact ═══
  const renderTier3Row = (project: OrbitItem) => {
    const stats = getProjectStats(project.id);

    return (
      <button
        key={project.id}
        onClick={() => setSelectedItemId(project.id)}
        className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border border-border/40 bg-card hover:border-border/60 hover:bg-foreground/[0.01] transition-all group"
      >
        <span className="text-lg leading-none">{project.emoji || "📁"}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-medium truncate group-hover:text-foreground transition-colors">
            {project.title}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/40 shrink-0">
          <span className="tabular-nums">{stats.done}/{stats.total}</span>
          <div className="w-16 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden hidden sm:block">
            <div
              className="h-full rounded-full bg-foreground/15 transition-all"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <span className="tabular-nums w-8 text-right">{stats.progress}%</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
      </button>
    );
  };

  // ═══ Kanban Project Section ═══
  const renderKanbanProject = (project: OrbitItem) => {
    const stats = getProjectStats(project.id);
    const columns = [
      { id: "active", label: t('kanban.inProgress'), tasks: getProjectTasks(project.id, "active") },
      { id: "waiting", label: t('kanban.waiting'), tasks: getProjectTasks(project.id, "waiting") },
      { id: "done", label: t('kanban.done'), tasks: getProjectTasks(project.id, "done") },
    ];

    return (
      <div key={project.id} className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedItemId(project.id)}
            className="flex items-center gap-2 group"
          >
            <span className="text-xl">{project.emoji || "📁"}</span>
            <h3 className="text-[15px] font-semibold group-hover:text-foreground transition-colors">
              {project.title}
            </h3>
            <span className="text-[11px] text-muted-foreground/40 tabular-nums">
              {stats.progress}%
            </span>
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                <h4 className="text-[12px] font-medium text-muted-foreground/70">
                  {column.label}
                </h4>
                <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                  {column.tasks.length}
                </span>
              </div>
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {column.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedItemId(task.id)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                  >
                    <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                      {task.title}
                    </p>
                    {task.dueDate && (
                      <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                        {t('projects.due', { date: formatDueDate(task.dueDate) })}
                      </p>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void handleNewTask(project.id, column.id as "active" | "waiting" | "done")}
                  disabled={creatingTaskKey !== null}
                  aria-busy={creatingTaskKey === `${project.id}:${column.id}`}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-border/40 hover:border-border hover:bg-foreground/[0.02] transition-colors text-[12px] text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1.5 disabled:cursor-wait disabled:opacity-60"
                >
                  <Plus aria-hidden="true" className="h-3 w-3" />
                  {creatingTaskKey === `${project.id}:${column.id}`
                    ? (lang === 'de' ? 'Wird erstellt …' : 'Creating…')
                    : t('projects.addTask')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ═══ Tier Section Renderer ═══
  const renderTierSection = (tier: 1 | 2 | 3) => {
    const config = TIER_CONFIG[tier];
    const Icon = config.icon;
    const tierProjects = projectsByTier[tier];
    const isCollapsed = collapsedTiers.has(tier);

    if (tierProjects.length === 0) return null;

    return (
      <div>
        {/* Tier Header */}
        <button
          onClick={() => toggleTier(tier)}
          aria-expanded={!isCollapsed}
          className="flex items-center gap-2.5 w-full mb-3 group"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-200",
              isCollapsed && "-rotate-90",
            )}
          />
          <div className={cn(
            "flex items-center justify-center h-5 w-5 rounded",
            tier === 1 ? "bg-foreground text-background" : tier === 2 ? "bg-foreground/15" : "bg-foreground/[0.06]",
          )}>
            <Icon className={cn("h-3 w-3", tier === 1 ? "" : "text-muted-foreground/60")} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">
            {t(config.labelKey)}
          </span>
          <span className="text-[11px] text-muted-foreground/40 tabular-nums">
            {tierProjects.length}
          </span>
        </button>

        {!isCollapsed && (
          <>
            {viewMode === "grid" ? (
              tier === 3 ? (
                // Tier 3: compact rows
                <div className="space-y-1.5">
                  {tierProjects.map((project) => (
                    renderTier3Row(project)
                  ))}
                </div>
              ) : (
                // Tier 1 & 2: card grids
                <div className={cn(
                  "grid gap-3",
                  tier === 1
                    ? "grid-cols-1 lg:grid-cols-2"
                    : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
                )}>
                  {tierProjects.map((project) =>
                    tier === 1 ? (
                      renderTier1Card(project)
                    ) : (
                      renderTier2Card(project)
                    )
                  )}
                </div>
              )
            ) : (
              // Kanban view
              <div className="space-y-8">
                {tierProjects.map((project) => (
                  renderKanbanProject(project)
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog
        open={isCreating}
        onOpenChange={(open) => {
          if (open) {
            setIsCreating(true);
            return;
          }
          handleCancelCreating();
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-busy={projectSubmitting}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            handleCancelCreating();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
            handleCancelCreating();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleInputRef.current?.focus();
          }}
          className="fixed left-1/2 top-[max(env(safe-area-inset-top,0px),8px)] w-[calc(100%-1.5rem)] max-w-[520px] translate-x-[-50%] translate-y-0 gap-0 overflow-hidden rounded-2xl border-border/60 bg-popover p-0 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)] lg:top-[18vh] lg:rounded-xl lg:shadow-[0_16px_70px_-12px_rgba(0,0,0,0.25)]"
        >
              <DialogTitle className="sr-only">{t('projects.createDialogTitle')}</DialogTitle>
              <DialogDescription className="sr-only">
                {lang === 'de'
                  ? 'Gib einen Projektnamen und optional eine Beschreibung ein.'
                  : 'Enter a project name and an optional description.'}
              </DialogDescription>
              {/* Title Input */}
              <div className="flex items-center gap-3 px-4 py-3 lg:py-3">
                <FolderKanban className="h-5 w-5 lg:h-4 lg:w-4 shrink-0 text-muted-foreground/50" />
                <input
                  id="new-project-title"
                  aria-label={t('projects.nameLabel')}
                  ref={titleInputRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void handleNewProject();
                    }
                  }}
                  placeholder={t('projects.namePlaceholder')}
                  className="flex-1 bg-transparent text-base lg:text-sm outline-none placeholder:text-muted-foreground/40"
                  autoComplete="off"
                  autoCorrect="off"
                  disabled={projectSubmitting}
                />
                <button
                  type="button"
                  onClick={handleCancelCreating}
                  disabled={projectSubmitting}
                  className="min-h-11 rounded-lg px-2 text-[12px] font-medium text-muted-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:hidden"
                >
                  {t('common.cancel')}
                </button>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Description Input */}
              <div className="px-4 py-3 lg:py-3">
                <textarea
                  aria-label={t('projects.descriptionLabel')}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void handleNewProject();
                    }
                  }}
                  placeholder={t('projects.descriptionPlaceholder')}
                  className="w-full bg-transparent text-[14px] lg:text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40 resize-none min-h-[80px] max-h-[30vh] overflow-y-auto leading-relaxed"
                  rows={3}
                  disabled={projectSubmitting}
                />
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {projectCreateError && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/15 bg-destructive/[0.06] px-4 py-2.5 text-[12px] leading-relaxed text-destructive"
                >
                  <p>{projectCreateError}</p>
                  <button
                    type="button"
                    onClick={() => void handleNewProject()}
                    disabled={projectSubmitting}
                    aria-busy={projectSubmitting}
                    className="min-h-9 rounded-lg bg-destructive/10 px-3 font-medium transition-colors hover:bg-destructive/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 bg-muted/30 px-4 py-2.5 lg:py-2">
                <button
                  type="button"
                  onClick={handleCancelCreating}
                  disabled={projectSubmitting}
                  className="min-h-11 rounded-lg px-3 text-[12px] font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-9 lg:text-[11px]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleNewProject()}
                  disabled={projectSubmitting}
                  aria-busy={projectSubmitting}
                  className="orbit-pressable min-h-11 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:cursor-wait disabled:opacity-70 lg:min-h-9 lg:text-[11px]"
                >
                  {projectSubmitting
                    ? (lang === 'de' ? 'Wird erstellt …' : 'Creating…')
                    : t('common.create')}
                </button>
              </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardProjectDraftOpen}
        onOpenChange={(open) => {
          if (!projectSubmitting) setDiscardProjectDraftOpen(open);
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogTitle>
            {lang === 'de' ? 'Projektentwurf verwerfen?' : 'Discard project draft?'}
          </DialogTitle>
          <DialogDescription>
            {lang === 'de'
              ? 'Name und Beschreibung wurden noch nicht gespeichert. Diese Änderungen gehen beim Verwerfen verloren.'
              : 'The name and description have not been saved. Discarding will permanently remove these changes.'}
          </DialogDescription>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDiscardProjectDraftOpen(false)}
              className="min-h-11 rounded-lg border border-border/70 px-4 text-[13px] font-medium hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {lang === 'de' ? 'Weiter bearbeiten' : 'Keep editing'}
            </button>
            <button
              type="button"
              onClick={closeProjectCreator}
              className="min-h-11 rounded-lg bg-destructive px-4 text-[13px] font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive/30"
            >
              {lang === 'de' ? 'Entwurf verwerfen' : 'Discard draft'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto" data-slot="page-content">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-[22px] font-semibold tracking-tight">
            {t('nav.projects')}
          </h1>
          <p className="text-[13px] text-muted-foreground/60 mt-1">
            {tp('projects.count.one', 'projects.count.other', projects.length)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/40 p-1" role="group" aria-label={t('projects.projectView')}>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label={t('projects.gridView')}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('projects.grid')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              aria-pressed={viewMode === "kanban"}
              aria-label={t('projects.boardView')}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('projects.board')}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleStartCreating}
            className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-2 text-[13px] lg:text-[12px] font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" /> {t('projects.newProject')}
          </button>
        </div>
      </div>

      {taskCreateError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.05] px-3 py-2.5 text-[12px] text-destructive">
          <p>{taskCreateError.message}</p>
          <button
            type="button"
            onClick={() => void handleNewTask(taskCreateError.projectId, taskCreateError.status)}
            disabled={creatingTaskKey !== null}
            aria-busy={creatingTaskKey !== null}
            className="min-h-9 rounded-lg bg-destructive/10 px-3 font-medium transition-colors hover:bg-destructive/20 disabled:cursor-wait disabled:opacity-60"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Tier Sections */}
      {projects.length > 0 ? (
        <div className="space-y-8">
          {renderTierSection(1)}
          {renderTierSection(2)}
          {renderTierSection(3)}
        </div>
      ) : (
        <div className="py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
            <FolderKanban className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-[13px] text-muted-foreground/50">
            {t('projects.noProjects')}
          </p>
          <p className="text-[12px] text-muted-foreground/30 mt-1">
            {t('projects.createToStart')}
          </p>
        </div>
      )}
    </div>
    </>
  );
}
