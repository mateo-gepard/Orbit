"use client";
import { useMemo, useState } from "react";
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
    if (!user) return;
    const id = await createItem({
      type: "project",
      status: "active",
      title: "",
      emoji: "🚀",
      color: "#6366f1",
      tier,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

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
    });
    setSelectedItemId(id);
  };

  const getProjectTasks = (projectId: string, status?: string) => {
    const all = getAllProjectTasks(projectId);
    return status ? all.filter((i) => i.status === status) : all;
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
                        Due {task.dueDate}
                      </p>
                    )}
                  </button>
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
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
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
          <div className="hidden lg:flex items-center rounded-lg border border-border/50 bg-muted/40 p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
          <button
            onClick={() => handleNewProject()}
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
  );
}
