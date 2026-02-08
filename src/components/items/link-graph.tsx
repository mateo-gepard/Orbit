'use client';

import { useState } from 'react';
import { X, Network, CheckCircle2, Circle, Target, Calendar, FileText, ListTodo, Zap } from 'lucide-react';
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
          "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer",
          isHighlighted 
            ? "bg-primary/10 border-primary shadow-sm ring-2 ring-primary/20" 
            : "bg-background border-border/30 hover:bg-foreground/[0.02] hover:border-border",
          isDone && !isHighlighted && "opacity-50"
        )}
      >
        <div className={cn(
          "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
          isHighlighted ? "bg-primary/20" : "bg-muted/50"
        )}>
          <Icon className={cn("h-4 w-4", isHighlighted ? "text-primary" : color)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {relationship && (
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                {relationship}
              </span>
            )}
          </div>
          <p className={cn(
            "text-sm font-medium truncate",
            isDone && "line-through text-muted-foreground"
          )}>
            {item.emoji && `${item.emoji} `}{item.title}
          </p>
          <p className="text-xs text-muted-foreground/60 capitalize">
            {item.type}
            {isDone && " · Done"}
          </p>
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
            <div className="space-y-6 pt-4">
              {/* Current Item - Highlighted */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Circle className="h-3 w-3 fill-primary text-primary" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Current Item
                  </h3>
                </div>
                {renderItem(currentItem, true)}
              </div>

              {/* Parent */}
              {parent && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px bg-border/40 flex-1" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Part of
                    </h3>
                    <div className="h-px bg-border/40 flex-1" />
                  </div>
                  {renderItem(parent, false, 'parent')}
                  
                  {/* Connection line */}
                  <div className="flex items-center justify-center my-2">
                    <div className="w-px h-6 bg-border/40" />
                  </div>
                </div>
              )}

              {/* Children */}
              {children.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px bg-border/40 flex-1" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Contains ({children.length})
                    </h3>
                    <div className="h-px bg-border/40 flex-1" />
                  </div>
                  
                  {/* Connection line from current */}
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-px h-6 bg-border/40" />
                  </div>
                  
                  <div className="space-y-2">
                    {children.map(child => renderItem(child, false, 'child'))}
                  </div>
                </div>
              )}

              {/* Linked Items */}
              {linkedItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px bg-border/40 flex-1" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Linked ({linkedItems.length})
                    </h3>
                    <div className="h-px bg-border/40 flex-1" />
                  </div>
                  <div className="space-y-2">
                    {linkedItems.map(linked => renderItem(linked, false, 'linked'))}
                  </div>
                </div>
              )}

              {/* Reverse Links */}
              {reverseLinks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px bg-border/40 flex-1" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Linked From ({reverseLinks.length})
                    </h3>
                    <div className="h-px bg-border/40 flex-1" />
                  </div>
                  <div className="space-y-2">
                    {reverseLinks.map(reverse => renderItem(reverse, false, 'linked from'))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
