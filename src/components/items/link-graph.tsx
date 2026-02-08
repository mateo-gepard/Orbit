'use client';

import { useState, useMemo } from 'react';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import { X, Network, CheckCircle2, Target, Calendar, FileText, Zap, Sparkles, GitBranch, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrbitItem, ItemType } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import { getItemRelationships } from '@/lib/links';

const ITEM_TYPE_CONFIG: Record<ItemType, {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  task: { 
    icon: CheckCircle2, 
    color: 'text-blue-600 dark:text-blue-400', 
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Task' 
  },
  project: { 
    icon: Target, 
    color: 'text-purple-600 dark:text-purple-400', 
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    label: 'Project' 
  },
  event: { 
    icon: Calendar, 
    color: 'text-green-600 dark:text-green-400', 
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Event' 
  },
  goal: { 
    icon: Target, 
    color: 'text-orange-600 dark:text-orange-400', 
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    label: 'Goal' 
  },
  note: { 
    icon: FileText, 
    color: 'text-yellow-600 dark:text-yellow-400', 
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    label: 'Note' 
  },
  habit: { 
    icon: Zap, 
    color: 'text-pink-600 dark:text-pink-400', 
    bgColor: 'bg-pink-50 dark:bg-pink-950/30',
    borderColor: 'border-pink-200 dark:border-pink-800',
    label: 'Habit' 
  },
};

interface LinkGraphProps {
  open: boolean;
  onClose: () => void;
  currentItem: OrbitItem;
  allItems: OrbitItem[];
  onNavigate: (itemId: string) => void;
}

export function LinkGraph({ open, onClose, currentItem, allItems, onNavigate }: LinkGraphProps) {
  const { isDragging, handlers: swipeHandlers } = useSwipeToClose({ onClose });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['ancestors', 'current', 'links', 'children']));
  
  // Use unified relationship system
  const relationships = useMemo(() => 
    getItemRelationships(currentItem, allItems),
    [currentItem, allItems]
  );
  
  // Categorize for display
  const graphData = useMemo(() => {
    const directLinkedIds = new Set(currentItem.linkedIds || []);
    const directReverseIds = new Set(relationships.reverseLinked.map(i => i.id));
    const ancestorIds = new Set(relationships.ancestors.map(a => a.id));
    const descendantIds = new Set(relationships.descendants.map(d => d.id));
    
    // Direct links (bidirectional peer links)
    const directLinks = [...relationships.linked, ...relationships.reverseLinked];
    
    // Indirectly related
    const indirectlyRelated = relationships.allRelated.filter((i: OrbitItem) => 
      !directLinkedIds.has(i.id) && 
      !directReverseIds.has(i.id) &&
      !ancestorIds.has(i.id) &&
      !descendantIds.has(i.id)
    );
    
    return {
      ancestors: relationships.ancestors,
      descendants: relationships.descendants,
      directLinks,
      indirectlyRelated,
      immediateChildren: relationships.children,
      allRelatedItems: relationships.allRelated,
      parent: relationships.parent
    };
  }, [currentItem, relationships]);
  
  const hasRelationships = graphData.ancestors.length > 0 || graphData.descendants.length > 0 || graphData.allRelatedItems.length > 0;
  
  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Modern card-based item renderer
  const renderItem = (item: OrbitItem, isHighlighted: boolean = false) => {
    const config = ITEM_TYPE_CONFIG[item.type];
    const Icon = config.icon;
    const isDone = item.status === 'done';

    return (
      <button
        key={item.id}
        onClick={() => {
          onNavigate(item.id);
          onClose();
        }}
        className={cn(
          "group relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 w-full text-left",
          "hover:scale-[1.02] active:scale-[0.98]",
          isHighlighted 
            ? "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary shadow-lg shadow-primary/10" 
            : cn("hover:shadow-md", config.bgColor, config.borderColor),
          isDone && !isHighlighted && "opacity-60"
        )}
      >
        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center h-11 w-11 rounded-xl shrink-0 transition-transform group-hover:scale-110",
          isHighlighted 
            ? "bg-primary/15 ring-2 ring-primary/30 shadow-sm" 
            : "bg-background/50 shadow-sm"
        )}>
          <Icon className={cn(
            "h-5 w-5 transition-transform group-hover:rotate-12",
            isHighlighted ? "text-primary" : config.color
          )} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-semibold truncate leading-tight mb-0.5",
            isDone && "line-through",
            isHighlighted && "text-foreground"
          )}>
            {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
            {item.title}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={cn(
              "text-[10px] px-1.5 py-0 h-4 capitalize font-medium",
              config.color
            )}>
              {item.type}
            </Badge>
            {isDone && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-green-600 border-green-200">
                Done
              </Badge>
            )}
          </div>
        </div>
        
        {/* Highlight indicator */}
        {isHighlighted && (
          <div className="absolute top-2 right-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          </div>
        )}
        
        {/* Chevron */}
        {!isHighlighted && (
          <ChevronDown className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors rotate-[-90deg]" />
        )}
      </button>
    );
  };

  // Section header component
  const SectionHeader = ({ 
    icon: Icon,
    title,
    count,
    sectionKey,
    gradient
  }: {
    icon: LucideIcon;
    title: string; 
    count: number; 
    sectionKey: string;
    gradient: string;
  }) => {
    const isExpanded = expandedSections.has(sectionKey);
    
    return (
      <button
        onClick={() => toggleSection(sectionKey)}
        className={cn(
          "flex items-center justify-between w-full px-4 py-3 rounded-lg transition-all",
          "hover:bg-foreground/[0.02] active:scale-[0.99]",
          gradient
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-background/50 shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            <Badge variant="secondary" className="h-5 px-2 text-xs">
              {count}
            </Badge>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-[85dvh] rounded-t-2xl p-0 border-0"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Link Graph</SheetTitle>
        </SheetHeader>

        {/* Swipe Handle */}
        <div 
          className="absolute top-0 left-0 right-0 flex justify-center pt-4 pb-8 cursor-grab active:cursor-grabbing z-10"
          {...swipeHandlers}
        >
          <div className={cn(
            "w-10 h-1 rounded-full bg-muted-foreground/20 transition-all",
            isDragging && "bg-muted-foreground/40 w-12"
          )} />
        </div>

        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border/60 pt-14 pb-4 px-4 z-10">
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
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[calc(85dvh-7rem)] px-4 pb-6">
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
            <div className="space-y-6 py-4">
              {/* Ancestors Section */}
              {graphData.ancestors.length > 0 && (
                <div className="space-y-3">
                  <SectionHeader 
                    icon={ChevronUp}
                    title="Parent Chain"
                    count={graphData.ancestors.length}
                    sectionKey="ancestors"
                    gradient="bg-gradient-to-r from-purple-50/50 to-transparent dark:from-purple-950/20"
                  />
                  {expandedSections.has('ancestors') && (
                    <div className="space-y-2 pl-2">
                      {graphData.ancestors.slice().reverse().map((ancestor: OrbitItem) => (
                        <div key={ancestor.id}>
                          {renderItem(ancestor, false)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Current Item */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">Current</span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                </div>
                {renderItem(currentItem, true)}
              </div>

              {/* Direct Links */}
              {graphData.directLinks.length > 0 && (
                <div className="space-y-3">
                  <SectionHeader 
                    icon={Link2}
                    title="Direct Links"
                    count={graphData.directLinks.length}
                    sectionKey="links"
                    gradient="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20"
                  />
                  {expandedSections.has('links') && (
                    <div className="space-y-2 pl-2">
                      {graphData.directLinks.map((linked: OrbitItem) => (
                        <div key={linked.id}>
                          {renderItem(linked, false)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Indirectly Related */}
              {graphData.indirectlyRelated.length > 0 && (
                <div className="space-y-3">
                  <SectionHeader 
                    icon={GitBranch}
                    title="Related via Network"
                    count={graphData.indirectlyRelated.length}
                    sectionKey="network"
                    gradient="bg-gradient-to-r from-green-50/50 to-transparent dark:from-green-950/20"
                  />
                  {expandedSections.has('network') && (
                    <div className="space-y-2 pl-2">
                      {graphData.indirectlyRelated.map((linked: OrbitItem) => (
                        <div key={linked.id}>
                          {renderItem(linked, false)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Children */}
              {graphData.immediateChildren.length > 0 && (
                <div className="space-y-3">
                  <SectionHeader 
                    icon={ChevronDown}
                    title="Direct Children"
                    count={graphData.immediateChildren.length}
                    sectionKey="children"
                    gradient="bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20"
                  />
                  {expandedSections.has('children') && (
                    <div className="space-y-2 pl-2">
                      {graphData.immediateChildren.map((child: OrbitItem) => (
                        <div key={child.id}>
                          {renderItem(child, false)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* All Descendants */}
              {graphData.descendants.length > graphData.immediateChildren.length && (
                <div className="space-y-3">
                  <SectionHeader 
                    icon={GitBranch}
                    title="All Descendants"
                    count={graphData.descendants.length - graphData.immediateChildren.length}
                    sectionKey="descendants"
                    gradient="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20"
                  />
                  {expandedSections.has('descendants') && (
                    <div className="space-y-2 pl-2">
                      {graphData.descendants
                        .filter((d: OrbitItem) => !graphData.immediateChildren.some((c: OrbitItem) => c.id === d.id))
                        .map((desc: OrbitItem) => (
                          <div key={desc.id}>
                            {renderItem(desc, false)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="mt-6 pt-6 border-t border-border/60">
                <div className="flex items-center justify-center gap-6 text-center">
                  <div>
                    <div className="text-2xl font-bold text-foreground">{graphData.ancestors.length}</div>
                    <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Ancestors</div>
                  </div>
                  <div className="h-8 w-px bg-border/40" />
                  <div>
                    <div className="text-2xl font-bold text-primary">{graphData.allRelatedItems.length}</div>
                    <div className="text-[10px] text-primary/60 uppercase tracking-wider">Connected</div>
                  </div>
                  <div className="h-8 w-px bg-border/40" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{graphData.descendants.length}</div>
                    <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Descendants</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
