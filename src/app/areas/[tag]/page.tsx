'use client';

import { useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Search, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { ItemRow } from '@/components/items/item-row';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrbitStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settings-store';

type AreaView = 'active' | 'completed' | 'archived' | 'all';

function decodeTag(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function AreaPage() {
  const params = useParams<{ tag: string | string[] }>();
  const tag = useMemo(() => decodeTag(params.tag), [params.tag]);
  const items = useOrbitStore((state) => state.items);
  const setActiveTag = useOrbitStore((state) => state.setActiveTag);
  const setCommandBarOpen = useOrbitStore((state) => state.setCommandBarOpen);
  const language = useSettingsStore((state) => state.settings.language);
  const [view, setView] = useState<AreaView>('active');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActiveTag(tag || null);
    return () => {
      if (useOrbitStore.getState().activeTag === tag) {
        useOrbitStore.getState().setActiveTag(null);
      }
    };
  }, [setActiveTag, tag]);

  const areaItems = useMemo(() => items.filter((item) => item.tags?.includes(tag)), [items, tag]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(language === 'de' ? 'de' : 'en');
    return areaItems
      .filter((item) => {
        if (view === 'active') return item.status === 'active' || item.status === 'waiting';
        if (view === 'completed') return item.status === 'done';
        if (view === 'archived') return item.status === 'archived';
        return true;
      })
      .filter((item) => !query || item.title.toLocaleLowerCase(language === 'de' ? 'de' : 'en').includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [areaItems, language, search, view]);

  const labels = language === 'de'
    ? { active: 'Aktiv', completed: 'Erledigt', archived: 'Archiviert', all: 'Alle' }
    : { active: 'Active', completed: 'Completed', archived: 'Archived', all: 'All' };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/40 bg-background px-4 pb-4 pt-4 lg:px-8 lg:pt-8">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <h1 className="truncate text-xl font-semibold tracking-tight">{tag}</h1>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground/75">
              {language === 'de'
                ? `${areaItems.length} ${areaItems.length === 1 ? 'Eintrag' : 'Einträge'} in diesem Bereich`
                : `${areaItems.length} ${areaItems.length === 1 ? 'item' : 'items'} in this area`}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setCommandBarOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {language === 'de' ? 'Hinzufügen' : 'Add item'}
          </Button>
        </div>
      </header>

      <div className="border-b border-border/40 bg-background px-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Tabs value={view} onValueChange={(value) => setView(value as AreaView)}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 py-2">
              {(Object.keys(labels) as AreaView[]).map((key) => (
                <TabsTrigger key={key} value={key} className="min-h-10 px-3 text-[12px]">
                  {labels[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={language === 'de' ? `Bereich ${tag} durchsuchen` : `Search ${tag} area`}
              placeholder={language === 'de' ? 'Bereich durchsuchen…' : 'Search this area…'}
              className="min-h-11 w-full rounded-xl border border-border/60 bg-background py-2 pl-10 pr-11 text-[13px] outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={language === 'de' ? 'Suche löschen' : 'Clear search'}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {visibleItems.length > 0 ? (
            <div className="space-y-1">
              {visibleItems.map((item) => (
                <ItemRow key={item.id} item={item} showType showProject />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center" role="status">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                <Hash className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
              </div>
              <h2 className="text-[15px] font-medium">
                {language === 'de' ? 'Keine passenden Einträge' : 'No matching items'}
              </h2>
              <p className="mt-1 max-w-sm text-[12px] text-muted-foreground/75">
                {search
                  ? (language === 'de' ? 'Versuche einen anderen Suchbegriff.' : 'Try a different search term.')
                  : (language === 'de' ? 'In dieser Ansicht gibt es noch keine Einträge.' : 'There are no items in this view yet.')}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
