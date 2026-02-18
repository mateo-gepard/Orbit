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
  ArrowUpDown,
  Trophy,
  Crown,
  ShoppingBag,
  Archive,
  ArchiveRestore,
  Trash2,
  ExternalLink,
  Edit3,
  Check,
  ChevronDown,
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
  Percent,
  Eye,
  EyeOff,
  GripVertical,
  Zap,
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
    // Use a CORS proxy or allorigins to fetch page HTML
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return {};
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const getMeta = (names: string[]): string | undefined => {
      for (const name of names) {
        const el = doc.querySelector(
          `meta[property="${name}"], meta[name="${name}"]`
        );
        if (el?.getAttribute('content')) return el.getAttribute('content')!;
      }
      return undefined;
    };

    const title = getMeta(['og:title', 'twitter:title']) || doc.querySelector('title')?.textContent?.trim();
    const description = getMeta(['og:description', 'twitter:description', 'description']);
    const imageUrl = getMeta(['og:image', 'twitter:image', 'twitter:image:src']);
    const siteName = getMeta(['og:site_name']);

    // Try to find price from common patterns
    let price: number | undefined;
    let currency: string | undefined;
    const priceStr = getMeta(['product:price:amount', 'og:price:amount']);
    const currStr = getMeta(['product:price:currency', 'og:price:currency']);
    if (priceStr) {
      price = parseFloat(priceStr);
      currency = currStr || '€';
    }
    if (!price) {
      // Search for JSON-LD product data
      const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        try {
          const data = JSON.parse(script.textContent || '');
          const offer = data?.offers || data?.offers?.[0];
          if (offer?.price) {
            price = parseFloat(offer.price);
            currency = offer.priceCurrency || '€';
            break;
          }
        } catch { /* ignore */ }
      }
    }

    return { title, description, imageUrl, price, currency, siteName };
  } catch {
    return {};
  }
}

// ─── Price formatter ───────────────────────────────────────

function formatPrice(price: number, currency = '€'): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
  return `${sym}${price.toFixed(2)}`;
}

// ─── Rank badge ────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
      <Crown className="h-3 w-3 text-white" />
    </div>
  );
  if (rank === 2) return (
    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-zinc-300 to-zinc-500 flex items-center justify-center shadow-md">
      <span className="text-[10px] font-black text-white">2</span>
    </div>
  );
  if (rank === 3) return (
    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-orange-400 to-orange-700 flex items-center justify-center shadow-md">
      <span className="text-[10px] font-black text-white">3</span>
    </div>
  );
  return (
    <div className="h-6 w-6 rounded-full bg-foreground/[0.04] flex items-center justify-center">
      <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums">{rank}</span>
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
    // Hydrate store
    useWishlistStore.persist.rehydrate();
  }, []);

  // ── Derived data ──
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

  // ═══════════════════════════════════════════════════════════
  // ADD VIEW — URL or Text input
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // DUEL VIEW — This or That
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // STATS VIEW
  // ═══════════════════════════════════════════════════════════

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
  // LIST VIEW — Main ranked list
  // ═══════════════════════════════════════════════════════════

  const activeCount = items.filter((i) => !i.purchased && !i.archived).length;
  const purchasedCount = items.filter((i) => i.purchased).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 lg:px-8 py-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-rose-500/15 to-pink-500/15 flex items-center justify-center">
              <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold tracking-tight">Wishlist</h1>
              <p className="text-[10px] text-muted-foreground/40">
                {activeCount} wishes{totalValue > 0 && ` · ${formatPrice(totalValue)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCount >= 2 && (
              <button
                onClick={() => setView('duel')}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 px-3 py-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:from-violet-500/15 hover:to-fuchsia-500/15 transition-all active:scale-95"
              >
                <Swords className="h-3.5 w-3.5" />
                Rank
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => setView('stats')}
                className="h-8 w-8 rounded-xl bg-foreground/[0.04] flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-foreground/[0.08] transition-all"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setView('add')}
              className="flex items-center gap-1.5 rounded-xl bg-rose-500 text-white px-3 py-1.5 text-[11px] font-semibold hover:bg-rose-400 transition-all active:scale-95 shadow-lg shadow-rose-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Wish
            </button>
          </div>
        </div>

        {/* Search + Sort + Filters */}
        {items.length > 0 && (
          <div className="mt-3 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/25" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search wishes..."
                className="w-full rounded-xl border border-border/30 bg-foreground/[0.02] pl-9 pr-3 py-2 text-[12px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/30 transition-colors"
              />
            </div>
            {/* Sort + Filter bar */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {/* Sort buttons */}
              {[
                { mode: 'rank' as SortMode, label: 'Ranked', icon: Trophy },
                { mode: 'newest' as SortMode, label: 'Newest', icon: Clock },
                { mode: 'price-asc' as SortMode, label: 'Price ↑', icon: DollarSign },
                { mode: 'price-desc' as SortMode, label: 'Price ↓', icon: DollarSign },
              ].map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-all shrink-0',
                    sortMode === mode
                      ? 'bg-foreground/[0.07] text-foreground'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}

              <div className="h-4 w-px bg-border/30 shrink-0" />

              {/* Category filters */}
              <button
                onClick={() => setFilterCategory(null)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-all shrink-0',
                  !filterCategory
                    ? 'bg-foreground/[0.07] text-foreground'
                    : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                )}
              >
                All
              </button>
              {usedCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-all shrink-0',
                    filterCategory === cat
                      ? 'bg-foreground/[0.07] text-foreground'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                  )}
                >
                  {cat}
                </button>
              ))}

              <div className="h-4 w-px bg-border/30 shrink-0" />

              {/* Toggle purchased */}
              <button
                onClick={() => setShowPurchased(!showPurchased)}
                className={cn(
                  'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-all shrink-0',
                  showPurchased
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/30 hover:text-muted-foreground/50'
                )}
              >
                <ShoppingBag className="h-3 w-3" />
                Got {purchasedCount > 0 && `(${purchasedCount})`}
              </button>
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
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-500/10 to-pink-500/10 flex items-center justify-center mb-4">
                  <Heart className="h-7 w-7 text-rose-500/40" />
                </div>
                <h2 className="text-[16px] font-bold mb-1">Your wishlist is empty</h2>
                <p className="text-[12px] text-muted-foreground/40 max-w-[280px] mb-6">
                  Paste a URL or type something you want. Build your list, then rank it with &quot;This or That&quot; to find your #1.
                </p>
                <button
                  onClick={() => setView('add')}
                  className="flex items-center gap-2 rounded-2xl bg-rose-500 text-white px-6 py-3 text-[13px] font-semibold hover:bg-rose-400 transition-all active:scale-95 shadow-lg shadow-rose-500/20"
                >
                  <Plus className="h-4 w-4" />
                  Add your first wish
                </button>
              </>
            ) : (
              <>
                <Search className="h-8 w-8 text-muted-foreground/15 mb-3" />
                <p className="text-[13px] text-muted-foreground/30">No wishes match your filters</p>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 lg:px-8 space-y-2">
            {/* #1 Hero Card — only when sorted by rank */}
            {sortMode === 'rank' && activeItems.length > 0 && !searchQuery && !filterCategory && (
              <button
                onClick={() => openDetail(activeItems[0].id)}
                className="w-full rounded-2xl overflow-hidden border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-rose-500/[0.04] p-5 text-left transition-all hover:border-amber-500/30 active:scale-[0.99] mb-3 group"
              >
                <div className="flex items-start gap-4">
                  {activeItems[0].imageUrl && (
                    <div className="h-20 w-20 rounded-xl overflow-hidden bg-foreground/[0.04] shrink-0">
                      <img src={activeItems[0].imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                        <Crown className="h-2.5 w-2.5 text-white" />
                      </div>
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">#1 Most Wanted</span>
                    </div>
                    <h3 className="text-[15px] font-bold tracking-tight line-clamp-2 group-hover:text-rose-500 transition-colors">
                      {activeItems[0].title}
                    </h3>
                    {activeItems[0].description && (
                      <p className="text-[11px] text-muted-foreground/40 line-clamp-1 mt-0.5">{activeItems[0].description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {activeItems[0].price != null && (
                        <span className="text-[14px] font-bold text-foreground">
                          {formatPrice(activeItems[0].price, activeItems[0].currency)}
                        </span>
                      )}
                      {activeItems[0].category && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-foreground/[0.04] text-muted-foreground/40">{activeItems[0].category}</span>
                      )}
                      <span className="text-[9px] text-muted-foreground/25 font-mono tabular-nums ml-auto">{activeItems[0].elo} ELO</span>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Rest of the items */}
            {(sortMode === 'rank' && !searchQuery && !filterCategory ? activeItems.slice(1) : activeItems).map((item, idx) => {
              const rank = sortMode === 'rank' ? rankedItems.findIndex((r) => r.id === item.id) + 1 : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => openDetail(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all group',
                    'hover:bg-foreground/[0.03] active:scale-[0.99]',
                    item.purchased && 'opacity-50'
                  )}
                >
                  {/* Rank or Image */}
                  {sortMode === 'rank' && !item.purchased ? (
                    <RankBadge rank={rank} />
                  ) : item.imageUrl ? (
                    <div className="h-10 w-10 rounded-lg overflow-hidden bg-foreground/[0.04] shrink-0">
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
                      <Gift className="h-4 w-4 text-muted-foreground/20" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-[13px] font-medium truncate',
                      item.purchased && 'line-through'
                    )}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.price != null && (
                        <span className="text-[11px] font-semibold tabular-nums">{formatPrice(item.price, item.currency)}</span>
                      )}
                      {item.category && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.04] text-muted-foreground/35">{item.category}</span>
                      )}
                    </div>
                  </div>

                  {/* ELO & indicator */}
                  {!item.purchased && item.matchesPlayed > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-mono font-bold tabular-nums text-muted-foreground/30">{item.elo}</p>
                      <p className="text-[7px] text-muted-foreground/20 uppercase tracking-wider">ELO</p>
                    </div>
                  )}

                  {item.purchased && (
                    <div className="shrink-0">
                      <Check className="h-4 w-4 text-emerald-500" />
                    </div>
                  )}
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
// ADD ITEM VIEW — URL scraping + text input
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
  const urlRef = useRef<HTMLInputElement>(null);

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
        // Auto-scrape if it looks like a URL
        if (text.match(/^https?:\/\//i) || text.match(/^www\./i)) {
          setUrl(text);
          setTimeout(() => {
            // trigger scrape
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
      {/* Header */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[14px] font-bold">Add to Wishlist</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-6">
        {/* Mode toggle */}
        <div className="rounded-xl border border-border/40 p-1 flex gap-1">
          <button
            onClick={() => setMode('url')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[12px] font-medium transition-all',
              mode === 'url'
                ? 'bg-foreground/[0.07] text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Paste URL
          </button>
          <button
            onClick={() => setMode('text')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[12px] font-medium transition-all',
              mode === 'text'
                ? 'bg-foreground/[0.07] text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            <Type className="h-3.5 w-3.5" />
            Type It
          </button>
        </div>

        {/* URL mode */}
        {mode === 'url' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/[0.02] p-6 text-center space-y-3">
              <LinkIcon className="h-6 w-6 text-rose-500/30 mx-auto" />
              <p className="text-[12px] text-muted-foreground/50">Paste a product URL and we&apos;ll grab the details</p>
              <div className="flex gap-2">
                <input
                  ref={urlRef}
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setScraped(false); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
                  placeholder="https://..."
                  className="flex-1 rounded-xl border border-border/40 bg-background px-3 py-2.5 text-[12px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 transition-colors"
                />
                <button
                  onClick={handlePaste}
                  className="rounded-xl border border-border/40 px-3 py-2.5 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-all"
                >
                  Paste
                </button>
              </div>
              <button
                onClick={handleScrape}
                disabled={scraping || !url.trim()}
                className={cn(
                  'w-full rounded-xl py-2.5 text-[12px] font-semibold transition-all',
                  scraping
                    ? 'bg-foreground/[0.04] text-muted-foreground/30 cursor-wait'
                    : 'bg-rose-500 text-white hover:bg-rose-400 active:scale-[0.98] shadow-lg shadow-rose-500/20'
                )}
              >
                {scraping ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                    Scraping...
                  </span>
                ) : scraped ? (
                  <span className="flex items-center justify-center gap-2">
                    <Check className="h-3.5 w-3.5" />
                    Found! Edit below if needed
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Fetch Product Details
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Manual / scraped fields */}
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Name *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want?"
              autoFocus={mode === 'text'}
              className="mt-1 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes, size, color, spec..."
              rows={2}
              className="mt-1 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 transition-colors resize-none"
            />
          </div>

          {/* Price + Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Price</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/30">{currency}</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-border/40 bg-transparent pl-8 pr-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 transition-colors"
                />
              </div>
            </div>
            <div className="w-20">
              <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border/40 bg-transparent px-2 py-2.5 text-[13px] focus:outline-none focus:border-rose-500/40 transition-colors"
              >
                <option value="€">€</option>
                <option value="$">$</option>
                <option value="£">£</option>
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Category</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? '' : cat)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all',
                    category === cat
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : 'bg-foreground/[0.03] text-muted-foreground/40 border border-transparent hover:bg-foreground/[0.06]'
                  )}
                >
                  {cat}
                </button>
              ))}
              {/* New category inline */}
              <div className="flex items-center gap-1">
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCategoryAdd()}
                  placeholder="+ New"
                  className="w-20 rounded-lg border border-border/30 bg-transparent px-2 py-1 text-[11px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-rose-500/30 focus:w-28 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Image URL (if no image from scrape) */}
          {!imageUrl && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Image URL</label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (optional)"
                className="mt-1 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 transition-colors"
              />
            </div>
          )}

          {/* Preview */}
          {(title || imageUrl) && (
            <div className="rounded-xl border border-border/40 bg-foreground/[0.01] p-4">
              <p className="text-[8px] text-muted-foreground/25 uppercase tracking-widest mb-2">Preview</p>
              <div className="flex items-center gap-3">
                {imageUrl && (
                  <div className="h-12 w-12 rounded-lg overflow-hidden bg-foreground/[0.04] shrink-0">
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={() => setImageUrl('')} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{title || 'Untitled'}</p>
                  {price && <p className="text-[12px] font-bold mt-0.5">{currency}{price}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!title.trim()}
          className={cn(
            'w-full rounded-2xl py-3.5 text-[14px] font-semibold transition-all active:scale-[0.98]',
            title.trim()
              ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-lg shadow-rose-500/20'
              : 'bg-foreground/[0.04] text-muted-foreground/25 cursor-not-allowed'
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <Heart className="h-4 w-4" />
            Add to Wishlist
          </span>
        </button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// DUEL VIEW — This or That (Tinder-style swipe ranking)
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

    // Brief animation delay then next pair
    setTimeout(() => {
      setChosen(null);
      setPair(getDuelPair());
    }, 400);
  };

  if (!pair) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center p-8 text-center">
        <Swords className="h-8 w-8 text-muted-foreground/15 mb-3" />
        <p className="text-[14px] font-semibold mb-1">Need at least 2 wishes</p>
        <p className="text-[12px] text-muted-foreground/40">Add more items to start ranking</p>
        <button onClick={onBack} className="mt-4 text-[12px] text-rose-500 font-medium hover:text-rose-400 transition-colors">
          ← Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Swords className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-[12px] font-bold">This or That</span>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="h-3 w-3 text-orange-500" />
              <span className="text-[10px] font-bold text-orange-500 tabular-nums">{streak}</span>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/30 tabular-nums">{totalDuels + totalRounds} duels total</span>
        </div>
      </div>

      {/* Duel arena */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 gap-4">
        <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest font-medium mb-2">
          Which do you want more?
        </p>

        <div className="w-full max-w-lg grid grid-cols-2 gap-4">
          {pair.map((item) => (
            <button
              key={item.id}
              onClick={() => handleChoice(item.id)}
              className={cn(
                'relative rounded-2xl border-2 p-5 text-center transition-all duration-300',
                'hover:scale-[1.02] active:scale-[0.98]',
                chosen === item.id
                  ? 'border-rose-500 bg-rose-500/[0.06] scale-[1.02] shadow-xl shadow-rose-500/20'
                  : chosen && chosen !== item.id
                    ? 'border-border/20 opacity-40 scale-[0.96]'
                    : 'border-border/40 hover:border-rose-500/30 bg-card'
              )}
            >
              {/* Image */}
              {item.imageUrl ? (
                <div className="h-28 w-full rounded-xl overflow-hidden bg-foreground/[0.04] mb-3 mx-auto">
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-28 w-full rounded-xl bg-foreground/[0.02] flex items-center justify-center mb-3">
                  <Gift className="h-8 w-8 text-muted-foreground/10" />
                </div>
              )}

              <h3 className="text-[13px] font-bold line-clamp-2 leading-tight">{item.title}</h3>

              {item.price != null && (
                <p className="text-[14px] font-bold mt-2 text-rose-500">{formatPrice(item.price, item.currency)}</p>
              )}

              {item.category && (
                <span className="inline-block mt-2 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-foreground/[0.04] text-muted-foreground/35">
                  {item.category}
                </span>
              )}

              {/* Win animation overlay */}
              {chosen === item.id && (
                <div className="absolute inset-0 rounded-2xl flex items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-rose-500 flex items-center justify-center animate-bounce shadow-xl">
                    <Heart className="h-5 w-5 text-white" fill="currentColor" />
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Skip */}
        <button
          onClick={() => setPair(getDuelPair())}
          className="text-[11px] text-muted-foreground/25 hover:text-muted-foreground/40 transition-colors mt-2"
        >
          Skip this pair
        </button>

        {/* Current #1 */}
        {topItem && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 px-3 py-2">
            <Crown className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] text-muted-foreground/50">Current #1:</span>
            <span className="text-[10px] font-bold truncate max-w-[200px]">{topItem.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// DETAIL VIEW — Full item detail with actions
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
      {/* Header */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground/40 hover:text-foreground transition-colors">
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
              className="flex items-center gap-1 text-[11px] text-rose-500 font-medium hover:text-rose-400 transition-colors"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-6">
        {/* Hero image */}
        {item.imageUrl && (
          <div className="rounded-2xl overflow-hidden bg-foreground/[0.04] aspect-video">
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Title & rank */}
        <div>
          {!item.purchased && !item.archived && rank > 0 && rank <= totalItems && (
            <div className="flex items-center gap-2 mb-2">
              <RankBadge rank={rank} />
              <span className="text-[10px] text-muted-foreground/30">of {totalItems}</span>
              {item.matchesPlayed > 0 && (
                <span className="text-[9px] font-mono text-muted-foreground/25 ml-auto">{item.elo} ELO · {item.matchesPlayed} duels</span>
              )}
            </div>
          )}

          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-[20px] font-bold bg-transparent border-b border-border/40 pb-1 focus:outline-none focus:border-rose-500/40"
            />
          ) : (
            <h2 className={cn('text-[20px] font-bold tracking-tight', item.purchased && 'line-through text-muted-foreground/40')}>
              {item.title}
            </h2>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {item.price != null && (
              <span className="text-[18px] font-bold">{formatPrice(item.price, item.currency)}</span>
            )}
            {item.category && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-foreground/[0.04] text-muted-foreground/40">{item.category}</span>
            )}
            {item.purchased && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Purchased</span>
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
            className="w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 resize-none"
          />
        ) : item.description ? (
          <p className="text-[13px] text-muted-foreground/60 leading-relaxed">{item.description}</p>
        ) : null}

        {/* Price edit */}
        {editing && (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Price</label>
            <input
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] focus:outline-none focus:border-rose-500/40"
            />
          </div>
        )}

        {/* Notes */}
        {editing ? (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Personal notes..."
              rows={3}
              className="mt-1 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-rose-500/40 resize-none"
            />
          </div>
        ) : item.notes ? (
          <div className="rounded-xl bg-foreground/[0.02] border border-border/30 p-3">
            <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-[12px] text-muted-foreground/50 leading-relaxed">{item.notes}</p>
          </div>
        ) : null}

        {/* Link */}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border/40 px-4 py-3 text-[12px] text-muted-foreground/50 hover:text-rose-500 hover:border-rose-500/30 transition-all group"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{item.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
            <span className="text-[10px] text-muted-foreground/20 group-hover:text-rose-500/50">Open</span>
          </a>
        )}

        {/* Info row */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground/25">
          <span>Added {createdDate}</span>
          <span>{daysSinceAdded}d ago</span>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {!item.purchased && (
            <button
              onClick={onPurchase}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-semibold bg-emerald-500 text-white hover:bg-emerald-400 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
            >
              <ShoppingBag className="h-4 w-4" />
              Mark as Purchased
            </button>
          )}

          <div className="flex gap-2">
            {item.archived ? (
              <button
                onClick={onUnarchive}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium border border-border/40 text-muted-foreground/50 hover:bg-foreground/[0.04] transition-all"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </button>
            ) : (
              <button
                onClick={onArchive}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium border border-border/40 text-muted-foreground/50 hover:bg-foreground/[0.04] transition-all"
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
                'flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium transition-all',
                confirmDelete
                  ? 'bg-red-500 text-white'
                  : 'border border-border/40 text-muted-foreground/30 hover:text-red-500 hover:border-red-500/30'
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDelete ? 'Confirm Delete' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// STATS VIEW — Wishlist analytics
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
  const archived = items.filter((i) => i.archived && !i.purchased);
  const totalValue = active.reduce((s, i) => s + (i.price ?? 0), 0);
  const purchasedValue = purchased.reduce((s, i) => s + (i.price ?? 0), 0);
  const avgElo = active.length > 0 ? Math.round(active.reduce((s, i) => s + i.elo, 0) / active.length) : 0;

  // Most dueled item
  const duelCounts: Record<string, number> = {};
  duelHistory.forEach((d) => {
    duelCounts[d.winnerId] = (duelCounts[d.winnerId] || 0) + 1;
    duelCounts[d.loserId] = (duelCounts[d.loserId] || 0) + 1;
  });
  const mostDueledId = Object.entries(duelCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const mostDueled = items.find((i) => i.id === mostDueledId);

  // Win rate leaders
  const wins: Record<string, number> = {};
  const losses: Record<string, number> = {};
  duelHistory.forEach((d) => {
    wins[d.winnerId] = (wins[d.winnerId] || 0) + 1;
    losses[d.loserId] = (losses[d.loserId] || 0) + 1;
  });

  // Category breakdown
  const catCounts: Record<string, { count: number; value: number }> = {};
  active.forEach((i) => {
    const cat = i.category || 'Uncategorized';
    if (!catCounts[cat]) catCounts[cat] = { count: 0, value: 0 };
    catCounts[cat].count++;
    catCounts[cat].value += i.price ?? 0;
  });

  // Oldest wish
  const oldest = [...active].sort((a, b) => a.createdAt - b.createdAt)[0];
  const oldestDays = oldest ? Math.floor((Date.now() - oldest.createdAt) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <BarChart3 className="h-3.5 w-3.5 text-rose-500" />
        <span className="text-[12px] font-bold">Wishlist Insights</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-6">
        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active', value: active.length.toString(), sub: 'wishes', color: 'text-rose-500' },
            { label: 'Total Value', value: totalValue > 0 ? formatPrice(totalValue) : '—', sub: 'pending', color: 'text-amber-500' },
            { label: 'Duels', value: duelHistory.length.toString(), sub: 'played', color: 'text-violet-500' },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl border border-border/40 p-3 text-center">
              <p className={cn('text-lg font-bold tabular-nums leading-none', m.color)}>{m.value}</p>
              <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1">{m.label}</p>
            </div>
          ))}
        </div>

        {/* More stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/40 p-3">
            <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-1">Purchased</p>
            <p className="text-[16px] font-bold tabular-nums">{purchased.length}</p>
            {purchasedValue > 0 && <p className="text-[10px] text-muted-foreground/30">{formatPrice(purchasedValue)} spent</p>}
          </div>
          <div className="rounded-2xl border border-border/40 p-3">
            <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-1">Avg ELO</p>
            <p className="text-[16px] font-bold tabular-nums font-mono">{avgElo || '—'}</p>
            <p className="text-[10px] text-muted-foreground/30">across {active.length} items</p>
          </div>
        </div>

        {/* Oldest wish */}
        {oldest && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-500/60" />
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider">Longest Waiting</span>
            </div>
            <p className="text-[13px] font-bold">{oldest.title}</p>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">{oldestDays} days on your wishlist</p>
          </div>
        )}

        {/* Category breakdown */}
        {Object.keys(catCounts).length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-2">By Category</p>
            <div className="space-y-1.5">
              {Object.entries(catCounts)
                .sort(([, a], [, b]) => b.value - a.value)
                .map(([cat, data]) => (
                  <div key={cat} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-foreground/[0.02]">
                    <Tag className="h-3 w-3 text-muted-foreground/20 shrink-0" />
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

        {/* Most contested */}
        {mostDueled && (
          <div className="rounded-xl border border-border/40 p-3">
            <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest mb-1">Most Dueled</p>
            <p className="text-[13px] font-bold">{mostDueled.title}</p>
            <p className="text-[10px] text-muted-foreground/30">{duelCounts[mostDueledId]} matchups</p>
          </div>
        )}
      </div>
    </div>
  );
}
