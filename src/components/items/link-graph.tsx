'use client';

import { useState } from 'react';
import { X, Network, CheckCircle2, Circle, Target, Calendar, FileText, ListTodo, Zap, ArrowDown, ArrowRight, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { OrbitItem, ItemType } from '@/lib/types';

const ITEM_TYPE_CONFIG: Record<ItemType, { icon: any; color: string; label: string }> = {
  task: { icon: CheckCircle2, color: 'text-blue-600', label: 'Task' },
  project: { icon: Target, color: 'text-purple-600', label: 'Project' },
  event: { icon: Calendar, color: 'text-green-600', label: 'Event' },
  goal: { icon: Target, color: 'text-orange-600', label: 'Goal' },
  note: { icon: FileText, color: 'text-yellow-600', label: 'Note' },
  habit: { icon: Zap, color: 'text-pink-600', label: 'Habit' },
};

interface LinkGraphProps {
  open: boolean;
  onClose: () => void;
  currentItem: OrbitItem;
  allItems: OrbitItem[];
  onNavigate: (itemId: string) => void;
}

// Helper function to recursively collect ALL related items through any connection
function collectAllRelatedItems(
  startItem: OrbitItem,
  allItems: OrbitItem[],
  visited: Set<string> = new Set()
): OrbitItem[] {
  if (visited.has(startItem.id)) return [];
  visited.add(startItem.id);
  
  const related: OrbitItem[] = [];
  
  // 1. Get all items linked TO this item (linkedIds)
  const directLinked = (startItem.linkedIds || [])
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is OrbitItem => i !== undefined && !visited.has(i.id));
  
  // 2. Get all items that link to THIS item (reverse links)
  const reverseLinked = allItems.filter(i => 
    i.linkedIds?.includes(startItem.id) && !visited.has(i.id)
  );
  
  // 3. Get parent
  const parent = startItem.parentId 
    ? allItems.find(i => i.id === startItem.parentId && !visited.has(i.id))
    : undefined;
  
  // 4. Get all children
  const children = allItems.filter(i => i.parentId === startItem.id && !visited.has(i.id));
  
  // Collect all immediate connections
  const immediateConnections = [
    ...directLinked,
    ...reverseLinked,
    ...(parent ? [parent] : []),
    ...children
  ];
  
  // Add immediate connections and recurse through each
  immediateConnections.forEach(connectedItem => {
    if (!visited.has(connectedItem.id)) {
      related.push(connectedItem);
      // Recursively get ALL items connected to this one
      const deeperConnections = collectAllRelatedItems(connectedItem, allItems, visited);
      related.push(...deeperConnections);
    }
  });
  
  return related;
}

// Helper to collect all descendants (children, grandchildren, etc.)
function collectAllDescendants(
  item: OrbitItem,
  allItems: OrbitItem[],
  visited: Set<string> = new Set()
): OrbitItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  const children = allItems.filter(i => i.parentId === item.id);
  const allDescendants: OrbitItem[] = [...children];
  
  children.forEach(child => {
    const grandchildren = collectAllDescendants(child, allItems, visited);
    allDescendants.push(...grandchildren);
  });
  
  return allDescendants;
}

// Helper to collect all ancestors (parent, grandparent, etc.)
function collectAllAncestors(
  item: OrbitItem,
  allItems: OrbitItem[],
  visited: Set<string> = new Set()
): OrbitItem[] {
  if (visited.has(item.id)) return [];
  visited.add(item.id);
  
  if (!item.parentId) return [];
  
  const parent = allItems.find(i => i.id === item.parentId);
  if (!parent) return [];
  
  const ancestors: OrbitItem[] = [parent];
  const upperAncestors = collectAllAncestors(parent, allItems, visited);
  ancestors.push(...upperAncestors);
  
  return ancestors;
}

export function LinkGraph({ open, onClose, currentItem, allItems, onNavigate }: LinkGraphProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Collect ALL related items through ANY connection (links, parent, children)
  const allRelatedItems = collectAllRelatedItems(currentItem, allItems);
  
  // Now categorize them intelligently
  // Direct links are items that are explicitly linked to/from current item
  const directLinkedIds = new Set(currentItem.linkedIds || []);
  const directReverseIds = new Set(
    allItems.filter(i => i.linkedIds?.includes(currentItem.id)).map(i => i.id)
  );
  
  // Items that are directly linked (not their parents/children)
  const directLinks = allRelatedItems.filter((i: OrbitItem) => 
    directLinkedIds.has(i.id) || directReverseIds.has(i.id)
  );
  
  // Collect ALL ancestors and descendants of current item
  const allAncestors = collectAllAncestors(currentItem, allItems);
  const allDescendants = collectAllDescendants(currentItem, allItems);
  const immediateChildren = allItems.filter(i => i.parentId === currentItem.id);
  
  // Everything else that came through the connection chain
  // Exclude items that are already in ancestors or descendants of the CURRENT item
  const ancestorIds = new Set(allAncestors.map(a => a.id));
  const descendantIds = new Set(allDescendants.map(d => d.id));
  
  const indirectlyRelated = allRelatedItems.filter((i: OrbitItem) => 
    !directLinkedIds.has(i.id) && 
    !directReverseIds.has(i.id) &&
    !ancestorIds.has(i.id) &&
    !descendantIds.has(i.id)
  );

  const hasRelationships = allAncestors.length > 0 || allDescendants.length > 0 || allRelatedItems.length > 0;
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart(touch.clientY);
    setTouchCurrent(touch.clientY);
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    
    const touch = e.touches[0];
    const currentY = touch.clientY;
    const diff = currentY - touchStart;
    
    if (diff > 0) {
      setTouchCurrent(currentY);
      setIsDragging(true);
    }
  };

  const handleTouchEnd = () => {
    if (touchStart === null || touchCurrent === null) return;
    
    const diff = touchCurrent - touchStart;
    const threshold = 100;
    
    if (diff > threshold) {
      onClose();
    }
    
    setTouchStart(null);
    setTouchCurrent(null);
    setIsDragging(false);
  };

  const renderItem = (item: OrbitItem, isHighlighted: boolean = false, relationship: string = '') => {
    const { icon: Icon, color } = ITEM_TYPE_CONFIG[item.type];
    const isDone = item.status === 'done';

    return (
      <div
        key={item.id}
        onClick={() => {
          onNavigate(item.id);
          onClose();
        }}
        className={cn(
          "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all cursor-pointer",
          isHighlighted 
            ? "bg-primary/10 border-primary shadow-md ring-2 ring-primary/30" 
            : "bg-background border-border/40 hover:bg-foreground/[0.02] hover:border-border hover:shadow-sm",
          isDone && !isHighlighted && "opacity-50"
        )}
      >
        <div className={cn(
          "flex items-center justify-center h-9 w-9 rounded-lg shrink-0 shadow-sm",
          isHighlighted ? "bg-primary/20 ring-1 ring-primary/30" : "bg-muted/60"
        )}>
          <Icon className={cn("h-4.5 w-4.5", isHighlighted ? "text-primary" : color)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-[13px] font-medium truncate leading-tight",
            isDone && "line-through text-muted-foreground"
          )}>
            {item.emoji && `${item.emoji} `}{item.title}
          </p>
          <p className="text-[11px] text-muted-foreground/60 capitalize mt-0.5">
            {item.type}
            {isDone && " · Done"}
          </p>
        </div>
        
        {isHighlighted && (
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary shadow-sm" />
        )}
      </div>
    );
  };

  const renderConnector = (type: 'down' | 'horizontal' | 'branch') => {
    if (type === 'down') {
      return (
        <div className="flex items-center justify-center py-1">
          <ArrowDown className="h-4 w-4 text-muted-foreground/30" />
        </div>
      );
    }
    if (type === 'horizontal') {
      return (
        <div className="flex items-center gap-1 py-1">
          <div className="flex-1 h-px bg-border/40" />
          <Minus className="h-3 w-3 text-muted-foreground/30" />
          <div className="flex-1 h-px bg-border/40" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-1">
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-3 w-px bg-border/40" />
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-px w-4 bg-border/40" />
            ))}
          </div>
        </div>
      </div>
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
        <div className="h-[calc(85dvh-7rem)] overflow-y-auto px-4 pb-6">
          {!hasRelationships ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 -mt-8">
              <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                <Network className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                No connections yet
              </h3>
              <p className="text-xs text-muted-foreground/60 max-w-[240px]">
                Link this item to projects, tasks, or notes to see the graph
              </p>
            </div>
          ) : (
            <div className="pt-4 max-w-md mx-auto">
              {/* Flowchart - Top to Bottom */}
              
              {/* All Ancestors (top to bottom) */}
              {allAncestors.length > 0 && (
                <>
                  {allAncestors.slice().reverse().map((ancestor, idx) => (
                    <div key={ancestor.id}>
                      <div className="mb-2">
                        <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                          ↑ {idx === allAncestors.length - 1 ? 'Parent' : `Ancestor ${allAncestors.length - idx - 1} level${allAncestors.length - idx - 1 > 1 ? 's' : ''} up`}
                        </div>
                        {renderItem(ancestor, false)}
                      </div>
                      {renderConnector('down')}
                    </div>
                  ))}
                </>
              )}

              {/* Current Item - Always in the middle */}
              <div className="mb-2">
                <div className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider text-center mb-2 flex items-center justify-center gap-1">
                  <Circle className="h-2 w-2 fill-primary text-primary" />
                  Current Item
                  <Circle className="h-2 w-2 fill-primary text-primary" />
                </div>
                {renderItem(currentItem, true)}
              </div>

              {/* Direct Linked Items (immediate peers) */}
              {directLinks.length > 0 && (
                <>
                  {renderConnector('horizontal')}
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ↔ Direct Links ({directLinks.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {directLinks.map(linked => renderItem(linked, false))}
                    </div>
                  </div>
                  {renderConnector('horizontal')}
                </>
              )}

              {/* Nested Linked Items (links of links) */}
              {indirectlyRelated.length > 0 && (
                <>
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ⇄ Related via Links ({indirectlyRelated.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {indirectlyRelated.map(linked => renderItem(linked, false))}
                    </div>
                  </div>
                  {renderConnector('horizontal')}
                </>
              )}

              {/* Immediate Children */}
              {immediateChildren.length > 0 && (
                <>
                  {renderConnector('down')}
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ↓ Direct Children ({immediateChildren.length})
                    </div>
                    {immediateChildren.length > 2 && renderConnector('branch')}
                    <div className="grid grid-cols-1 gap-2">
                      {immediateChildren.map((child, idx) => (
                        <div key={child.id}>
                          {renderItem(child, false)}
                          {idx < immediateChildren.length - 1 && (
                            <div className="flex justify-center py-1">
                              <div className="w-px h-4 bg-border/30" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* All Descendants (grandchildren and beyond) */}
              {allDescendants.length > immediateChildren.length && (
                <>
                  {renderConnector('down')}
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ↓ All Descendants ({allDescendants.length - immediateChildren.length} more)
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {allDescendants.filter(d => !immediateChildren.some(c => c.id === d.id)).map(desc => 
                        renderItem(desc, false)
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Summary at bottom */}
              {hasRelationships && (
                <div className="mt-6 pt-4 border-t border-border/30 text-center">
                  <p className="text-[11px] text-muted-foreground/50">
                    Total: {allAncestors.length} ancestor{allAncestors.length !== 1 ? 's' : ''} · {' '}
                    {allRelatedItems.length} related · {' '}
                    {allDescendants.length} descendant{allDescendants.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
