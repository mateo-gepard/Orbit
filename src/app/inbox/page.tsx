'use client';

import { useMemo } from 'react';
import { Inbox as InboxIcon } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import { ItemRow } from '@/components/items/item-row';
import type { ItemStatus } from '@/lib/types';

export default function InboxPage() {
  const { items, setSelectedItemId, setCommandBarOpen } = useOrbitStore();

  const inboxItems = useMemo(
    () => items.filter((i) => i.status === 'inbox'),
    [items]
  );

  const quickSetStatus = async (id: string, status: ItemStatus) => {
    await updateItem(id, { status });
  };

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-[13px] text-muted-foreground/60 mt-0.5">
          {inboxItems.length} {inboxItems.length === 1 ? 'item' : 'items'} to
          process
        </p>
      </div>

      <div className="space-y-px">
        {inboxItems.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5 group">
            <div className="flex-1 min-w-0">
              <ItemRow item={item} showType compact />
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                onClick={() => quickSetStatus(item.id, 'active')}
              >
                Activate
              </button>
              <button
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                onClick={() => quickSetStatus(item.id, 'archived')}
              >
                Archive
              </button>
            </div>
          </div>
        ))}

        {inboxItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
              <InboxIcon className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <h3 className="text-[15px] font-medium">Inbox zero</h3>
            <p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs">
              All items processed. Press{' '}
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>{' '}
              to add new ones.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
