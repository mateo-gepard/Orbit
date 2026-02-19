'use client';

import { useMemo } from 'react';
import { Inbox as InboxIcon, ArrowRight, Trash2 } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem, deleteItem } from '@/lib/firestore';
import { ItemRow } from '@/components/items/item-row';
import { SwipeableRow } from '@/components/mobile/swipeable-row';
import { haptic } from '@/lib/mobile';
import type { ItemStatus } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';

export default function InboxPage() {
  const { items, setSelectedItemId, setCommandBarOpen } = useOrbitStore();
  const { t } = useTranslation();

  const inboxItems = useMemo(
    () => items.filter((i) => 
      i.type === 'task' && 
      i.status !== 'done' && 
      i.status !== 'archived' && 
      !i.dueDate && 
      !i.parentId
    ),
    [items]
  );

  const quickSetStatus = async (id: string, status: ItemStatus) => {
    haptic('medium');
    await updateItem(id, { status });
  };

  const quickDelete = async (id: string) => {
    haptic('medium');
    await deleteItem(id);
  };

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('nav.inbox')}</h1>
        <p className="text-[13px] text-muted-foreground/60 mt-0.5">
          {inboxItems.length} {inboxItems.length === 1 ? 'item' : 'items'} to
          process
        </p>
        {inboxItems.length > 0 && (
          <p className="text-[11px] text-muted-foreground/40 mt-1 lg:hidden">
            ← Swipe right to activate · Swipe left to delete →
          </p>
        )}
      </div>

      <div className="space-y-px">
        {inboxItems.map((item) => (
          <div key={item.id} className="group">
            {/* Mobile: use swipeable rows */}
            <div className="lg:hidden">
              <SwipeableRow
                onSwipeRight={() => quickSetStatus(item.id, 'active')}
                onSwipeLeft={() => quickDelete(item.id)}
                rightLabel={t('inbox.activate')}
                leftLabel={t('common.delete')}
                rightIcon={ArrowRight}
                leftIcon={Trash2}
              >
                <ItemRow item={item} showType compact enableSwipe={false} />
              </SwipeableRow>
            </div>
            {/* Desktop: hover buttons */}
            <div className="hidden lg:flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <ItemRow item={item} showType compact enableSwipe={false} />
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                  onClick={() => quickSetStatus(item.id, 'active')}
                >
                  {t('inbox.activate')}
                </button>
                <button
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                  onClick={() => quickSetStatus(item.id, 'archived')}
                >
                  {t('common.archive')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {inboxItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 lg:h-12 lg:w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
              <InboxIcon className="h-6 w-6 lg:h-5 lg:w-5 text-muted-foreground/30" />
            </div>
            <h3 className="text-[15px] font-medium">{t('inbox.zero')}</h3>
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
