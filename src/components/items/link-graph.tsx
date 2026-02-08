'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import { X, Network, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { OrbitItem } from '@/lib/types';
import { getItemRelationships } from '@/lib/links';
import { OrbitNode } from './link-graph-node';
import { buildGraphData } from './link-graph-utils';

const nodeTypes = { orbitNode: OrbitNode };

interface LinkGraphProps {
  open: boolean;
  onClose: () => void;
  currentItem: OrbitItem;
  allItems: OrbitItem[];
  onNavigate: (itemId: string) => void;
}

export function LinkGraph({ open, onClose, currentItem, allItems, onNavigate }: LinkGraphProps) {
  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({ onClose });

  const relationships = useMemo(
    () => getItemRelationships(currentItem, allItems),
    [currentItem, allItems]
  );

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraphData(currentItem, relationships),
    [currentItem, relationships]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const hasRelationships = initialNodes.length > 1;

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const data = node.data as { item: OrbitItem; isCurrent: boolean };
      if (!data.isCurrent) {
        onNavigate(data.item.id);
        onClose();
      }
    },
    [onNavigate, onClose]
  );

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-[85dvh] rounded-t-2xl p-0 border-0"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={swipeStyles}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Link Graph</SheetTitle>
        </SheetHeader>

        <div className="h-full flex flex-col">
          {/* Swipe Handle */}
          <div
            className="absolute top-0 left-0 right-0 flex justify-center pt-4 pb-8 cursor-grab active:cursor-grabbing z-20"
            {...swipeHandlers}
          >
            <div
              className={cn(
                'w-10 h-1 rounded-full bg-muted-foreground/20 transition-all',
                isDragging && 'bg-muted-foreground/40 w-12'
              )}
            />
          </div>

          {/* Header */}
          <div className="bg-background border-b border-border/60 pt-14 pb-4 px-4 z-20 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-muted-foreground/70" />
                <h2 className="text-base font-semibold">Link Graph</h2>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 shrink-0"
                aria-label="Close link graph"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Graph Canvas */}
          <div className="flex-1 min-h-0">
          {!hasRelationships ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4 shadow-sm">
                <GitBranch className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">
                No connections yet
              </h3>
              <p className="text-sm text-muted-foreground/70 max-w-[280px] leading-relaxed">
                Link this item to other projects, tasks, or notes to visualize relationships
              </p>
            </div>
          ) : (
            <div className="h-full w-full relative">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                className="link-graph-canvas"
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  className="!bg-background"
                />
                <Controls
                  showInteractive={false}
                  className="!bg-card !border-border/60 !shadow-lg !rounded-xl [&>button]:!bg-card [&>button]:!border-border/40 [&>button]:!text-foreground [&>button:hover]:!bg-muted"
                />
                <MiniMap
                  nodeStrokeWidth={3}
                  zoomable
                  pannable
                  className="!bg-card !border-border/60 !rounded-xl !shadow-lg"
                  maskColor="rgba(0,0,0,0.1)"
                />
              </ReactFlow>

              {/* Legend */}
              <div className="absolute bottom-4 left-4 z-10 bg-card/95 backdrop-blur-sm border border-border/60 rounded-xl px-3 py-2.5 shadow-lg">
                <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                  Legend
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-muted-foreground rounded" />
                    <span className="text-[10px] text-muted-foreground">Parent / Child</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 rounded" style={{ background: 'repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 4px, transparent 4px, transparent 8px)' }} />
                    <span className="text-[10px] text-muted-foreground">Peer Link</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 rounded" style={{ background: 'repeating-linear-gradient(90deg, #a855f7 0, #a855f7 2px, transparent 2px, transparent 5px)' }} />
                    <span className="text-[10px] text-muted-foreground">Refers To</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
