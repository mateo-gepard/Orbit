'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus, X, Crown, Gem, ShoppingBag, ExternalLink, ChevronLeft,
  Gavel, Trophy, Archive, Undo2, Trash2, Edit3,
  Sparkles, Clock, DollarSign, Star, ArrowRight, Lock,
  Cpu, Shirt, Compass, Home, Palette, Heart, BookOpen, Package,
  Medal, Link, Image, StickyNote, TrendingUp, Shield, Eye,
  Flame, Target, Zap, Hash, ChevronRight, BarChart3,
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

// ─── Particle burst effect ─────────────────────────────
function ParticleBurst({ count = 8, color = 'bg-amber-400' }: { count?: number; color?: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="absolute left-1/2 top-1/2"
          style={{
            animation: `vault-particle 0.8s ease-out ${i * 0.05}s forwards`,
            transform: `rotate(${(360 / count) * i}deg) translateY(-20px)`,
          }}>
          <div className={cn('h-1 w-1 rounded-full', color)} />
        </div>
      ))}
    </div>
  );
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

  // Form state
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState('EUR');
  const [formUrl, setFormUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formCategory, setFormCategory] = useState<VaultCategory>('tech');
  const [formNotes, setFormNotes] = useState('');

  // Auction state
  const [duelPair, setDuelPair] = useState<[VaultItem, VaultItem] | null>(null);
  const [duelResult, setDuelResult] = useState<{ winnerId: string; animation: boolean } | null>(null);
  const [duelCount, setDuelCount] = useState(0);
  const [gavelStrike, setGavelStrike] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [auctionReady, setAuctionReady] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const activeItems = useMemo(() => getActiveItems(), [items]);
  const acquiredItems = useMemo(() => getAcquiredItems(), [items]);
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
    setAuctionReady(false);
    setTimeout(() => setAuctionReady(true), 100);
  }, [activeItems]);

  const handleDuelChoice = (winnerId: string) => {
    if (!duelPair) return;
    const loserId = duelPair[0].id === winnerId ? duelPair[1].id : duelPair[0].id;
    recordDuel(winnerId, loserId);
    setGavelStrike(true);
    setShowParticles(true);
    setDuelResult({ winnerId, animation: true });
    setDuelCount((c) => c + 1);
    setTimeout(() => setGavelStrike(false), 600);
    setTimeout(() => setShowParticles(false), 1000);
    setTimeout(() => {
      const pair = pickDuelPair(useWishlistStore.getState().getActiveItems());
      setDuelPair(pair);
      setDuelResult(null);
      setAuctionReady(false);
      setTimeout(() => setAuctionReady(true), 100);
    }, 1600);
  };

  const resetForm = () => {
    setFormName(''); setFormPrice(''); setFormCurrency('EUR');
    setFormUrl(''); setFormImageUrl(''); setFormCategory('tech');
    setFormNotes(''); setEditingItem(null);
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
  // ADD / EDIT — APPRAISAL DOCUMENT
  // ═══════════════════════════════════════════════════════

  if (view === 'add' || view === 'edit') {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header strip */}
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center gap-2">
          <button onClick={() => { resetForm(); setView('gallery'); }} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Gem className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} />
          <span className="text-[11px] font-mono text-muted-foreground/50 uppercase tracking-wider">
            {editingItem ? 'Appraisal Update' : 'New Acquisition'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-xl mx-auto w-full">
          {/* Appraisal document — styled like Flight's boarding pass */}
          <div className="rounded-2xl overflow-hidden border border-amber-500/20 bg-card">
            {/* Gold header bar */}
            <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gem className="h-3.5 w-3.5 text-white/90" />
                <span className="text-[13px] font-bold text-white tracking-wide">THE VAULT</span>
              </div>
              <span className="text-[10px] font-mono text-white/60 tracking-wider uppercase">
                {editingItem ? 'Reappraisal' : 'Intake Form'}
              </span>
            </div>

            {/* Document body */}
            <div className="p-5 space-y-4">
              <div className="text-center pb-3 border-b border-border/30">
                <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.2em]">
                  {editingItem ? 'Certificate of Reappraisal' : 'Certificate of Acquisition'}
                </p>
                <p className="text-[10px] text-muted-foreground/20 mt-0.5">
                  {new Date().toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>

              {/* Name field */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Hash className="h-2.5 w-2.5" /> Piece Name <span className="text-amber-500">*</span>
                </label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Sony WH-1000XM5" autoFocus
                  className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-3 text-[14px] font-semibold placeholder:text-muted-foreground/20 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.05)] transition-all" />
              </div>

              {/* Price + Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                    <DollarSign className="h-2.5 w-2.5" /> Appraisal Value
                  </label>
                  <div className="relative mt-1.5">
                    <input value={formPrice} onChange={(e) => setFormPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" type="text" inputMode="decimal"
                      className="w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-3 text-[14px] font-semibold placeholder:text-muted-foreground/20 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.05)] transition-all tabular-nums" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest">Currency</label>
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3 py-3 text-[14px] font-semibold focus:outline-none focus:border-amber-500/40 transition-all appearance-none text-center">
                    {['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Tear line */}
              <div className="relative mx-0 my-1">
                <div className="border-t border-dashed border-border/40" />
                <div className="absolute -left-7 -top-2.5 h-5 w-5 rounded-full bg-background" />
                <div className="absolute -right-7 -top-2.5 h-5 w-5 rounded-full bg-background" />
              </div>

              {/* Museum Wing selector */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Target className="h-2.5 w-2.5" /> Museum Wing
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {VAULT_CATEGORIES.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat.icon] || Package;
                    const isSelected = formCategory === cat.id;
                    return (
                      <button key={cat.id} onClick={() => setFormCategory(cat.id)}
                        className={cn(
                          'relative flex flex-col items-center gap-1.5 rounded-xl py-3 px-1 text-center transition-all duration-300 active:scale-95 border overflow-hidden',
                          isSelected
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                            : 'border-border/30 text-muted-foreground/35 hover:border-border/50 hover:text-muted-foreground/50'
                        )}>
                        {isSelected && (
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent animate-vault-shimmer" />
                          </div>
                        )}
                        <Icon className={cn('h-4 w-4 transition-transform duration-300', isSelected && 'scale-110')} strokeWidth={1.5} />
                        <span className="text-[7px] uppercase tracking-wider font-semibold leading-none">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source Link */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Link className="h-2.5 w-2.5" /> Source
                </label>
                <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..."
                  className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.05)] transition-all" />
              </div>

              {/* Image URL with preview */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Image className="h-2.5 w-2.5" /> Image
                </label>
                <input value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://...image.jpg"
                  className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.05)] transition-all" />
                {formImageUrl && (
                  <div className="mt-2.5 rounded-xl border border-border/30 overflow-hidden h-36 bg-foreground/[0.02] relative group">
                    <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] to-transparent pointer-events-none" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={formImageUrl} alt="Preview" className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>

              {/* Curator Notes */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
                  <StickyNote className="h-2.5 w-2.5" /> Curator&apos;s Notes
                </label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Why does this piece belong in the collection?" rows={3}
                  className="mt-1.5 w-full rounded-xl border border-border/40 bg-transparent px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground/20 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.05)] transition-all resize-none italic" />
              </div>
            </div>

            {/* Barcode at bottom — like Flight boarding pass */}
            <div className="px-5 pb-4 pt-2">
              <div className="flex items-center justify-center gap-[2px] h-6 overflow-hidden opacity-15">
                {Array.from({ length: 35 }, (_, i) => (
                  <div key={i} className="bg-foreground rounded-[0.5px]"
                    style={{ width: [1, 2, 3][Math.abs((formName || 'VAULT').charCodeAt(i % Math.max(formName.length, 1)) + i) % 3] + 'px', height: '100%' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Submit CTA */}
          <button onClick={handleSubmit} disabled={!formName.trim()}
            className={cn(
              'mt-6 w-full relative flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-bold transition-all active:scale-[0.98] text-white shadow-lg overflow-hidden',
              formName.trim()
                ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:via-amber-400 hover:to-yellow-400 shadow-amber-600/25'
                : 'bg-muted-foreground/20 cursor-not-allowed shadow-none'
            )}>
            {formName.trim() && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-vault-shimmer" />
            )}
            <Gem className="h-4 w-4 relative z-10" />
            <span className="relative z-10">{editingItem ? 'Update Piece' : 'Induct into Vault'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // AUCTION RING — THE DRAMATIC DUEL
  // ═══════════════════════════════════════════════════════

  if (view === 'auction') {
    if (!duelPair) startNewDuel();
    return (
      <div className="flex flex-col h-full bg-background relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-amber-500/[0.03] rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-amber-500/[0.02] rounded-full blur-[100px]" />
        </div>

        {/* Header */}
        <div className="relative z-10 px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button onClick={() => { setView('gallery'); setDuelCount(0); }} className="text-muted-foreground/40 hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="relative">
              <Gavel className={cn('h-4 w-4 text-amber-500 transition-transform', gavelStrike && 'animate-[gavel-strike_0.4s_ease-out]')} strokeWidth={1.5} />
              {gavelStrike && <div className="absolute inset-0 rounded-full animate-[vault-pulse-ring_0.6s_ease-out]" style={{ boxShadow: '0 0 0 2px rgba(245,158,11,0.3)' }} />}
            </div>
            <div>
              <span className="text-[12px] font-bold tracking-tight">Auction Ring</span>
              <span className="text-[9px] text-muted-foreground/30 ml-2 tabular-nums">{duelCount} duels</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {duels.length > 0 && (
              <button onClick={() => setView('leaderboard')} className="flex items-center gap-1 text-[10px] text-amber-500/50 hover:text-amber-400 transition-colors">
                <Trophy className="h-3 w-3" /> Rankings
              </button>
            )}
          </div>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto flex flex-col">
          {!duelPair ? (
            /* Not enough pieces */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="relative mx-auto w-20 h-20 mb-4">
                  <div className="absolute inset-0 rounded-full bg-amber-500/5 animate-pulse" />
                  <div className="absolute inset-3 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Gavel className="h-7 w-7 text-amber-500/20" />
                  </div>
                </div>
                <p className="text-[16px] font-bold">Not Enough Pieces</p>
                <p className="text-[12px] text-muted-foreground/30 mt-1 max-w-[280px]">Add at least 2 items to start the auction</p>
                <button onClick={() => setView('add')} className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-500 hover:text-amber-400 transition-colors bg-amber-500/10 px-4 py-2 rounded-xl">
                  <Plus className="h-3.5 w-3.5" /> Add Piece
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-4 lg:p-8 max-w-3xl mx-auto w-full">
              {/* Auction header */}
              <div className="text-center mb-6 lg:mb-8">
                <div className="inline-flex items-center gap-2 bg-amber-500/10 rounded-full px-4 py-1.5 mb-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[9px] text-amber-500 uppercase tracking-[0.2em] font-bold">Live Auction</span>
                </div>
                <h2 className="text-[20px] lg:text-[24px] font-black tracking-tight">Which do you desire more?</h2>
                <p className="text-[11px] text-muted-foreground/25 mt-1">Tap the piece you want most. The gavel decides.</p>
              </div>

              {/* Duel arena */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-8 items-start relative">
                {/* Center VS badge */}
                <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shadow-xl shadow-amber-500/30">
                      <span className="text-[11px] font-black text-white">VS</span>
                    </div>
                    <div className="absolute inset-0 rounded-full animate-[vault-pulse-ring_2s_ease-out_infinite]" style={{ boxShadow: '0 0 0 4px rgba(245,158,11,0.15)' }} />
                  </div>
                </div>

                {duelPair.map((item, idx) => {
                  const isWinner = duelResult?.winnerId === item.id;
                  const isLoser = duelResult && !isWinner;
                  const rarity = getItemRarity(item);
                  const CatIcon = getCategoryIcon(item.category);
                  return (
                    <button key={item.id} onClick={() => !duelResult && handleDuelChoice(item.id)} disabled={!!duelResult}
                      className={cn(
                        'relative rounded-2xl overflow-hidden border transition-all duration-500 text-left group',
                        auctionReady ? 'animate-vault-card-enter' : 'opacity-0',
                        !duelResult && 'hover:border-amber-500/50 hover:-translate-y-1 active:scale-[0.98] cursor-pointer',
                        isWinner && 'border-amber-400/60 -translate-y-2 shadow-2xl shadow-amber-500/20',
                        isLoser && 'border-border/15 opacity-30 scale-[0.96] blur-[1px]',
                        !duelResult && !isWinner && 'border-border/40'
                      )}
                      style={{ animationDelay: `${idx * 0.15}s`, animationFillMode: 'forwards' }}>
                      
                      {/* Top accent */}
                      <div className={cn('h-[3px] transition-all duration-500',
                        isWinner ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500' 
                        : 'bg-gradient-to-r from-transparent via-amber-400/20 to-transparent')} />

                      {/* Spotlight overlay on hover */}
                      {!duelResult && (
                        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      )}

                      {/* Image or placeholder */}
                      {item.imageUrl ? (
                        <div className="h-40 lg:h-52 overflow-hidden bg-foreground/[0.02] relative">
                          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent z-10 pointer-events-none" />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt={item.name}
                            className={cn('w-full h-full object-contain p-4 transition-all duration-700', !duelResult && 'group-hover:scale-110')} />
                        </div>
                      ) : (
                        <div className="h-32 lg:h-40 flex items-center justify-center relative">
                          <div className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent pointer-events-none" />
                          <div className="relative">
                            <CatIcon className={cn('h-16 w-16 text-muted-foreground/10 transition-all duration-500', !duelResult && 'group-hover:text-amber-500/20 group-hover:scale-110')} strokeWidth={0.5} />
                          </div>
                        </div>
                      )}

                      {/* Info */}
                      <div className="px-5 pb-5 pt-3 relative z-10">
                        <p className="text-[16px] lg:text-[18px] font-black tracking-tight truncate">{item.name}</p>
                        <div className="flex items-center gap-2.5 mt-1.5">
                          <span className={cn('text-[8px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-md',
                            rarity === 'heirloom' ? 'bg-purple-500/10 text-purple-400' : rarity === 'vintage' ? 'bg-amber-500/10 text-amber-400' : rarity === 'seasoned' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                          )}>{getRarityLabel(rarity)}</span>
                          <span className="text-[9px] text-muted-foreground/30">{VAULT_CATEGORIES.find(c => c.id === item.category)?.wing}</span>
                        </div>

                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/20">
                          {item.price !== undefined ? (
                            <p className="text-[20px] font-black text-amber-400 tabular-nums">{formatPrice(item.price, item.currency)}</p>
                          ) : (
                            <p className="text-[13px] text-muted-foreground/20 italic">Priceless</p>
                          )}
                          <div className="flex items-center gap-1.5 bg-foreground/[0.03] rounded-lg px-2 py-1">
                            <Trophy className="h-3 w-3 text-amber-500/40" />
                            <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums font-bold">{item.elo}</span>
                          </div>
                        </div>
                      </div>

                      {/* Winner crown overlay */}
                      {isWinner && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                          <div className="relative">
                            <div className="bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full p-4 shadow-2xl shadow-amber-500/40 animate-vault-crown-drop">
                              <Crown className="h-8 w-8 text-white" />
                            </div>
                            {showParticles && <ParticleBurst count={12} />}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Mobile VS badge */}
                <div className="lg:hidden flex justify-center -my-3 relative z-20 order-first" style={{ order: 1 }}>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-500/30 -mt-5">
                    <span className="text-[10px] font-black text-white">VS</span>
                  </div>
                </div>
              </div>

              {/* Skip / session info */}
              {!duelResult && (
                <div className="mt-6 flex items-center justify-center">
                  <button onClick={startNewDuel}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/25 hover:text-muted-foreground/50 transition-colors bg-foreground/[0.02] hover:bg-foreground/[0.04] px-4 py-2 rounded-xl">
                    Skip this duel <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // LEADERBOARD — RANKINGS PODIUM
  // ═══════════════════════════════════════════════════════

  if (view === 'leaderboard') {
    const topThree = rankedItems.slice(0, 3);
    return (
      <div className="flex flex-col h-full bg-background relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/[0.03] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('gallery')} className="text-muted-foreground/40 hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Trophy className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} />
            <span className="text-[12px] font-bold tracking-tight">Auction Rankings</span>
          </div>
          <span className="text-[10px] text-muted-foreground/30 tabular-nums">{duels.length} duels total</span>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto p-4 lg:p-8 max-w-2xl mx-auto w-full space-y-8">
          {/* Podium — only show with 3+ items */}
          {topThree.length >= 3 && (
            <div className="pt-4">
              {/* Podium header */}
              <div className="text-center mb-6">
                <p className="text-[8px] text-amber-500/40 uppercase tracking-[0.25em] font-bold">Most Desired</p>
              </div>

              <div className="grid grid-cols-3 gap-3 items-end">
                {[1, 0, 2].map((rank) => {
                  const item = topThree[rank];
                  if (!item) return null;
                  const isFirst = rank === 0;
                  const CatIcon = getCategoryIcon(item.category);
                  const podiumHeight = isFirst ? 'pb-6' : rank === 1 ? 'pb-4' : 'pb-3';
                  const medalColors = isFirst ? 'from-amber-400 to-yellow-500' : rank === 1 ? 'from-zinc-300 to-zinc-400' : 'from-orange-600 to-orange-700';
                  return (
                    <div key={item.id} className={cn(
                      'rounded-2xl overflow-hidden border text-center transition-all relative group',
                      isFirst ? 'border-amber-500/30 order-2' : 'border-border/30',
                      rank === 1 && 'order-1', rank === 2 && 'order-3', podiumHeight
                    )}>
                      {/* Top accent */}
                      <div className={cn('h-[3px] bg-gradient-to-r from-transparent to-transparent',
                        isFirst ? 'via-amber-400/80' : rank === 1 ? 'via-zinc-400/40' : 'via-orange-600/40')} />
                      
                      {/* Glow for #1 */}
                      {isFirst && <div className="absolute inset-0 bg-amber-500/[0.03] pointer-events-none" />}

                      <div className={cn('py-4', isFirst ? 'pt-5' : '')}>
                        {/* Medal */}
                        <div className={cn('mx-auto rounded-full flex items-center justify-center mb-3 shadow-lg',
                          isFirst ? 'h-11 w-11' : 'h-8 w-8',
                          `bg-gradient-to-br ${medalColors}`
                        )}>
                          {isFirst ? <Crown className="h-5 w-5 text-white" /> : <span className="text-[11px] font-black text-white">{rank + 1}</span>}
                        </div>

                        {/* Image or icon */}
                        {item.imageUrl ? (
                          <div className={cn('mx-auto overflow-hidden rounded-xl mb-3 border border-border/20', isFirst ? 'h-24 w-24' : 'h-16 w-16')}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-1" />
                          </div>
                        ) : (
                          <CatIcon className={cn('mx-auto mb-3', isFirst ? 'h-12 w-12 text-muted-foreground/15' : 'h-8 w-8 text-muted-foreground/10')} strokeWidth={0.6} />
                        )}

                        <p className={cn('font-bold truncate px-3', isFirst ? 'text-[14px]' : 'text-[11px]')}>{item.name}</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Trophy className={cn('text-amber-500/50', isFirst ? 'h-3 w-3' : 'h-2.5 w-2.5')} />
                          <p className={cn('text-amber-500 font-mono tabular-nums font-bold', isFirst ? 'text-[13px]' : 'text-[10px]')}>{item.elo}</p>
                        </div>
                        {item.price !== undefined && <p className={cn('text-muted-foreground/30 mt-0.5', isFirst ? 'text-[11px]' : 'text-[9px]')}>{formatPrice(item.price, item.currency)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full ranking list */}
          {rankedItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full bg-amber-500/5 animate-pulse" />
                <div className="absolute inset-2 rounded-full bg-foreground/[0.02] flex items-center justify-center">
                  <Trophy className="h-6 w-6 text-muted-foreground/10" />
                </div>
              </div>
              <p className="text-[15px] font-bold text-muted-foreground/30">No rankings yet</p>
              <p className="text-[12px] text-muted-foreground/20 mt-1">Run some auctions to rank your collection</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground/25 uppercase tracking-widest font-medium mb-3 px-1">Full Rankings</p>
              {rankedItems.map((item, idx) => {
                const rarity = getItemRarity(item);
                const CatIcon = getCategoryIcon(item.category);
                const winRate = item.duelsPlayed > 0 ? Math.round((item.duelsWon / item.duelsPlayed) * 100) : 0;
                return (
                  <div key={item.id} className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all group',
                    idx < 3 ? 'bg-foreground/[0.03]' : 'hover:bg-foreground/[0.02]'
                  )}>
                    {/* Rank */}
                    <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-black',
                      idx === 0 ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white' : idx === 1 ? 'bg-gradient-to-br from-zinc-300 to-zinc-400 text-white' : idx === 2 ? 'bg-gradient-to-br from-orange-600 to-orange-700 text-white' : 'bg-foreground/[0.03] text-muted-foreground/25')}>
                      {idx + 1}
                    </div>
                    
                    {/* Thumb */}
                    {item.imageUrl ? (
                      <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 border border-border/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-foreground/[0.03] border border-border/20">
                        <CatIcon className="h-4 w-4 text-muted-foreground/20" strokeWidth={1.5} />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-[8px] uppercase tracking-wider font-semibold', getRarityColor(rarity))}>{getRarityLabel(rarity)}</span>
                        <span className="text-[8px] text-muted-foreground/15">•</span>
                        <span className="text-[9px] text-muted-foreground/25 tabular-nums">{item.duelsWon}W/{item.duelsPlayed}D</span>
                        {item.duelsPlayed > 0 && (
                          <>
                            <span className="text-[8px] text-muted-foreground/15">•</span>
                            <span className={cn('text-[9px] tabular-nums font-medium', winRate >= 60 ? 'text-emerald-400/60' : winRate >= 40 ? 'text-muted-foreground/30' : 'text-red-400/40')}>{winRate}%</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Elo */}
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-mono font-black text-amber-500 tabular-nums">{item.elo}</p>
                      {item.price !== undefined && <p className="text-[9px] text-muted-foreground/25 tabular-nums">{formatPrice(item.price, item.currency)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Continue CTA */}
          {rankedItems.length >= 2 && (
            <button onClick={() => { setView('auction'); startNewDuel(); }}
              className="w-full relative flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[13px] font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-white hover:from-amber-500 hover:via-amber-400 hover:to-yellow-400 transition-all active:scale-[0.98] shadow-lg shadow-amber-600/20 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-vault-shimmer" />
              <Gavel className="h-4 w-4 relative z-10" /> <span className="relative z-10">Continue Auction</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // ACQUIRED / PROVENANCE SHELF
  // ═══════════════════════════════════════════════════════

  if (view === 'acquired') {
    const displayItems = showRemoved ? removedItems : acquiredItems;
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => { setView('gallery'); setShowRemoved(false); }} className="text-muted-foreground/40 hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {showRemoved ? <Archive className="h-3.5 w-3.5 text-muted-foreground/40" strokeWidth={1.5} /> : <ShoppingBag className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />}
            <span className="text-[12px] font-bold tracking-tight">
              {showRemoved ? 'Deaccessioned' : 'Provenance Shelf'}
            </span>
          </div>
          <button onClick={() => setShowRemoved(!showRemoved)} className="text-[10px] px-2.5 py-1 rounded-lg text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors border border-border/30 hover:border-border/50">
            {showRemoved ? 'Show Acquired' : 'Show Removed'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 max-w-2xl mx-auto w-full space-y-4">
          {/* Total spend banner */}
          {!showRemoved && acquiredItems.length > 0 && (
            <div className="rounded-2xl overflow-hidden border border-emerald-500/20 bg-card">
              <div className="h-[3px] bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
              <div className="px-5 py-4 text-center">
                <p className="text-[8px] text-emerald-500/50 uppercase tracking-[0.2em] font-bold">Collection Acquired</p>
                <p className="text-3xl font-black tabular-nums mt-1 text-emerald-400">{formatPrice(stats.acquiredValue, acquiredItems[0]?.currency || 'EUR')}</p>
                <p className="text-[9px] text-muted-foreground/25 mt-1">{acquiredItems.length} pieces · total investment</p>
              </div>
            </div>
          )}

          {/* Items */}
          {displayItems.length === 0 ? (
            <div className="text-center py-16">
              {showRemoved ? (
                <><Archive className="h-8 w-8 text-muted-foreground/10 mx-auto mb-3" /><p className="text-[14px] font-bold text-muted-foreground/30">No deaccessioned pieces</p></>
              ) : (
                <><ShoppingBag className="h-8 w-8 text-muted-foreground/10 mx-auto mb-3" /><p className="text-[14px] font-bold text-muted-foreground/30">No acquisitions yet</p>
                  <p className="text-[12px] text-muted-foreground/20 mt-1">Mark items as acquired to track your spending</p></>
              )}
            </div>
          ) : displayItems.map((item) => {
            const date = new Date(showRemoved ? (item.removedAt || 0) : (item.acquiredAt || 0));
            const dateStr = date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
            const CatIcon = getCategoryIcon(item.category);
            return (
              <div key={item.id} className="rounded-2xl overflow-hidden border border-border/30 bg-card group transition-all hover:border-border/50">
                <div className={cn('h-[2px]', showRemoved ? 'bg-gradient-to-r from-transparent via-zinc-500/30 to-transparent' : 'bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent')} />
                <div className="px-4 py-3.5 flex items-center gap-3.5">
                  {item.imageUrl ? (
                    <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 border border-border/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt="" className="w-full h-full object-contain p-1" />
                    </div>
                  ) : (
                    <div className="h-14 w-14 rounded-xl flex items-center justify-center shrink-0 bg-foreground/[0.02] border border-border/20">
                      <CatIcon className="h-6 w-6 text-muted-foreground/15" strokeWidth={1} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground/30">{dateStr}</span>
                      {item.price !== undefined && (
                        <><span className="text-[8px] text-muted-foreground/15">•</span>
                          <span className={cn('text-[10px] font-mono tabular-nums font-semibold', showRemoved ? 'text-muted-foreground/30' : 'text-emerald-400/70')}>{formatPrice(item.price, item.currency)}</span></>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => restoreItem(item.id)} className="text-muted-foreground/30 hover:text-amber-500 transition-colors p-2 rounded-lg hover:bg-foreground/[0.03]" title="Return to Vault">
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="text-muted-foreground/20 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-foreground/[0.03]" title="Delete permanently">
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
  // MAIN GALLERY — THE GRAND HALL
  // ═══════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/[0.02] rounded-full blur-[100px] pointer-events-none" />

      {/* Header — museum style */}
      <div className="relative z-10 px-4 lg:px-8 py-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Gem className="h-5 w-5 text-amber-500 animate-vault-float" strokeWidth={1.5} />
              <div className="absolute inset-0 animate-vault-glow rounded-full" style={{ boxShadow: '0 0 12px 2px rgba(245,158,11,0.15)' }} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none">The Vault</h1>
              <p className="text-[8px] text-muted-foreground/25 uppercase tracking-[0.2em] font-medium mt-0.5">Personal Collection</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {acquiredItems.length > 0 && (
              <button onClick={() => setView('acquired')} className="flex items-center gap-1 text-[10px] text-muted-foreground/35 hover:text-emerald-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-emerald-500/5">
                <ShoppingBag className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{acquiredItems.length}</span>
              </button>
            )}
            {rankedItems.length >= 2 && (
              <button onClick={() => setView('leaderboard')} className="flex items-center gap-1 text-[10px] text-muted-foreground/35 hover:text-amber-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-amber-500/5">
                <Trophy className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Rankings</span>
              </button>
            )}
            {activeItems.length >= 2 && (
              <button onClick={() => { setView('auction'); startNewDuel(); }}
                className="relative flex items-center gap-1.5 text-[10px] font-bold text-amber-500 transition-colors px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/15 overflow-hidden">
                <Gavel className="h-3.5 w-3.5" /> Auction
              </button>
            )}
            <button onClick={() => setView('add')}
              className="flex items-center gap-1.5 text-[11px] font-bold bg-foreground text-background hover:opacity-90 transition-all active:scale-95 px-3 py-1.5 rounded-xl ml-1">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">

          {/* ─── Stats Dashboard — Museum Security Panel ─── */}
          {activeItems.length > 0 && (
            <div className="rounded-2xl overflow-hidden border border-amber-500/15 bg-card">
              <div className="h-[3px] bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-6 w-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Lock className="h-3 w-3 text-amber-500/60" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Vault Appraisal</span>
                    <p className="text-[7px] text-muted-foreground/20 tracking-[0.2em] uppercase">Real-time Collection Status</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                  <div className="relative">
                    <div className="flex items-end gap-1">
                      <p className="text-3xl font-black tabular-nums leading-none">{stats.totalItems}</p>
                      <Sparkles className="h-3 w-3 text-amber-500/30 mb-1" />
                    </div>
                    <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.15em] mt-1.5 font-medium">Pieces in Vault</p>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-amber-400 tabular-nums leading-none">{formatPrice(stats.totalValue, activeItems[0]?.currency || 'EUR')}</p>
                    <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.15em] mt-1.5 font-medium">Collection Value</p>
                  </div>
                  <div>
                    <div className="flex items-end gap-1">
                      <p className="text-3xl font-black tabular-nums leading-none">{stats.duelCount}</p>
                      <Gavel className="h-3 w-3 text-muted-foreground/15 mb-1" />
                    </div>
                    <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.15em] mt-1.5 font-medium">Auctions Held</p>
                  </div>
                  <div>
                    {stats.topRated ? (
                      <>
                        <p className="text-[15px] font-black truncate leading-tight">{stats.topRated.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Crown className="h-2.5 w-2.5 text-amber-500/50" />
                          <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.15em] font-medium">
                            Top Rated · <span className="text-amber-500 font-bold">{stats.topRated.elo}</span>
                          </p>
                        </div>
                      </>
                    ) : (
                      <><p className="text-[15px] text-muted-foreground/15">—</p><p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.15em] mt-1.5 font-medium">Top Rated</p></>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Wing Filters — Museum Gallery Navigation ─── */}
          {activeItems.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => setSelectedCategory('all')}
                className={cn('shrink-0 text-[10px] font-bold px-3.5 py-2 rounded-xl transition-all uppercase tracking-wider',
                  selectedCategory === 'all' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground/30 hover:text-muted-foreground/50 hover:bg-foreground/[0.03]')}>
                All ({activeItems.length})
              </button>
              {VAULT_CATEGORIES.map((cat) => {
                const count = stats.categoryBreakdown[cat.id];
                if (count === 0) return null;
                const Icon = CATEGORY_ICONS[cat.icon] || Package;
                return (
                  <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                    className={cn('shrink-0 flex items-center gap-1.5 text-[10px] font-bold px-3.5 py-2 rounded-xl transition-all uppercase tracking-wider',
                      selectedCategory === cat.id
                        ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25 shadow-lg shadow-amber-500/5'
                        : 'text-muted-foreground/30 hover:text-muted-foreground/50 hover:bg-foreground/[0.03] border border-transparent')}>
                    <Icon className="h-3 w-3" strokeWidth={1.5} /> {cat.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Empty State — Grand Opening ─── */}
          {activeItems.length === 0 && (
            <div className="text-center py-20 relative">
              <div className="relative mx-auto w-28 h-28 mb-8">
                {/* Pulsing rings */}
                <div className="absolute inset-0 rounded-full border border-amber-500/10 animate-[vault-pulse-ring_3s_ease-out_infinite]" />
                <div className="absolute inset-2 rounded-full border border-amber-500/10 animate-[vault-pulse-ring_3s_ease-out_0.5s_infinite]" />
                <div className="absolute inset-4 rounded-full bg-amber-500/5 flex items-center justify-center">
                  <Gem className="h-10 w-10 text-amber-500/30 animate-vault-float" />
                </div>
              </div>
              <h2 className="text-[22px] font-black tracking-tight">Your Vault Awaits</h2>
              <p className="text-[13px] text-muted-foreground/35 mt-2 max-w-[320px] mx-auto leading-relaxed">
                Every great collection begins with a single piece. What will be your first acquisition?
              </p>
              <button onClick={() => setView('add')}
                className="mt-8 relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-white px-8 py-4 text-[14px] font-bold hover:from-amber-500 hover:via-amber-400 hover:to-yellow-400 transition-all active:scale-[0.98] shadow-xl shadow-amber-600/25 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-vault-shimmer" />
                <Plus className="h-4 w-4 relative z-10" /> <span className="relative z-10">First Acquisition</span>
              </button>
            </div>
          )}

          {/* ─── Collection Grid ─── */}
          {sortedGalleryItems.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {sortedGalleryItems.map((item, idx) => (
                <VaultCard key={item.id} item={item} rank={rankedItems.indexOf(item) + 1} index={idx}
                  onEdit={() => openEdit(item)} onAcquire={() => acquireItem(item.id)} onRemove={() => removeItem(item.id)} />
              ))}
            </div>
          )}

          {/* ─── Auction CTA Banner ─── */}
          {activeItems.length >= 2 && duels.length === 0 && (
            <div className="rounded-2xl overflow-hidden border border-amber-500/20 bg-card relative group">
              <div className="h-[3px] bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.02] to-transparent pointer-events-none" />
              <div className="p-6 text-center relative z-10">
                <div className="inline-flex items-center gap-2 bg-amber-500/10 rounded-full px-3 py-1 mb-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[8px] text-amber-500 uppercase tracking-[0.2em] font-bold">New Feature</span>
                </div>
                <h3 className="text-[16px] font-black tracking-tight">Ready for Your First Auction?</h3>
                <p className="text-[12px] text-muted-foreground/35 mt-1.5 max-w-[320px] mx-auto leading-relaxed">
                  Pit your wishes head-to-head. The auction ring reveals what you truly desire most.
                </p>
                <button onClick={() => { setView('auction'); startNewDuel(); }}
                  className="mt-5 relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-white px-6 py-3 text-[12px] font-bold hover:from-amber-500 hover:via-amber-400 hover:to-yellow-400 transition-all active:scale-[0.98] shadow-lg shadow-amber-600/20 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-vault-shimmer" />
                  <Gavel className="h-3.5 w-3.5 relative z-10" /> <span className="relative z-10">Open Auction Ring</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// VAULT CARD — Museum Exhibition Piece
// ═══════════════════════════════════════════════════════

function VaultCard({ item, rank, index, onEdit, onAcquire, onRemove }: {
  item: VaultItem; rank: number; index: number;
  onEdit: () => void; onAcquire: () => void; onRemove: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const rarity = getItemRarity(item);
  const CatIcon = getCategoryIcon(item.category);
  const catLabel = VAULT_CATEGORIES.find(c => c.id === item.category)?.wing || '';

  // Spotlight follow mouse effect
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const handleMouse = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setSpotlightPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const rarityBorderColor = rarity === 'heirloom' ? 'hover:border-purple-500/30' : rarity === 'vintage' ? 'hover:border-amber-500/30' : rarity === 'seasoned' ? 'hover:border-blue-500/20' : 'hover:border-emerald-500/20';

  return (
    <div ref={cardRef}
      className={cn(
        'group relative rounded-2xl overflow-hidden border transition-all duration-500',
        'border-border/30', rarityBorderColor,
        'hover:shadow-xl hover:-translate-y-1',
        rarity === 'heirloom' && 'hover:shadow-purple-500/5',
        rarity === 'vintage' && 'hover:shadow-amber-500/5',
      )}
      style={{ animationDelay: `${index * 0.05}s` }}
      onMouseEnter={() => { setShowActions(true); setIsHovered(true); }}
      onMouseLeave={() => { setShowActions(false); setIsHovered(false); }}
      onMouseMove={handleMouse}
    >
      {/* Top accent line — color coded by rarity */}
      <div className={cn('h-[3px] bg-gradient-to-r from-transparent to-transparent transition-all duration-500',
        rarity === 'heirloom' ? 'via-purple-400/50 group-hover:via-purple-400/80' 
        : rarity === 'vintage' ? 'via-amber-400/40 group-hover:via-amber-400/70' 
        : rarity === 'seasoned' ? 'via-blue-400/30 group-hover:via-blue-400/60' 
        : 'via-emerald-400/20 group-hover:via-emerald-400/50'
      )} />

      {/* Spotlight effect following mouse */}
      {isHovered && (
        <div className="absolute inset-0 pointer-events-none z-[1] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `radial-gradient(circle at ${spotlightPos.x}% ${spotlightPos.y}%, rgba(245,158,11,0.06) 0%, transparent 60%)` }} />
      )}

      {/* Rank badge */}
      {rank > 0 && rank <= 3 && item.duelsPlayed > 0 && (
        <div className="absolute top-3 left-3 z-10">
          <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg',
            rank === 1 ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-amber-500/30' 
            : rank === 2 ? 'bg-gradient-to-br from-zinc-300 to-zinc-400 text-white shadow-zinc-400/20' 
            : 'bg-gradient-to-br from-orange-600 to-orange-700 text-white shadow-orange-600/20')}>
            {rank === 1 ? <Crown className="h-3.5 w-3.5" /> : rank}
          </div>
        </div>
      )}

      {/* Rarity badge — top right */}
      <div className="absolute top-3 right-3 z-10">
        <span className={cn('text-[7px] uppercase tracking-widest font-bold px-2 py-1 rounded-lg backdrop-blur-sm',
          rarity === 'heirloom' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20' 
          : rarity === 'vintage' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' 
          : rarity === 'seasoned' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' 
          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
        )}>{getRarityLabel(rarity)}</span>
      </div>

      {/* Image section */}
      {item.imageUrl ? (
        <div className="h-44 overflow-hidden relative bg-foreground/[0.01]">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-[2] pointer-events-none" />
          {/* Shimmer overlay */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-[3] opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-vault-shimmer" />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-5 transition-all duration-700 group-hover:scale-110" />
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center relative">
          <div className="absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-transparent pointer-events-none" />
          <CatIcon className="h-14 w-14 text-muted-foreground/[0.06] transition-all duration-700 group-hover:text-muted-foreground/[0.12] group-hover:scale-110" strokeWidth={0.5} />
        </div>
      )}

      {/* Info section */}
      <div className="px-4 py-3.5 relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-black tracking-tight truncate">{item.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[8px] text-muted-foreground/25 uppercase tracking-wider font-medium">{catLabel}</span>
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground/15 hover:text-amber-500 transition-colors" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Price & Elo row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
          <div>
            {item.price !== undefined ? (
              <p className="text-[17px] font-black text-amber-400 tabular-nums tracking-tight">{formatPrice(item.price, item.currency)}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground/15 italic font-medium">Priceless</p>
            )}
          </div>
          {item.duelsPlayed > 0 && (
            <div className="flex items-center gap-1.5 bg-foreground/[0.03] rounded-lg px-2 py-1 border border-border/10">
              <Trophy className="h-2.5 w-2.5 text-amber-500/40" />
              <span className="text-[10px] text-muted-foreground/35 font-mono tabular-nums font-bold">{item.elo}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        {item.notes && (
          <p className="text-[10px] text-muted-foreground/25 mt-2.5 italic line-clamp-2 leading-relaxed">&ldquo;{item.notes}&rdquo;</p>
        )}
      </div>

      {/* Action buttons — slide up on hover */}
      <div className={cn('px-3.5 pb-3.5 flex items-center gap-1.5 transition-all duration-500', showActions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none')}>
        <button onClick={(e) => { e.stopPropagation(); onAcquire(); }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all active:scale-95 border border-emerald-500/15">
          <ShoppingBag className="h-3 w-3" /> Acquire
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="flex items-center justify-center rounded-xl p-2 text-muted-foreground/25 hover:text-foreground hover:bg-foreground/[0.04] transition-all active:scale-95 border border-border/20">
          <Edit3 className="h-3 w-3" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex items-center justify-center rounded-xl p-2 text-muted-foreground/15 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border border-border/20">
          <Archive className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
