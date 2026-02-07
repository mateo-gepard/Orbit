'use client';

import { useMemo } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';

export default function ProjectsPage() {
  const { items, setSelectedItemId, setCommandBarOpen } = useOrbitStore();
  const { user } = useAuth();

  const projects = useMemo(
    () => items.filter((i) => i.type === 'project' && i.status !== 'archived'),
    [items]
  );

  const getProjectProgress = (projectId: string) => {
    const children = items.filter((i) => i.parentId === projectId);
    if (children.length === 0) return 0;
    const done = children.filter((i) => i.status === 'done').length;
    return Math.round((done / children.length) * 100);
  };

  const getProjectChildCount = (projectId: string) => {
    return items.filter((i) => i.parentId === projectId).length;
  };

  const handleNewProject = async () => {
    if (!user) return;
    const id = await createItem({
      type: 'project',
      status: 'active',
      title: 'New Project',
      emoji: '🚀',
      color: '#6366f1',
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {projects.length} active
          </p>
        </div>
        <button
          onClick={handleNewProject}
          className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-1.5 text-[13px] lg:text-[12px] font-medium text-background transition-opacity hover:opacity-90 active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const progress = getProjectProgress(project.id);
          const childCount = getProjectChildCount(project.id);
          return (
            <button
              key={project.id}
              onClick={() => setSelectedItemId(project.id)}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:bg-foreground/[0.02] hover:border-border group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl lg:text-xl leading-none mt-0.5">{project.emoji || '📁'}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] lg:text-[13px] font-semibold truncate group-hover:text-foreground transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                    {childCount} {childCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="h-1.5 lg:h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-foreground/20 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">{progress}%</span>
                  {project.tags && project.tags.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/30">{project.tags[0]}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 lg:h-12 lg:w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
            <FolderKanban className="h-6 w-6 lg:h-5 lg:w-5 text-muted-foreground/30" />
          </div>
          <h3 className="text-[15px] font-medium">No projects yet</h3>
          <p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs">
            Projects help you group related tasks and track overall progress.
          </p>
        </div>
      )}
    </div>
  );
}
