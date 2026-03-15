'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, X, Link as LinkIcon, FolderOpen, Target, Calendar, StickyNote, CheckSquare, ChevronLeft, Search, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OrbitItem, ItemType } from '@/lib/types';
import { useLinks } from '@/lib/hooks/use-links';

interface LinkManagerProps {
  item: OrbitItem;
  allItems: OrbitItem[];
  onUpdate: (updates: Partial<OrbitItem>) => void;
}

const ITEM_TYPE_CONFIG = {
  project: { label: 'Projects', icon: FolderOpen, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  task: { label: 'Tasks', icon: CheckSquare, color: 'text-green-600', bg: 'bg-green-500/10' },
  event: { label: 'Events', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  goal: { label: 'Goals', icon: Target, color: 'text-orange-600', bg: 'bg-orange-500/10' },
  note: { label: 'Notes', icon: StickyNote, color: 'text-yellow-600', bg: 'bg-yellow-500/10' },
  habit: { label: 'Habits', icon: Repeat, color: 'text-pink-600', bg: 'bg-pink-500/10' },
} as const;

type PickerMode = 'closed' | 'link' | 'parent';

export function LinkManager({ item, allItems, onUpdate }: LinkManagerProps) {
  const [pickerMode, setPickerMode] = useState<PickerMode>('closed');
  const [selectedType, setSelectedType] = useState<ItemType | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const links = useLinks({ item, allItems, onUpdate });

  // Auto-focus search when entering item list
  useEffect(() => {
    if (selectedType && searchRef.current) {
      searchRef.current.focus();
    }
  }, [selectedType]);

  const resetPicker = () => {
    setPickerMode('closed');
    setSelectedType(null);
    setSearch('');
  };

  const handlePickItem = (targetId: string) => {
    if (pickerMode === 'link') {
      links.handleAddLink(targetId);
    } else if (pickerMode === 'parent') {
      links.handleSetParent(targetId);
    }
    resetPicker();
  };

  // Get items for the selected category, filtered by search
  const getCategoryItems = (): OrbitItem[] => {
    if (!selectedType) return [];
    const items = pickerMode === 'parent'
      ? links.linkableItems.filter(i => i.type === selectedType)
      : links.getLinkableByType(selectedType);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.emoji && i.emoji.toLowerCase().includes(q))
    );
  };

  // Count available items per type
  const getTypeCount = (type: ItemType): number => {
    if (pickerMode === 'parent') {
      return links.linkableItems.filter(i => i.type === type).length;
    }
    return links.getLinkableByType(type).length;
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

  // Category grid (step 1)
  const renderCategoryGrid = () => (
    <div className="grid grid-cols-3 gap-1.5">
      {(Object.entries(ITEM_TYPE_CONFIG) as [ItemType, typeof ITEM_TYPE_CONFIG[ItemType]][]).map(([type, config]) => {
        const Icon = config.icon;
        const count = getTypeCount(type);
        return (
          <button
            key={type}
            onClick={() => { setSelectedType(type); setSearch(''); }}
            disabled={count === 0}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg p-2.5 transition-all text-center',
              'border border-transparent',
              count > 0
                ? 'hover:border-border/60 hover:bg-foreground/[0.04] cursor-pointer'
                : 'opacity-30 cursor-not-allowed',
            )}
          >
            <div className={cn('rounded-md p-1.5', config.bg)}>
              <Icon className={cn('h-4 w-4', config.color)} />
            </div>
            <span className="text-[10px] font-medium text-foreground/70">{config.label}</span>
            <span className="text-[9px] text-muted-foreground/50">{count}</span>
          </button>
        );
      })}
    </div>
  );

  // Item list (step 2)
  const renderItemList = () => {
    const items = getCategoryItems();
    const config = ITEM_TYPE_CONFIG[selectedType!];
    const Icon = config.icon;

    return (
      <div className="space-y-2">
        {/* Back + category header */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setSelectedType(null); setSearch(''); }}
            className="rounded-md p-1 hover:bg-foreground/[0.06] transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/60" />
          </button>
          <Icon className={cn('h-3.5 w-3.5', config.color)} />
          <span className="text-[11px] font-medium text-foreground/80">{config.label}</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${config.label.toLowerCase()}...`}
            className="w-full h-7 pl-7 pr-2 rounded-md border border-border/60 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/30"
          />
        </div>

        {/* Items */}
        <div className="max-h-[180px] overflow-y-auto -mx-0.5 px-0.5 space-y-0.5">
          {items.map(i => {
            const itemConfig = ITEM_TYPE_CONFIG[i.type];
            const ItemIcon = itemConfig.icon;
            return (
              <button
                key={i.id}
                onClick={() => handlePickItem(i.id)}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left hover:bg-foreground/[0.06] transition-colors group"
              >
                <ItemIcon className={cn('h-3.5 w-3.5 shrink-0', itemConfig.color)} />
                <span className="text-[11px] text-foreground/80 truncate">
                  {i.emoji && `${i.emoji} `}{i.title || 'Untitled'}
                </span>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="text-[11px] text-muted-foreground/50 text-center py-3">
              {search ? 'No matches' : `No ${config.label.toLowerCase()} available`}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Parent Link */}
      {links.relationships.parent && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Parent
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {renderItemBadge(links.relationships.parent, () => links.handleSetParent(undefined))}
          </div>
        </div>
      )}

      {/* Linked Items */}
      {links.relationships.linked.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Linked Items ({links.relationships.linked.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {links.relationships.linked.map((linkedItem: OrbitItem) =>
              renderItemBadge(linkedItem, () => links.handleRemoveLink(linkedItem.id))
            )}
          </div>
        </div>
      )}

      {/* Child Items (Read-only display) */}
      {links.relationships.children.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Contains ({links.relationships.children.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {links.relationships.children.map((childItem: OrbitItem) => renderItemBadge(childItem))}
          </div>
        </div>
      )}

      {/* Picker (for both Link and Parent) */}
      {pickerMode !== 'closed' ? (
        <div className="rounded-md border border-border/60 bg-foreground/[0.02] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground/80">
              {pickerMode === 'link' ? 'Link to...' : 'Set Parent...'}
            </span>
            <button onClick={resetPicker} className="text-muted-foreground/50 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {selectedType ? renderItemList() : renderCategoryGrid()}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerMode('link')}
            className="h-7 text-[11px] gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Link
          </Button>
          {!links.relationships.parent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerMode('parent')}
              className="h-7 text-[11px] gap-1.5"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Set Parent
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
