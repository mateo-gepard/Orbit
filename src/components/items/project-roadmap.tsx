'use client';

import { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  GanttChart,
  Plus,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import type { OrbitItem } from '@/lib/types';
import {
  ProjectRoadmapNode,
  MilestoneRoadmapNode,
  TaskRoadmapNode,
} from './roadmap-node';
import { buildRoadmapGraph } from './roadmap-utils';

const nodeTypes = {
  projectRoadmapNode: ProjectRoadmapNode,
  milestoneRoadmapNode: MilestoneRoadmapNode,
  taskRoadmapNode: TaskRoadmapNode,
};

interface ProjectRoadmapProps {
  open: boolean;
  onClose: () => void;
  project: OrbitItem;
  allItems: OrbitItem[];
  onNavigate: (itemId: string) => void;
}

export function ProjectRoadmap({ open, onClose, project, allItems, onNavigate }: ProjectRoadmapProps) {
  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({ onClose });
  const { user } = useAuth();

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildRoadmapGraph(project, allItems),
    [project, allItems],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const hasContent = initialNodes.length > 1;

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const data = node.data as { item?: OrbitItem };
      if (data.item) {
        onNavigate(data.item.id);
        onClose();
      }
    },
    [onNavigate, onClose],
  );

  // ── Quick create ──
  const handleAddMilestone = async () => {
    if (!user) return;
    const id = await createItem({
      type: 'goal',
      status: 'active',
      title: '',
      parentId: project.id,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    onNavigate(id);
    onClose();
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const milestones = allItems.filter(i => i.parentId === project.id && i.type === 'goal' && i.status !== 'archived');
    const milestoneIds = new Set(milestones.map(m => m.id));
    const tasks = allItems.filter(i =>
      i.type === 'task' && i.status !== 'archived' && i.status !== 'inbox' &&
      (i.parentId === project.id || milestoneIds.has(i.parentId!)),
    );
    const done = tasks.filter(t => t.status === 'done').length;
    const active = tasks.filter(t => t.status === 'active').length;
    const waiting = tasks.filter(t => t.status === 'waiting').length;
    const overdue = tasks.filter(t => !['done', 'archived'].includes(t.status) && t.dueDate && t.dueDate < new Date().toISOString().split('T')[0]).length;
    return {
      milestones: milestones.length,
      milestoneDone: milestones.filter(m => m.status === 'done').length,
      tasks: tasks.length,
      done,
      active,
      waiting,
      overdue,
      progress: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
    };
  }, [allItems, project.id]);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="mobile-sheet-height rounded-t-2xl p-0 border-0 lg:h-[88dvh]"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={swipeStyles}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Project Roadmap</SheetTitle>
        </SheetHeader>

        <div className="h-full flex flex-col bg-background">
          {/* Swipe handle (mobile) */}
          <div
            className="absolute top-0 left-0 right-0 flex justify-center pt-4 pb-8 cursor-grab active:cursor-grabbing z-20 lg:hidden"
            {...swipeHandlers}
          >
            <div className={cn(
              'w-10 h-1 rounded-full bg-muted-foreground/20 transition-all',
              isDragging && 'bg-muted-foreground/40 w-12',
            )} />
          </div>

          {/* ── Header ── */}
          <div className="bg-background/95 backdrop-blur-sm border-b border-border/60 pt-10 lg:pt-4 pb-3 px-4 z-20 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <GanttChart className="h-5 w-5 text-muted-foreground/60 shrink-0" />
                <span className="text-xl shrink-0">{project.emoji || '📁'}</span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold truncate">{project.title || 'Untitled Project'}</h2>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-muted-foreground/50">
                      {stats.milestones} milestone{stats.milestones !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">
                      {stats.done}/{stats.tasks} tasks
                    </span>
                    {stats.overdue > 0 && (
                      <span className="text-[11px] text-red-500 font-medium">
                        {stats.overdue} overdue
                      </span>
                    )}
                    <span className="text-[11px] font-medium" style={{ color: project.color || '#6366f1' }}>
                      {stats.progress}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleAddMilestone}
                  className="flex items-center gap-1.5 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] px-3 py-1.5 text-[11px] font-medium text-foreground/80 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Milestone
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onClose}
                  className="h-8 w-8 shrink-0"
                  aria-label="Close roadmap"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ── ReactFlow Canvas ── */}
          <div className="flex-1 min-h-0">
            {hasContent ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
                minZoom={0.2}
                maxZoom={2}
                defaultEdgeOptions={{
                  type: 'smoothstep',
                }}
                proOptions={{ hideAttribution: true }}
              >
                <Controls
                  position="bottom-right"
                  className="!bg-background !border-border/60 !rounded-xl !shadow-lg [&>button]:!bg-background [&>button]:!border-border/40 [&>button]:!rounded-lg [&>button]:hover:!bg-foreground/[0.05]"
                />

                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="var(--color-muted-foreground)"
                  className="!opacity-[0.15]"
                />
              </ReactFlow>
            ) : (
              // ── Empty state ──
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="h-20 w-20 rounded-2xl bg-foreground/[0.03] flex items-center justify-center mb-5">
                  <Target className="h-10 w-10 text-muted-foreground/20" />
                </div>
                <h3 className="text-base font-semibold text-foreground/80 mb-1.5">No roadmap data yet</h3>
                <p className="text-[13px] text-muted-foreground/50 max-w-[300px] leading-relaxed mb-5">
                  Add milestones and tasks to see your project&apos;s full dependency graph with progress tracking
                </p>
                <button
                  onClick={handleAddMilestone}
                  className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-medium text-background hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Add First Milestone
                </button>
              </div>
            )}
          </div>

          {/* ── Legend (bottom strip) ── */}
          {hasContent && (
            <div className="bg-background/95 backdrop-blur-sm border-t border-border/60 px-4 py-2 flex items-center justify-center gap-6 flex-wrap shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-[2px] bg-muted-foreground rounded-full" />
                <span className="text-[10px] text-muted-foreground/50">Parent → Child</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-[2px] bg-blue-500 rounded-full" style={{ strokeDasharray: '4,3' }} />
                <span className="text-[10px] text-muted-foreground/50">Dependency</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[10px] text-muted-foreground/50">High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[10px] text-muted-foreground/50">Medium</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-muted-foreground/50">Low</span>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
