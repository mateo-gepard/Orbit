'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useWishlistStore, type WishlistItem } from '@/lib/wishlist-store';
import { cn } from '@/lib/utils';
import {
  Heart,
  Plus,
  X,
  Link as LinkIcon,
  Type,
  Search,
  Sparkles,
  Trophy,
  Crown,
  ShoppingBag,
  Archive,
  ArchiveRestore,
  Trash2,
  ExternalLink,
  Edit3,
  Check,
  Star,
  TrendingUp,
  DollarSign,
  Tag,
  Gift,
  Swords,
  Flame,
  ChevronLeft,
  BarChart3,
  Clock,
  Target,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────

type View = 'list' | 'duel' | 'add' | 'detail' | 'stats';
type SortMode = 'rank' | 'newest' | 'price-asc' | 'price-desc' | 'name';
type AddMode = 'url' | 'text';

// ─── URL Metadata Scraper ──────────────────────────────────

interface ScrapedMeta {
  title?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  siteName?: string;
}

async function scrapeUrl(url: string): Promise<ScrapedMeta> {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      title: data.title || undefined,
      description: data.description || undefined,
      imageUrl: data.imageUrl || undefined,
      price: data.price != null ? data.price : undefined,
      currency: data.currency || undefined,
      siteName: data.siteName || undefined,
    };
  } catch {
    return {};
  }
}

// ─── Price formatter ───────────────────────────────────────

function formatPrice(price: number, currency = '€'): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
  return `${sym}${price.toFixed(2)}`;
}

// ─── Rank indicator ────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 flex items-center justify-center ring-2 ring-amber-400/20">
      <Crown className="h-3.5 w-3.5 text-white drop-shadow-sm" />
    </div>
  );
  if (rank === 2) return (
    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-zinc-200 via-zinc-300 to-zinc-500 flex items-center justify-center ring-2 ring-zinc-300/20">
      <span className="text-[11px] font-black text-white drop-shadow-sm">2</span>
    </div>
  );
  if (rank === 3) return (
    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-600 via-orange-600 to-orange-800 flex items-center justify-center ring-2 ring-orange-500/20">
      <span className="text-[11px] font-black text-white drop-shadow-sm">3</span>
    </div>
  );
  return (
    <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center">
      <span className="text-[11px] font-bold text-muted-foreground/50 tabular-nums">{rank}</span>
    </div>
  );
}

// ─── Product thumbnail ─────────────────────────────────────

function ProductImage({ src, size = 'md', className }: { src?: string; size?: 'sm' | 'md' | 'lg' | 'hero'; className?: string }) {
  const dims = {
    sm: 'h-10 w-10 rounded-lg',
    md: 'h-14 w-14 rounded-xl',
    lg: 'h-32 w-full rounded-xl',
    hero: 'w-full aspect-square max-h-[320px] rounded-2xl',
  }[size];

  if (!src) {
    return (
      <div className={cn(dims, 'bg-muted/30 flex items-center justify-center shrink-0', className)}>
        <Gift className={cn('text-muted-foreground/15', size === 'sm' ? 'h-4 w-4' : size === 'hero' || size === 'lg' ? 'h-8 w-8' : 'h-5 w-5')} />
      </div>
    );
  }

  return (
    <div className={cn(dims, 'bg-muted/20 overflow-hidden flex items-center justify-center shrink-0', className)}>
      <img
        src={src}
        alt=""
        className={cn(
          'max-h-full max-w-full object-contain',
          size === 'sm' ? 'p-0.5' : size === 'hero' ? 'p-6' : 'p-1'
        )}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function WishlistPage() {
  const {
    items,
    addItem,
    updateItem,
    removeItem,
    purchaseItem,
    archiveItem,
    unarchiveItem,
    recordDuel,
    getDuelPair,
    categories,
    addCategory,
    duelHistory,
  } = useWishlistStore();

  const [view, setView] = useState<View>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPurchased, setShowPurchased] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    useWishlistStore.persist.rehydrate();
  }, []);

  const activeItems = useMemo(() => {
    let list = items.filter((i) => !i.archived);
    if (!showPurchased) list = list.filter((i) => !i.purchased);
    if (filterCategory) list = list.filter((i) => i.category === filterCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      );
    }
    switch (sortMode) {
      case 'rank': return [...list].sort((a, b) => b.elo - a.elo);
      case 'newest': return [...list].sort((a, b) => b.createdAt - a.createdAt);
      case 'price-asc': return [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      case 'price-desc': return [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case 'name': return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
  }, [items, sortMode, filterCategory, searchQuery, showPurchased]);

  const totalValue = useMemo(
    () => items.filter((i) => !i.purchased && !i.archived).reduce((s, i) => s + (i.price ?? 0), 0),
    [items]
  );

  const rankedItems = useMemo(
    () => [...items].filter((i) => !i.purchased && !i.archived).sort((a, b) => b.elo - a.elo),
    [items]
  );

  const usedCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((i) => { if (i.category) cats.add(i.category); });
    categories.forEach((c) => cats.add(c));
    return [...cats].sort();
  }, [items, categories]);

  const openDetail = (id: string) => {
    setDetailId(id);
    setView('detail');
  };

  if (!mounted) return null;

  // ── ADD VIEW ──
  if (view === 'add') {
    return (
      <AddItemView
        categories={usedCategories}
        onAdd={(item) => {
          const created = addItem(item);
          setView('list');
          return created;
        }}
        onAddCategory={addCategory}
        onBack={() => setView('list')}
      />
    );
  }

  // ── DUEL VIEW ──
  if (view === 'duel') {
    return (
      <DuelView
        getDuelPair={getDuelPair}
        recordDuel={recordDuel}
        onBack={() => setView('list')}
        totalDuels={duelHistory.length}
        topItem={rankedItems[0]}
      />
    );
  }

  // ── DETAIL VIEW ──
  if (view === 'detail' && detailId) {
    const item = items.find((i) => i.id === detailId);
    if (!item) { setView('list'); return null; }
    return (
      <DetailView
        item={item}
        rank={rankedItems.findIndex((i) => i.id === item.id) + 1}
        totalItems={rankedItems.length}
        onUpdate={(updates) => updateItem(item.id, updates)}
        onPurchase={() => { purchaseItem(item.id); setView('list'); }}
        onArchive={() => { archiveItem(item.id); setView('list'); }}
        onUnarchive={() => { unarchiveItem(item.id); setView('list'); }}
        onDelete={() => { removeItem(item.id); setView('list'); }}
        onBack={() => setView('list')}
        categories={usedCategories}
        onAddCategory={addCategory}
      />
    );
  }

  // ── STATS VIEW ──
  if (view === 'stats') {
    return (
      <StatsView
        items={items}
        duelHistory={duelHistory}
        onBack={() => setView('list')}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════════════════════

  const activeCount = items.filter((i) => !i.purchased && !i.archived).length;
  const purchasedCount = items.filter((i) => i.purchased).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 lg:px-8 py-4 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[18px] font-semibold tracking-tight">Wishlist</h1>
            <span className="text-[11px] text-muted-foreground/35 tabular-nums">
              {activeCount} item{activeCount !== 1 ? 's' : ''}{totalValue > 0 && ` · ${formatPrice(totalValue)}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {activeCount >= 2 && (
              <button
                onClick={() => setView('duel')}
                className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <Swords className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Rank</span>
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => setView('stats')}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setView('add')}
              className="h-8 px-3.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        {items.length > 0 && (
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg border border-border/20 bg-muted/20 pl-9 pr-3 py-1.5 text-[12px] placeholder:text-muted-foreground/30 focus:outline-none focus:border-border/50 focus:bg-muted/30 transition-all"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide text-[10px]">
              {([
                { mode: 'rank' as SortMode, label: 'Ranked' },
                { mode: 'newest' as SortMode, label: 'Newest' },
                { mode: 'price-asc' as SortMode, label: 'Price ↑' },
                { mode: 'price-desc' as SortMode, label: 'Price ↓' },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={cn(
                    'rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                    sortMode === mode
                      ? 'bg-foreground/[0.06] text-foreground'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                  )}
                >
                  {label}
                </button>
              ))}

              {usedCategories.length > 0 && <div className="h-3 w-px bg-border/30 shrink-0 mx-0.5" />}

              <button
                onClick={() => setFilterCategory(null)}
                className={cn(
                  'rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                  !filterCategory ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                )}
              >
                All
              </button>
              {usedCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                  className={cn(
                    'rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                    filterCategory === cat ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                  )}
                >
                  {cat}
                </button>
              ))}

              {purchasedCount > 0 && (
                <>
                  <div className="h-3 w-px bg-border/30 shrink-0 mx-0.5" />
                  <button
                    onClick={() => setShowPurchased(!showPurchased)}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                      showPurchased ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/35'
                    )}
                  >
                    <Check className="h-2.5 w-2.5" />
                    Purchased ({purchasedCount})
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            {items.length === 0 ? (
              <>
                <div className="h-12 w-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                  <Heart className="h-5 w-5 text-muted-foreground/25" />
                </div>
                <h2 className="text-[15px] font-semibold mb-1">No wishes yet</h2>
                <p className="text-[12px] text-muted-foreground/40 max-w-[260px] mb-5 leading-relaxed">
                  Paste a link or type what you want. Rank items with duels to find your #1.
                </p>
                <button
                  onClick={() => setView('add')}
                  className="flex items-center gap-2 rounded-lg bg-foreground text-background px-5 py-2.5 text-[12px] font-semibold hover:opacity-90 transition-all active:scale-[0.97]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add your first wish
                </button>
              </>
            ) : (
              <>
                <Search className="h-6 w-6 text-muted-foreground/15 mb-2" />
                <p className="text-[12px] text-muted-foreground/30">No matches</p>
              </>
            )}
          </div>
        ) : (
          <div className="p-3 lg:px-8 space-y-px">
            {/* #1 Hero Card */}
            {sortMode === 'rank' && activeItems.length > 0 && !searchQuery && !filterCategory && (
              <button
                onClick={() => openDetail(activeItems[0].id)}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500/[0.04] to-transparent border border-amber-500/10 p-4 text-left transition-all hover:border-amber-500/20 active:scale-[0.995] mb-2 group"
              >
                <div className="flex items-start gap-3.5">
                  <ProductImage src={activeItems[0].imageUrl} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <RankBadge rank={1} />
                      <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest">#1</span>
                    </div>
                    <h3 className="text-[14px] font-semibold tracking-tight line-clamp-2 group-hover:text-foreground/80 transition-colors">
                      {activeItems[0].title}
                    </h3>
                    <div className="flex items-center gap-2.5 mt-1.5">
                      {activeItems[0].price != null && (
                        <span className="text-[13px] font-bold tabular-nums">
                          {formatPrice(activeItems[0].price, activeItems[0].currency)}
                        </span>
                      )}
                      {activeItems[0].category && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.03] text-muted-foreground/40">{activeItems[0].category}</span>
                      )}
                      {activeItems[0].matchesPlayed > 0 && (
                        <span className="text-[9px] text-muted-foreground/25 tabular-nums ml-auto">{activeItems[0].elo}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Items */}
            {(sortMode === 'rank' && !searchQuery && !filterCategory ? activeItems.slice(1) : activeItems).map((item) => {
              const rank = sortMode === 'rank' ? rankedItems.findIndex((r) => r.id === item.id) + 1 : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => openDetail(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all group',
                    'hover:bg-muted/30 active:scale-[0.995]',
                    item.purchased && 'opacity-40'
                  )}
                >
                  {sortMode === 'rank' && !item.purchased ? (
                    <RankBadge rank={rank} />
                  ) : (
                    <ProductImage src={item.imageUrl} size="sm" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[13px] font-medium truncate', item.purchased && 'line-through')}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.price != null && (
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/60">{formatPrice(item.price, item.currency)}</span>
                      )}
                      {item.category && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.03] text-muted-foreground/35">{item.category}</span>
                      )}
                    </div>
                  </div>

                  {!item.purchased && item.matchesPlayed > 0 && (
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/25 shrink-0">{item.elo}</span>
                  )}
                  {item.purchased && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// ADD ITEM VIEW
// ═══════════════════════════════════════════════════════════

function AddItemView({
  categories,
  onAdd,
  onAddCategory,
  onBack,
}: {
  categories: string[];
  onAdd: (item: Omit<WishlistItem, 'id' | 'elo' | 'matchesPlayed' | 'createdAt' | 'updatedAt'>) => WishlistItem;
  onAddCategory: (name: string) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<AddMode>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('€');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(false);

  const handleScrape = async () => {
    if (!url.trim()) return;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
    setScraping(true);
    try {
      const meta = await scrapeUrl(cleanUrl);
      if (meta.title) setTitle(meta.title);
      if (meta.description) setDescription(meta.description);
      if (meta.imageUrl) setImageUrl(meta.imageUrl);
      if (meta.price) setPrice(String(meta.price));
      if (meta.currency) setCurrency(meta.currency);
      setUrl(cleanUrl);
      setScraped(true);
    } finally {
      setScraping(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        if (text.match(/^https?:\/\//i) || text.match(/^www\./i)) {
          setUrl(text);
          setTimeout(() => {
            const cleanUrl = text.startsWith('http') ? text : 'https://' + text;
            setScraping(true);
            scrapeUrl(cleanUrl).then((meta) => {
              if (meta.title) setTitle(meta.title);
              if (meta.description) setDescription(meta.description);
              if (meta.imageUrl) setImageUrl(meta.imageUrl);
              if (meta.price) setPrice(String(meta.price));
              if (meta.currency) setCurrency(meta.currency);
              setUrl(cleanUrl);
              setScraped(true);
            }).finally(() => setScraping(false));
          }, 100);
        }
      }
    } catch { /* clipboard not available */ }
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const priceNum = parseFloat(price);
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      url: url.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      price: !isNaN(priceNum) ? priceNum : undefined,
      currency: currency || '€',
      category: category || undefined,
    });
  };

  const handleCategoryAdd = () => {
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[14px] font-semibold">Add Wish</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
        {/* Mode toggle */}
        <div className="rounded-lg border border-border/20 p-0.5 flex gap-0.5 bg-muted/20">
          <button
            onClick={() => setMode('url')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-medium transition-all',
              mode === 'url' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/50 hover:text-muted-foreground/70'
            )}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            From URL
          </button>
          <button
            onClick={() => setMode('text')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-medium transition-all',
              mode === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/50 hover:text-muted-foreground/70'
            )}
          >
            <Type className="h-3.5 w-3.5" />
            Manual
          </button>
        </div>

        {/* URL input */}
        {mode === 'url' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-border/30 bg-muted/10 p-5 text-center space-y-3">
              <div className="flex items-center gap-2 mx-auto">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 rounded-lg border border-border/30 bg-background px-3 py-2 text-[12px] placeholder:text-muted-foreground/30 focus:outline-none focus:border-border/60 transition-colors"
                />
                <button
                  onClick={handlePaste}
                  className="rounded-lg border border-border/30 px-3 py-2 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-all"
                >
                  Paste
                </button>
              </div>
              <button
                onClick={handleScrape}
                disabled={scraping || !url.trim()}
                className={cn(
                  'w-full rounded-lg py-2 text-[11px] font-semibold transition-all',
                  scraping
                    ? 'bg-muted/30 text-muted-foreground/30 cursor-wait'
                    : 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
                )}
              >
                {scraping ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Fetching...
                  </span>
                ) : scraped ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Check className="h-3 w-3" />
                    Fetched — edit below
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    Fetch Details
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Name *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want?"
              autoFocus={mode === 'text'}
              className="mt-1 w-full rounded-lg border border-border/25 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Size, color, specs..."
              rows={2}
              className="mt-1 w-full rounded-lg border border-border/25 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Price</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground/30">{currency}</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border/25 bg-transparent pl-7 pr-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors"
                />
              </div>
            </div>
            <div className="w-20">
              <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/25 bg-transparent px-2 py-2 text-[13px] focus:outline-none focus:border-border/50 transition-colors"
              >
                <option value="€">€ EUR</option>
                <option value="$">$ USD</option>
                <option value="£">£ GBP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Category</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? '' : cat)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[10px] font-medium transition-all',
                    category === cat
                      ? 'bg-foreground/[0.07] text-foreground ring-1 ring-foreground/10'
                      : 'bg-muted/20 text-muted-foreground/40 hover:bg-muted/40'
                  )}
                >
                  {cat}
                </button>
              ))}
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCategoryAdd()}
                placeholder="+ New"
                className="w-16 rounded-md border border-border/20 bg-transparent px-2 py-1 text-[10px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/40 focus:w-24 transition-all"
              />
            </div>
          </div>

          {!imageUrl && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Image URL</label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (optional)"
                className="mt-1 w-full rounded-lg border border-border/25 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors"
              />
            </div>
          )}

          {/* Preview */}
          {(title || imageUrl) && (
            <div className="rounded-lg border border-border/15 bg-muted/10 p-3.5">
              <p className="text-[8px] text-muted-foreground/30 uppercase tracking-widest mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <ProductImage src={imageUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{title || 'Untitled'}</p>
                  {price && <p className="text-[11px] font-semibold text-muted-foreground/50 mt-0.5">{currency}{price}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!title.trim()}
          className={cn(
            'w-full rounded-xl py-3 text-[13px] font-semibold transition-all active:scale-[0.98]',
            title.trim()
              ? 'bg-foreground text-background hover:opacity-90'
              : 'bg-muted/30 text-muted-foreground/25 cursor-not-allowed'
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <Heart className="h-3.5 w-3.5" />
            Add to Wishlist
          </span>
        </button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// DUEL VIEW
// ═══════════════════════════════════════════════════════════

function DuelView({
  getDuelPair,
  recordDuel,
  onBack,
  totalDuels,
  topItem,
}: {
  getDuelPair: () => [WishlistItem, WishlistItem] | null;
  recordDuel: (winnerId: string, loserId: string) => void;
  onBack: () => void;
  totalDuels: number;
  topItem?: WishlistItem;
}) {
  const [pair, setPair] = useState<[WishlistItem, WishlistItem] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);

  useEffect(() => {
    setPair(getDuelPair());
  }, []);

  const handleChoice = (winnerId: string) => {
    if (!pair) return;
    const loserId = pair[0].id === winnerId ? pair[1].id : pair[0].id;
    setChosen(winnerId);
    recordDuel(winnerId, loserId);
    setStreak((s) => s + 1);
    setTotalRounds((r) => r + 1);

    setTimeout(() => {
      setChosen(null);
      setPair(getDuelPair());
    }, 350);
  };

  if (!pair) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center p-8 text-center">
        <Swords className="h-6 w-6 text-muted-foreground/15 mb-3" />
        <p className="text-[14px] font-semibold mb-1">Need at least 2 wishes</p>
        <p className="text-[12px] text-muted-foreground/40">Add more items to start ranking</p>
        <button onClick={onBack} className="mt-4 text-[12px] text-muted-foreground/50 font-medium hover:text-foreground transition-colors">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[12px] font-semibold">This or That</span>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="h-3 w-3 text-orange-500" />
              <span className="text-[10px] font-bold text-orange-500 tabular-nums">{streak}</span>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/30 tabular-nums">{totalDuels + totalRounds} duels</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 gap-5">
        <p className="text-[11px] text-muted-foreground/35 uppercase tracking-widest font-medium">
          Which do you want more?
        </p>

        <div className="w-full max-w-md grid grid-cols-2 gap-3">
          {pair.map((item) => (
            <button
              key={item.id}
              onClick={() => handleChoice(item.id)}
              className={cn(
                'relative rounded-xl border p-4 text-center transition-all duration-300',
                'hover:scale-[1.01] active:scale-[0.98]',
                chosen === item.id
                  ? 'border-foreground/20 bg-foreground/[0.04] scale-[1.01]'
                  : chosen && chosen !== item.id
                    ? 'border-transparent opacity-30 scale-[0.97]'
                    : 'border-border/25 hover:border-border/50 bg-card'
              )}
            >
              <ProductImage src={item.imageUrl} size="lg" className="mb-3" />
              <h3 className="text-[12px] font-semibold line-clamp-2 leading-snug">{item.title}</h3>
              {item.price != null && (
                <p className="text-[13px] font-bold mt-1.5 tabular-nums">{formatPrice(item.price, item.currency)}</p>
              )}
              {item.category && (
                <span className="inline-block mt-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/40">
                  {item.category}
                </span>
              )}

              {chosen === item.id && (
                <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-background/60">
                  <div className="h-10 w-10 rounded-full bg-foreground flex items-center justify-center">
                    <Check className="h-5 w-5 text-background" />
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPair(getDuelPair())}
          className="text-[11px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
        >
          Skip
        </button>

        {topItem && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/20 border border-border/15 px-3 py-1.5">
            <Crown className="h-3 w-3 text-amber-500/60" />
            <span className="text-[10px] text-muted-foreground/40">Current #1:</span>
            <span className="text-[10px] font-semibold truncate max-w-[180px]">{topItem.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════════════════════════

function DetailView({
  item,
  rank,
  totalItems,
  onUpdate,
  onPurchase,
  onArchive,
  onUnarchive,
  onDelete,
  onBack,
  categories,
  onAddCategory,
}: {
  item: WishlistItem;
  rank: number;
  totalItems: number;
  onUpdate: (updates: Partial<WishlistItem>) => void;
  onPurchase: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onBack: () => void;
  categories: string[];
  onAddCategory: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description || '');
  const [editPrice, setEditPrice] = useState(item.price != null ? String(item.price) : '');
  const [editNotes, setEditNotes] = useState(item.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    const p = parseFloat(editPrice);
    onUpdate({
      title: editTitle.trim() || item.title,
      description: editDescription.trim() || undefined,
      price: !isNaN(p) ? p : undefined,
      notes: editNotes.trim() || undefined,
    });
    setEditing(false);
  };

  const createdDate = new Date(item.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const daysSinceAdded = Math.floor((Date.now() - item.createdAt) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground/40 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          <span className="text-[12px]">Back</span>
        </button>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 text-[11px] text-foreground font-medium hover:opacity-70 transition-colors"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
        {/* Product image — square, centered, padded */}
        {item.imageUrl && (
          <ProductImage src={item.imageUrl} size="hero" className="mx-auto border border-border/10" />
        )}

        {/* Title & rank */}
        <div>
          {!item.purchased && !item.archived && rank > 0 && rank <= totalItems && (
            <div className="flex items-center gap-2 mb-2">
              <RankBadge rank={rank} />
              <span className="text-[10px] text-muted-foreground/30">of {totalItems}</span>
              {item.matchesPlayed > 0 && (
                <span className="text-[9px] font-mono text-muted-foreground/25 ml-auto">{item.elo} · {item.matchesPlayed} duels</span>
              )}
            </div>
          )}

          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-[18px] font-semibold bg-transparent border-b border-border/30 pb-1 focus:outline-none focus:border-foreground/20"
            />
          ) : (
            <h2 className={cn('text-[18px] font-semibold tracking-tight', item.purchased && 'line-through text-muted-foreground/40')}>
              {item.title}
            </h2>
          )}

          <div className="flex flex-wrap items-center gap-2.5 mt-2">
            {item.price != null && (
              <span className="text-[16px] font-bold tabular-nums">{formatPrice(item.price, item.currency)}</span>
            )}
            {item.category && (
              <span className="text-[9px] font-medium px-2 py-0.5 rounded-md bg-muted/30 text-muted-foreground/50">{item.category}</span>
            )}
            {item.purchased && (
              <span className="text-[9px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Purchased</span>
            )}
          </div>
        </div>

        {/* Description */}
        {editing ? (
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description..."
            rows={3}
            className="w-full rounded-lg border border-border/25 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 resize-none"
          />
        ) : item.description ? (
          <p className="text-[13px] text-muted-foreground/50 leading-relaxed">{item.description}</p>
        ) : null}

        {editing && (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Price</label>
            <input
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-border/25 bg-transparent px-3 py-2 text-[13px] focus:outline-none focus:border-border/50"
            />
          </div>
        )}

        {editing ? (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Personal notes..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-border/25 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 resize-none"
            />
          </div>
        ) : item.notes ? (
          <div className="rounded-lg bg-muted/15 border border-border/10 p-3">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-[12px] text-muted-foreground/50 leading-relaxed">{item.notes}</p>
          </div>
        ) : null}

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border/20 px-3.5 py-2.5 text-[11px] text-muted-foreground/45 hover:text-foreground hover:border-border/40 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{item.url.replace(/^https?:\/\/(www\.)?/, '').split('?')[0]}</span>
          </a>
        )}

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/25">
          <span>Added {createdDate}</span>
          {daysSinceAdded > 0 && <span>{daysSinceAdded}d ago</span>}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {!item.purchased && (
            <button
              onClick={onPurchase}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[12px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Mark as Purchased
            </button>
          )}

          <div className="flex gap-2">
            {item.archived ? (
              <button
                onClick={onUnarchive}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[11px] font-medium border border-border/20 text-muted-foreground/50 hover:bg-muted/20 transition-all"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </button>
            ) : (
              <button
                onClick={onArchive}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[11px] font-medium border border-border/20 text-muted-foreground/50 hover:bg-muted/20 transition-all"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            )}
            <button
              onClick={() => {
                if (confirmDelete) { onDelete(); } else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[11px] font-medium transition-all',
                confirmDelete
                  ? 'bg-red-500 text-white'
                  : 'border border-border/20 text-muted-foreground/30 hover:text-red-500 hover:border-red-500/20'
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// STATS VIEW
// ═══════════════════════════════════════════════════════════

function StatsView({
  items,
  duelHistory,
  onBack,
}: {
  items: WishlistItem[];
  duelHistory: { winnerId: string; loserId: string; timestamp: number }[];
  onBack: () => void;
}) {
  const active = items.filter((i) => !i.purchased && !i.archived);
  const purchased = items.filter((i) => i.purchased);
  const totalValue = active.reduce((s, i) => s + (i.price ?? 0), 0);
  const purchasedValue = purchased.reduce((s, i) => s + (i.price ?? 0), 0);
  const avgElo = active.length > 0 ? Math.round(active.reduce((s, i) => s + i.elo, 0) / active.length) : 0;

  const duelCounts: Record<string, number> = {};
  duelHistory.forEach((d) => {
    duelCounts[d.winnerId] = (duelCounts[d.winnerId] || 0) + 1;
    duelCounts[d.loserId] = (duelCounts[d.loserId] || 0) + 1;
  });
  const mostDueledId = Object.entries(duelCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const mostDueled = items.find((i) => i.id === mostDueledId);

  const catCounts: Record<string, { count: number; value: number }> = {};
  active.forEach((i) => {
    const cat = i.category || 'Uncategorized';
    if (!catCounts[cat]) catCounts[cat] = { count: 0, value: 0 };
    catCounts[cat].count++;
    catCounts[cat].value += i.price ?? 0;
  });

  const oldest = [...active].sort((a, b) => a.createdAt - b.createdAt)[0];
  const oldestDays = oldest ? Math.floor((Date.now() - oldest.createdAt) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[12px] font-semibold">Insights</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Active', value: active.length.toString() },
            { label: 'Value', value: totalValue > 0 ? formatPrice(totalValue) : '—' },
            { label: 'Duels', value: duelHistory.length.toString() },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-border/15 bg-muted/10 p-3 text-center">
              <p className="text-[16px] font-bold tabular-nums leading-none">{m.value}</p>
              <p className="text-[8px] text-muted-foreground/30 uppercase tracking-wider mt-1.5">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-border/15 bg-muted/10 p-3">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1">Purchased</p>
            <p className="text-[15px] font-bold tabular-nums">{purchased.length}</p>
            {purchasedValue > 0 && <p className="text-[10px] text-muted-foreground/30 mt-0.5">{formatPrice(purchasedValue)} spent</p>}
          </div>
          <div className="rounded-xl border border-border/15 bg-muted/10 p-3">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1">Avg ELO</p>
            <p className="text-[15px] font-bold tabular-nums font-mono">{avgElo || '—'}</p>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">{active.length} items</p>
          </div>
        </div>

        {oldest && (
          <div className="rounded-xl border border-border/15 bg-muted/10 p-3.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[9px] text-muted-foreground/30 font-medium uppercase tracking-wider">Longest Waiting</span>
            </div>
            <p className="text-[13px] font-semibold">{oldest.title}</p>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">{oldestDays} days</p>
          </div>
        )}

        {Object.keys(catCounts).length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/35 uppercase tracking-wider mb-2">By Category</p>
            <div className="space-y-1">
              {Object.entries(catCounts)
                .sort(([, a], [, b]) => b.value - a.value)
                .map(([cat, data]) => (
                  <div key={cat} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/10">
                    <span className="text-[12px] font-medium flex-1">{cat}</span>
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums">{data.count}</span>
                    {data.value > 0 && (
                      <span className="text-[10px] font-mono text-muted-foreground/25 tabular-nums">{formatPrice(data.value)}</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {mostDueled && (
          <div className="rounded-xl border border-border/15 bg-muted/10 p-3">
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1">Most Dueled</p>
            <p className="text-[13px] font-semibold">{mostDueled.title}</p>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">{duelCounts[mostDueledId!]} matchups</p>
          </div>
        )}
      </div>
    </div>
  );
}
