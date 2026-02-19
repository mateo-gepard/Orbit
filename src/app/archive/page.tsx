'use client';

import { useMemo, useState } from 'react';
import { Archive as ArchiveIcon, RotateCcw, Search, CheckCircle2, Circle } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import { ItemRow } from '@/components/items/item-row';
import { SwipeableRow } from '@/components/mobile/swipeable-row';
import { haptic } from '@/lib/mobile';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/lib/i18n';

type ViewTab = 'completed' | 'archived';

export default function ArchivePage() {
  const { items } = useOrbitStore();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('completed');
  const { t } = useTranslation();

  const completedItems = useMemo(() => {
    const completed = items.filter((i) => i.status === 'done' && i.type !== 'habit');
    if (!search) return completed;
    const q = search.toLowerCase();
    return completed.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.tags?.some((t) => t.includes(q))
    );
  }, [items, search]);

  const archivedItems = useMemo(() => {
    const archived = items.filter((i) => i.status === 'archived');
    if (!search) return archived;
    const q = search.toLowerCase();
    return archived.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.tags?.some((t) => t.includes(q))
    );
  }, [items, search]);

  const handleRestore = async (id: string) => {
    haptic('success');
    await updateItem(id, { status: 'active' });
  };

  const handleUncomplete = async (id: string) => {
    haptic('light');
    await updateItem(id, { status: 'active', completedAt: undefined });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 lg:px-8 pt-4 lg:pt-8 pb-3 lg:pb-4 border-b border-border/40 bg-background">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold tracking-tight">{t('nav.archive')}</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">
            {t('archive.subtitle')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={(v) => setActiveTab(v as ViewTab)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Tab Navigation */}
        <div className="sticky top-0 z-10 bg-background border-b border-border/40">
          <div className="max-w-3xl mx-auto px-4 lg:px-8">
            <TabsList className="w-full grid grid-cols-2 bg-transparent h-auto p-0 gap-0">
              <TabsTrigger 
                value="completed" 
                className={cn(
                  "relative rounded-none border-b-2 border-transparent py-3 text-[13px] font-medium transition-all",
                  "data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none",
                  "data-[state=inactive]:text-muted-foreground/60 hover:text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{t('archive.completedTab')}</span>
                  <span className="text-[11px] text-muted-foreground/40 font-normal">
                    {completedItems.length}
                  </span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="archived"
                className={cn(
                  "relative rounded-none border-b-2 border-transparent py-3 text-[13px] font-medium transition-all",
                  "data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none",
                  "data-[state=inactive]:text-muted-foreground/60 hover:text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  <span>{t('archive.archivedTab')}</span>
                  <span className="text-[11px] text-muted-foreground/40 font-normal">
                    {archivedItems.length}
                  </span>
                </div>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Search Bar */}
        <div className="sticky top-[49px] lg:top-[49px] z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 px-4 lg:px-8 py-3">
          <div className="max-w-3xl mx-auto relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 lg:h-3.5 lg:w-3.5 -translate-y-1/2 text-muted-foreground/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab}…`}
              className="w-full rounded-xl lg:rounded-lg border border-border/50 bg-background py-2.5 lg:py-2 pl-10 lg:pl-9 pr-3 text-[14px] lg:text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-foreground/20 transition-colors"
            />
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-4">
            {/* Completed Tab */}
            <TabsContent value="completed" className="mt-0 space-y-px">
              {completedItems.map((item) => (
                <div key={item.id} className="group">
                  {/* Mobile: swipe to uncomplete */}
                  <div className="lg:hidden">
                    <SwipeableRow
                      onSwipeRight={() => handleUncomplete(item.id)}
                      rightLabel="Uncomplete"
                      rightIcon={Circle}
                    >
                      <ItemRow item={item} showType compact enableSwipe={false} />
                    </SwipeableRow>
                  </div>
                  {/* Desktop: hover button */}
                  <div className="hidden lg:flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <ItemRow item={item} showType compact enableSwipe={false} />
                    </div>
                    <button
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-foreground/[0.05] transition-all shrink-0"
                      onClick={() => handleUncomplete(item.id)}
                    >
                      <Circle className="h-3 w-3" /> Uncomplete
                    </button>
                  </div>
                </div>
              ))}

              {completedItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 flex h-14 w-14 lg:h-12 lg:w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                    <CheckCircle2 className="h-6 w-6 lg:h-5 lg:w-5 text-muted-foreground/30" />
                  </div>
                  <h3 className="text-[15px] font-medium">No completed items</h3>
                  <p className="text-[12px] text-muted-foreground/50 mt-1">
                    {search ? 'Try a different search term' : 'Completed tasks and goals will appear here'}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Archived Tab */}
            <TabsContent value="archived" className="mt-0 space-y-px">
              {archivedItems.map((item) => (
                <div key={item.id} className="group">
                  {/* Mobile: swipe to restore */}
                  <div className="lg:hidden">
                    <SwipeableRow
                      onSwipeRight={() => handleRestore(item.id)}
                      rightLabel="Restore"
                      rightIcon={RotateCcw}
                    >
                      <ItemRow item={item} showType compact enableSwipe={false} />
                    </SwipeableRow>
                  </div>
                  {/* Desktop: hover button */}
                  <div className="hidden lg:flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <ItemRow item={item} showType compact enableSwipe={false} />
                    </div>
                    <button
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-foreground/[0.05] transition-all shrink-0"
                      onClick={() => handleRestore(item.id)}
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  </div>
                </div>
              ))}

              {archivedItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 flex h-14 w-14 lg:h-12 lg:w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                    <ArchiveIcon className="h-6 w-6 lg:h-5 lg:w-5 text-muted-foreground/30" />
                  </div>
                  <h3 className="text-[15px] font-medium">Archive is empty</h3>
                  <p className="text-[12px] text-muted-foreground/50 mt-1">
                    {search ? 'Try a different search term' : 'Archived items will appear here'}
                  </p>
                </div>
              )}
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}