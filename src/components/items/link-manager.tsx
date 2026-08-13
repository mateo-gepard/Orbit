'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, X, Link as LinkIcon, FolderOpen, Target, Calendar, StickyNote, CheckSquare, ChevronLeft, Search, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThreadmapItem, ItemType } from '@/lib/types';
import { useLinks } from '@/lib/hooks/use-links';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

interface LinkManagerProps {
  item: ThreadmapItem;
  allItems: ThreadmapItem[];
  onUpdate: (updates: Partial<ThreadmapItem>) => void;
}

const ITEM_TYPE_CONFIG = {
  project: { labelKey: 'type.project', icon: FolderOpen, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  task: { labelKey: 'type.task', icon: CheckSquare, color: 'text-green-600', bg: 'bg-green-500/10' },
  event: { labelKey: 'type.event', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  goal: { labelKey: 'type.goal', icon: Target, color: 'text-orange-600', bg: 'bg-orange-500/10' },
  note: { labelKey: 'type.note', icon: StickyNote, color: 'text-yellow-600', bg: 'bg-yellow-500/10' },
  habit: { labelKey: 'type.habit', icon: Repeat, color: 'text-pink-600', bg: 'bg-pink-500/10' },
} as const;

type PickerMode = 'closed' | 'link' | 'parent';

export function LinkManager({ item, allItems, onUpdate }: LinkManagerProps) {
  const [pickerMode, setPickerMode] = useState<PickerMode>('closed');
  const [selectedType, setSelectedType] = useState<ItemType | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const openPickerRef = useRef<HTMLButtonElement>(null);
  const categoryBackRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();

  const links = useLinks({ item, allItems, onUpdate });
  const visibleLinkedItems = [
    ...links.relationships.linked,
    ...links.relationships.reverseLinked,
  ].filter((linkedItem, index, arr) => arr.findIndex((i) => i.id === linkedItem.id) === index);

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
    requestAnimationFrame(() => openPickerRef.current?.focus());
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
  const getCategoryItems = (): ThreadmapItem[] => {
    if (!selectedType) return [];
    const items = pickerMode === 'parent'
      ? links.getParentableByType(selectedType)
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
      return links.getParentableByType(type).length;
    }
    return links.getLinkableByType(type).length;
  };

  const renderItemBadge = (linkedItem: ThreadmapItem, onRemove?: () => void) => {
    const config = ITEM_TYPE_CONFIG[linkedItem.type];
    const Icon = config.icon;

    return (
      <div
        key={linkedItem.id}
        className="group flex items-center gap-1.5 rounded-md bg-foreground/[0.06] px-2 py-1 text-[11px] hover:bg-foreground/[0.1] transition-colors"
      >
        <Icon aria-hidden="true" className={cn('h-3 w-3', config.color)} />
        <span className="text-foreground/80 max-w-[120px] truncate">
          {linkedItem.emoji} {linkedItem.title}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('links.unlink', { title: linkedItem.title || t('common.untitled') })}
            title={t('links.unlink', { title: linkedItem.title || t('common.untitled') })}
            className="reveal-action ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-red-500/10 hover:text-red-600"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  // Category grid (step 1)
  const renderCategoryGrid = () => {
    if (pickerMode === 'parent' && links.parentableItems.length === 0) {
      return (
        <div className="rounded-lg bg-foreground/[0.03] px-3 py-4 text-center text-[11px] text-muted-foreground/60">
          {t('links.noParents')}
        </div>
      );
    }

    const categories = (Object.entries(ITEM_TYPE_CONFIG) as [ItemType, typeof ITEM_TYPE_CONFIG[ItemType]][])
      .filter(([type]) => pickerMode !== 'parent' || getTypeCount(type) > 0);

    return (
      <div className="grid grid-cols-3 gap-1.5">
        {categories.map(([type, config]) => {
        const Icon = config.icon;
        const count = getTypeCount(type);
        return (
          <button
            type="button"
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
              <Icon aria-hidden="true" className={cn('h-4 w-4', config.color)} />
            </div>
            <span className="text-[10px] font-medium text-foreground/70">{t(config.labelKey as TranslationKey)}</span>
            <span className="text-[9px] text-muted-foreground/50">{count}</span>
          </button>
        );
        })}
      </div>
    );
  };

  // Item list (step 2)
  const renderItemList = () => {
    const items = getCategoryItems();
    const config = ITEM_TYPE_CONFIG[selectedType!];
    const Icon = config.icon;
    const typeLabel = t(config.labelKey as TranslationKey);

    return (
      <div className="space-y-2">
        {/* Back + category header */}
        <div className="flex items-center gap-1.5">
          <button
            ref={categoryBackRef}
            type="button"
            onClick={() => { setSelectedType(null); setSearch(''); }}
            aria-label={t('links.backCategories')}
            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] lg:h-8 lg:w-8"
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground/60" />
          </button>
          <Icon aria-hidden="true" className={cn('h-3.5 w-3.5', config.color)} />
          <span className="text-[11px] font-medium text-foreground/80">{typeLabel}</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
          <input
            ref={searchRef}
            type="text"
            aria-label={t('links.searchType', { type: typeLabel })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t('links.searchType', { type: typeLabel })}…`}
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
                type="button"
                key={i.id}
                onClick={() => handlePickItem(i.id)}
                className="group flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.06] lg:min-h-0"
              >
                <ItemIcon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', itemConfig.color)} />
                <span className="text-[11px] text-foreground/80 truncate">
                  {i.emoji && `${i.emoji} `}{i.title || t('common.untitled')}
                </span>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="text-[11px] text-muted-foreground/50 text-center py-3">
              {search ? t('links.noMatches') : t('links.noAvailable', { type: typeLabel })}
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
              {t('links.parent')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {renderItemBadge(links.relationships.parent, () => links.handleSetParent(undefined))}
          </div>
        </div>
      )}

      {/* Linked Items */}
      {visibleLinkedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              {t('links.linkedItems', { count: visibleLinkedItems.length })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleLinkedItems.map((linkedItem: ThreadmapItem) =>
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
              {t('links.contains', { count: links.relationships.children.length })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {links.relationships.children.map((childItem: ThreadmapItem) => renderItemBadge(childItem))}
          </div>
        </div>
      )}

      {/* Picker (for both Link and Parent) */}
      {pickerMode !== 'closed' ? (
        <div className="rounded-md border border-border/60 bg-foreground/[0.02] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground/80">
              {pickerMode === 'link' ? t('links.linkTo') : t('links.setParentTo')}
            </span>
            <button
              type="button"
              onClick={resetPicker}
              aria-label={t('links.closePicker')}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground lg:h-8 lg:w-8"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          {selectedType ? renderItemList() : renderCategoryGrid()}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            ref={openPickerRef}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPickerMode('link')}
            disabled={links.linkableItems.length === 0}
            className="min-h-11 gap-1.5 text-[11px] lg:h-7 lg:min-h-7"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('links.addLink')}
          </Button>
          {links.parentableItems.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPickerMode('parent')}
              className="min-h-11 gap-1.5 text-[11px] lg:h-7 lg:min-h-7"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {links.relationships.parent ? t('links.changeParent') : t('links.setParent')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
