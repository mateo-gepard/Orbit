'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus, X, ChevronLeft, Gem, ShoppingBag, ExternalLink,
  Gavel, Trophy, Archive, Undo2, Trash2, Edit3,
  DollarSign, Crown, ArrowRight,
  Cpu, Shirt, Compass, Home, Palette, Heart, BookOpen, Package,
  Link, Image, StickyNote, Hash, ChevronRight, Loader2, Globe,
  Check, MoreHorizontal, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import {
  useWishlistStore, VAULT_CATEGORIES, getItemRarity, getRarityLabel,
  getRarityColor, getVaultStats, formatPrice, pickDuelPair,
  type VaultItem, type VaultCategory,
} from '@/lib/wishlist-store';

// ─── Category icons ────────────────────────────────────
const CATEGORY_ICONS: Record<string, typeof Cpu> = {
  Cpu, Shirt, Compass, Home, Palette, Heart, BookOpen, Package,
};
function getCategoryIcon(cat: VaultCategory) {
  const c = VAULT_CATEGORIES.find((v) => v.id === cat);
  return c ? CATEGORY_ICONS[c.icon] || Package : Package;
}

type VaultView = 'gallery' | 'auction' | 'leaderboard' | 'acquired' | 'add' | 'edit';

// ─── Lot number from index ─────────────────────────────
function lotNumber(idx: number) {
  return String(idx + 1).padStart(3, '0');
}

// ═════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════

export default function WishlistPage() {
  const { user } = useAuth();
  const {
    items, duels, addItem, updateItem, acquireItem, removeItem, restoreItem,
    deleteItem, recordDuel, getActiveItems, getAcquiredItems, getRemovedItems, getRankedItems,
  } = useWishlistStore();

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<VaultView>('gallery');
  const [selectedCategory, setSelectedCategory] = useState<VaultCategory | 'all'>('all');
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  // Quick-add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickExpanded, setQuickExpanded] = useState(false);
  const [quickPrice, setQuickPrice] = useState('');
  const [quickCategory, setQuickCategory] = useState<VaultCategory>('tech');
  const [quickUrl, setQuickUrl] = useState('');
  const [quickImageUrl, setQuickImageUrl] = useState('');
  const [quickScraping, setQuickScraping] = useState(false);
  const [quickScrapedSite, setQuickScrapedSite] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const scrapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state (edit)
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState('EUR');
  const [formUrl, setFormUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formCategory, setFormCategory] = useState<VaultCategory>('tech');
  const [formNotes, setFormNotes] = useState('');

  // Auction state
  const [duelPair, setDuelPair] = useState<[VaultItem, VaultItem] | null>(null);
  const [duelResult, setDuelResult] = useState<{ winnerId: string } | null>(null);
  const [duelCount, setDuelCount] = useState(0);

  // Card expand (gallery detail overlay)
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (showQuickAdd) setTimeout(() => quickInputRef.current?.focus(), 50);
  }, [showQuickAdd]);

  // URL helpers
  const isUrl = useCallback((text: string) => {
    const t = text.trim();
    return /^https?:\/\/.+\..+/i.test(t) || /^www\..+\..+/i.test(t);
  }, []);

  const guessCategory = useCallback((url: string, siteName?: string): VaultCategory => {
    const d = (url + ' ' + (siteName || '')).toLowerCase();
    if (/amazon|ebay|best\s?buy|newegg|mediamarkt|apple\.com|samsung/i.test(d)) return 'tech';
    if (/zalando|asos|zara|hm\.com|uniqlo|nike|adidas|farfetch|ssense/i.test(d)) return 'fashion';
    if (/airbnb|booking|eventbrite|ticketmaster|tripadvisor/i.test(d)) return 'experience';
    if (/ikea|wayfair|westelm|pottery\s?barn|muji/i.test(d)) return 'home';
    if (/etsy|behance|dribbble/i.test(d)) return 'creative';
    if (/lululemon|gymshark|peloton|headspace|calm/i.test(d)) return 'wellness';
    if (/udemy|coursera|masterclass|kindle/i.test(d)) return 'education';
    return 'other';
  }, []);

  const scrapeUrl = useCallback(async (url: string) => {
    setQuickScraping(true);
    setQuickScrapedSite('');
    try {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(fullUrl)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Scrape failed');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.title) setQuickName(data.title);
      if (data.price) setQuickPrice(data.price);
      if (data.image) setQuickImageUrl(data.image);
      if (data.siteName) setQuickScrapedSite(data.siteName);
      setQuickUrl(fullUrl);
      setQuickCategory(guessCategory(fullUrl, data.siteName));
      setQuickExpanded(true);
    } catch {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      setQuickUrl(fullUrl);
      setQuickCategory(guessCategory(fullUrl));
    } finally {
      setQuickScraping(false);
    }
  }, [guessCategory]);

  const activeItems = useMemo(() => getActiveItems(), [items]);
  const acquiredItemsList = useMemo(() => getAcquiredItems(), [items]);
  const removedItems = useMemo(() => getRemovedItems(), [items]);
  const rankedItems = useMemo(() => getRankedItems(), [items]);
  const stats = useMemo(() => getVaultStats(items, duels), [items, duels]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return activeItems;
    return activeItems.filter((i) => i.category === selectedCategory);
  }, [activeItems, selectedCategory]);

  const sortedGalleryItems = useMemo(
    () => [...filteredItems].sort((a, b) => b.elo - a.elo),
    [filteredItems]
  );

  const startNewDuel = useCallback(() => {
    const pair = pickDuelPair(activeItems);
    setDuelPair(pair);
    setDuelResult(null);
  }, [activeItems]);

  const handleDuelChoice = (winnerId: string) => {
    if (!duelPair) return;
    const loserId = duelPair[0].id === winnerId ? duelPair[1].id : duelPair[0].id;
    recordDuel(winnerId, loserId);
    setDuelResult({ winnerId });
    setDuelCount((c) => c + 1);
    setTimeout(() => {
      const pair = pickDuelPair(useWishlistStore.getState().getActiveItems());
      setDuelPair(pair);
      setDuelResult(null);
    }, 1200);
  };

  const resetForm = () => {
    setFormName(''); setFormPrice(''); setFormCurrency('EUR');
    setFormUrl(''); setFormImageUrl(''); setFormCategory('tech');
    setFormNotes(''); setEditingItem(null);
  };

  const handleQuickAdd = () => {
    if (!quickName.trim()) return;
    const price = quickPrice ? parseFloat(quickPrice) : undefined;
    addItem({
      name: quickName.trim(), price, currency: 'EUR', category: quickCategory,
      url: quickUrl.trim() || undefined, imageUrl: quickImageUrl.trim() || undefined,
    });
    setQuickName(''); setQuickPrice(''); setQuickCategory('tech');
    setQuickExpanded(false); setQuickUrl(''); setQuickImageUrl('');
    setQuickScrapedSite('');
    quickInputRef.current?.focus();
  };

  const openEdit = (item: VaultItem) => {
    setFormName(item.name); setFormPrice(item.price?.toString() || '');
    setFormCurrency(item.currency); setFormUrl(item.url || '');
    setFormImageUrl(item.imageUrl || ''); setFormCategory(item.category);
    setFormNotes(item.notes || ''); setEditingItem(item); setView('edit');
  };

  const handleSubmit = () => {
    if (!formName.trim()) return;
    const price = formPrice ? parseFloat(formPrice) : undefined;
    if (editingItem) {
      updateItem(editingItem.id, {
        name: formName.trim(), price, currency: formCurrency,
        url: formUrl.trim() || undefined, imageUrl: formImageUrl.trim() || undefined,
        category: formCategory, notes: formNotes.trim() || undefined,
      });
    } else {
      addItem({
        name: formName.trim(), price, currency: formCurrency,
        url: formUrl.trim() || undefined, imageUrl: formImageUrl.trim() || undefined,
        category: formCategory, notes: formNotes.trim() || undefined,
      });
    }
    resetForm(); setView('gallery');
  };

  if (!mounted) return null;

  // ═══════════════════════════════════════════════════════
  // EDIT FORM — Clean editorial
  // ═══════════════════════════════════════════════════════
  if (view === 'add' || view === 'edit') {
    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50 flex items-center gap-3">
          <button onClick={() => { resetForm(); setView('gallery'); }} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{editingItem ? 'Edit' : 'New'} Piece</span>
        </div>

        <div className="p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Name</label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="What is it?" autoFocus
              className="w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Price</label>
              <input value={formPrice} onChange={(e) => setFormPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="—" type="text" inputMode="decimal"
                className="w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all tabular-nums" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Currency</label>
              <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)}
                className="w-full border border-border bg-transparent px-2 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all appearance-none text-center">
                {['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {VAULT_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.icon] || Package;
                const sel = formCategory === cat.id;
                return (
                  <button key={cat.id} onClick={() => setFormCategory(cat.id)}
                    className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all border',
                      sel ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30')}>
                    <Icon className="h-3 w-3" strokeWidth={1.5} />{cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Link</label>
            <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..."
              className="w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Image URL</label>
            <input value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://..."
              className="w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all" />
            {formImageUrl && (
              <div className="mt-3 rounded-lg border border-border overflow-hidden h-40 bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={formImageUrl} alt="" className="w-full h-full object-contain p-3"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Why do you want this?" rows={3}
              className="w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all resize-none" />
          </div>

          <button onClick={handleSubmit} disabled={!formName.trim()}
            className={cn('w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all',
              formName.trim() ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {editingItem ? 'Save Changes' : 'Add to Collection'}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // AUCTION — Editorial Comparison
  // ═══════════════════════════════════════════════════════
  if (view === 'auction') {
    if (!duelPair) startNewDuel();
    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('gallery'); setDuelCount(0); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <span className="text-sm font-medium">Auction</span>
              {duelCount > 0 && <span className="text-xs text-muted-foreground ml-2 tabular-nums">{duelCount} rounds</span>}
            </div>
          </div>
          {duels.length > 0 && (
            <button onClick={() => setView('leaderboard')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Rankings →
            </button>
          )}
        </div>

        {!duelPair ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-3">
              <p className="text-lg font-medium">Not enough pieces</p>
              <p className="text-sm text-muted-foreground">Add at least two items to start comparing.</p>
              <button onClick={() => { setView('gallery'); setShowQuickAdd(true); }}
                className="inline-flex items-center gap-2 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-all mt-2">
                <Plus className="h-3.5 w-3.5" /> Add items
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 lg:p-8 max-w-4xl mx-auto">
            {/* Question */}
            <div className="text-center mb-8 lg:mb-12">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Lot Comparison</p>
              <h2 className="text-xl lg:text-2xl font-semibold tracking-tight">Which do you want more?</h2>
            </div>

            {/* Two lots */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              {duelPair.map((item, idx) => {
                const isWinner = duelResult?.winnerId === item.id;
                const isLoser = duelResult && !isWinner;
                const CatIcon = getCategoryIcon(item.category);
                return (
                  <button key={item.id}
                    onClick={() => !duelResult && handleDuelChoice(item.id)}
                    disabled={!!duelResult}
                    className={cn(
                      'relative text-left rounded-xl border transition-all duration-300 overflow-hidden group',
                      !duelResult && 'hover:border-foreground/30 hover:shadow-lg active:scale-[0.99] cursor-pointer',
                      isWinner && 'border-foreground/40 ring-2 ring-foreground/10',
                      isLoser && 'opacity-30 scale-[0.97]',
                      !duelResult && !isWinner && 'border-border'
                    )}>
                    {/* Image */}
                    {item.imageUrl ? (
                      <div className="aspect-[4/3] overflow-hidden bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt={item.name}
                          className={cn('w-full h-full object-contain p-6 transition-transform duration-500', !duelResult && 'group-hover:scale-105')} />
                      </div>
                    ) : (
                      <div className="aspect-[4/3] flex items-center justify-center bg-muted/10">
                        <CatIcon className="h-16 w-16 text-muted-foreground/10" strokeWidth={0.5} />
                      </div>
                    )}

                    {/* Info */}
                    <div className="p-4 lg:p-5">
                      <p className="text-xs text-muted-foreground mb-1 font-mono tabular-nums">
                        Lot {lotNumber(idx)} · {VAULT_CATEGORIES.find(c => c.id === item.category)?.label}
                      </p>
                      <p className="text-base lg:text-lg font-semibold tracking-tight">{item.name}</p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                        {item.price !== undefined ? (
                          <p className="text-base font-semibold tabular-nums">{formatPrice(item.price, item.currency)}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground/50">No price</p>
                        )}
                        <p className="text-xs text-muted-foreground tabular-nums font-mono">{item.elo} pts</p>
                      </div>
                    </div>

                    {/* Winner indicator */}
                    {isWinner && (
                      <div className="absolute top-3 right-3 bg-foreground text-background rounded-full px-2.5 py-1 text-[10px] font-semibold flex items-center gap-1 animate-scale-in">
                        <Check className="h-3 w-3" /> Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Skip */}
            {!duelResult && (
              <div className="mt-8 flex justify-center">
                <button onClick={startNewDuel} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  Skip <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // LEADERBOARD — Clean Ranked List
  // ═══════════════════════════════════════════════════════
  if (view === 'leaderboard') {
    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('gallery')} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">Rankings</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{duels.length} comparisons</span>
        </div>

        <div className="p-4 lg:p-8 max-w-2xl mx-auto w-full">
          {rankedItems.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-base font-medium text-muted-foreground/50">No rankings yet</p>
              <p className="text-sm text-muted-foreground/30 mt-1">Run some auctions first.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {rankedItems.map((item, idx) => {
                const CatIcon = getCategoryIcon(item.category);
                const winRate = item.duelsPlayed > 0 ? Math.round((item.duelsWon / item.duelsPlayed) * 100) : 0;
                const isTop3 = idx < 3;
                return (
                  <div key={item.id} className={cn(
                    'flex items-center gap-4 py-3.5 transition-colors border-b border-border/30 last:border-0',
                    isTop3 && 'py-4'
                  )}>
                    {/* Rank number */}
                    <div className={cn('w-8 text-right shrink-0',
                      idx === 0 ? 'text-lg font-bold' : idx < 3 ? 'text-base font-semibold' : 'text-sm text-muted-foreground')}>
                      {idx + 1}
                    </div>

                    {/* Thumb */}
                    {item.imageUrl ? (
                      <div className={cn('rounded-lg overflow-hidden shrink-0 border border-border/50 bg-muted/20',
                        isTop3 ? 'h-12 w-12' : 'h-9 w-9')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                      </div>
                    ) : (
                      <div className={cn('rounded-lg flex items-center justify-center shrink-0 bg-muted/30 border border-border/50',
                        isTop3 ? 'h-12 w-12' : 'h-9 w-9')}>
                        <CatIcon className="h-4 w-4 text-muted-foreground/30" strokeWidth={1.5} />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium truncate', isTop3 ? 'text-sm' : 'text-[13px]')}>{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {item.duelsWon}–{item.duelsPlayed - item.duelsWon}
                        </span>
                        {item.duelsPlayed > 0 && (
                          <span className={cn('text-xs tabular-nums', winRate >= 60 ? 'text-foreground/60' : 'text-muted-foreground/40')}>
                            {winRate}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <p className={cn('font-mono tabular-nums font-semibold', isTop3 ? 'text-sm' : 'text-xs text-muted-foreground')}>{item.elo}</p>
                      {item.price !== undefined && (
                        <p className="text-[11px] text-muted-foreground/40 tabular-nums">{formatPrice(item.price, item.currency)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rankedItems.length >= 2 && (
            <button onClick={() => { setView('auction'); startNewDuel(); }}
              className="w-full mt-6 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]">
              <Gavel className="h-3.5 w-3.5" /> Continue Auction
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // ACQUIRED / REMOVED
  // ═══════════════════════════════════════════════════════
  if (view === 'acquired') {
    const displayItems = showRemoved ? removedItems : acquiredItemsList;
    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('gallery'); setShowRemoved(false); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{showRemoved ? 'Removed' : 'Acquired'}</span>
          </div>
          <button onClick={() => setShowRemoved(!showRemoved)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-2.5 py-1">
            {showRemoved ? 'Show Acquired' : 'Show Removed'}
          </button>
        </div>

        <div className="p-4 lg:p-8 max-w-2xl mx-auto w-full">
          {/* Spend summary */}
          {!showRemoved && acquiredItemsList.length > 0 && (
            <div className="mb-6 pb-6 border-b border-border/50 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Spent</p>
              <p className="text-3xl font-semibold tabular-nums">{formatPrice(stats.acquiredValue, acquiredItemsList[0]?.currency || 'EUR')}</p>
              <p className="text-xs text-muted-foreground mt-1">{acquiredItemsList.length} items acquired</p>
            </div>
          )}

          {displayItems.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-base font-medium text-muted-foreground/50">Nothing here yet</p>
            </div>
          ) : displayItems.map((item) => {
            const date = new Date(showRemoved ? (item.removedAt || 0) : (item.acquiredAt || 0));
            const dateStr = date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
            const CatIcon = getCategoryIcon(item.category);
            return (
              <div key={item.id} className="flex items-center gap-3.5 py-3 border-b border-border/30 last:border-0 group">
                {item.imageUrl ? (
                  <div className="h-11 w-11 rounded-lg overflow-hidden shrink-0 border border-border/50 bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                  </div>
                ) : (
                  <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 bg-muted/30 border border-border/50">
                    <CatIcon className="h-4 w-4 text-muted-foreground/25" strokeWidth={1.5} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.price !== undefined && (
                    <p className="text-sm font-medium tabular-nums">{formatPrice(item.price, item.currency)}</p>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => restoreItem(item.id)} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted/50" title="Restore">
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-muted/50" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // GALLERY — The Collection
  // ═══════════════════════════════════════════════════════
  return (
    <div className="relative min-h-full bg-background">

      {/* Header */}
      <div className="relative z-10 px-4 lg:px-8 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Collection</h1>
            {activeItems.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {activeItems.length} {activeItems.length === 1 ? 'piece' : 'pieces'}
                {stats.totalValue > 0 && <span> · {formatPrice(stats.totalValue, activeItems[0]?.currency || 'EUR')}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {acquiredItemsList.length > 0 && (
              <button onClick={() => setView('acquired')} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/50">
                <ShoppingBag className="h-3.5 w-3.5" />
              </button>
            )}
            {rankedItems.length >= 2 && (
              <button onClick={() => setView('leaderboard')} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/50">
                <Trophy className="h-3.5 w-3.5" />
              </button>
            )}
            {activeItems.length >= 2 && (
              <button onClick={() => { setView('auction'); startNewDuel(); }}
                className="text-xs font-medium text-foreground bg-muted/50 hover:bg-muted transition-colors px-3 py-1.5 rounded-md flex items-center gap-1.5">
                <Gavel className="h-3 w-3" /> Rank
              </button>
            )}
            <button onClick={() => setShowQuickAdd(!showQuickAdd)}
              className={cn('flex items-center gap-1.5 text-xs font-medium transition-all px-3 py-1.5 rounded-md',
                showQuickAdd ? 'bg-muted text-foreground' : 'bg-foreground text-background hover:opacity-90')}>
              {showQuickAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {!showQuickAdd && 'Add'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick-Add */}
      {showQuickAdd && (
        <div className="relative z-10 border-b border-border/50 bg-muted/20">
          <div className="px-4 lg:px-8 py-3 max-w-5xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {quickScraping ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                ) : (
                  <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                )}
                <input ref={quickInputRef} value={quickName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuickName(val);
                    if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);
                    if (isUrl(val) && !quickScraping) {
                      scrapeTimeoutRef.current = setTimeout(() => scrapeUrl(val), 600);
                    }
                  }}
                  onPaste={(e) => {
                    setTimeout(() => {
                      const pasted = e.currentTarget?.value || quickName;
                      if (isUrl(pasted)) {
                        if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);
                        scrapeUrl(pasted);
                      }
                    }, 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !quickScraping) handleQuickAdd();
                    if (e.key === 'Escape') { setShowQuickAdd(false); setQuickName(''); setQuickExpanded(false); setQuickUrl(''); setQuickImageUrl(''); setQuickScrapedSite(''); }
                  }}
                  placeholder={quickScraping ? 'Fetching...' : 'Name or paste a URL, then Enter'}
                  disabled={quickScraping}
                  className={cn('w-full border border-border bg-background pl-9 pr-3 py-2 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all', quickScraping && 'opacity-60')} />
              </div>
              <button onClick={() => setQuickExpanded(!quickExpanded)}
                className={cn('shrink-0 p-2 rounded-lg transition-all border', quickExpanded ? 'border-foreground/20 bg-muted' : 'border-border text-muted-foreground hover:text-foreground')}>
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', quickExpanded && 'rotate-90')} />
              </button>
              <button onClick={handleQuickAdd} disabled={!quickName.trim() || quickScraping}
                className={cn('shrink-0 px-3.5 py-2 rounded-lg text-xs font-medium transition-all',
                  quickName.trim() && !quickScraping ? 'bg-foreground text-background hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                {quickScraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
              </button>
            </div>

            {quickExpanded && (
              <div className="mt-3 space-y-3">
                {(quickImageUrl || quickScrapedSite) && (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5">
                    {quickImageUrl && (
                      <div className="h-10 w-10 rounded overflow-hidden shrink-0 border border-border/50 bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={quickImageUrl} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {quickScrapedSite && <p className="text-[11px] text-muted-foreground font-medium">{quickScrapedSite}</p>}
                      {quickUrl && <p className="text-[11px] text-muted-foreground/50 truncate">{quickUrl}</p>}
                    </div>
                    {quickUrl && (
                      <a href={quickUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2.5">
                  <input value={quickPrice} onChange={(e) => setQuickPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Price" type="text" inputMode="decimal"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
                    className="w-20 border border-border bg-background px-2.5 py-1.5 text-xs rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 tabular-nums" />
                  <div className="flex items-center gap-1 flex-wrap">
                    {VAULT_CATEGORIES.map((cat) => {
                      const Icon = CATEGORY_ICONS[cat.icon] || Package;
                      const sel = quickCategory === cat.id;
                      return (
                        <button key={cat.id} onClick={() => setQuickCategory(cat.id)}
                          className={cn('flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all border',
                            sel ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30')}>
                          <Icon className="h-2.5 w-2.5" strokeWidth={1.5} />{cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative z-10 p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Category filters */}
        {activeItems.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            <button onClick={() => setSelectedCategory('all')}
              className={cn('shrink-0 text-xs font-medium px-3 py-1.5 rounded-md transition-all',
                selectedCategory === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
              All
            </button>
            {VAULT_CATEGORIES.map((cat) => {
              const count = stats.categoryBreakdown[cat.id];
              if (count === 0) return null;
              const Icon = CATEGORY_ICONS[cat.icon] || Package;
              return (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                  className={cn('shrink-0 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md transition-all',
                    selectedCategory === cat.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
                  <Icon className="h-3 w-3" strokeWidth={1.5} />{cat.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {activeItems.length === 0 && (
          <div className="text-center py-24">
            <Gem className="h-8 w-8 text-muted-foreground/15 mx-auto mb-4" strokeWidth={1} />
            <h2 className="text-lg font-semibold tracking-tight">Start your collection</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
              Add the things you want. Compare them. Know what matters most.
            </p>
            <button onClick={() => setShowQuickAdd(true)}
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium bg-foreground text-background px-5 py-2.5 rounded-lg hover:opacity-90 transition-all active:scale-[0.98]">
              <Plus className="h-3.5 w-3.5" /> Add first piece
            </button>
          </div>
        )}

        {/* Collection Grid — Exhibition layout */}
        {sortedGalleryItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/50 rounded-xl overflow-hidden border border-border/50">
            {sortedGalleryItems.map((item, idx) => (
              <CollectionCard key={item.id} item={item} index={idx}
                rank={rankedItems.findIndex(r => r.id === item.id) + 1}
                isExpanded={expandedCard === item.id}
                onToggleExpand={() => setExpandedCard(expandedCard === item.id ? null : item.id)}
                onEdit={() => openEdit(item)}
                onAcquire={() => acquireItem(item.id)}
                onRemove={() => removeItem(item.id)} />
            ))}
          </div>
        )}

        {/* Auction prompt */}
        {activeItems.length >= 2 && duels.length === 0 && (
          <div className="text-center py-6 border-t border-border/50">
            <p className="text-sm text-muted-foreground">
              Want to know what you actually want most?
            </p>
            <button onClick={() => { setView('auction'); startNewDuel(); }}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium bg-foreground text-background px-5 py-2.5 rounded-lg hover:opacity-90 transition-all active:scale-[0.98]">
              <Gavel className="h-3.5 w-3.5" /> Start ranking
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// COLLECTION CARD — Gallery piece
// ═══════════════════════════════════════════════════════

function CollectionCard({ item, index, rank, isExpanded, onToggleExpand, onEdit, onAcquire, onRemove }: {
  item: VaultItem; index: number; rank: number;
  isExpanded: boolean; onToggleExpand: () => void;
  onEdit: () => void; onAcquire: () => void; onRemove: () => void;
}) {
  const CatIcon = getCategoryIcon(item.category);
  const catLabel = VAULT_CATEGORIES.find(c => c.id === item.category)?.label || '';
  const rarity = getItemRarity(item);

  return (
    <div className={cn('bg-background transition-all duration-200 group relative', isExpanded && 'sm:col-span-2 lg:col-span-3')}>
      {/* Main clickable area */}
      <div className="cursor-pointer" onClick={onToggleExpand}>
        {/* Image */}
        {item.imageUrl ? (
          <div className={cn('overflow-hidden bg-muted/10 relative', isExpanded ? 'aspect-[16/7]' : 'aspect-[4/3]')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt={item.name}
              className={cn('w-full h-full object-contain transition-transform duration-500', isExpanded ? 'p-8' : 'p-5 group-hover:scale-[1.03]')} />
          </div>
        ) : (
          <div className={cn('flex items-center justify-center bg-muted/5', isExpanded ? 'aspect-[16/7]' : 'aspect-[4/3]')}>
            <CatIcon className={cn('text-muted-foreground/8 transition-all duration-500', isExpanded ? 'h-20 w-20' : 'h-12 w-12 group-hover:scale-110')} strokeWidth={0.5} />
          </div>
        )}

        {/* Info strip */}
        <div className={cn('px-4 py-3', isExpanded && 'px-5 py-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Lot line */}
              <p className="text-[10px] text-muted-foreground/50 font-mono tabular-nums mb-0.5">
                {lotNumber(index)} · {catLabel}
                {rank > 0 && rank <= 5 && item.duelsPlayed > 0 && <span className="ml-1">· #{rank}</span>}
              </p>
              <p className={cn('font-medium tracking-tight truncate', isExpanded ? 'text-base' : 'text-sm')}>
                {item.name}
              </p>
            </div>
            {item.price !== undefined && (
              <p className={cn('font-medium tabular-nums shrink-0', isExpanded ? 'text-base' : 'text-sm')}>
                {formatPrice(item.price, item.currency)}
              </p>
            )}
          </div>

          {/* Expanded detail */}
          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-border/40 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{getRarityLabel(rarity)}</span>
                {item.duelsPlayed > 0 && <span className="tabular-nums font-mono">{item.elo} pts · {item.duelsWon}W–{item.duelsPlayed - item.duelsWon}L</span>}
                <span>{new Date(item.addedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {item.notes && <p className="text-sm text-muted-foreground leading-relaxed">{item.notes}</p>}
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="h-3 w-3" /> Source
                </a>
              )}
              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={(e) => { e.stopPropagation(); onAcquire(); }}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-foreground text-background hover:opacity-90 transition-all">
                  <ShoppingBag className="h-3 w-3" /> Acquired
                </button>
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-border">
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
                <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all border border-border">
                  <Archive className="h-3 w-3" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
