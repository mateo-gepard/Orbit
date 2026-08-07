'use client';

import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type AriaLabelConfig,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  GanttChart,
  LoaderCircle,
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
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTranslation, type Translate } from '@/lib/i18n';

const nodeTypes = {
  projectRoadmapNode: ProjectRoadmapNode,
  milestoneRoadmapNode: MilestoneRoadmapNode,
  taskRoadmapNode: TaskRoadmapNode,
};

function graphAriaLabels(translate: Translate): Partial<AriaLabelConfig> {
  return {
    'node.a11yDescription.default': translate('graph.nodeSelectDescription'),
    'node.a11yDescription.keyboardDisabled': translate('graph.nodeMoveDescription'),
    'node.a11yDescription.ariaLiveMessage': ({ x, y }) => translate('graph.nodeMoved', { x, y }),
    'edge.a11yDescription.default': translate('graph.edgeSelectDescription'),
    'controls.ariaLabel': translate('graph.controls'),
    'controls.zoomIn.ariaLabel': translate('graph.zoomIn'),
    'controls.zoomOut.ariaLabel': translate('graph.zoomOut'),
    'controls.fitView.ariaLabel': translate('graph.fitView'),
    'controls.interactive.ariaLabel': translate('graph.toggleInteractivity'),
    'minimap.ariaLabel': translate('graph.miniMap'),
    'handle.ariaLabel': translate('graph.handle'),
  };
}

interface ProjectRoadmapProps {
  open: boolean;
  onClose: () => void;
  project: OrbitItem;
  allItems: OrbitItem[];
  onNavigate: (itemId: string) => void;
}

export function ProjectRoadmap({ open, onClose, project, allItems, onNavigate }: ProjectRoadmapProps) {
  const { t, tp } = useTranslation();
  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({ onClose });
  const { user } = useAuth();
  const createPendingRef = useRef(false);
  const [isCreatingMilestone, setIsCreatingMilestone] = useState(false);
  const ariaLabelConfig = useMemo(() => graphAriaLabels(t), [t]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildRoadmapGraph(project, allItems, { dependencyLabel: t('roadmap.dependsOn') }),
    [project, allItems, t],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (!open) return;
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialEdges, initialNodes, open, setEdges, setNodes]);

  const hasContent = initialNodes.length > 1;
  const renderedTaskCount = initialNodes.filter((node) => node.type === 'taskRoadmapNode').length;

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
  const handleAddMilestone = useCallback(async () => {
    if (!user || createPendingRef.current) return;

    createPendingRef.current = true;
    setIsCreatingMilestone(true);
    try {
      const now = Date.now();
      const id = await createItem({
        type: 'goal',
        status: 'active',
        title: t('roadmap.newMilestoneTitle'),
        parentId: project.id,
        tags: [],
        userId: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      onNavigate(id);
      onClose();
    } catch {
      toast.error(t('roadmap.addMilestoneError'));
    } finally {
      createPendingRef.current = false;
      setIsCreatingMilestone(false);
    }
  }, [onClose, onNavigate, project.id, t, user]);

  // ── Stats ──
  const stats = useMemo(() => {
    const milestones = allItems.filter(i => i.parentId === project.id && i.type === 'goal' && i.status !== 'archived');
    const milestoneIds = new Set(milestones.map(m => m.id));
    const tasks = allItems.filter(i =>
      i.type === 'task' && i.status !== 'archived' &&
      (i.parentId === project.id || milestoneIds.has(i.parentId!)),
    );
    const done = tasks.filter(t => t.status === 'done').length;
    const active = tasks.filter(t => t.status === 'active').length;
    const waiting = tasks.filter(t => t.status === 'waiting').length;
    const today = format(new Date(), 'yyyy-MM-dd');
    const overdue = tasks.filter(t => !['done', 'archived'].includes(t.status) && t.dueDate && t.dueDate < today).length;
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
        style={swipeStyles}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t('roadmap.title')}</SheetTitle>
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
                  <h2 className="text-[15px] font-semibold truncate">
                    {project.title || t('projects.untitledProject')}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-[11px] text-muted-foreground/50">
                      {tp('roadmap.milestones.one', 'roadmap.milestones.other', stats.milestones)}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">
                      {tp('roadmap.taskProgress.one', 'roadmap.taskProgress.other', stats.tasks, {
                        done: stats.done,
                        total: stats.tasks,
                      })}
                    </span>
                    {stats.tasks > renderedTaskCount && (
                      <span className="text-[11px] text-muted-foreground/50">
                        {tp(
                          'roadmap.hiddenTasks.one',
                          'roadmap.hiddenTasks.other',
                          stats.tasks - renderedTaskCount,
                        )}
                      </span>
                    )}
                    {stats.overdue > 0 && (
                      <span className="text-[11px] text-red-500 font-medium">
                        {tp('roadmap.overdue.one', 'roadmap.overdue.other', stats.overdue)}
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
                  type="button"
                  onClick={handleAddMilestone}
                  disabled={!user || isCreatingMilestone}
                  aria-busy={isCreatingMilestone}
                  className="flex items-center gap-1.5 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] px-3 py-1.5 text-[11px] font-medium text-foreground/80 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingMilestone ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t('roadmap.addMilestone')}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onClose}
                  className="h-8 w-8 shrink-0"
                  aria-label={t('roadmap.close')}
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
                ariaLabelConfig={ariaLabelConfig}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
                minZoom={0.2}
                maxZoom={2}
                nodesConnectable={false}
                deleteKeyCode={null}
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
                <h3 className="text-base font-semibold text-foreground/80 mb-1.5">
                  {t('roadmap.emptyTitle')}
                </h3>
                <p className="text-[13px] text-muted-foreground/50 max-w-[300px] leading-relaxed mb-5">
                  {t('roadmap.emptyDescription')}
                </p>
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  disabled={!user || isCreatingMilestone}
                  aria-busy={isCreatingMilestone}
                  className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-medium text-background hover:opacity-90 active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingMilestone ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t('roadmap.addFirstMilestone')}
                </button>
              </div>
            )}
          </div>

          {/* ── Legend (bottom strip) ── */}
          {hasContent && (
            <div className="bg-background/95 backdrop-blur-sm border-t border-border/60 px-4 py-2 flex items-center justify-center gap-6 flex-wrap shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-[2px] bg-muted-foreground rounded-full" />
                <span className="text-[10px] text-muted-foreground/50">{t('roadmap.parentChild')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-[2px] bg-blue-500 rounded-full" style={{ strokeDasharray: '4,3' }} />
                <span className="text-[10px] text-muted-foreground/50">{t('roadmap.dependency')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[10px] text-muted-foreground/50">{t('priority.high')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[10px] text-muted-foreground/50">{t('priority.medium')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-muted-foreground/50">{t('priority.low')}</span>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
