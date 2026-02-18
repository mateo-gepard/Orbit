'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, X, ChevronLeft, Gem, ShoppingBag, ExternalLink,
  Gavel, Trophy, Archive, Undo2, Trash2, Edit3,
  Crown, ArrowRight,
  Cpu, Shirt, Compass, Home, Palette, Heart, BookOpen, Package,
  Loader2, Globe,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/auth-provider';
import {
  useWishlistStore, VAULT_CATEGORIES, getItemRarity, getRarityLabel,
  getRarityColor, getVaultStats, formatPrice, pickDuelPair,
  recommendedRounds, rankingConfidence,
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
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  // Quick-add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickExpanded, setQuickExpanded] = useState(false);
  const [quickPrice, setQuickPrice] = useState('');
  const [quickPriceEstimated, setQuickPriceEstimated] = useState(false);
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
    setQuickPriceEstimated(false);
    try {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(fullUrl)}`, { cache: 'no-store' });
      const data = await res.json();
      // Use whatever fields came back (even from fallback responses)
      const title = (data.title && data.title !== 'Product') ? data.title : '';
      if (title) setQuickName(title);
      if (data.price) setQuickPrice(data.price);
      if (data.image) setQuickImageUrl(data.image);
      if (data.siteName) setQuickScrapedSite(data.siteName);
      setQuickUrl(fullUrl);
      setQuickCategory(guessCategory(fullUrl, data.siteName));
      setQuickExpanded(true);

      // Fire off search fallback for missing image/price
      if (title && (!data.image || !data.price)) {
        try {
          const searchRes = await fetch(`/api/scrape/image?q=${encodeURIComponent(title)}`);
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (!data.image && searchData.image) setQuickImageUrl(searchData.image);
            if (!data.price && searchData.price) {
              setQuickPrice(searchData.price);
              setQuickPriceEstimated(true); // Mark as estimated
            }
          }
        } catch { /* search fallback failed silently */ }
      }
    } catch {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      setQuickUrl(fullUrl);
      setQuickCategory(guessCategory(fullUrl));
      setQuickExpanded(true);
    } finally {
      setQuickScraping(false);
    }
  }, [guessCategory]);

  const activeItems = useMemo(() => getActiveItems(), [items]);
  const acquiredItemsList = useMemo(() => getAcquiredItems(), [items]);
  const removedItems = useMemo(() => getRemovedItems(), [items]);
  const rankedItems = useMemo(() => getRankedItems(), [items]);
  const stats = useMemo(() => getVaultStats(items, duels), [items, duels]);
  const confidence = useMemo(() => rankingConfidence(items), [items]);
  const itemsByCategory = useMemo(() => {
    const map: Record<VaultCategory, VaultItem[]> = {
      tech: [], fashion: [], experience: [], home: [], creative: [], wellness: [], education: [], other: [],
    };
    for (const item of activeItems) map[item.category]?.push(item);
    for (const cat of VAULT_CATEGORIES) map[cat.id].sort((a, b) => b.elo - a.elo);
    return map;
  }, [activeItems]);

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
      name: quickName.trim(), price, priceEstimated: quickPriceEstimated && !!price, currency: 'EUR', category: quickCategory,
      url: quickUrl.trim() || undefined, imageUrl: quickImageUrl.trim() || undefined,
    });
    setQuickName(''); setQuickPrice(''); setQuickPriceEstimated(false); setQuickCategory('tech');
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
    const target = recommendedRounds(activeItems.length);
    const sessionDone = duelCount >= target && duelCount > 0;

    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setView('gallery'); setDuelCount(0); }} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div>
                <span className="text-sm font-medium">Auction</span>
                <span className="text-xs text-muted-foreground ml-2 tabular-nums">{duelCount}/{target}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {confidence >= 100 && (
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Ranking stable</span>
              )}
              {duels.length > 0 && (
                <button onClick={() => setView('leaderboard')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Rankings →
                </button>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2.5 h-1 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500',
                confidence >= 100 ? 'bg-emerald-500' : confidence >= 60 ? 'bg-foreground/60' : 'bg-foreground/30'
              )}
              style={{ width: `${Math.min(100, (duelCount / target) * 100)}%` }}
            />
          </div>
        </div>

        {sessionDone ? (
          /* Session complete */
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-4 max-w-sm">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">Rankings updated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {duelCount} rounds completed · {confidence}% confidence
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button onClick={() => setView('leaderboard')}
                  className="inline-flex items-center gap-2 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-all">
                  <Crown className="h-3.5 w-3.5" /> View rankings
                </button>
                <button onClick={() => { setDuelCount(0); startNewDuel(); }}
                  className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
                  <Gavel className="h-3.5 w-3.5" /> Keep going
                </button>
              </div>
            </div>
          </div>
        ) : !duelPair ? (
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
          <div className="flex flex-col h-[calc(100dvh-theme(spacing.28))] lg:h-auto lg:p-8 max-w-4xl mx-auto">
            {/* Question — compact on mobile */}
            <div className="text-center py-4 lg:py-0 lg:mb-12 shrink-0">
              <p className="hidden lg:block text-xs text-muted-foreground uppercase tracking-widest mb-2">Lot Comparison</p>
              <h2 className="text-base lg:text-2xl font-semibold tracking-tight">Which do you want more?</h2>
            </div>

            {/* Two lots — side by side on mobile, stacked on desktop */}
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-2 gap-2 px-3 lg:px-0 lg:gap-6 min-h-0">
              {duelPair.map((item, idx) => {
                const isWinner = duelResult?.winnerId === item.id;
                const isLoser = duelResult && !isWinner;
                const CatIcon = getCategoryIcon(item.category);
                return (
                  <button key={item.id}
                    onClick={() => !duelResult && handleDuelChoice(item.id)}
                    disabled={!!duelResult}
                    className={cn(
                      'relative text-left rounded-xl border transition-all duration-300 overflow-hidden group flex flex-col',
                      !duelResult && 'hover:border-foreground/30 hover:shadow-lg active:scale-[0.98] cursor-pointer',
                      isWinner && 'border-foreground/40 ring-2 ring-foreground/10',
                      isLoser && 'opacity-30 scale-[0.97]',
                      !duelResult && !isWinner && 'border-border'
                    )}>
                    {/* Image — fills available space */}
                    {item.imageUrl ? (
                      <div className="flex-1 min-h-0 overflow-hidden bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt={item.name}
                          className={cn('w-full h-full object-contain p-3 lg:p-6 transition-transform duration-500', !duelResult && 'group-hover:scale-105')} />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/10">
                        <CatIcon className="h-10 w-10 lg:h-16 lg:w-16 text-muted-foreground/10" strokeWidth={0.5} />
                      </div>
                    )}

                    {/* Info — compact on mobile */}
                    <div className="p-2.5 lg:p-5 shrink-0">
                      <p className="text-[10px] lg:text-xs text-muted-foreground mb-0.5 lg:mb-1 font-mono tabular-nums truncate">
                        <span className="hidden lg:inline">Lot {lotNumber(idx)} · </span>{VAULT_CATEGORIES.find(c => c.id === item.category)?.label}
                      </p>
                      <p className="text-xs lg:text-lg font-semibold tracking-tight line-clamp-2 leading-tight">{item.name}</p>
                      <div className="flex items-center justify-between mt-1.5 lg:mt-3 pt-1.5 lg:pt-3 border-t border-border/50">
                        {item.price !== undefined ? (
                          <p className="text-xs lg:text-base font-semibold tabular-nums">{formatPrice(item.price, item.currency)}</p>
                        ) : (
                          <p className="text-[10px] lg:text-sm text-muted-foreground/50">No price</p>
                        )}
                        <p className="text-[10px] lg:text-xs text-muted-foreground tabular-nums font-mono">{item.elo}</p>
                      </div>
                    </div>

                    {/* Winner indicator */}
                    {isWinner && (
                      <div className="absolute top-2 right-2 lg:top-3 lg:right-3 bg-foreground text-background rounded-full p-1.5 lg:px-2.5 lg:py-1 text-[10px] font-semibold flex items-center gap-1 animate-scale-in">
                        <Check className="h-3 w-3" />
                        <span className="hidden lg:inline">Selected</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Skip — bottom of screen on mobile */}
            {!duelResult && (
              <div className="py-4 lg:mt-8 flex justify-center shrink-0">
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
        <div className="px-4 lg:px-8 py-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('gallery')} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">Rankings</span>
            </div>
            <div className="flex items-center gap-2">
              {confidence > 0 && (
                <span className={cn('text-[10px] tabular-nums font-medium',
                  confidence >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                  {confidence}% confident
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/40 tabular-nums">{duels.length} duels</span>
            </div>
          </div>
          {/* Confidence bar */}
          {confidence > 0 && confidence < 100 && (
            <div className="mt-2 h-0.5 bg-muted/50 rounded-full overflow-hidden">
              <div className="h-full bg-foreground/30 rounded-full transition-all duration-500" style={{ width: `${confidence}%` }} />
            </div>
          )}
        </div>

        <div className="p-3 lg:p-8 max-w-2xl mx-auto w-full">
          {rankedItems.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-base font-medium text-muted-foreground/50">No rankings yet</p>
              <p className="text-sm text-muted-foreground/30 mt-1">Run some auctions first.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Top 3 — podium style on mobile */}
              {rankedItems.slice(0, 3).map((item, idx) => {
                const CatIcon = getCategoryIcon(item.category);
                const winRate = item.duelsPlayed > 0 ? Math.round((item.duelsWon / item.duelsPlayed) * 100) : 0;
                return (
                  <div key={item.id} className={cn(
                    'flex items-center gap-3 py-3 transition-colors border-b border-border/30',
                    idx === 0 && 'py-4'
                  )}>
                    {/* Rank */}
                    <div className={cn('w-7 text-center shrink-0 font-mono',
                      idx === 0 ? 'text-lg font-bold' : 'text-base font-semibold')}>
                      {idx === 0 ? '👑' : idx + 1}
                    </div>

                    {/* Thumb */}
                    {item.imageUrl ? (
                      <div className={cn('rounded-lg overflow-hidden shrink-0 border border-border/50 bg-muted/20',
                        idx === 0 ? 'h-14 w-14' : 'h-11 w-11')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                      </div>
                    ) : (
                      <div className={cn('rounded-lg flex items-center justify-center shrink-0 bg-muted/30 border border-border/50',
                        idx === 0 ? 'h-14 w-14' : 'h-11 w-11')}>
                        <CatIcon className="h-4 w-4 text-muted-foreground/30" strokeWidth={1.5} />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium truncate', idx === 0 ? 'text-sm' : 'text-[13px]')}>{item.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {item.duelsWon}W–{item.duelsPlayed - item.duelsWon}L
                        </span>
                        {item.duelsPlayed > 0 && (
                          <span className="text-[11px] text-muted-foreground/40 tabular-nums">{winRate}%</span>
                        )}
                      </div>
                    </div>

                    {/* Score + price */}
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono tabular-nums font-semibold">{item.elo}</p>
                      {item.price !== undefined && (
                        <p className="text-[10px] text-muted-foreground/40 tabular-nums">{formatPrice(item.price, item.currency)}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Separator between podium and rest */}
              {rankedItems.length > 3 && (
                <div className="py-2">
                  <div className="h-px bg-border/60" />
                </div>
              )}

              {/* Rest of ranked items — compact */}
              {rankedItems.slice(3).map((item, idx) => {
                const CatIcon = getCategoryIcon(item.category);
                const actualIdx = idx + 3;
                return (
                  <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-border/20 last:border-0">
                    {/* Rank */}
                    <div className="w-7 text-center shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
                      {actualIdx + 1}
                    </div>

                    {/* Thumb */}
                    {item.imageUrl ? (
                      <div className="h-8 w-8 rounded overflow-hidden shrink-0 border border-border/40 bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded flex items-center justify-center shrink-0 bg-muted/20">
                        <CatIcon className="h-3 w-3 text-muted-foreground/30" strokeWidth={1.5} />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-mono tabular-nums text-muted-foreground">{item.elo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rankedItems.length >= 2 && (
            <button onClick={() => { setView('auction'); startNewDuel(); }}
              className="w-full mt-4 lg:mt-6 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]">
              <Gavel className="h-3.5 w-3.5" /> {confidence < 100 ? `Improve rankings (${confidence}%)` : 'Continue Auction'}
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
  // GALLERY — Museum-style Collection Gallery
  // ═══════════════════════════════════════════════════════

  // The #1 ranked item becomes the hero / featured piece
  const heroItem = rankedItems.length > 0 && rankedItems[0].duelsPlayed > 0 ? rankedItems[0] : null;

  return (
    <div className="min-h-full bg-background">
      {/* ── Header ───────────────────────────────────── */}
      <div className="px-4 lg:px-8 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-semibold tracking-tight">The Vault</span>
            <span className="text-[11px] text-muted-foreground/40 ml-2 hidden sm:inline tabular-nums">
              {stats.totalItems} piece{stats.totalItems !== 1 && 's'}
              {stats.totalValue > 0 && <> · {formatPrice(stats.totalValue, 'EUR')}</>}
            </span>
          </div>
          <button onClick={() => setShowQuickAdd(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-foreground text-background px-3 py-1.5 rounded-lg hover:opacity-90 transition-all">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {/* Nav row */}
        <div className="flex items-center gap-1 mt-3 -mb-px">
          {([
            { id: 'gallery' as const, icon: Gem, label: 'Gallery' },
            { id: 'auction' as const, icon: Gavel, label: 'Auction' },
            { id: 'leaderboard' as const, icon: Crown, label: 'Rankings' },
            { id: 'acquired' as const, icon: ShoppingBag, label: 'Acquired' },
          ] as const).map((tab) => (
            <button key={tab.id}
              onClick={() => { if (tab.id === 'auction') startNewDuel(); setView(tab.id); }}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all',
                view === tab.id
                  ? 'bg-foreground/8 text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}>
              <tab.icon className="h-3 w-3" strokeWidth={1.5} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Gallery body — 3D room ────────────────── */}
      <div className="max-w-6xl mx-auto w-full vault-wall min-h-[60vh]">
        {activeItems.length === 0 ? (
          <div className="text-center py-24 px-4 text-muted-foreground/60">
            <Gem className="h-10 w-10 mx-auto mb-4 text-muted-foreground/20" strokeWidth={1} />
            <p className="text-lg font-medium">Your vault is empty</p>
            <p className="text-sm mt-1 mb-4">Paste a URL or add items to start your collection.</p>
            <button onClick={() => setShowQuickAdd(true)}
              className="inline-flex items-center gap-2 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-all">
              <Plus className="h-3.5 w-3.5" /> Add first piece
            </button>
          </div>
        ) : (
          <>
            {/* ── Hero / Featured Piece ──────────────── */}
            {heroItem && (
              <div className="px-4 lg:px-8 pt-8 lg:pt-12 pb-2">
                <button
                  onClick={() => setExpandedCard(expandedCard === heroItem.id ? null : heroItem.id)}
                  className="w-full text-left group"
                >
                  <div className="relative overflow-hidden rounded-2xl vault-frame bg-background">
                    {/* Ambient ceiling light */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/[0.02] dark:from-white/[0.02] dark:to-black/5 pointer-events-none" />
                    <div className="flex flex-col sm:flex-row items-center relative">
                      {/* Hero image — spotlit */}
                      {heroItem.imageUrl ? (
                        <div className="w-full sm:w-1/2 aspect-square sm:aspect-auto sm:h-64 lg:h-80 flex items-center justify-center p-6 lg:p-12 vault-spotlight">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={heroItem.imageUrl} alt={heroItem.name}
                            className="max-w-full max-h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-transform duration-700 group-hover:scale-[1.03]" />
                        </div>
                      ) : (
                        <div className="w-full sm:w-1/2 h-48 sm:h-64 lg:h-80 flex items-center justify-center vault-spotlight">
                          {(() => { const I = getCategoryIcon(heroItem.category); return <I className="h-20 w-20 text-muted-foreground/6" strokeWidth={0.3} />; })()}
                        </div>
                      )}
                      {/* Hero placard */}
                      <div className="flex-1 p-5 sm:p-8 lg:p-10 sm:border-l border-border/30">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Featured Piece</p>
                        <h2 className="text-lg lg:text-2xl font-semibold tracking-tight leading-snug mb-3">{heroItem.name}</h2>
                        {heroItem.price !== undefined && (
                          <p className="text-sm lg:text-base font-medium tabular-nums text-muted-foreground/80 mb-3">
                            {heroItem.priceEstimated && '~'}{formatPrice(heroItem.price, heroItem.currency)}
                            {heroItem.priceEstimated && <span className="text-[10px] ml-1 text-amber-500">est.</span>}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
                          <span className="uppercase tracking-wider">{VAULT_CATEGORIES.find(c => c.id === heroItem.category)?.label}</span>
                          {heroItem.duelsPlayed > 0 && <span className="tabular-nums font-mono">{heroItem.elo} pts</span>}
                          <span>#{rankedItems.findIndex(r => r.id === heroItem.id) + 1} Ranked</span>
                        </div>
                        {heroItem.notes && (
                          <p className="text-xs text-muted-foreground/50 mt-3 line-clamp-2 leading-relaxed italic">&ldquo;{heroItem.notes}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* ── Category Wings ─────────────────────── */}
            <div className="px-4 lg:px-8 pb-8 lg:pb-16" style={{ perspective: '1200px' }}>
              {VAULT_CATEGORIES.map((cat) => {
                const catItems = itemsByCategory[cat.id];
                if (!catItems || catItems.length === 0) return null;
                const CatIcon = CATEGORY_ICONS[cat.icon] || Package;
                // Skip the hero item in its category to avoid duplicate
                const displayItems = heroItem
                  ? catItems.filter(i => i.id !== heroItem.id)
                  : catItems;
                if (displayItems.length === 0) return null;
                return (
                  <section key={cat.id} className="mt-10 lg:mt-14 first:mt-6 first:lg:mt-10">
                    {/* Picture rail + wing label */}
                    <div className="vault-rail pt-4 mb-6 lg:mb-8">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2.5">
                          <CatIcon className="h-4 w-4 text-muted-foreground/35" strokeWidth={1.5} />
                          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">{cat.wing}</h2>
                          <span className="text-[10px] text-muted-foreground/20 tabular-nums">{displayItems.length}</span>
                        </div>
                        <div className="flex-1" />
                      </div>
                    </div>

                    {/* Pieces on the wall — perspective grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 lg:gap-x-6 lg:gap-y-10">
                      {displayItems.map((item, idx) => {
                        const rank = rankedItems.findIndex(r => r.id === item.id) + 1;
                        const hasImage = !!item.imageUrl;
                        // Vary heights for visual rhythm — like a real gallery hang
                        const tallCard = idx % 5 === 0 || idx % 7 === 2;
                        return (
                          <div key={item.id}
                            className="group cursor-pointer"
                            style={{ transformStyle: 'preserve-3d' }}
                            onClick={() => setExpandedCard(item.id)}
                          >
                            {/* The frame — hangs on wall with depth */}
                            <div className={cn(
                              'relative overflow-hidden rounded-lg vault-frame bg-background transition-all duration-300',
                              'group-hover:-translate-y-1 group-hover:rotate-0',
                            )}
                              style={{
                                transform: `rotateX(1deg)`,
                                transformOrigin: 'top center',
                                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotateX(0deg) translateY(-4px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'rotateX(1deg)'; }}
                            >
                              {/* Mat — the white/cream border around art */}
                              <div className={cn(
                                'relative flex items-center justify-center overflow-hidden vault-spotlight',
                                tallCard && hasImage ? 'h-44 lg:h-56' : 'h-30 lg:h-38',
                                'p-3 lg:p-4'
                              )}>
                                {/* Inner mat border */}
                                <div className="absolute inset-2 lg:inset-3 border border-border/20 rounded-sm pointer-events-none" />
                                {hasImage ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.imageUrl} alt={item.name}
                                      className="max-w-[80%] max-h-[80%] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-transform duration-500 group-hover:scale-[1.04]" />
                                  </>
                                ) : (
                                  <CatIcon className="h-8 w-8 lg:h-10 lg:w-10 text-muted-foreground/5" strokeWidth={0.4} />
                                )}
                                {/* Rank — engraved corner */}
                                {rank > 0 && item.duelsPlayed > 0 && (
                                  <div className="absolute top-2 right-2 lg:top-2.5 lg:right-2.5">
                                    <span className="text-[8px] lg:text-[9px] font-mono font-semibold text-muted-foreground/25 tabular-nums">
                                      #{rank}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Name placard — small brass-style plate */}
                              <div className="px-3 py-2 lg:px-4 lg:py-2.5 border-t border-border/30">
                                <p className="text-[10.5px] lg:text-[12px] font-medium tracking-tight leading-snug line-clamp-2">{item.name}</p>
                                <div className="flex items-baseline justify-between mt-0.5 gap-2">
                                  {item.price !== undefined ? (
                                    <span className={cn('text-[9px] lg:text-[10px] tabular-nums',
                                      item.priceEstimated ? 'text-amber-600/60 dark:text-amber-400/60' : 'text-muted-foreground/40')}>
                                      {item.priceEstimated && '~'}{formatPrice(item.price, item.currency)}
                                    </span>
                                  ) : (
                                    <span />
                                  )}
                                  {item.url && (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground/15 hover:text-muted-foreground/50 transition-colors shrink-0">
                                      <ExternalLink className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Floor gradient — grounds the room */}
            <div className="h-12 lg:h-20 vault-floor" />
          </>
        )}
      </div>

      {/* ── Detail lightbox — walk up to the piece ── */}
      {expandedCard && mounted && (() => {
        const item = activeItems.find(i => i.id === expandedCard);
        if (!item) return null;
        const rank = rankedItems.findIndex(r => r.id === item.id) + 1;
        const rarity = getItemRarity(item);
        const CatIcon = getCategoryIcon(item.category);
        const catLabel = VAULT_CATEGORIES.find(c => c.id === item.category);
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-8"
            onClick={() => setExpandedCard(null)}>
            {/* Dark gallery room backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
            {/* Spotlight cone from above */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 50% 60% at 50% 25%, rgba(255,255,255,0.06) 0%, transparent 100%)' }} />
            
            <div className="relative w-full max-w-2xl bg-background rounded-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200 max-h-[90dvh] flex flex-col vault-frame"
              style={{ boxShadow: '0 0 80px -20px rgba(0,0,0,0.3), 0 12px 40px -10px rgba(0,0,0,0.2)' }}
              onClick={(e) => e.stopPropagation()}>
              {/* Close */}
              <button onClick={() => setExpandedCard(null)}
                className="absolute top-3 right-3 z-10 text-muted-foreground/40 hover:text-foreground transition-colors p-1.5 rounded-full hover:bg-muted/50">
                <X className="h-4 w-4" />
              </button>

              {/* Image — spotlit on the wall */}
              <div className="vault-spotlight flex items-center justify-center min-h-[220px] sm:min-h-[300px] p-8 sm:p-14 shrink-0 relative">
                {/* Inner mat line */}
                <div className="absolute inset-4 sm:inset-6 border border-border/15 rounded-md pointer-events-none" />
                {item.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.name}
                      className="max-w-full max-h-[40vh] object-contain drop-shadow-[0_12px_32px_rgba(0,0,0,0.15)]" />
                  </>
                ) : (
                  <CatIcon className="h-20 w-20 text-muted-foreground/8" strokeWidth={0.3} />
                )}
              </div>

              {/* Exhibition placard — brass plate feel */}
              <div className="p-5 sm:p-7 border-t border-border/30 overflow-y-auto bg-gradient-to-b from-background to-muted/10">
                {/* Category & rank */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
                    {catLabel?.wing || catLabel?.label}
                  </span>
                  {rank > 0 && item.duelsPlayed > 0 && (
                    <span className="text-[10px] text-muted-foreground/25 tabular-nums font-mono">Rank #{rank}</span>
                  )}
                </div>

                <h2 className="text-lg sm:text-xl font-semibold tracking-tight leading-snug mb-3">{item.name}</h2>

                <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 mb-4 text-sm text-muted-foreground/70">
                  {item.price !== undefined && (
                    <span className={cn('font-medium tabular-nums', item.priceEstimated && 'text-amber-600 dark:text-amber-400')}>
                      {item.priceEstimated && '~'}{formatPrice(item.price, item.currency)}
                      {item.priceEstimated && (
                        <button onClick={() => updateItem(item.id, { priceEstimated: false })}
                          className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-400/80 text-amber-950 hover:bg-emerald-500 hover:text-white transition-colors align-middle"
                          title="Confirm price">
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </button>
                      )}
                    </span>
                  )}
                  <span className="text-xs">{getRarityLabel(rarity)}</span>
                  {item.duelsPlayed > 0 && (
                    <span className="text-xs tabular-nums font-mono">{item.elo} pts · {item.duelsWon}W–{item.duelsPlayed - item.duelsWon}L</span>
                  )}
                  <span className="text-xs">{new Date(item.addedAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>

                {item.notes && (
                  <p className="text-sm text-muted-foreground/60 leading-relaxed mb-4 italic">&ldquo;{item.notes}&rdquo;</p>
                )}

                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground transition-colors mb-5">
                    <ExternalLink className="h-3 w-3" /> View source
                  </a>
                )}

                <div className="flex items-center gap-2 pt-4 border-t border-border/30">
                  <button onClick={() => { acquireItem(item.id); setExpandedCard(null); }}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-foreground text-background hover:opacity-90 transition-all">
                    <ShoppingBag className="h-3.5 w-3.5" /> Acquired
                  </button>
                  <button onClick={() => { openEdit(item); setExpandedCard(null); }}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-border/60">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => { removeItem(item.id); setExpandedCard(null); }}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all border border-border/60 ml-auto">
                    <Archive className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Quick-add overlay ────────────────────────── */}
      {showQuickAdd && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowQuickAdd(false); setQuickExpanded(false); setQuickName(''); setQuickPrice(''); setQuickUrl(''); setQuickImageUrl(''); setQuickScrapedSite(''); setQuickPriceEstimated(false); } }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-md bg-background border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-5 animate-in slide-in-from-bottom-4 duration-200 max-h-[85dvh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">Add to Collection</span>
              <button onClick={() => { setShowQuickAdd(false); setQuickExpanded(false); setQuickName(''); setQuickPrice(''); setQuickUrl(''); setQuickImageUrl(''); setQuickScrapedSite(''); setQuickPriceEstimated(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* URL / Name input */}
            <div className="relative">
              <input ref={quickInputRef} value={quickName} onChange={(e) => {
                setQuickName(e.target.value);
                // Auto-scrape if URL pasted
                if (isUrl(e.target.value)) {
                  if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);
                  scrapeTimeoutRef.current = setTimeout(() => scrapeUrl(e.target.value), 600);
                }
              }}
                placeholder="Paste a link or type a name…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !quickExpanded) { if (isUrl(quickName)) { scrapeUrl(quickName); } else { setQuickExpanded(true); } } else if (e.key === 'Enter' && quickExpanded) { handleQuickAdd(); } }}
                className="w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all pr-10" />
              {quickScraping && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 text-muted-foreground/50 animate-spin" />
                </div>
              )}
            </div>

            {quickScrapedSite && (
              <p className="text-[11px] text-muted-foreground/50 mt-1.5 flex items-center gap-1">
                <Globe className="h-3 w-3" /> {quickScrapedSite}
              </p>
            )}

            {/* Expanded fields */}
            {quickExpanded && (
              <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {quickImageUrl && (
                  <div className="rounded-lg border border-border overflow-hidden h-32 bg-muted/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={quickImageUrl} alt="" className="w-full h-full object-contain p-2"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}

                <div className="flex gap-2">
                  <input value={quickPrice} onChange={(e) => setQuickPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Price" type="text" inputMode="decimal"
                    className="flex-1 border border-border bg-transparent px-3 py-2 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 tabular-nums" />
                  <input value={quickImageUrl} onChange={(e) => setQuickImageUrl(e.target.value)}
                    placeholder="Image URL" type="text"
                    className="flex-1 border border-border bg-transparent px-3 py-2 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                </div>

                {/* Category pills */}
                <div className="flex flex-wrap gap-1">
                  {VAULT_CATEGORIES.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat.icon] || Package;
                    const sel = quickCategory === cat.id;
                    return (
                      <button key={cat.id} onClick={() => setQuickCategory(cat.id)}
                        className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all border',
                          sel ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30')}>
                        <Icon className="h-2.5 w-2.5" strokeWidth={1.5} />{cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4">
              {!quickExpanded && quickName.trim() && !isUrl(quickName) && (
                <button onClick={() => setQuickExpanded(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  More details
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {quickExpanded && (
                  <button onClick={() => { setQuickExpanded(false); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
                    Less
                  </button>
                )}
                <button onClick={handleQuickAdd} disabled={!quickName.trim() || quickScraping}
                  className={cn('inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all',
                    quickName.trim() && !quickScraping
                      ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
                      : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
