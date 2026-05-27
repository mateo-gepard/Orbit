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
import { useSettingsStore } from '@/lib/settings-store';

export default function InboxPage() {
  const { items } = useOrbitStore();
  const { t } = useTranslation();
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');

  const inboxItems = useMemo(
    () => items.filter((i) =>
      i.type === 'task' &&
      i.status === 'inbox',
    ),
    [items],
  );

  const quickSetStatus = async (id: string, status: ItemStatus) => {
    haptic('medium');
    await updateItem(id, { status });
  };

  const quickDelete = async (id: string) => {
    haptic('error');
    await deleteItem(id);
  };

  return (
    <div className="mobile-page-gutter mx-auto max-w-3xl space-y-5 py-4 lg:p-8" data-slot="page-content">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('nav.inbox')}</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground/60">
          {inboxItems.length} {inboxItems.length === 1 ? 'item' : 'items'} to process
        </p>
      </div>

      <div className="space-y-px">
        {inboxItems.map((item) => (
          <div key={item.id} className="group">
            <div className="lg:hidden">
              <SwipeableRow
                onSwipeRight={() => quickSetStatus(item.id, 'active')}
                onSwipeLeft={() => quickDelete(item.id)}
                rightLabel={t('inbox.activate')}
                leftLabel={t('common.delete')}
                rightIcon={ArrowRight}
                leftIcon={Trash2}
                leftTone="destructive"
              >
                <ItemRow item={item} showType compact enableSwipe={false} />
              </SwipeableRow>
            </div>
            <div className="hidden items-center gap-1.5 lg:flex">
              <div className="min-w-0 flex-1">
                <ItemRow item={item} showType compact enableSwipe={false} />
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                  onClick={() => quickSetStatus(item.id, 'active')}
                >
                  {t('inbox.activate')}
                </button>
                <button
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
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
            {hockeyMode ? (
              <>
                <div className="mb-4 select-none text-5xl" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,200,200,0.15))' }}>
                  {'\u{1F3D2}'}
                </div>
                <h3 className="text-[15px] font-semibold">Sauberes Spielfeld!</h3>
                <p className="mt-1.5 max-w-xs text-[12px] text-muted-foreground/50">
                  Keine Aufgaben im Strafraum.
                </p>
                <p className="mt-3 text-[10px] italic text-muted-foreground/30">
                  &ldquo;Die beste Verteidigung ist eine leere Inbox.&rdquo;
                </p>
              </>
            ) : (
              <>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.04] lg:h-12 lg:w-12">
                  <InboxIcon className="h-6 w-6 text-muted-foreground/30 lg:h-5 lg:w-5" />
                </div>
                <h3 className="text-[15px] font-medium">{t('inbox.zero')}</h3>
                <p className="mt-1 max-w-xs text-[12px] text-muted-foreground/50">
                  {t('inbox.zeroDesc')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
