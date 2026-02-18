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
  Gem,
  Gavel,
  Eye,
  Hash,
  Bookmark,
  Layers,
  Zap,
  Award,
  CircleDot,
  ArrowUpRight,
  Timer,
  Fingerprint,
  Shield,
  Crosshair,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────

type View = 'collection' | 'arena' | 'acquire' | 'lot' | 'portfolio';
type SortMode = 'rank' | 'newest' | 'price-asc' | 'price-desc' | 'name';
type AddMode = 'url' | 'manual';

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

// ─── Helpers ───────────────────────────────────────────────

function formatPrice(price: number, currency = '€'): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
  return `${sym}${price.toFixed(2)}`;
}

function formatLotNumber(index: number): string {
  return `LOT ${String(index + 1).padStart(3, '0')}`;
}

function getDesireLabel(elo: number): { label: string; intensity: number } {
  if (elo >= 1350) return { label: 'Obsession', intensity: 5 };
  if (elo >= 1280) return { label: 'Must-Have', intensity: 4 };
  if (elo >= 1220) return { label: 'Want', intensity: 3 };
  if (elo >= 1160) return { label: 'Interested', intensity: 2 };
  return { label: 'Curious', intensity: 1 };
}

function getDaysSince(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function getWaitLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

// ─── Lot Number Badge ──────────────────────────────────────

function LotBadge({ index, size = 'sm' }: { index: number; size?: 'sm' | 'lg' }) {
  return (
    <span className={cn(
      'font-mono tabular-nums tracking-wider uppercase',
      size === 'sm' ? 'text-[8px] text-muted-foreground/25' : 'text-[10px] text-muted-foreground/30'
    )}>
      {formatLotNumber(index)}
    </span>
  );
}

// ─── Rank Crest ────────────────────────────────────────────

function RankCrest({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-amber-300/30">
      <Crown className="h-4 w-4 text-white drop-shadow-sm" />
    </div>
  );
  if (rank === 2) return (
    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-zinc-200 via-zinc-300 to-zinc-500 flex items-center justify-center shadow-md ring-1 ring-zinc-300/30">
      <span className="text-[12px] font-black text-white drop-shadow-sm">II</span>
    </div>
  );
  if (rank === 3) return (
    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-600 via-orange-600 to-orange-800 flex items-center justify-center shadow-md ring-1 ring-orange-500/20">
      <span className="text-[12px] font-black text-white drop-shadow-sm">III</span>
    </div>
  );
  return (
    <div className="h-8 w-8 rounded-xl bg-muted/30 flex items-center justify-center">
      <span className="text-[11px] font-bold text-muted-foreground/30 tabular-nums">{rank}</span>
    </div>
  );
}

// ─── Desire Meter ──────────────────────────────────────────

function DesireMeter({ elo, matchesPlayed, compact = false }: { elo: number; matchesPlayed: number; compact?: boolean }) {
  const { label, intensity } = getDesireLabel(elo);
  if (matchesPlayed === 0) return null;

  return (
    <div className={cn('flex items-center gap-1.5', compact && 'gap-1')}>
      <div className="flex gap-[2px]">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={cn(
              'rounded-[1px] transition-all duration-500',
              compact ? 'h-2 w-[3px]' : 'h-2.5 w-1',
              i < intensity
                ? intensity >= 4 ? 'bg-amber-500' : intensity >= 3 ? 'bg-foreground/40' : 'bg-foreground/20'
                : 'bg-foreground/[0.04]'
            )}
          />
        ))}
      </div>
      {!compact && (
        <span className={cn(
          'text-[8px] uppercase tracking-widest font-medium',
          intensity >= 4 ? 'text-amber-500/70' : 'text-muted-foreground/25'
        )}>
          {label}
        </span>
      )}
    </div>
  );
}

// ─── Product Display ───────────────────────────────────────

function ProductDisplay({ src, size = 'md', className }: { src?: string; size?: 'sm' | 'md' | 'catalog' | 'exhibit'; className?: string }) {
  const dims = {
    sm: 'h-11 w-11 rounded-lg',
    md: 'h-16 w-16 rounded-xl',
    catalog: 'h-36 w-full rounded-xl',
    exhibit: 'w-full aspect-[4/3] max-h-[360px] rounded-2xl',
  }[size];

  if (!src) {
    return (
      <div className={cn(dims, 'bg-muted/20 border border-border/10 flex items-center justify-center shrink-0', className)}>
        <Gem className={cn(
          'text-muted-foreground/10',
          size === 'sm' ? 'h-4 w-4' : size === 'exhibit' || size === 'catalog' ? 'h-8 w-8' : 'h-5 w-5'
        )} />
      </div>
    );
  }

  return (
    <div className={cn(dims, 'bg-muted/10 border border-border/10 overflow-hidden flex items-center justify-center shrink-0', className)}>
      <img
        src={src}
        alt=""
        className={cn(
          'max-h-full max-w-full object-contain',
          size === 'sm' ? 'p-0.5' : size === 'exhibit' ? 'p-8' : size === 'catalog' ? 'p-3' : 'p-1.5'
        )}
      />
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// THE VAULT — Main Page
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

  const [view, setView] = useState<View>('collection');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAcquired, setShowAcquired] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    useWishlistStore.persist.rehydrate();
  }, []);

  const activeItems = useMemo(() => {
    let list = items.filter((i) => !i.archived);
    if (!showAcquired) list = list.filter((i) => !i.purchased);
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
  }, [items, sortMode, filterCategory, searchQuery, showAcquired]);

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

  const openLot = (id: string) => {
    setDetailId(id);
    setView('lot');
  };

  if (!mounted) return null;

  // ── ACQUIRE VIEW ──
  if (view === 'acquire') {
    return (
      <AcquireView
        categories={usedCategories}
        onAdd={(item) => {
          const created = addItem(item);
          setView('collection');
          return created;
        }}
        onAddCategory={addCategory}
        onBack={() => setView('collection')}
        lotNumber={items.length}
      />
    );
  }

  // ── ARENA VIEW ──
  if (view === 'arena') {
    return (
      <ArenaView
        getDuelPair={getDuelPair}
        recordDuel={recordDuel}
        onBack={() => setView('collection')}
        totalDuels={duelHistory.length}
        topItem={rankedItems[0]}
        rankedItems={rankedItems}
      />
    );
  }

  // ── LOT VIEW (Detail) ──
  if (view === 'lot' && detailId) {
    const item = items.find((i) => i.id === detailId);
    if (!item) { setView('collection'); return null; }
    return (
      <LotView
        item={item}
        rank={rankedItems.findIndex((i) => i.id === item.id) + 1}
        totalItems={rankedItems.length}
        lotIndex={items.findIndex((i) => i.id === item.id)}
        onUpdate={(updates) => updateItem(item.id, updates)}
        onPurchase={() => { purchaseItem(item.id); setView('collection'); }}
        onArchive={() => { archiveItem(item.id); setView('collection'); }}
        onUnarchive={() => { unarchiveItem(item.id); setView('collection'); }}
        onDelete={() => { removeItem(item.id); setView('collection'); }}
        onBack={() => setView('collection')}
        categories={usedCategories}
        onAddCategory={addCategory}
      />
    );
  }

  // ── PORTFOLIO VIEW ──
  if (view === 'portfolio') {
    return (
      <PortfolioView
        items={items}
        duelHistory={duelHistory}
        onBack={() => setView('collection')}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════
  // COLLECTION VIEW
  // ═══════════════════════════════════════════════════════════

  const activeCount = items.filter((i) => !i.purchased && !i.archived).length;
  const purchasedCount = items.filter((i) => i.purchased).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Vault Header */}
      <div className="px-4 lg:px-8 py-4 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-foreground/[0.04] border border-border/10 flex items-center justify-center">
                <Gem className="h-3.5 w-3.5 text-muted-foreground/30" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-[17px] font-semibold tracking-tight leading-none">The Vault</h1>
                <p className="text-[8px] font-mono text-muted-foreground/20 mt-0.5">{activeCount} lot{activeCount !== 1 ? 's' : ''}{totalValue > 0 ? ` · ${formatPrice(totalValue)}` : ''}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeCount >= 2 && (
              <button
                onClick={() => setView('arena')}
                className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-all border border-transparent hover:border-border/15"
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">This or That</span>
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => setView('portfolio')}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <Layers className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setView('acquire')}
              className="h-8 px-3.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              Acquire
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        {items.length > 0 && (
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/20" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search collection..."
                className="w-full rounded-lg border border-border/15 bg-muted/15 pl-9 pr-3 py-1.5 text-[12px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/40 focus:bg-muted/25 transition-all"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide text-[10px]">
              {([
                { mode: 'rank' as SortMode, label: 'Ranked', icon: Trophy },
                { mode: 'newest' as SortMode, label: 'Recent', icon: Clock },
                { mode: 'price-desc' as SortMode, label: 'Value ↓', icon: DollarSign },
              ]).map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={cn(
                    'rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0 flex items-center gap-1',
                    sortMode === mode
                      ? 'bg-foreground/[0.06] text-foreground'
                      : 'text-muted-foreground/30 hover:text-muted-foreground/50'
                  )}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {label}
                </button>
              ))}

              {usedCategories.length > 0 && <div className="h-3 w-px bg-border/20 shrink-0 mx-0.5" />}

              {usedCategories.length > 0 && (
                <button
                  onClick={() => setFilterCategory(null)}
                  className={cn(
                    'rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                    !filterCategory ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground/30 hover:text-muted-foreground/50'
                  )}
                >
                  All
                </button>
              )}
              {usedCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                  className={cn(
                    'rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                    filterCategory === cat ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground/30 hover:text-muted-foreground/50'
                  )}
                >
                  {cat}
                </button>
              ))}

              {purchasedCount > 0 && (
                <>
                  <div className="h-3 w-px bg-border/20 shrink-0 mx-0.5" />
                  <button
                    onClick={() => setShowAcquired(!showAcquired)}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2 py-1 font-medium whitespace-nowrap transition-all shrink-0',
                      showAcquired ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/25'
                    )}
                  >
                    <ShoppingBag className="h-2.5 w-2.5" />
                    Acquired ({purchasedCount})
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collection */}
      <div className="flex-1 overflow-y-auto">
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            {items.length === 0 ? (
              <>
                <div className="h-20 w-20 rounded-2xl bg-muted/10 border border-border/10 flex items-center justify-center mb-5 relative">
                  <Gem className="h-8 w-8 text-muted-foreground/10" strokeWidth={1} />
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-lg bg-foreground/[0.03] border border-border/10 flex items-center justify-center">
                    <Plus className="h-3 w-3 text-muted-foreground/15" />
                  </div>
                </div>
                <h2 className="text-[17px] font-semibold mb-2 tracking-tight">Your Vault awaits</h2>
                <p className="text-[12px] text-muted-foreground/30 max-w-[300px] mb-1.5 leading-relaxed">
                  Curate your desires. Every link, every item becomes a lot in your personal collection.
                </p>
                <p className="text-[11px] text-muted-foreground/20 max-w-[280px] mb-6 leading-relaxed">
                  Then settle it in the Arena — <em>this or that</em> — and discover what you truly want.
                </p>
                <button
                  onClick={() => setView('acquire')}
                  className="flex items-center gap-2 rounded-xl bg-foreground text-background px-6 py-3 text-[12px] font-semibold hover:opacity-90 transition-all active:scale-[0.97]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Acquire first lot
                </button>
              </>
            ) : (
              <>
                <Search className="h-6 w-6 text-muted-foreground/10 mb-2" />
                <p className="text-[12px] text-muted-foreground/25">No matches</p>
              </>
            )}
          </div>
        ) : (
          <div className="p-3 lg:px-8">
            {/* Crown Certificate — #1 Ranked (the Vault's signature artifact) */}
            {sortMode === 'rank' && activeItems.length > 0 && !searchQuery && !filterCategory && (() => {
              const top = activeItems[0];
              const desire = getDesireLabel(top.elo);
              const days = getDaysSince(top.createdAt);
              const lotIdx = items.findIndex(i => i.id === top.id);
              return (
                <button
                  onClick={() => openLot(top.id)}
                  className="w-full rounded-2xl border border-border/15 bg-card overflow-hidden text-left transition-all hover:border-border/30 active:scale-[0.998] mb-4 group relative"
                >
                  {/* Gold accent line */}
                  <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

                  {/* Watermark */}
                  <div className="absolute top-4 right-4 opacity-[0.015] pointer-events-none select-none">
                    <Crown className="h-28 w-28" strokeWidth={0.5} />
                  </div>

                  {/* Certificate header strip */}
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center">
                        <Crown className="h-2 w-2 text-white" />
                      </div>
                      <span className="text-[8px] font-bold text-amber-500 uppercase tracking-[0.25em]">Crown Lot</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[7px] font-mono text-muted-foreground/15 uppercase tracking-widest">{formatLotNumber(lotIdx)}</span>
                      {top.matchesPlayed > 0 && (
                        <span className="text-[8px] font-mono text-amber-500/40 tabular-nums">{top.elo}</span>
                      )}
                    </div>
                  </div>

                  {/* Thin separator with notches (like a tear line) */}
                  <div className="relative mx-3 h-px">
                    <div className="absolute inset-0 border-t border-dashed border-border/15" />
                    <div className="absolute -left-3 -top-[3px] h-1.5 w-1.5 rounded-full bg-background" />
                    <div className="absolute -right-3 -top-[3px] h-1.5 w-1.5 rounded-full bg-background" />
                  </div>

                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <ProductDisplay src={top.imageUrl} size="md" />
                        <div className="absolute -top-1 -right-1">
                          <RankCrest rank={1} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold tracking-tight line-clamp-2 group-hover:text-foreground/80 transition-colors">
                          {top.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-2">
                          {top.price != null && (
                            <span className="text-[15px] font-bold tabular-nums">
                              {formatPrice(top.price, top.currency)}
                            </span>
                          )}
                          {top.category && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.03] text-muted-foreground/35">{top.category}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2.5">
                          <DesireMeter elo={top.elo} matchesPlayed={top.matchesPlayed} />
                          {days > 0 && (
                            <span className="text-[8px] text-muted-foreground/20 font-mono">
                              {getWaitLabel(days)} in vault
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Certificate footer — barcode-like pattern */}
                  <div className="px-4 pb-3 flex items-end justify-between">
                    <div className="flex gap-[1.5px]">
                      {Array.from({ length: 24 }, (_, i) => (
                        <div
                          key={i}
                          className="bg-foreground/[0.04] rounded-[0.5px]"
                          style={{ width: i % 3 === 0 ? '2.5px' : '1.5px', height: `${8 + (((lotIdx + i) * 7) % 8)}px` }}
                        />
                      ))}
                    </div>
                    <p className="text-[6px] font-mono text-muted-foreground/10 uppercase tracking-widest">
                      The Vault · Est. {new Date(top.createdAt).getFullYear()}
                    </p>
                  </div>
                </button>
              );
            })()}

            {/* Collection Items */}
            <div className="space-y-px">
              {(sortMode === 'rank' && !searchQuery && !filterCategory ? activeItems.slice(1) : activeItems).map((item) => {
                const rank = sortMode === 'rank' ? rankedItems.findIndex((r) => r.id === item.id) + 1 : 0;
                const lotIdx = items.findIndex((i) => i.id === item.id);
                const days = getDaysSince(item.createdAt);

                return (
                  <button
                    key={item.id}
                    onClick={() => openLot(item.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all group',
                      'hover:bg-muted/20 active:scale-[0.998]',
                      item.purchased && 'opacity-35'
                    )}
                  >
                    {/* Rank or Image */}
                    {sortMode === 'rank' && !item.purchased ? (
                      <RankCrest rank={rank} />
                    ) : (
                      <ProductDisplay src={item.imageUrl} size="sm" />
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-[13px] font-medium truncate', item.purchased && 'line-through')}>
                          {item.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.price != null && (
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/50">{formatPrice(item.price, item.currency)}</span>
                        )}
                        {item.category && (
                          <span className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.03] text-muted-foreground/30">{item.category}</span>
                        )}
                        <span className="text-[8px] font-mono text-muted-foreground/15">{formatLotNumber(lotIdx)}</span>
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {!item.purchased && item.matchesPlayed > 0 && (
                        <DesireMeter elo={item.elo} matchesPlayed={item.matchesPlayed} compact />
                      )}
                      {!item.purchased && days > 7 && (
                        <span className="text-[8px] text-muted-foreground/15 font-mono">{getWaitLabel(days)}</span>
                      )}
                      {item.purchased && <ShoppingBag className="h-3 w-3 text-emerald-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// ACQUIRE VIEW
// ═══════════════════════════════════════════════════════════

function AcquireView({
  categories,
  onAdd,
  onAddCategory,
  onBack,
  lotNumber,
}: {
  categories: string[];
  onAdd: (item: Omit<WishlistItem, 'id' | 'elo' | 'matchesPlayed' | 'createdAt' | 'updatedAt'>) => WishlistItem;
  onAddCategory: (name: string) => void;
  onBack: () => void;
  lotNumber: number;
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
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-[14px] font-semibold">Acquire New Lot</h2>
            <p className="text-[9px] font-mono text-muted-foreground/25">{formatLotNumber(lotNumber)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
        {/* Mode toggle */}
        <div className="rounded-xl border border-border/20 p-0.5 flex gap-0.5 bg-muted/15">
          <button
            onClick={() => setMode('url')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[11px] font-medium transition-all',
              mode === 'url' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            From URL
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[11px] font-medium transition-all',
              mode === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            <Type className="h-3.5 w-3.5" />
            Manual Entry
          </button>
        </div>

        {/* URL input */}
        {mode === 'url' && (
          <div className="rounded-xl border border-dashed border-border/25 bg-muted/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded-lg border border-border/25 bg-background px-3 py-2.5 text-[12px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors"
              />
              <button
                onClick={handlePaste}
                className="rounded-lg border border-border/25 px-3 py-2.5 text-[11px] font-medium text-muted-foreground/40 hover:text-foreground hover:bg-muted/20 transition-all"
              >
                Paste
              </button>
            </div>
            <button
              onClick={handleScrape}
              disabled={scraping || !url.trim()}
              className={cn(
                'w-full rounded-lg py-2.5 text-[11px] font-semibold transition-all',
                scraping
                  ? 'bg-muted/20 text-muted-foreground/25 cursor-wait'
                  : 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
              )}
            >
              {scraping ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3 w-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  Scanning...
                </span>
              ) : scraped ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Check className="h-3 w-3" />
                  Scanned — verify details
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Scan Product
                </span>
              )}
            </button>
          </div>
        )}

        {/* Catalog Entry Fields */}
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="h-2.5 w-2.5" />
              Item Name *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What caught your eye?"
              autoFocus={mode === 'manual'}
              className="mt-1.5 w-full rounded-lg border border-border/20 bg-transparent px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/40 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Size, color, specs, why you want it..."
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-border/20 bg-transparent px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/40 transition-colors resize-none"
            />
          </div>

          {/* Price row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="h-2.5 w-2.5" />
                Estimate
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground/25">{currency}</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border/20 bg-transparent pl-7 pr-3 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/40 transition-colors"
                />
              </div>
            </div>
            <div className="w-20">
              <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border/20 bg-transparent px-2 py-2.5 text-[13px] focus:outline-none focus:border-border/40 transition-colors"
              >
                <option value="€">€ EUR</option>
                <option value="$">$ USD</option>
                <option value="£">£ GBP</option>
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="h-2.5 w-2.5" />
              Collection
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? '' : cat)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all',
                    category === cat
                      ? 'bg-foreground/[0.06] text-foreground ring-1 ring-foreground/10'
                      : 'bg-muted/15 text-muted-foreground/35 hover:bg-muted/30'
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
                className="w-16 rounded-lg border border-border/15 bg-transparent px-2 py-1.5 text-[10px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/30 focus:w-24 transition-all"
              />
            </div>
          </div>

          {/* Image URL */}
          {!imageUrl && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Image URL</label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (optional)"
                className="mt-1.5 w-full rounded-lg border border-border/20 bg-transparent px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/40 transition-colors"
              />
            </div>
          )}

          {/* Preview — Catalog Card Style */}
          {(title || imageUrl) && (
            <div className="rounded-xl border border-border/15 bg-card overflow-hidden">
              <div className="h-[1.5px] bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
              <div className="p-4">
                <p className="text-[7px] text-muted-foreground/20 uppercase tracking-[0.2em] font-mono mb-2.5">Catalog Preview</p>
                <div className="flex items-center gap-3">
                  <ProductDisplay src={imageUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{title || 'Untitled'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {price && <p className="text-[11px] font-semibold text-muted-foreground/50">{currency}{price}</p>}
                      {category && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.03] text-muted-foreground/30">{category}</span>}
                    </div>
                    <p className="text-[8px] font-mono text-muted-foreground/15 mt-1">{formatLotNumber(lotNumber)}</p>
                  </div>
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
            'w-full rounded-xl py-3.5 text-[13px] font-semibold transition-all active:scale-[0.98]',
            title.trim()
              ? 'bg-foreground text-background hover:opacity-90'
              : 'bg-muted/20 text-muted-foreground/20 cursor-not-allowed'
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <Gem className="h-3.5 w-3.5" />
            Add to Vault
          </span>
        </button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// THE ARENA — Duels with intensity
// ═══════════════════════════════════════════════════════════

function ArenaView({
  getDuelPair,
  recordDuel,
  onBack,
  totalDuels,
  topItem,
  rankedItems,
}: {
  getDuelPair: () => [WishlistItem, WishlistItem] | null;
  recordDuel: (winnerId: string, loserId: string) => void;
  onBack: () => void;
  totalDuels: number;
  topItem?: WishlistItem;
  rankedItems: WishlistItem[];
}) {
  const [pair, setPair] = useState<[WishlistItem, WishlistItem] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [lastVerdict, setLastVerdict] = useState<{ winner: string; eloGain: number } | null>(null);
  const [entering, setEntering] = useState(true);
  const [roundPhase, setRoundPhase] = useState<'ready' | 'choosing' | 'verdict'>('ready');

  useEffect(() => {
    const newPair = getDuelPair();
    setPair(newPair);
    // Entrance animation
    setTimeout(() => setEntering(false), 100);
  }, []);

  const handleChoice = (winnerId: string) => {
    if (!pair || roundPhase === 'verdict') return;
    const loserId = pair[0].id === winnerId ? pair[1].id : pair[0].id;
    const winnerItem = pair.find(p => p.id === winnerId)!;
    
    setChosen(winnerId);
    setRoundPhase('verdict');
    
    // Calculate ELO change for display
    const expectedWinner = 1 / (1 + Math.pow(10, (pair.find(p => p.id === loserId)!.elo - winnerItem.elo) / 400));
    const eloGain = Math.round(32 * (1 - expectedWinner));
    
    recordDuel(winnerId, loserId);
    setStreak((s) => s + 1);
    setTotalRounds((r) => r + 1);
    setLastVerdict({ winner: winnerItem.title, eloGain });

    setTimeout(() => {
      setChosen(null);
      setRoundPhase('ready');
      const newPair = getDuelPair();
      setPair(newPair);
      // Brief re-enter animation
      setEntering(true);
      setTimeout(() => setEntering(false), 50);
    }, 600);
  };

  if (!pair) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted/15 border border-border/10 flex items-center justify-center mb-4">
          <Gavel className="h-6 w-6 text-muted-foreground/15" />
        </div>
        <p className="text-[15px] font-semibold mb-1.5">Arena needs challengers</p>
        <p className="text-[12px] text-muted-foreground/35">Add at least 2 items to start ranking</p>
        <button onClick={onBack} className="mt-5 text-[12px] text-muted-foreground/40 font-medium hover:text-foreground transition-colors">
          ← Back to Vault
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Arena Header — darker, more intense */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center justify-between relative">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-foreground/[0.06] flex items-center justify-center">
              <Crosshair className="h-3 w-3 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <span className="text-[12px] font-semibold">The Arena</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {streak > 2 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 animate-in fade-in duration-300">
              <Flame className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] font-bold text-amber-500 tabular-nums">{streak} streak</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/25 font-mono tabular-nums">
            <span className="text-muted-foreground/15">Round</span>
            <span className="font-bold text-muted-foreground/40">{totalDuels + totalRounds}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 gap-5 relative">
        {/* Verdict flash overlay */}
        {lastVerdict && roundPhase === 'ready' && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center animate-in fade-in slide-in-from-bottom-2 duration-300 z-10">
            <div className="rounded-xl bg-card border border-border/15 px-4 py-2.5 shadow-lg">
              <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">Verdict</p>
              <p className="text-[12px] font-semibold mt-0.5 truncate max-w-[250px]">{lastVerdict.winner}</p>
              <p className="text-[10px] text-emerald-500 font-mono font-bold mt-0.5">+{lastVerdict.eloGain} ELO</p>
            </div>
          </div>
        )}

        {/* Question — This or That prompt */}
        <div className="text-center space-y-1">
          <p className="text-[18px] font-bold tracking-tight">This or that?</p>
          <p className="text-[10px] text-muted-foreground/25 uppercase tracking-[0.2em]">
            Tap the one you desire more
          </p>
        </div>

        {/* Duel Cards with VS badge */}
        <div className="w-full max-w-md relative">
          <div className="grid grid-cols-2 gap-3">
            {pair.map((item, idx) => {
              const lotIdx = rankedItems.findIndex(r => r.id === item.id);
              const isWinner = chosen === item.id;
              const isLoser = chosen && chosen !== item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleChoice(item.id)}
                  className={cn(
                    'relative rounded-2xl border overflow-hidden text-center transition-all duration-300',
                    'active:scale-[0.97]',
                    isWinner
                      ? 'border-foreground/20 bg-foreground/[0.04] scale-[1.02] ring-2 ring-foreground/10'
                      : isLoser
                        ? 'border-transparent opacity-20 scale-[0.94] blur-[1px]'
                        : 'border-border/20 hover:border-border/40 hover:shadow-lg hover:shadow-foreground/[0.02] bg-card',
                    entering && 'animate-in fade-in slide-in-from-bottom-1 duration-300',
                    entering && idx === 1 && 'delay-75'
                  )}
                >
                  {/* Lot number strip */}
                  <div className="px-3 py-1.5 border-b border-border/10 bg-muted/10 flex items-center justify-between">
                    <span className="text-[7px] font-mono text-muted-foreground/20 uppercase tracking-widest">
                      {formatLotNumber(lotIdx >= 0 ? lotIdx : 0)}
                    </span>
                    {item.matchesPlayed > 0 && (
                      <span className="text-[7px] font-mono text-muted-foreground/15 tabular-nums">{item.elo}</span>
                    )}
                  </div>

                  <div className="p-3.5">
                    <ProductDisplay src={item.imageUrl} size="catalog" className="mb-3" />
                    <h3 className="text-[12px] font-semibold line-clamp-2 leading-snug px-1 min-h-[2.5em]">{item.title}</h3>
                    {item.price != null && (
                      <p className="text-[14px] font-bold mt-2 tabular-nums">{formatPrice(item.price, item.currency)}</p>
                    )}
                    {item.category && (
                      <span className="inline-block mt-2 text-[8px] font-medium px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground/30">
                        {item.category}
                      </span>
                    )}
                    {item.matchesPlayed > 0 && (
                      <div className="mt-2 flex justify-center">
                        <DesireMeter elo={item.elo} matchesPlayed={item.matchesPlayed} compact />
                      </div>
                    )}
                  </div>

                  {/* Winner stamp */}
                  {isWinner && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
                      <div className="flex flex-col items-center gap-1 animate-in zoom-in-50 duration-200">
                        <div className="h-12 w-12 rounded-full bg-foreground flex items-center justify-center shadow-xl">
                          <Gavel className="h-5 w-5 text-background" />
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/60">Chosen</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* VS badge floating between cards */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className={cn(
              'h-9 w-9 rounded-full bg-background border-2 border-border/20 flex items-center justify-center shadow-lg transition-all duration-300',
              chosen ? 'opacity-0 scale-75' : 'opacity-100'
            )}>
              <span className="text-[9px] font-black text-muted-foreground/40 tracking-wider">VS</span>
            </div>
          </div>
        </div>

        {/* Skip + controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setEntering(true);
              setPair(getDuelPair());
              setTimeout(() => setEntering(false), 50);
            }}
            className="text-[10px] text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors font-medium"
          >
            Skip matchup →
          </button>
        </div>

        {/* Current Crown strip */}
        {topItem && (
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/10 border border-border/10 px-3.5 py-2.5 w-full max-w-md">
            <div className="h-5 w-5 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
              <Crown className="h-3 w-3 text-amber-500/60" />
            </div>
            <span className="text-[9px] text-muted-foreground/30 shrink-0">Reigning</span>
            <span className="text-[11px] font-semibold truncate flex-1">{topItem.title}</span>
            {topItem.matchesPlayed > 0 && (
              <span className="text-[8px] font-mono text-muted-foreground/20 tabular-nums shrink-0">{topItem.elo}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// LOT VIEW — Detailed exhibit
// ═══════════════════════════════════════════════════════════

function LotView({
  item,
  rank,
  totalItems,
  lotIndex,
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
  lotIndex: number;
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
  const daysSinceAdded = getDaysSince(item.createdAt);
  const { label: desireLabel, intensity } = getDesireLabel(item.elo);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground/20">{formatLotNumber(lotIndex)}</span>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/35 hover:text-foreground transition-colors"
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
        {/* Exhibit Image with museum frame */}
        {item.imageUrl && (
          <div className="rounded-2xl border border-border/10 bg-muted/5 p-1">
            <ProductDisplay src={item.imageUrl} size="exhibit" className="mx-auto" />
          </div>
        )}

        {/* Lot Certificate Card */}
        <div className="rounded-xl border border-border/15 bg-card overflow-hidden relative">
          {/* Accent line */}
          {!item.purchased && !item.archived && rank === 1 ? (
            <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          ) : (
            <div className="h-[1.5px] bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
          )}

          {/* Watermark for top 3 */}
          {rank > 0 && rank <= 3 && !item.purchased && (
            <div className="absolute top-3 right-3 opacity-[0.02] pointer-events-none select-none">
              {rank === 1 ? <Crown className="h-20 w-20" strokeWidth={0.5} /> :
               rank === 2 ? <Shield className="h-20 w-20" strokeWidth={0.5} /> :
               <Award className="h-20 w-20" strokeWidth={0.5} />}
            </div>
          )}

          <div className="p-4">
            {/* Rank + Desire */}
            {!item.purchased && !item.archived && rank > 0 && rank <= totalItems && (
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <RankCrest rank={rank} />
                  <div className="flex flex-col">
                    <span className="text-[9px] text-muted-foreground/25">Rank {rank} of {totalItems}</span>
                    {item.matchesPlayed > 0 && (
                      <span className="text-[8px] font-mono text-muted-foreground/15">{item.elo} ELO · {item.matchesPlayed} duels</span>
                    )}
                  </div>
                </div>
                <DesireMeter elo={item.elo} matchesPlayed={item.matchesPlayed} />
              </div>
            )}

            {/* Title */}
            {editing ? (
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-[18px] font-semibold bg-transparent border-b border-border/25 pb-1 focus:outline-none focus:border-foreground/20"
              />
            ) : (
              <h2 className={cn(
                'text-[18px] font-semibold tracking-tight',
                item.purchased && 'line-through text-muted-foreground/35'
              )}>
                {item.title}
              </h2>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
              {item.price != null && (
                <span className="text-[16px] font-bold tabular-nums">{formatPrice(item.price, item.currency)}</span>
              )}
              {item.category && (
                <span className="text-[9px] font-medium px-2 py-0.5 rounded-md bg-muted/20 text-muted-foreground/40">{item.category}</span>
              )}
              {item.purchased && (
                <span className="text-[9px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShoppingBag className="h-2.5 w-2.5" />
                  Acquired
                </span>
              )}
            </div>
          </div>

          {/* Certificate barcode footer */}
          <div className="px-4 pb-3 flex items-end justify-between border-t border-border/[0.06] pt-2.5 mt-1">
            <div className="flex gap-[1.5px]">
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="bg-foreground/[0.04] rounded-[0.5px]"
                  style={{ width: i % 3 === 0 ? '2.5px' : '1.5px', height: `${6 + (((lotIndex + i) * 7) % 6)}px` }}
                />
              ))}
            </div>
            <p className="text-[6px] font-mono text-muted-foreground/10 uppercase tracking-widest">
              {formatLotNumber(lotIndex)} · The Vault
            </p>
          </div>
        </div>

        {/* Description */}
        {editing ? (
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description..."
            rows={3}
            className="w-full rounded-xl border border-border/20 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/40 resize-none"
          />
        ) : item.description ? (
          <p className="text-[13px] text-muted-foreground/45 leading-relaxed">{item.description}</p>
        ) : null}

        {editing && (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Estimate</label>
            <input
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="mt-1.5 w-full rounded-lg border border-border/20 bg-transparent px-3 py-2.5 text-[13px] focus:outline-none focus:border-border/40"
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
              placeholder="Personal notes, reasoning, alternatives..."
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-border/20 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-border/40 resize-none"
            />
          </div>
        ) : item.notes ? (
          <div className="rounded-xl bg-muted/10 border border-border/10 p-4">
            <p className="text-[8px] text-muted-foreground/25 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5">
              <Bookmark className="h-2.5 w-2.5" />
              Notes
            </p>
            <p className="text-[12px] text-muted-foreground/45 leading-relaxed">{item.notes}</p>
          </div>
        ) : null}

        {/* Provenance (source link) */}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-border/15 px-4 py-3 text-[11px] text-muted-foreground/40 hover:text-foreground hover:border-border/30 transition-all group"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{item.url.replace(/^https?:\/\/(www\.)?/, '').split('?')[0]}</span>
            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        )}

        {/* Provenance details — museum catalog style */}
        <div className="rounded-xl border border-border/10 bg-card overflow-hidden">
          <div className="px-3.5 pt-3 pb-2 flex items-center gap-1.5">
            <Fingerprint className="h-3 w-3 text-muted-foreground/15" />
            <p className="text-[8px] text-muted-foreground/20 uppercase tracking-[0.2em] font-mono font-medium">Provenance</p>
          </div>
          <div className="relative mx-3.5 h-px mb-2">
            <div className="absolute inset-0 border-t border-dashed border-border/15" />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center px-3.5 pb-3.5">
            <div>
              <p className="text-[12px] font-semibold tabular-nums">{createdDate}</p>
              <p className="text-[7px] text-muted-foreground/20 uppercase tracking-wider mt-0.5">Cataloged</p>
            </div>
            <div>
              <p className="text-[12px] font-semibold tabular-nums">{daysSinceAdded}d</p>
              <p className="text-[7px] text-muted-foreground/20 uppercase tracking-wider mt-0.5">In Vault</p>
            </div>
            <div>
              <p className="text-[12px] font-semibold tabular-nums">{item.matchesPlayed}</p>
              <p className="text-[7px] text-muted-foreground/20 uppercase tracking-wider mt-0.5">Arena Duels</p>
            </div>
          </div>
          {/* Win/loss record if any duels */}
          {item.matchesPlayed > 0 && (
            <div className="px-3.5 pb-3 pt-1 border-t border-border/[0.06]">
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-muted-foreground/15 font-mono">Desire Classification</span>
                <span className={cn(
                  'text-[8px] font-bold uppercase tracking-widest',
                  intensity >= 4 ? 'text-amber-500/60' : intensity >= 3 ? 'text-foreground/30' : 'text-muted-foreground/25'
                )}>
                  {desireLabel}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {!item.purchased && (
            <button
              onClick={onPurchase}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-[12px] font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Mark as Acquired
            </button>
          )}

          <div className="flex gap-2">
            {item.archived ? (
              <button
                onClick={onUnarchive}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium border border-border/15 text-muted-foreground/40 hover:bg-muted/15 transition-all"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </button>
            ) : (
              <button
                onClick={onArchive}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium border border-border/15 text-muted-foreground/40 hover:bg-muted/15 transition-all"
              >
                <Archive className="h-3.5 w-3.5" />
                Vault Away
              </button>
            )}
            <button
              onClick={() => {
                if (confirmDelete) { onDelete(); } else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium transition-all',
                confirmDelete
                  ? 'bg-red-500 text-white'
                  : 'border border-border/15 text-muted-foreground/25 hover:text-red-500 hover:border-red-500/20'
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
// PORTFOLIO — Stats & insights
// ═══════════════════════════════════════════════════════════

function PortfolioView({
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
  const rankedActive = [...active].sort((a, b) => b.elo - a.elo);

  // Win rates
  const winCounts: Record<string, number> = {};
  const lossCounts: Record<string, number> = {};
  duelHistory.forEach((d) => {
    winCounts[d.winnerId] = (winCounts[d.winnerId] || 0) + 1;
    lossCounts[d.loserId] = (lossCounts[d.loserId] || 0) + 1;
  });

  // Most contested (most duels)
  const duelCounts: Record<string, number> = {};
  duelHistory.forEach((d) => {
    duelCounts[d.winnerId] = (duelCounts[d.winnerId] || 0) + 1;
    duelCounts[d.loserId] = (duelCounts[d.loserId] || 0) + 1;
  });
  const mostContestedId = Object.entries(duelCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const mostContested = items.find((i) => i.id === mostContestedId);

  // Biggest climber (highest win rate with enough matches)
  const climber = active
    .filter(i => i.matchesPlayed >= 3)
    .map(i => ({ item: i, winRate: (winCounts[i.id] || 0) / i.matchesPlayed }))
    .sort((a, b) => b.winRate - a.winRate)[0];

  // Categories
  const catCounts: Record<string, { count: number; value: number }> = {};
  active.forEach((i) => {
    const cat = i.category || 'Uncategorized';
    if (!catCounts[cat]) catCounts[cat] = { count: 0, value: 0 };
    catCounts[cat].count++;
    catCounts[cat].value += i.price ?? 0;
  });

  const oldest = [...active].sort((a, b) => a.createdAt - b.createdAt)[0];
  const oldestDays = oldest ? getDaysSince(oldest.createdAt) : 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/20 flex items-center gap-2.5">
        <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="h-5 w-5 rounded-md bg-foreground/[0.06] flex items-center justify-center">
          <Layers className="h-3 w-3 text-muted-foreground/40" strokeWidth={1.5} />
        </div>
        <span className="text-[12px] font-semibold">Collector&apos;s Portfolio</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
        {/* Key Metrics — certificate style */}
        <div className="rounded-xl border border-border/10 bg-card overflow-hidden">
          <div className="h-[1.5px] bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
          <div className="grid grid-cols-3 divide-x divide-border/10 py-4">
            {[
              { label: 'In Vault', value: active.length.toString(), sub: 'lots' },
              { label: 'Total Value', value: totalValue > 0 ? formatPrice(totalValue) : '—', sub: 'estimated' },
              { label: 'Verdicts', value: duelHistory.length.toString(), sub: 'arena' },
            ].map((m) => (
              <div key={m.label} className="text-center px-3">
                <p className="text-[18px] font-bold tabular-nums leading-none">{m.value}</p>
                <p className="text-[7px] text-muted-foreground/20 uppercase tracking-[0.15em] mt-1.5">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Acquisition History */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/10 bg-card p-3.5">
            <p className="text-[8px] text-muted-foreground/20 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1">
              <ShoppingBag className="h-2.5 w-2.5" />
              Acquired
            </p>
            <p className="text-[16px] font-bold tabular-nums">{purchased.length}</p>
            {purchasedValue > 0 && <p className="text-[10px] text-muted-foreground/25 mt-0.5">{formatPrice(purchasedValue)} total</p>}
          </div>
          <div className="rounded-xl border border-border/10 bg-card p-3.5">
            <p className="text-[8px] text-muted-foreground/20 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1">
              <Target className="h-2.5 w-2.5" />
              Avg Desire
            </p>
            <p className="text-[16px] font-bold tabular-nums font-mono">{avgElo || '—'}</p>
            <p className="text-[10px] text-muted-foreground/25 mt-0.5">{active.filter(i => i.matchesPlayed > 0).length} ranked</p>
          </div>
        </div>

        {/* Top 3 Podium */}
        {rankedActive.length >= 3 && rankedActive[0].matchesPlayed > 0 && (
          <div className="rounded-xl border border-border/10 bg-card overflow-hidden">
            <div className="h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
            <div className="p-4">
              <p className="text-[8px] text-muted-foreground/20 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
                <Award className="h-2.5 w-2.5 text-amber-500/50" />
                Top Desires
              </p>
              <div className="space-y-2">
                {rankedActive.slice(0, 3).map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <RankCrest rank={i + 1} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{item.title}</p>
                      {item.price != null && (
                        <p className="text-[10px] text-muted-foreground/30 tabular-nums">{formatPrice(item.price, item.currency)}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-mono font-bold tabular-nums">{item.elo}</p>
                      <p className="text-[7px] text-muted-foreground/20 uppercase">ELO</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Patience Test */}
        {oldest && oldestDays > 0 && (
          <div className="rounded-xl border border-border/10 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Timer className="h-3 w-3 text-muted-foreground/20" />
              <span className="text-[8px] text-muted-foreground/20 font-medium uppercase tracking-[0.15em]">Patience Test</span>
            </div>
            <p className="text-[13px] font-semibold">{oldest.title}</p>
            <p className="text-[10px] text-muted-foreground/25 mt-0.5">{oldestDays} days waiting — still want it?</p>
          </div>
        )}

        {/* Arena Champion */}
        {climber && (
          <div className="rounded-xl border border-border/10 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-emerald-500/50" />
              <span className="text-[8px] text-muted-foreground/20 font-medium uppercase tracking-[0.15em]">Arena Champion</span>
            </div>
            <p className="text-[13px] font-semibold">{climber.item.title}</p>
            <p className="text-[10px] text-muted-foreground/25 mt-0.5">{Math.round(climber.winRate * 100)}% win rate across {climber.item.matchesPlayed} duels</p>
          </div>
        )}

        {/* Most Contested */}
        {mostContested && (
          <div className="rounded-xl border border-border/10 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Gavel className="h-3 w-3 text-muted-foreground/20" />
              <span className="text-[8px] text-muted-foreground/20 font-medium uppercase tracking-[0.15em]">Most Contested</span>
            </div>
            <p className="text-[13px] font-semibold">{mostContested.title}</p>
            <p className="text-[10px] text-muted-foreground/25 mt-0.5">{duelCounts[mostContestedId!]} arena appearances</p>
          </div>
        )}

        {/* Collections Breakdown */}
        {Object.keys(catCounts).length > 0 && (
          <div>
            <p className="text-[9px] font-medium text-muted-foreground/25 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
              <Layers className="h-2.5 w-2.5" />
              Collections
            </p>
            <div className="space-y-1">
              {Object.entries(catCounts)
                .sort(([, a], [, b]) => b.value - a.value)
                .map(([cat, data]) => (
                  <div key={cat} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 bg-muted/10">
                    <span className="text-[12px] font-medium flex-1">{cat}</span>
                    <span className="text-[10px] text-muted-foreground/25 tabular-nums">{data.count} lot{data.count !== 1 ? 's' : ''}</span>
                    {data.value > 0 && (
                      <span className="text-[10px] font-mono text-muted-foreground/20 tabular-nums">{formatPrice(data.value)}</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
