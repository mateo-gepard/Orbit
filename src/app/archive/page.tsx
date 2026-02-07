'use client';

import { useMemo, useState } from 'react';
import { Archive as ArchiveIcon, RotateCcw, Search } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import { ItemRow } from '@/components/items/item-row';
import { SwipeableRow } from '@/components/mobile/swipeable-row';
import { haptic } from '@/lib/mobile';
import { cn } from '@/lib/utils';

export default function ArchivePage() {
  const { items } = useOrbitStore();
  const [search, setSearch] = useState('');

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

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Archive</h1>
        <p className="text-[13px] text-muted-foreground/60 mt-0.5">
          {archivedItems.length} {archivedItems.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 lg:h-3.5 lg:w-3.5 -translate-y-1/2 text-muted-foreground/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search archive…"
          className="w-full rounded-xl lg:rounded-lg border border-border/50 bg-transparent py-2.5 lg:py-2 pl-10 lg:pl-9 pr-3 text-[14px] lg:text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-foreground/20 transition-colors"
        />
      </div>

      <div className="space-y-px">
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
              Archived items will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}