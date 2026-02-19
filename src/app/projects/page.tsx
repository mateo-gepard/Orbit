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
} from "lucide-react";
import { useOrbitStore } from "@/lib/store";
import { useAuth } from "@/components/providers/auth-provider";
import { createItem, updateItem } from "@/lib/firestore";
import { cn } from "@/lib/utils";
import { useTranslation } from '@/lib/i18n';
type ViewMode = "grid" | "kanban";
export default function ProjectsPage() {
  const { items, setSelectedItemId } = useOrbitStore();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const projects = useMemo(
    () => items.filter((i) => i.type === "project" && i.status !== "archived"),
    [items],
  );
  const getProjectStats = (projectId: string) => {
    const tasks = items.filter(
      (i) => i.parentId === projectId && i.type === "task",
    );
    const total = tasks.length;
    const done = tasks.filter((i) => i.status === "done").length;
    const inProgress = tasks.filter((i) => i.status === "active").length;
    const waiting = tasks.filter((i) => i.status === "waiting").length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, waiting, progress };
  };
  const getProjectMilestones = (projectId: string) => {
    return items.filter((i) => i.parentId === projectId && i.type === "goal");
  };
  const handleNewProject = async () => {
    if (!user) return;
    const id = await createItem({
      type: "project",
      status: "active",
      title: "New Project",
      emoji: "🚀",
      color: "#6366f1",
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
  const moveTask = async (
    taskId: string,
    newStatus: "active" | "waiting" | "done",
  ) => {
    await updateItem(taskId, { status: newStatus });
  };
  const getProjectTasks = (projectId: string, status?: string) => {
    return items.filter(
      (i) =>
        i.parentId === projectId &&
        i.type === "task" &&
        (status ? i.status === status : true),
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
            onClick={handleNewProject}
            className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-2 text-[13px] lg:text-[12px] font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" /> {t('projects.newProject')}
          </button>
        </div>
      </div>
      {/* Grid View */}{" "}
      {viewMode === "grid" && (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {" "}
          {projects.map((project) => {
            const stats = getProjectStats(project.id);
            const milestones = getProjectMilestones(project.id);
            return (
              <div
                key={project.id}
                className="flex flex-col rounded-xl lg:rounded-2xl border border-border/60 bg-card overflow-hidden hover:border-border/80 transition-all hover:shadow-md"
              >
                {" "}
                {/* Project Header */}{" "}
                <button
                  onClick={() => setSelectedItemId(project.id)}
                  className="flex items-start gap-3 p-4 text-left hover:bg-foreground/[0.02] transition-colors group"
                >
                  {" "}
                  <span className="text-2xl leading-none mt-0.5">
                    {project.emoji || "📁"}
                  </span>{" "}
                  <div className="flex-1 min-w-0">
                    {" "}
                    <h3 className="text-[14px] font-semibold truncate group-hover:text-foreground transition-colors">
                      {" "}
                      {project.title}{" "}
                    </h3>{" "}
                    {project.content && (
                      <p className="text-[12px] text-muted-foreground/50 mt-0.5 line-clamp-2">
                        {" "}
                        {project.content}{" "}
                      </p>
                    )}{" "}
                  </div>{" "}
                </button>{" "}
                {/* Stats */}{" "}
                <div className="px-4 pb-3 space-y-3">
                  {" "}
                  {/* Progress bar */}{" "}
                  <div className="space-y-1.5">
                    {" "}
                    <div className="flex items-center justify-between text-[11px]">
                      {" "}
                      <span className="text-muted-foreground/50">
                        {stats.done}/{stats.total} tasks
                      </span>{" "}
                      <span className="text-muted-foreground/50 tabular-nums">
                        {stats.progress}%
                      </span>{" "}
                    </div>{" "}
                    <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                      {" "}
                      <div
                        className="h-full rounded-full bg-foreground/20 transition-all"
                        style={{ width: `${stats.progress}%` }}
                      />{" "}
                    </div>{" "}
                  </div>{" "}
                  {/* Task breakdown */}{" "}
                  <div className="flex items-center gap-3 text-[11px]">
                    {" "}
                    <div className="flex items-center gap-1 text-muted-foreground/50">
                      {" "}
                      <Circle className="h-2.5 w-2.5" />{" "}
                      <span>{stats.inProgress} active</span>{" "}
                    </div>{" "}
                    <div className="flex items-center gap-1 text-muted-foreground/50">
                      {" "}
                      <Clock className="h-2.5 w-2.5" />{" "}
                      <span>{stats.waiting} waiting</span>{" "}
                    </div>{" "}
                  </div>{" "}
                  {/* Milestones */}{" "}
                  {milestones.length > 0 && (
                    <div className="pt-2 border-t border-border/30">
                      {" "}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 mb-1.5">
                        {" "}
                        <Target className="h-3 w-3" />{" "}
                        <span className="font-medium">Milestones</span>{" "}
                      </div>{" "}
                      <div className="space-y-1">
                        {" "}
                        {milestones.slice(0, 2).map((milestone) => (
                          <button
                            key={milestone.id}
                            onClick={() => setSelectedItemId(milestone.id)}
                            className="w-full flex items-center gap-2 text-left px-2 py-1 rounded-md hover:bg-foreground/[0.03] transition-colors group/milestone"
                          >
                            {" "}
                            <CheckCircle2
                              className={cn(
                                "h-3 w-3 shrink-0",
                                milestone.status === "done"
                                  ? "text-foreground/30"
                                  : "text-muted-foreground/30",
                              )}
                            />{" "}
                            <span
                              className={cn(
                                "text-[11px] truncate",
                                milestone.status === "done"
                                  ? "text-muted-foreground/40 line-through"
                                  : "text-foreground/60",
                              )}
                            >
                              {" "}
                              {milestone.title}{" "}
                            </span>{" "}
                          </button>
                        ))}{" "}
                      </div>{" "}
                    </div>
                  )}{" "}
                </div>{" "}
              </div>
            );
          })}{" "}
          {projects.length === 0 && (
            <div className="col-span-full py-16 text-center">
              {" "}
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                {" "}
                <FolderKanban className="h-5 w-5 text-muted-foreground/30" />{" "}
              </div>{" "}
              <p className="text-[13px] text-muted-foreground/50">
                No projects yet
              </p>{" "}
              <p className="text-[12px] text-muted-foreground/30 mt-1">
                Create one to get started
              </p>{" "}
            </div>
          )}{" "}
        </div>
      )}{" "}
      {/* Kanban View */}{" "}
      {viewMode === "kanban" && projects.length > 0 && (
        <div className="space-y-8">
          {" "}
          {projects.map((project) => {
            const stats = getProjectStats(project.id);
            const columns = [
              {
                id: "active",
                label: "In Progress",
                tasks: getProjectTasks(project.id, "active"),
              },
              {
                id: "waiting",
                label: "Waiting",
                tasks: getProjectTasks(project.id, "waiting"),
              },
              {
                id: "done",
                label: "Done",
                tasks: getProjectTasks(project.id, "done"),
              },
            ];
            return (
              <div key={project.id} className="space-y-3">
                {" "}
                {/* Project Header */}{" "}
                <div className="flex items-center justify-between">
                  {" "}
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
                {/* Kanban Board */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className="flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden"
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                        <h4 className="text-[12px] font-medium text-muted-foreground/70">
                          {column.label}
                        </h4>
                        <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                          {column.tasks.length}
                        </span>
                      </div>

                      {/* Tasks */}
                      <div className="p-2 space-y-1.5 min-h-[100px]">
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

                        {/* Add Task Button */}
                        <button
                          onClick={() =>
                            handleNewTask(project.id, column.id as any)
                          }
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
          })}
        </div>
      )}
      {viewMode === "kanban" && projects.length === 0 && (
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
