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

export function LinkGraph({ open, onClose, currentItem, allItems, onNavigate }: LinkGraphProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Find parent
  const parent = currentItem.parentId 
    ? allItems.find(i => i.id === currentItem.parentId) 
    : undefined;

  // Find children
  const children = allItems.filter(i => i.parentId === currentItem.id);

  // Find linked items (peers)
  const linkedItems = (currentItem.linkedIds || [])
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is OrbitItem => i !== undefined);

  // Find reverse links (items that link to this one)
  const reverseLinks = allItems.filter(i => 
    i.linkedIds?.includes(currentItem.id) && 
    !currentItem.linkedIds?.includes(i.id)
  );

  // Swipe-to-close handlers
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

  const hasRelationships = parent || children.length > 0 || linkedItems.length > 0 || reverseLinks.length > 0;

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
              
              {/* Grandparent (if parent has parent) */}
              {parent?.parentId && (() => {
                const grandparent = allItems.find(i => i.id === parent.parentId);
                return grandparent ? (
                  <>
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                        ↑ Parent's Parent
                      </div>
                      {renderItem(grandparent, false)}
                    </div>
                    {renderConnector('down')}
                  </>
                ) : null;
              })()}

              {/* Parent */}
              {parent && (
                <>
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ↑ Part of
                    </div>
                    {renderItem(parent, false)}
                  </div>
                  {renderConnector('down')}
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

              {/* Linked Items (Peers) - Shown horizontally */}
              {linkedItems.length > 0 && (
                <>
                  {renderConnector('horizontal')}
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ↔ Linked ({linkedItems.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {linkedItems.map(linked => renderItem(linked, false))}
                    </div>
                  </div>
                  {renderConnector('horizontal')}
                </>
              )}

              {/* Reverse Links */}
              {reverseLinks.length > 0 && (
                <>
                  {!linkedItems.length && renderConnector('horizontal')}
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ← Linked From ({reverseLinks.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {reverseLinks.map(reverse => renderItem(reverse, false))}
                    </div>
                  </div>
                  {renderConnector('horizontal')}
                </>
              )}

              {/* Children - Below current item */}
              {children.length > 0 && (
                <>
                  {renderConnector('down')}
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center mb-2">
                      ↓ Contains ({children.length})
                    </div>
                    {children.length > 2 && renderConnector('branch')}
                    <div className="grid grid-cols-1 gap-2">
                      {children.map((child, idx) => (
                        <div key={child.id}>
                          {renderItem(child, false)}
                          {idx < children.length - 1 && (
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

              {/* Grandchildren preview (first level only) */}
              {children.length > 0 && (() => {
                const grandchildren = allItems.filter(i => 
                  children.some(child => child.id === i.parentId)
                );
                return grandchildren.length > 0 ? (
                  <>
                    {renderConnector('down')}
                    <div className="opacity-60">
                      <div className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider text-center mb-2">
                        ↓ Children's Children ({grandchildren.length})
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {grandchildren.slice(0, 3).map(gc => renderItem(gc, false))}
                        {grandchildren.length > 3 && (
                          <div className="text-center text-[11px] text-muted-foreground/40 py-2">
                            +{grandchildren.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : null;
              })()}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
