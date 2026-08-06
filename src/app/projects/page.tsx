"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { format, isValid, parseISO } from "date-fns";
import {
  FolderKanban,
  Plus,
  LayoutGrid,
  LayoutList,
  Circle,
  CheckCircle2,
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
import { createItem, updateItem } from "@/lib/firestore";
import { cn } from "@/lib/utils";
import { useTranslation } from '@/lib/i18n';
import type { OrbitItem, ProjectTier } from "@/lib/types";

type ViewMode = "grid" | "kanban";

const TIER_CONFIG = {
  1: { label: "Focus", description: "Top priority projects", icon: Star },
  2: { label: "Active", description: "Ongoing projects", icon: Layers },
  3: { label: "Backlog", description: "Lower priority", icon: Archive },
} as const;

export default function ProjectsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const projects = useMemo(
    () => items.filter((i) => i.type === "project" && i.status !== "archived" && i.status !== "done"),
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
    return items.filter((i) => i.parentId === projectId && i.type === "goal");
  };

  // Collect all tasks: direct children + tasks under milestones
  const getAllProjectTasks = (projectId: string) => {
    const direct = items.filter((i) => i.parentId === projectId && i.type === "task");
    const milestoneIds = new Set(getProjectMilestones(projectId).map((m) => m.id));
    const nested = milestoneIds.size > 0
      ? items.filter((i) => i.type === "task" && milestoneIds.has(i.parentId!))
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
    if (!user || !newTitle.trim()) return;
    const id = await createItem({
      type: "project",
      status: "active",
      title: newTitle.trim(),
      content: newDescription.trim() || undefined,
      emoji: "\ud83d\ude80",
      color: "#6366f1",
      tier,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setIsCreating(false);
    setNewTitle('');
    setNewDescription('');
    setSelectedItemId(id);
  };

  const handleStartCreating = () => {
    setIsCreating(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const handleCancelCreating = () => {
    setIsCreating(false);
    setNewTitle('');
    setNewDescription('');
  };

  useEffect(() => {
    if (!isCreating) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsCreating(false);
      setNewTitle("");
      setNewDescription("");
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isCreating]);

  const handleNewTask = async (
    projectId: string,
    status: "active" | "waiting" | "done" = "active",
  ) => {
    if (!user) return;
    const id = await createItem({
      type: "task",
      status,
      title: "New Task",
      parentId: projectId,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(status === "done" ? { completedAt: Date.now() } : {}),
    });
    setSelectedItemId(id);
  };

  const getProjectTasks = (projectId: string, status?: string) => {
    const all = getAllProjectTasks(projectId);
    return status ? all.filter((i) => i.status === status) : all;
  };

  const formatDueDate = (date: string) => {
    const parsed = parseISO(date);
    return isValid(parsed) ? format(parsed, "MMM d, yyyy") : "Date unavailable";
  };

  const handleTaskStatus = async (task: OrbitItem, status: "active" | "waiting" | "done") => {
    await updateItem(task.id, {
      status,
      completedAt: status === "done" ? task.completedAt ?? Date.now() : null,
    });
  };

  // ═══ Tier 1 Card — Large & Prominent ═══
  const Tier1Card = ({ project }: { project: OrbitItem }) => {
    const stats = getProjectStats(project.id);
    const milestones = getProjectMilestones(project.id);

    return (
      <button
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
              <span className="text-muted-foreground/60 font-medium">{stats.done}/{stats.total} tasks</span>
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
              <span>{stats.inProgress} active</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <Clock className="h-2.5 w-2.5" />
              <span>{stats.waiting} waiting</span>
            </div>
            {milestones.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground/50">
                <Target className="h-2.5 w-2.5" />
                <span>{milestones.filter(m => m.status === 'done').length}/{milestones.length} milestones</span>
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  // ═══ Tier 2 Card — Standard ═══
  const Tier2Card = ({ project }: { project: OrbitItem }) => {
    const stats = getProjectStats(project.id);
    const milestones = getProjectMilestones(project.id);

    return (
      <button
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
              <span className="text-muted-foreground/50">{stats.done}/{stats.total} tasks</span>
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
              <span>{stats.inProgress} active</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground/50">
              <Clock className="h-2.5 w-2.5" />
              <span>{stats.waiting} waiting</span>
            </div>
          </div>

          {milestones.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Target className="h-3 w-3" />
                <span>{milestones.filter(m => m.status === 'done').length}/{milestones.length} milestones</span>
              </div>
            </div>
          )}
        </div>
      </button>
    );
  };

  // ═══ Tier 3 Row — Compact ═══
  const Tier3Row = ({ project }: { project: OrbitItem }) => {
    const stats = getProjectStats(project.id);

    return (
      <button
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
  const KanbanProject = ({ project }: { project: OrbitItem }) => {
    const stats = getProjectStats(project.id);
    const columns = [
      { id: "active", label: "In Progress", tasks: getProjectTasks(project.id, "active") },
      { id: "waiting", label: "Waiting", tasks: getProjectTasks(project.id, "waiting") },
      { id: "done", label: "Done", tasks: getProjectTasks(project.id, "done") },
    ];

    return (
      <div className="space-y-3">
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
                  <div
                    key={task.id}
                    className="w-full rounded-lg border border-border/30 bg-background px-3 py-2 text-left transition-colors hover:border-border hover:bg-foreground/[0.02] group"
                  >
                    <button
                      onClick={() => setSelectedItemId(task.id)}
                      className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block text-[13px] font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                        {task.title}
                      </span>
                    </button>
                    {task.dueDate && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                        Due {formatDueDate(task.dueDate)}
                      </p>
                    )}
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Move to</span>
                      <select
                        value={task.status}
                        onChange={(event) => handleTaskStatus(task, event.target.value as "active" | "waiting" | "done")}
                        aria-label={`Move ${task.title} to column`}
                        className="min-h-8 flex-1 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                      >
                        <option value="active">In Progress</option>
                        <option value="waiting">Waiting</option>
                        <option value="done">Done</option>
                      </select>
                    </label>
                  </div>
                ))}
                <button
                  onClick={() => handleNewTask(project.id, column.id as "active" | "waiting" | "done")}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-border/40 hover:border-border hover:bg-foreground/[0.02] transition-colors text-[12px] text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1.5"
                >
                  <Plus className="h-3 w-3" />
                  Add task
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ═══ Tier Section Renderer ═══
  const TierSection = ({ tier }: { tier: 1 | 2 | 3 }) => {
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
            {config.label}
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
                    <Tier3Row key={project.id} project={project} />
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
                      <Tier1Card key={project.id} project={project} />
                    ) : (
                      <Tier2Card key={project.id} project={project} />
                    )
                  )}
                </div>
              )
            ) : (
              // Kanban view
              <div className="space-y-8">
                {tierProjects.map((project) => (
                  <KanbanProject key={project.id} project={project} />
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
      {/* Floating create dialog */}
      {isCreating && (
        <div
          className="fixed inset-0 z-50 flex items-start bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelCreating();
          }}
        >
          <div
            className={cn(
              'relative w-full',
              'pt-[max(env(safe-area-inset-top,0px),8px)] px-3',
              'lg:absolute lg:top-[18vh] lg:left-1/2 lg:-translate-x-1/2 lg:pt-0 lg:px-0',
              'lg:max-w-[520px]',
              'animate-slide-down-spring lg:animate-scale-in'
            )}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-project-title"
              className={cn(
                'overflow-hidden bg-popover',
                'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)] lg:shadow-[0_16px_70px_-12px_rgba(0,0,0,0.25)]',
                'rounded-2xl lg:rounded-xl',
                'border border-border/60'
              )}
            >
              <h2 id="new-project-title" className="sr-only">Create a project</h2>
              {/* Title Input */}
              <div className="flex items-center gap-3 px-4 py-3 lg:py-3">
                <FolderKanban className="h-5 w-5 lg:h-4 lg:w-4 shrink-0 text-muted-foreground/50" />
                <label htmlFor="new-project-name" className="sr-only">Project name</label>
                <input
                  id="new-project-name"
                  ref={titleInputRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelCreating();
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleNewProject();
                    }
                  }}
                  placeholder="Project name..."
                  className="flex-1 bg-transparent text-base lg:text-sm outline-none placeholder:text-muted-foreground/40"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                />
                <button
                  onClick={handleCancelCreating}
                  className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground/50 hover:text-muted-foreground lg:hidden"
                >
                  Cancel
                </button>
                <kbd className="hidden lg:inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/60">
                  esc
                </kbd>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Description Input */}
              <div className="px-4 py-3 lg:py-3">
                <label htmlFor="new-project-description" className="sr-only">Project description</label>
                <textarea
                  id="new-project-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelCreating();
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleNewProject();
                    }
                  }}
                  placeholder="Description (optional)..."
                  className="w-full bg-transparent text-[14px] lg:text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40 resize-none min-h-[80px] max-h-[30vh] overflow-y-auto leading-relaxed"
                  rows={3}
                />
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 lg:py-2 bg-muted/30">
                <p className="text-[10px] lg:text-[9px] text-muted-foreground/50 font-medium">
                  <kbd className="font-mono">⌘↵</kbd> create · <kbd className="font-mono">esc</kbd> cancel
                </p>
                <button
                  onClick={() => handleNewProject()}
                  disabled={!newTitle.trim()}
                  className="rounded-lg px-3 py-1.5 text-[12px] lg:text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto" data-slot="page-content">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-[22px] font-semibold tracking-tight">
            {t('nav.projects')}
          </h1>
          <p className="text-[13px] text-muted-foreground/60 mt-1">
            {projects.length} active project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/40 p-1" role="group" aria-label="Project view">
            <button
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="Grid view"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              aria-pressed={viewMode === "kanban"}
              aria-label="Kanban view"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Kanban</span>
            </button>
          </div>
          <button
            onClick={handleStartCreating}
            className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-2 text-[13px] lg:text-[12px] font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" /> {t('projects.newProject')}
          </button>
        </div>
      </div>

      {/* Tier Sections */}
      {projects.length > 0 ? (
        <div className="space-y-8">
          <TierSection tier={1} />
          <TierSection tier={2} />
          <TierSection tier={3} />
        </div>
      ) : (
        <div className="py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
            <FolderKanban className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-[13px] text-muted-foreground/50">
            No projects yet
          </p>
          <p className="text-[12px] text-muted-foreground/30 mt-1">
            Create one to get started
          </p>
        </div>
      )}
    </div>
    </>
  );
}
