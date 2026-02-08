'use client';

import { useState } from 'react';
import { Plus, X, Link as LinkIcon, FolderOpen, Target, Calendar, StickyNote, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrbitItem, ItemType } from '@/lib/types';

interface LinkManagerProps {
  item: OrbitItem;
  allItems: OrbitItem[];
  onUpdate: (updates: Partial<OrbitItem>) => void;
}

const ITEM_TYPE_CONFIG = {
  project: { label: 'Project', icon: FolderOpen, color: 'text-blue-600' },
  task: { label: 'Task', icon: CheckSquare, color: 'text-green-600' },
  event: { label: 'Event', icon: Calendar, color: 'text-purple-600' },
  goal: { label: 'Goal', icon: Target, color: 'text-orange-600' },
  note: { label: 'Note', icon: StickyNote, color: 'text-yellow-600' },
  habit: { label: 'Habit', icon: CheckSquare, color: 'text-pink-600' },
} as const;

export function LinkManager({ item, allItems, onUpdate }: LinkManagerProps) {
  const [showAddLink, setShowAddLink] = useState(false);
  const [selectedType, setSelectedType] = useState<ItemType | 'none'>('none');
  const [selectedItemId, setSelectedItemId] = useState<string>('none');

  // Get parent item
  const parentItem = item.parentId ? allItems.find(i => i.id === item.parentId) : undefined;

  // Get linked items (excluding parent)
  const linkedItems = (item.linkedIds || [])
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is OrbitItem => i !== undefined);

  // Get child items
  const childItems = allItems.filter(i => i.parentId === item.id);

  // All connected items
  const allConnectedIds = new Set([
    item.id,
    ...(item.parentId ? [item.parentId] : []),
    ...(item.linkedIds || []),
    ...childItems.map(i => i.id)
  ]);

  // Filter linkable items by selected type
  const linkableItems = selectedType === 'none' 
    ? []
    : allItems.filter(i => 
        i.type === selectedType &&
        !allConnectedIds.has(i.id) &&
        i.status !== 'archived'
      );

  const handleAddLink = () => {
    if (selectedItemId === 'none') return;
    
    const newLinkedIds = [...(item.linkedIds || []), selectedItemId];
    onUpdate({ linkedIds: newLinkedIds });
    
    // Reset
    setSelectedType('none');
    setSelectedItemId('none');
    setShowAddLink(false);
  };

  const handleRemoveLink = (linkId: string) => {
    const newLinkedIds = (item.linkedIds || []).filter(id => id !== linkId);
    onUpdate({ linkedIds: newLinkedIds });
  };

  const handleSetParent = (parentId: string) => {
    onUpdate({ parentId: parentId === 'none' ? undefined : parentId });
  };

  const handleRemoveParent = () => {
    onUpdate({ parentId: undefined });
  };

  const renderItemBadge = (linkedItem: OrbitItem, onRemove?: () => void) => {
    const config = ITEM_TYPE_CONFIG[linkedItem.type];
    const Icon = config.icon;

    return (
      <div
        key={linkedItem.id}
        className="group flex items-center gap-1.5 rounded-md bg-foreground/[0.06] px-2 py-1 text-[11px] hover:bg-foreground/[0.1] transition-colors"
      >
        <Icon className={cn('h-3 w-3', config.color)} />
        <span className="text-foreground/80 max-w-[120px] truncate">
          {linkedItem.emoji} {linkedItem.title}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Parent Link */}
      {parentItem && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Parent
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {renderItemBadge(parentItem, handleRemoveParent)}
          </div>
        </div>
      )}

      {/* Linked Items */}
      {linkedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Linked Items ({linkedItems.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {linkedItems.map(linkedItem =>
              renderItemBadge(linkedItem, () => handleRemoveLink(linkedItem.id))
            )}
          </div>
        </div>
      )}

      {/* Child Items (Read-only display) */}
      {childItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Contains ({childItems.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {childItems.map(childItem => renderItemBadge(childItem))}
          </div>
        </div>
      )}

      {/* Add Link Interface */}
      {!showAddLink ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddLink(true)}
          className="h-7 text-[11px] gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Link
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border border-border/60 bg-foreground/[0.02] p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground/80">Add New Link</span>
            <button
              onClick={() => {
                setShowAddLink(false);
                setSelectedType('none');
                setSelectedItemId('none');
              }}
              className="text-muted-foreground/50 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Step 1: Select Type */}
          <div>
            <label className="text-[10px] text-muted-foreground/60 block mb-1">Link Type</label>
            <Select value={selectedType} onValueChange={(v) => {
              setSelectedType(v as ItemType);
              setSelectedItemId('none');
            }}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Choose type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-[11px]">Choose type...</SelectItem>
                {(Object.entries(ITEM_TYPE_CONFIG) as [ItemType, typeof ITEM_TYPE_CONFIG[ItemType]][]).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={type} value={type} className="text-[11px]">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-3.5 w-3.5', config.color)} />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Select Item (only if type selected) */}
          {selectedType !== 'none' && (
            <div>
              <label className="text-[10px] text-muted-foreground/60 block mb-1">
                Select {ITEM_TYPE_CONFIG[selectedType].label}
              </label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Choose item..." />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <SelectItem value="none" className="text-[11px]">Choose item...</SelectItem>
                  {linkableItems.map(linkItem => (
                    <SelectItem key={linkItem.id} value={linkItem.id} className="text-[11px]">
                      {linkItem.emoji && `${linkItem.emoji} `}{linkItem.title}
                    </SelectItem>
                  ))}
                  {linkableItems.length === 0 && (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground/60">
                      No {ITEM_TYPE_CONFIG[selectedType as ItemType]?.label.toLowerCase()}s available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Add Button */}
          {selectedItemId !== 'none' && (
            <Button
              size="sm"
              onClick={handleAddLink}
              className="h-7 text-[11px] w-full"
            >
              <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
              Add Link
            </Button>
          )}
        </div>
      )}

      {/* Set Parent (if no parent) */}
      {!parentItem && (
        <div className="pt-2 border-t border-border/40">
          <div className="text-[10px] text-muted-foreground/60 mb-1.5">Set Parent</div>
          <Select value={item.parentId || 'none'} onValueChange={handleSetParent}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="No parent" />
            </SelectTrigger>
            <SelectContent className="max-h-[200px]">
              <SelectItem value="none" className="text-[11px]">No parent</SelectItem>
              {allItems
                .filter(i => !allConnectedIds.has(i.id) && i.status !== 'archived')
                .map(parentItem => {
                  const config = ITEM_TYPE_CONFIG[parentItem.type];
                  const Icon = config.icon;
                  return (
                    <SelectItem key={parentItem.id} value={parentItem.id} className="text-[11px]">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-3.5 w-3.5', config.color)} />
                        {parentItem.emoji && `${parentItem.emoji} `}{parentItem.title}
                      </div>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
