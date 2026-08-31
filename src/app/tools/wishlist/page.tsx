'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus, X, ChevronLeft, Gem, ShoppingBag, ExternalLink,
  Gavel, Trophy, Archive, Undo2, Trash2, Edit3,
  Crown, ArrowRight,
  Cpu, Shirt, Compass, Home, Palette, Heart, BookOpen, Package,
  Loader2, Globe,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ensureAppCheck } from '@/lib/firebase';
import { useAuth } from '@/components/providers/auth-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useSettingsStore } from '@/lib/settings-store';
import {
  useWishlistStore, VAULT_CATEGORIES, getItemRarity,
  getVaultStats, formatPrice, pickDuelPair,
  recommendedRounds, rankingConfidence,
  type VaultItem, type VaultCategory,
} from '@/lib/wishlist-store';

const COPY = {
  en: {
    edit: 'Edit', new: 'New', piece: 'piece', name: 'Name', whatIsIt: 'What is it?', price: 'Price', currency: 'Currency', category: 'Category', link: 'Link', imageUrl: 'Image URL', notes: 'Notes', whyWant: 'Why do you want this?', saveChanges: 'Save changes', addCollection: 'Add to collection',
    auction: 'Auction', rankings: 'Rankings', stable: 'Ranking stable', rankingsArrow: 'Rankings →', updated: 'Rankings updated', roundsCompleted: '{rounds} rounds completed · {confidence}% confidence', viewRankings: 'View rankings', keepGoing: 'Keep going', notEnough: 'Not enough pieces', needTwo: 'Add at least two items to start comparing.', addItems: 'Add items', preparing: 'Preparing comparison…', comparison: 'Lot comparison', whichMore: 'Which do you want more?', lot: 'Lot', noPrice: 'No price', selected: 'Selected', skip: 'Skip',
    confident: '{confidence}% confident', duels: '{count} duels', noRankings: 'No rankings yet', auctionFirst: 'Run some auctions first.', improve: 'Improve rankings ({confidence}%)', continueAuction: 'Continue auction',
    removed: 'Removed', acquired: 'Acquired', showAcquired: 'Show acquired', showRemoved: 'Show removed', totalSpent: 'Total spent', currenciesSeparate: 'Currencies are shown separately; no exchange-rate assumptions.', itemsAcquired: '{count} items acquired', nothingHere: 'Nothing here yet', restore: 'Restore {name}', deletePermanently: 'Delete {name} permanently', deleteTitle: 'Delete “{name}” permanently?', deleteFallback: 'Delete item permanently?', deleteDescription: 'This removes the item and its auction history from the Vault. This action cannot be undone.', deleteConfirm: 'Delete permanently',
    vault: 'The Vault', navigation: 'Vault sections', itemCount: '{count} {item}', gallery: 'Gallery', add: 'Add', empty: 'Your vault is empty', emptyDescription: 'Paste a URL or add items to start your collection.', addFirst: 'Add first piece', featured: 'Featured piece', estimated: 'est.', points: 'pts', ranked: '#{rank} ranked', rank: 'Rank #{rank}', source: 'Open source for {name}', viewSource: 'View source', confirmPrice: 'Confirm estimated price', acquiredAction: 'Acquired', remove: 'Remove', closeDetails: 'Close item details',
    addTitle: 'Add to collection', closeAdd: 'Close add item dialog', productInput: 'Product link or name', paste: 'Paste a link or type a name…', signInFetch: 'Sign in to fetch product details. You can still add the item manually.', productLookup: 'Product lookup failed ({status})', lookupUnavailable: 'Product details could not be fetched. You can still add the item manually.', productDetails: 'Product details from {site}', more: 'More details', less: 'Less', loading: 'Looking up product details', capacity: 'The Vault is full (500 items). Permanently delete an archived item before adding another.',
    discardTitle: 'Discard unsaved changes?', discardDescription: 'Your draft has not been saved. Discarding it cannot be undone.', keepEditing: 'Keep editing', discard: 'Discard draft',
    categories: { tech: ['Tech', 'Tech Wing'], fashion: ['Fashion', 'Fashion Gallery'], experience: ['Experiences', 'Experience Hall'], home: ['Home', 'Living Quarters'], creative: ['Creative', 'Atelier'], wellness: ['Wellness', 'Wellness Suite'], education: ['Education', 'Library'], other: ['Other', 'Open Vault'] },
    rarity: { fresh: 'Fresh arrival', seasoned: 'Seasoned', vintage: 'Vintage', heirloom: 'Heirloom' },
  },
  de: {
    edit: 'Bearbeiten', new: 'Neues', piece: 'Stück', name: 'Name', whatIsIt: 'Worum handelt es sich?', price: 'Preis', currency: 'Währung', category: 'Kategorie', link: 'Link', imageUrl: 'Bild-URL', notes: 'Notizen', whyWant: 'Warum möchtest du das?', saveChanges: 'Änderungen speichern', addCollection: 'Zur Sammlung hinzufügen',
    auction: 'Auktion', rankings: 'Rangliste', stable: 'Rangliste stabil', rankingsArrow: 'Rangliste →', updated: 'Rangliste aktualisiert', roundsCompleted: '{rounds} Runden abgeschlossen · {confidence}% Sicherheit', viewRankings: 'Rangliste ansehen', keepGoing: 'Weiter', notEnough: 'Nicht genug Stücke', needTwo: 'Füge mindestens zwei Stücke hinzu, um sie zu vergleichen.', addItems: 'Stücke hinzufügen', preparing: 'Vergleich wird vorbereitet…', comparison: 'Losvergleich', whichMore: 'Was möchtest du lieber?', lot: 'Los', noPrice: 'Kein Preis', selected: 'Ausgewählt', skip: 'Überspringen',
    confident: '{confidence}% sicher', duels: '{count} Duelle', noRankings: 'Noch keine Rangliste', auctionFirst: 'Führe zuerst ein paar Auktionen durch.', improve: 'Rangliste verbessern ({confidence}%)', continueAuction: 'Auktion fortsetzen',
    removed: 'Entfernt', acquired: 'Angeschafft', showAcquired: 'Angeschaffte zeigen', showRemoved: 'Entfernte zeigen', totalSpent: 'Ausgaben gesamt', currenciesSeparate: 'Währungen werden getrennt angezeigt; es werden keine Wechselkurse angenommen.', itemsAcquired: '{count} Stücke angeschafft', nothingHere: 'Hier ist noch nichts', restore: '{name} wiederherstellen', deletePermanently: '{name} dauerhaft löschen', deleteTitle: '„{name}“ dauerhaft löschen?', deleteFallback: 'Stück dauerhaft löschen?', deleteDescription: 'Dadurch werden das Stück und seine Auktionshistorie aus dem Archiv entfernt. Das kann nicht rückgängig gemacht werden.', deleteConfirm: 'Dauerhaft löschen',
    vault: 'Das Archiv', navigation: 'Archivbereiche', itemCount: '{count} {item}', gallery: 'Galerie', add: 'Hinzufügen', empty: 'Dein Archiv ist leer', emptyDescription: 'Füge einen Link oder Stücke hinzu, um deine Sammlung zu starten.', addFirst: 'Erstes Stück hinzufügen', featured: 'Ausgewähltes Stück', estimated: 'geschätzt', points: 'Pkt.', ranked: '#{rank} platziert', rank: 'Rang #{rank}', source: 'Quelle für {name} öffnen', viewSource: 'Quelle ansehen', confirmPrice: 'Geschätzten Preis bestätigen', acquiredAction: 'Angeschafft', remove: 'Entfernen', closeDetails: 'Artikeldetails schließen',
    addTitle: 'Zur Sammlung hinzufügen', closeAdd: 'Dialog zum Hinzufügen schließen', productInput: 'Produktlink oder Name', paste: 'Link einfügen oder Namen eingeben…', signInFetch: 'Melde dich an, um Produktdetails abzurufen. Du kannst das Stück weiterhin manuell hinzufügen.', productLookup: 'Produktabfrage fehlgeschlagen ({status})', lookupUnavailable: 'Produktdetails konnten nicht abgerufen werden. Du kannst das Stück weiterhin manuell hinzufügen.', productDetails: 'Produktdetails von {site}', more: 'Mehr Details', less: 'Weniger', loading: 'Produktdetails werden abgerufen', capacity: 'Das Archiv ist voll (500 Stücke). Lösche ein archiviertes Stück dauerhaft, bevor du ein neues hinzufügst.',
    discardTitle: 'Ungespeicherte Änderungen verwerfen?', discardDescription: 'Dein Entwurf wurde noch nicht gespeichert. Das Verwerfen kann nicht rückgängig gemacht werden.', keepEditing: 'Weiter bearbeiten', discard: 'Entwurf verwerfen',
    categories: { tech: ['Technik', 'Technikflügel'], fashion: ['Mode', 'Modegalerie'], experience: ['Erlebnisse', 'Erlebnishalle'], home: ['Wohnen', 'Wohnbereich'], creative: ['Kreatives', 'Atelier'], wellness: ['Wellness', 'Wellnessbereich'], education: ['Bildung', 'Bibliothek'], other: ['Sonstiges', 'Offenes Archiv'] },
    rarity: { fresh: 'Neu eingetroffen', seasoned: 'Etabliert', vintage: 'Vintage', heirloom: 'Erbstück' },
  },
} as const;

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

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

const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const;

function parsePriceInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function totalsByCurrency(items: VaultItem[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.price === undefined || !Number.isFinite(item.price)) continue;
    const currency = item.currency || 'EUR';
    totals.set(currency, (totals.get(currency) ?? 0) + item.price);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatCurrencyTotals(totals: Array<[string, number]>): string {
  return totals.map(([currency, amount]) => formatPrice(amount, currency)).join(' + ');
}

interface DraftDiscardDialogProps {
  open: boolean;
  title: string;
  description: string;
  keepLabel: string;
  discardLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
}

function DraftDiscardDialog({
  open,
  title,
  description,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
}: DraftDiscardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onKeep();
    }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onKeep}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            {discardLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════

export default function WishlistPage() {
  const { user } = useAuth();
  const language = useSettingsStore((state) => state.settings.language);
  const copy = COPY[language];
  const {
    items, duels, addItem, updateItem, acquireItem, removeItem, restoreItem,
    deleteItem, recordDuel,
  } = useWishlistStore();

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<VaultView>('gallery');
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<VaultItem | null>(null);

  // Quick-add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickExpanded, setQuickExpanded] = useState(false);
  const [quickPrice, setQuickPrice] = useState('');
  const [quickCurrency, setQuickCurrency] = useState('EUR');
  const [quickPriceEstimated, setQuickPriceEstimated] = useState(false);
  const [quickCategory, setQuickCategory] = useState<VaultCategory>('tech');
  const [quickUrl, setQuickUrl] = useState('');
  const [quickImageUrl, setQuickImageUrl] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickScraping, setQuickScraping] = useState(false);
  const [quickScrapedSite, setQuickScrapedSite] = useState('');
  const [quickError, setQuickError] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const scrapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapeAbortRef = useRef<AbortController | null>(null);
  const scrapeGenerationRef = useRef(0);

  // Form state (edit)
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState('EUR');
  const [formUrl, setFormUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formCategory, setFormCategory] = useState<VaultCategory>('tech');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [discardTarget, setDiscardTarget] = useState<'form' | 'quick' | null>(null);

  // Auction state
  const [duelPair, setDuelPair] = useState<[VaultItem, VaultItem] | null>(null);
  const [duelResult, setDuelResult] = useState<{ winnerId: string } | null>(null);
  const [duelCount, setDuelCount] = useState(0);
  const duelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Card expand (gallery detail overlay)
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => () => {
    scrapeGenerationRef.current += 1;
    scrapeAbortRef.current?.abort();
    if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);
    if (duelTimeoutRef.current) clearTimeout(duelTimeoutRef.current);
  }, [user?.uid]);

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

  const authenticatedScrapeFetch = useCallback(async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ) => {
    if (!user || user.uid === 'demo-user') {
      throw new Error('AUTH_REQUIRED');
    }
    const appCheckTokenPromise = (async (): Promise<string | null> => {
      try {
        const appCheck = await ensureAppCheck();
        if (!appCheck) return null;
        const { getToken } = await import('firebase/app-check');
        return (await getToken(appCheck, false)).token;
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('APP_CHECK_UNAVAILABLE', { cause: error });
        }
        return null;
      }
    })();
    const [token, appCheckToken] = await Promise.all([
      user.getIdToken(),
      appCheckTokenPromise,
    ]);

    // Never call a production scrape endpoint without device attestation. The
    // surrounding flow translates this internal condition into the existing,
    // user-safe "lookup unavailable" recovery state.
    if (!appCheckToken && process.env.NODE_ENV === 'production') {
      throw new Error('APP_CHECK_UNAVAILABLE');
    }
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (appCheckToken) headers.set('X-Firebase-AppCheck', appCheckToken);

    return fetch(input, { ...init, headers, cache: 'no-store' });
  }, [user]);

  const scrapeUrl = useCallback(async (url: string) => {
    if (!user || user.uid === 'demo-user') {
      setQuickError(copy.signInFetch);
      setQuickExpanded(true);
      return;
    }
    const generation = ++scrapeGenerationRef.current;
    scrapeAbortRef.current?.abort();
    const controller = new AbortController();
    scrapeAbortRef.current = controller;
    const isCurrent = () => generation === scrapeGenerationRef.current && !controller.signal.aborted;
    setQuickScraping(true);
    setQuickScrapedSite('');
    setQuickPriceEstimated(false);
    setQuickError('');
    try {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      const res = await authenticatedScrapeFetch(
        '/api/scrape',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fullUrl }),
          signal: controller.signal,
        }
      );
      if (!isCurrent()) return;
      if (res.status === 401) {
        setQuickError(copy.signInFetch);
        setQuickExpanded(true);
        return;
      }
      if (!res.ok) throw new Error(interpolate(copy.productLookup, { status: res.status }));
      const data = await res.json();
      if (!isCurrent()) return;
      // Use whatever fields came back (even from fallback responses)
      const title = (data.title && data.title !== 'Product') ? data.title : '';
      if (title) setQuickName(title);
      if (data.price) setQuickPrice(data.price);
      if (typeof data.currency === 'string' && /^[A-Z]{3}$/i.test(data.currency)) {
        setQuickCurrency(data.currency.toUpperCase());
      }
      if (data.image) setQuickImageUrl(data.image);
      if (data.siteName) setQuickScrapedSite(data.siteName);
      setQuickUrl(fullUrl);
      setQuickCategory(guessCategory(fullUrl, data.siteName));
      setQuickExpanded(true);

      // Fire off search fallback for missing image/price
      if (title && (!data.image || !data.price)) {
        try {
          const searchRes = await authenticatedScrapeFetch(
            '/api/scrape/image',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: title }),
              signal: controller.signal,
            }
          );
          if (!isCurrent()) return;
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (!isCurrent()) return;
            if (!data.image && searchData.image) setQuickImageUrl(searchData.image);
            if (!data.price && searchData.price) {
              setQuickPrice(searchData.price);
              setQuickPriceEstimated(true); // Mark as estimated
            }
          }
        } catch { /* search fallback failed silently */ }
      }
    } catch (error) {
      if (!isCurrent() || (error as { name?: string })?.name === 'AbortError') return;
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
      setQuickUrl(fullUrl);
      setQuickCategory(guessCategory(fullUrl));
      setQuickExpanded(true);
      setQuickError(error instanceof Error && error.message.startsWith(copy.productLookup.split(' ({status})')[0])
        ? error.message
        : copy.lookupUnavailable);
    } finally {
      if (isCurrent()) {
        setQuickScraping(false);
        scrapeAbortRef.current = null;
      }
    }
  }, [authenticatedScrapeFetch, copy.lookupUnavailable, copy.productLookup, copy.signInFetch, guessCategory, user]);

  const activeItems = useMemo(() => items.filter((item) => !item.acquiredAt && !item.removedAt), [items]);
  const acquiredItemsList = useMemo(() => items
    .filter((item) => item.acquiredAt)
    .sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0)), [items]);
  const removedItems = useMemo(() => items
    .filter((item) => item.removedAt)
    .sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0)), [items]);
  const rankedItems = useMemo(() => items
    .filter((item) => !item.acquiredAt && !item.removedAt)
    .sort((a, b) => b.elo - a.elo), [items]);
  const stats = useMemo(() => getVaultStats(items, duels), [items, duels]);
  const activeValueTotals = useMemo(() => totalsByCurrency(activeItems), [activeItems]);
  const acquiredValueTotals = useMemo(() => totalsByCurrency(acquiredItemsList), [acquiredItemsList]);
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

  useEffect(() => {
    if (view !== 'auction' || duelResult) return;

    const activeIds = new Set(activeItems.map((item) => item.id));
    const pairIsUsable = duelPair
      && activeIds.has(duelPair[0].id)
      && activeIds.has(duelPair[1].id);
    if (pairIsUsable) return;

    const nextPair = pickDuelPair(activeItems);
    if (nextPair !== null || duelPair !== null) setDuelPair(nextPair);
  }, [activeItems, duelPair, duelResult, view]);

  const handleDuelChoice = (winnerId: string) => {
    if (!duelPair) return;
    const loserId = duelPair[0].id === winnerId ? duelPair[1].id : duelPair[0].id;
    recordDuel(winnerId, loserId);
    setDuelResult({ winnerId });
    setDuelCount((c) => c + 1);
    if (duelTimeoutRef.current) clearTimeout(duelTimeoutRef.current);
    duelTimeoutRef.current = setTimeout(() => {
      const pair = pickDuelPair(useWishlistStore.getState().getActiveItems());
      setDuelPair(pair);
      setDuelResult(null);
      duelTimeoutRef.current = null;
    }, 1200);
  };

  const resetForm = useCallback(() => {
    setFormName(''); setFormPrice(''); setFormCurrency('EUR');
    setFormUrl(''); setFormImageUrl(''); setFormCategory('tech');
    setFormNotes(''); setFormError(''); setEditingItem(null);
  }, []);

  const closeQuickAdd = useCallback(() => {
    scrapeGenerationRef.current += 1;
    scrapeAbortRef.current?.abort();
    scrapeAbortRef.current = null;
    if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);
    scrapeTimeoutRef.current = null;
    setQuickScraping(false);
    setShowQuickAdd(false);
    setQuickExpanded(false);
    setQuickName('');
    setQuickPrice('');
    setQuickCurrency('EUR');
    setQuickPriceEstimated(false);
    setQuickCategory('tech');
    setQuickUrl('');
    setQuickImageUrl('');
    setQuickNotes('');
    setQuickScrapedSite('');
    setQuickError('');
  }, []);

  const formDraftDirty = editingItem
    ? formName !== editingItem.name
      || formPrice !== (editingItem.price?.toString() ?? '')
      || formCurrency !== (editingItem.currency || 'EUR')
      || formUrl !== (editingItem.url || '')
      || formImageUrl !== (editingItem.imageUrl || '')
      || formCategory !== editingItem.category
      || formNotes !== (editingItem.notes || '')
    : formName !== ''
      || formPrice !== ''
      || formCurrency !== 'EUR'
      || formUrl !== ''
      || formImageUrl !== ''
      || formCategory !== 'tech'
      || formNotes !== '';

  const quickDraftDirty = quickName !== ''
    || quickPrice !== ''
    || quickCurrency !== 'EUR'
    || quickCategory !== 'tech'
    || quickUrl !== ''
    || quickImageUrl !== ''
    || quickNotes !== '';

  const closeForm = useCallback(() => {
    setDiscardTarget(null);
    resetForm();
    setView('gallery');
  }, [resetForm]);

  const requestCloseForm = useCallback(() => {
    if (formDraftDirty) {
      setDiscardTarget('form');
      return;
    }
    closeForm();
  }, [closeForm, formDraftDirty]);

  const requestCloseQuickAdd = useCallback(() => {
    if (quickDraftDirty) {
      setDiscardTarget('quick');
      return;
    }
    closeQuickAdd();
  }, [closeQuickAdd, quickDraftDirty]);

  useEffect(() => {
    if (view !== 'add' && view !== 'edit') return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || discardTarget !== null) return;
      event.preventDefault();
      requestCloseForm();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [discardTarget, requestCloseForm, view]);

  const handleQuickAdd = () => {
    if (!quickName.trim()) return;
    const price = parsePriceInput(quickPrice);
    const added = addItem({
      name: quickName.trim(), price, priceEstimated: quickPriceEstimated && price !== undefined, currency: quickCurrency, category: quickCategory,
      url: quickUrl.trim() || undefined, imageUrl: quickImageUrl.trim() || undefined,
      notes: quickNotes.trim() || undefined,
    });
    if (!added) {
      setQuickError(copy.capacity);
      return;
    }
    setQuickName(''); setQuickPrice(''); setQuickCurrency('EUR'); setQuickPriceEstimated(false); setQuickCategory('tech');
    setQuickExpanded(false); setQuickUrl(''); setQuickImageUrl(''); setQuickNotes('');
    setQuickScrapedSite('');
    setQuickError('');
    quickInputRef.current?.focus();
  };

  const openEdit = (item: VaultItem) => {
    setFormName(item.name); setFormPrice(item.price?.toString() || '');
    setFormCurrency(item.currency); setFormUrl(item.url || '');
    setFormImageUrl(item.imageUrl || ''); setFormCategory(item.category);
    setFormNotes(item.notes || ''); setFormError(''); setEditingItem(item); setView('edit');
  };

  const handleSubmit = () => {
    if (!formName.trim()) return;
    const price = parsePriceInput(formPrice);
    if (editingItem) {
      updateItem(editingItem.id, {
        name: formName.trim(), price, currency: formCurrency,
        url: formUrl.trim() || undefined, imageUrl: formImageUrl.trim() || undefined,
        category: formCategory, notes: formNotes.trim() || undefined,
      });
    } else {
      const added = addItem({
        name: formName.trim(), price, currency: formCurrency,
        url: formUrl.trim() || undefined, imageUrl: formImageUrl.trim() || undefined,
        category: formCategory, notes: formNotes.trim() || undefined,
      });
      if (!added) {
        setFormError(copy.capacity);
        return;
      }
    }
    closeForm();
  };

  if (!mounted) return null;

  // ═══════════════════════════════════════════════════════
  // EDIT FORM — Clean editorial
  // ═══════════════════════════════════════════════════════
  if (view === 'add' || view === 'edit') {
    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50 flex items-center gap-3">
          <button type="button" aria-label={copy.gallery} onClick={requestCloseForm} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{editingItem ? copy.edit : copy.new} {copy.piece}</span>
        </div>

        <div className="p-4 lg:p-8 max-w-lg mx-auto w-full space-y-5">
          <div>
            <label htmlFor="wishlist-item-name" className="text-xs text-muted-foreground mb-1.5 block">{copy.name}</label>
            <input id="wishlist-item-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={copy.whatIsIt} autoFocus
              className="min-h-11 w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="wishlist-item-price" className="text-xs text-muted-foreground mb-1.5 block">{copy.price}</label>
              <input id="wishlist-item-price" value={formPrice} onChange={(e) => setFormPrice(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="—" type="text" inputMode="decimal"
                className="min-h-11 w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all tabular-nums" />
            </div>
            <div>
              <label htmlFor="wishlist-item-currency" className="text-xs text-muted-foreground mb-1.5 block">{copy.currency}</label>
              <select id="wishlist-item-currency" value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)}
                className="min-h-11 w-full border border-border bg-transparent px-2 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all appearance-none text-center">
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <fieldset>
            <legend className="text-xs text-muted-foreground mb-2 block">{copy.category}</legend>
            <div className="flex flex-wrap gap-1.5">
              {VAULT_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.icon] || Package;
                const sel = formCategory === cat.id;
                return (
                  <button type="button" key={cat.id} onClick={() => setFormCategory(cat.id)} aria-pressed={sel}
                    className={cn('flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      sel ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30')}>
                    <Icon className="h-3 w-3" strokeWidth={1.5} />{copy.categories[cat.id][0]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="wishlist-item-url" className="text-xs text-muted-foreground mb-1.5 block">{copy.link}</label>
            <input id="wishlist-item-url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..." type="url"
              className="min-h-11 w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all" />
          </div>

          <div>
            <label htmlFor="wishlist-item-image-url" className="text-xs text-muted-foreground mb-1.5 block">{copy.imageUrl}</label>
            <input id="wishlist-item-image-url" value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://..." type="url"
              className="min-h-11 w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all" />
          </div>

          <div>
            <label htmlFor="wishlist-item-notes" className="text-xs text-muted-foreground mb-1.5 block">{copy.notes}</label>
            <textarea id="wishlist-item-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder={copy.whyWant} rows={3}
              className="min-h-[88px] w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all resize-none" />
          </div>

          {formError && (
            <p role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {formError}
            </p>
          )}

          <button type="button" onClick={handleSubmit} disabled={!formName.trim()} aria-disabled={!formName.trim()}
            className={cn('w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all',
              formName.trim() ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {editingItem ? copy.saveChanges : copy.addCollection}
          </button>
        </div>
        <DraftDiscardDialog
          open={discardTarget === 'form'}
          title={copy.discardTitle}
          description={copy.discardDescription}
          keepLabel={copy.keepEditing}
          discardLabel={copy.discard}
          onKeep={() => setDiscardTarget(null)}
          onDiscard={closeForm}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // AUCTION — Editorial Comparison
  // ═══════════════════════════════════════════════════════
  if (view === 'auction') {
    const target = recommendedRounds(activeItems.length);
    const sessionDone = duelCount >= target && duelCount > 0;

    return (
      <div className="min-h-full bg-background">
        <div className="px-4 lg:px-8 py-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button type="button" aria-label={copy.gallery} onClick={() => { setView('gallery'); setDuelCount(0); }} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div>
                <span className="text-sm font-medium">{copy.auction}</span>
                <span className="text-xs text-muted-foreground ml-2 tabular-nums">{duelCount}/{target}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {confidence >= 100 && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{copy.stable}</span>
              )}
              {duels.length > 0 && (
                <button type="button" onClick={() => setView('leaderboard')} className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {copy.rankingsArrow}
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

        {activeItems.length < 2 ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-3">
              <p className="text-lg font-medium">{copy.notEnough}</p>
              <p className="text-sm text-muted-foreground">{copy.needTwo}</p>
              <button type="button" onClick={() => { setView('gallery'); setShowQuickAdd(true); }}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-all mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="h-3.5 w-3.5" /> {copy.addItems}
              </button>
            </div>
          </div>
        ) : sessionDone ? (
          /* Session complete */
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-4 max-w-sm">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
              <p className="text-lg font-semibold tracking-tight">{copy.updated}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {interpolate(copy.roundsCompleted, { rounds: duelCount, confidence })}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button type="button" onClick={() => setView('leaderboard')}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Crown className="h-3.5 w-3.5" /> {copy.viewRankings}
                </button>
                <button type="button" onClick={() => { setDuelCount(0); startNewDuel(); }}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Gavel className="h-3.5 w-3.5" /> {copy.keepGoing}
                </button>
              </div>
            </div>
          </div>
        ) : !duelPair ? (
          <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{copy.preparing}</span>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100dvh-theme(spacing.28))] lg:h-auto lg:p-8 max-w-4xl mx-auto">
            {/* Question — compact on mobile */}
            <div className="text-center py-4 lg:py-0 lg:mb-12 shrink-0">
              <p className="hidden lg:block text-xs text-muted-foreground uppercase tracking-widest mb-2">{copy.comparison}</p>
              <h2 className="text-base lg:text-2xl font-semibold tracking-tight">{copy.whichMore}</h2>
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
                        <img src={item.imageUrl} alt={item.name} decoding="async" referrerPolicy="no-referrer"
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
                        <span className="hidden lg:inline">{copy.lot} {lotNumber(idx)} · </span>{copy.categories[item.category][0]}
                      </p>
                      <p className="text-xs lg:text-lg font-semibold tracking-tight line-clamp-2 leading-tight">{item.name}</p>
                      <div className="flex items-center justify-between mt-1.5 lg:mt-3 pt-1.5 lg:pt-3 border-t border-border/50">
                        {item.price !== undefined ? (
                          <p className="text-xs lg:text-base font-semibold tabular-nums">{formatPrice(item.price, item.currency)}</p>
                        ) : (
                          <p className="text-[10px] lg:text-sm text-muted-foreground/50">{copy.noPrice}</p>
                        )}
                        <p className="text-[10px] lg:text-xs text-muted-foreground tabular-nums font-mono">{item.elo}</p>
                      </div>
                    </div>

                    {/* Winner indicator */}
                    {isWinner && (
                      <div className="absolute top-2 right-2 lg:top-3 lg:right-3 bg-foreground text-background rounded-full p-1.5 lg:px-2.5 lg:py-1 text-[10px] font-semibold flex items-center gap-1 animate-scale-in">
                        <Check className="h-3 w-3" />
                        <span className="hidden lg:inline">{copy.selected}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Skip — bottom of screen on mobile */}
            {!duelResult && (
              <div className="py-4 lg:mt-8 flex justify-center shrink-0">
                <button type="button" onClick={startNewDuel} className="flex min-h-11 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {copy.skip} <ArrowRight className="h-3 w-3" />
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
              <button type="button" aria-label={copy.gallery} onClick={() => setView('gallery')} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{copy.rankings}</span>
            </div>
            <div className="flex items-center gap-2">
              {confidence > 0 && (
                <span className={cn('text-[10px] tabular-nums font-medium',
                  confidence >= 100 ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
                  {interpolate(copy.confident, { confidence })}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/40 tabular-nums">{interpolate(copy.duels, { count: duels.length })}</span>
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
              <p className="text-base font-medium text-muted-foreground/50">{copy.noRankings}</p>
              <p className="text-sm text-muted-foreground/30 mt-1">{copy.auctionFirst}</p>
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
                      {idx === 0 ? (
                        <>
                          <Crown aria-hidden="true" className="mx-auto h-4 w-4" />
                          <span className="sr-only">{copy.rank.replace('{rank}', '1')}</span>
                        </>
                      ) : idx + 1}
                    </div>

                    {/* Thumb */}
                    {item.imageUrl ? (
                      <div className={cn('rounded-lg overflow-hidden shrink-0 border border-border/50 bg-muted/20',
                        idx === 0 ? 'h-14 w-14' : 'h-11 w-11')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-contain p-0.5" />
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
                        <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
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
            <button type="button" onClick={() => { setView('auction'); startNewDuel(); }}
              className="w-full mt-4 lg:mt-6 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98]">
              <Gavel className="h-3.5 w-3.5" /> {confidence < 100 ? interpolate(copy.improve, { confidence }) : copy.continueAuction}
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
            <button type="button" aria-label={copy.gallery} onClick={() => { setView('gallery'); setShowRemoved(false); }} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{showRemoved ? copy.removed : copy.acquired}</span>
          </div>
          <button type="button" onClick={() => setShowRemoved(!showRemoved)}
            className="min-h-11 px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {showRemoved ? copy.showAcquired : copy.showRemoved}
          </button>
        </div>

        <div className="p-4 lg:p-8 max-w-2xl mx-auto w-full">
          {/* Spend summary */}
          {!showRemoved && acquiredItemsList.length > 0 && (
            <div className="mb-6 pb-6 border-b border-border/50 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{copy.totalSpent}</p>
              <p className="text-3xl font-semibold tabular-nums">{formatCurrencyTotals(acquiredValueTotals) || '—'}</p>
              {acquiredValueTotals.length > 1 && (
                <p className="text-[10px] text-muted-foreground/45 mt-1">{copy.currenciesSeparate}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{interpolate(copy.itemsAcquired, { count: acquiredItemsList.length })}</p>
            </div>
          )}

          {displayItems.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-base font-medium text-muted-foreground/50">{copy.nothingHere}</p>
            </div>
          ) : displayItems.map((item) => {
            const date = new Date(showRemoved ? (item.removedAt || 0) : (item.acquiredAt || 0));
            const dateStr = date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const CatIcon = getCategoryIcon(item.category);
            return (
              <div key={item.id} className="flex items-center gap-3.5 py-3 border-b border-border/30 last:border-0 group">
                {item.imageUrl ? (
                  <div className="h-11 w-11 rounded-lg overflow-hidden shrink-0 border border-border/50 bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-contain p-0.5" />
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => restoreItem(item.id)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={interpolate(copy.restore, { name: item.name })}
                      aria-label={interpolate(copy.restore, { name: item.name })}
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteCandidate(item)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      title={interpolate(copy.deletePermanently, { name: item.name })}
                      aria-label={interpolate(copy.deletePermanently, { name: item.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <ConfirmDialog
          open={deleteCandidate !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteCandidate(null);
          }}
          title={deleteCandidate ? interpolate(copy.deleteTitle, { name: deleteCandidate.name }) : copy.deleteFallback}
          description={copy.deleteDescription}
          confirmLabel={copy.deleteConfirm}
          onConfirm={() => {
            if (deleteCandidate) deleteItem(deleteCandidate.id);
          }}
        />
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
            <h1 className="inline text-lg font-semibold tracking-tight">{copy.vault}</h1>
            <span className="text-[11px] text-muted-foreground/40 ml-2 hidden sm:inline tabular-nums">
              {interpolate(copy.itemCount, { count: stats.totalItems, item: language === 'de' ? 'Stück' : stats.totalItems === 1 ? 'piece' : 'pieces' })}
              {activeValueTotals.length > 0 && <> · {formatCurrencyTotals(activeValueTotals)}</>}
            </span>
          </div>
          <button type="button" onClick={() => setShowQuickAdd(true)}
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium bg-foreground text-background px-3 py-1.5 rounded-lg hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-3.5 w-3.5" /> {copy.add}
          </button>
        </div>
        {/* Nav row */}
        <nav aria-label={copy.navigation} className="flex items-center gap-1 mt-3 -mb-px">
          {([
            { id: 'gallery' as const, icon: Gem, label: copy.gallery },
            { id: 'auction' as const, icon: Gavel, label: copy.auction },
            { id: 'leaderboard' as const, icon: Crown, label: copy.rankings },
            { id: 'acquired' as const, icon: ShoppingBag, label: copy.acquired },
          ] as const).map((tab) => (
            <button key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-pressed={view === tab.id}
              onClick={() => { if (tab.id === 'auction') startNewDuel(); setView(tab.id); }}
              className={cn(
                'flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto',
                view === tab.id
                  ? 'bg-foreground/8 text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}>
              <tab.icon className="h-3 w-3" strokeWidth={1.5} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ── Gallery body — 3D room ────────────────── */}
      <div className="max-w-6xl mx-auto w-full vault-wall min-h-[60vh]">
        {activeItems.length === 0 ? (
          <div className="text-center py-24 px-4 text-muted-foreground/60">
            <Gem className="h-10 w-10 mx-auto mb-4 text-muted-foreground/20" strokeWidth={1} />
            <p className="text-lg font-medium">{copy.empty}</p>
            <p className="text-sm mt-1 mb-4">{copy.emptyDescription}</p>
            <button type="button" onClick={() => setShowQuickAdd(true)}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="h-3.5 w-3.5" /> {copy.addFirst}
            </button>
          </div>
        ) : (
          <>
            {/* ── Hero / Featured Piece ──────────────── */}
            {heroItem && (
              <div className="px-4 lg:px-8 pt-8 lg:pt-12 pb-2">
                <button
                  onClick={() => setExpandedCard(expandedCard === heroItem.id ? null : heroItem.id)}
                  aria-expanded={expandedCard === heroItem.id}
                  className="w-full min-h-11 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
                >
                  <div className="relative overflow-hidden rounded-2xl vault-frame bg-background">
                    {/* Ambient ceiling light */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/[0.02] dark:from-white/[0.02] dark:to-black/5 pointer-events-none" />
                    <div className="flex flex-col sm:flex-row items-center relative">
                      {/* Hero image — spotlit */}
                      {heroItem.imageUrl ? (
                        <div className="w-full sm:w-1/2 aspect-square sm:aspect-auto sm:h-64 lg:h-80 flex items-center justify-center p-6 lg:p-12 vault-spotlight">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={heroItem.imageUrl} alt={heroItem.name} loading="eager" fetchPriority="high" decoding="async" referrerPolicy="no-referrer"
                            className="max-w-full max-h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-transform duration-700 group-hover:scale-[1.03]" />
                        </div>
                      ) : (
                        <div className="w-full sm:w-1/2 h-48 sm:h-64 lg:h-80 flex items-center justify-center vault-spotlight">
                          {(() => { const I = getCategoryIcon(heroItem.category); return <I className="h-20 w-20 text-muted-foreground/6" strokeWidth={0.3} />; })()}
                        </div>
                      )}
                      {/* Hero placard */}
                      <div className="flex-1 p-5 sm:p-8 lg:p-10 sm:border-l border-border/30">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-2">{copy.featured}</p>
                        <h2 className="text-lg lg:text-2xl font-semibold tracking-tight leading-snug mb-3">{heroItem.name}</h2>
                        {heroItem.price !== undefined && (
                          <p className="text-sm lg:text-base font-medium tabular-nums text-muted-foreground/80 mb-3">
                            {heroItem.priceEstimated && '~'}{formatPrice(heroItem.price, heroItem.currency)}
                            {heroItem.priceEstimated && <span className="ml-1 text-[10px] text-amber-800 dark:text-amber-300">{copy.estimated}</span>}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
                          <span className="uppercase tracking-wider">{copy.categories[heroItem.category][0]}</span>
                          {heroItem.duelsPlayed > 0 && <span className="tabular-nums font-mono">{heroItem.elo} {copy.points}</span>}
                          <span>{interpolate(copy.ranked, { rank: rankedItems.findIndex(r => r.id === heroItem.id) + 1 })}</span>
                        </div>
                        {heroItem.notes && (
                          <p className="text-xs text-muted-foreground/60 mt-3 line-clamp-2 leading-relaxed italic">&ldquo;{heroItem.notes}&rdquo;</p>
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
                          <CatIcon className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.5} />
                          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{copy.categories[cat.id][1]}</h2>
                          <span className="text-[10px] text-muted-foreground/35 tabular-nums">{displayItems.length}</span>
                        </div>
                        <div className="flex-1" />
                      </div>
                    </div>

                    {/* Pieces on the wall — perspective grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 lg:gap-x-6 lg:gap-y-10">
                      {displayItems.map((item) => {
                        const rank = rankedItems.findIndex(r => r.id === item.id) + 1;
                        const hasImage = !!item.imageUrl;
                        return (
                          <div key={item.id}
                            className="group relative"
                            style={{ transformStyle: 'preserve-3d' }}
                          >
                            <button type="button" aria-label={item.name} onClick={() => setExpandedCard(item.id)} className="absolute inset-0 z-[1] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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
                              <div className="relative flex items-center justify-center overflow-hidden vault-spotlight aspect-[4/3] p-3 lg:p-4">
                                {/* Inner mat border */}
                                <div className="absolute inset-2 lg:inset-3 border border-border/30 rounded-sm pointer-events-none" />
                                {hasImage ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                                      className="max-w-[80%] max-h-[80%] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-transform duration-500 group-hover:scale-[1.04]" />
                                  </>
                                ) : (
                                  <CatIcon className="h-8 w-8 lg:h-10 lg:w-10 text-muted-foreground/10" strokeWidth={0.5} />
                                )}
                                {/* Rank — engraved corner */}
                                {rank > 0 && item.duelsPlayed > 0 && (
                                  <div className="absolute top-2 right-2 lg:top-2.5 lg:right-2.5">
                                    <span className="text-[8px] lg:text-[9px] font-mono font-semibold text-muted-foreground/40 tabular-nums">
                                      #{rank}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Name placard — small brass-style plate */}
                              <div className="px-3 py-2.5 lg:px-4 lg:py-3 border-t border-border/40">
                                <p className="text-[11px] lg:text-[12.5px] font-medium tracking-tight leading-snug line-clamp-2">{item.name}</p>
                                <div className="flex items-baseline justify-between mt-1 gap-2">
                                  {item.price !== undefined ? (
                                    <span className={cn('text-[10px] lg:text-[11px] tabular-nums font-medium',
                                      item.priceEstimated ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground/60')}>
                                      {item.priceEstimated && '~'}{formatPrice(item.price, item.currency)}
                                    </span>
                                  ) : (
                                    <span />
                                  )}
                                  {item.url && (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                                      aria-label={interpolate(copy.source, { name: item.name })}
                                      className="relative z-[2] flex h-11 w-11 items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
        return (
          <Dialog open onOpenChange={(open) => {
            if (!open) setExpandedCard(null);
          }}>
            <DialogContent
              showCloseButton={false}
              aria-describedby={undefined}
              className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 vault-frame"
              style={{ boxShadow: '0 0 80px -20px rgba(0,0,0,0.3), 0 12px 40px -10px rgba(0,0,0,0.2)' }}
            >
              <DialogTitle className="sr-only">{item.name}</DialogTitle>
              {/* Close */}
              <button type="button" onClick={() => setExpandedCard(null)} aria-label={copy.closeDetails}
                className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground lg:h-9 lg:w-9">
                <X className="h-4 w-4" />
              </button>

              {/* Image — spotlit on the wall */}
              <div className="vault-spotlight flex items-center justify-center min-h-[220px] sm:min-h-[300px] p-8 sm:p-14 shrink-0 relative">
                {/* Inner mat line */}
                <div className="absolute inset-4 sm:inset-6 border border-border/15 rounded-md pointer-events-none" />
                {item.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.name} decoding="async" referrerPolicy="no-referrer"
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
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
                    {copy.categories[item.category][1] || catLabel?.label}
                  </span>
                  {rank > 0 && item.duelsPlayed > 0 && (
                    <span className="text-[10px] text-muted-foreground/35 tabular-nums font-mono">{interpolate(copy.rank, { rank })}</span>
                  )}
                </div>

                <h2 className="text-lg sm:text-xl font-semibold tracking-tight leading-snug mb-3">{item.name}</h2>

                <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 mb-4 text-sm text-muted-foreground/70">
                  {item.price !== undefined && (
                    <span className={cn('font-medium tabular-nums', item.priceEstimated && 'text-amber-800 dark:text-amber-300')}>
                      {item.priceEstimated && '~'}{formatPrice(item.price, item.currency)}
                      {item.priceEstimated && (
                        <button onClick={() => updateItem(item.id, { priceEstimated: false })}
                          type="button"
                          aria-label={copy.confirmPrice}
                          className="ml-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-400/80 text-amber-950 hover:bg-emerald-500 hover:text-white transition-colors align-middle lg:h-5 lg:w-5"
                          title={copy.confirmPrice}>
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </button>
                      )}
                    </span>
                  )}
                  <span className="text-xs">{copy.rarity[rarity]}</span>
                  {item.duelsPlayed > 0 && (
                    <span className="text-xs tabular-nums font-mono">{item.elo} {copy.points} · {item.duelsWon}W–{item.duelsPlayed - item.duelsWon}L</span>
                  )}
                  <span className="text-xs">{new Date(item.addedAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>

                {item.notes && (
                  <p className="text-sm text-muted-foreground/60 leading-relaxed mb-4 italic">&ldquo;{item.notes}&rdquo;</p>
                )}

                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    aria-label={interpolate(copy.source, { name: item.name })}
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ExternalLink className="h-3 w-3" /> {copy.viewSource}
                  </a>
                )}

                <div className="flex items-center gap-2 pt-4 border-t border-border/30">
                  <button type="button" onClick={() => { acquireItem(item.id); setExpandedCard(null); }}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-foreground text-background hover:opacity-90 transition-all">
                    <ShoppingBag className="h-3.5 w-3.5" /> {copy.acquiredAction}
                  </button>
                  <button type="button" onClick={() => { openEdit(item); setExpandedCard(null); }}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-border/60">
                    <Edit3 className="h-3.5 w-3.5" /> {copy.edit}
                  </button>
                  <button type="button" onClick={() => { removeItem(item.id); setExpandedCard(null); }}
                    className="ml-auto flex min-h-11 items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-xs text-muted-foreground transition-all hover:bg-destructive/5 hover:text-destructive">
                    <Archive className="h-3.5 w-3.5" /> {copy.remove}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Quick-add overlay ────────────────────────── */}
      <Dialog open={showQuickAdd} onOpenChange={(open) => {
        if (!open) requestCloseQuickAdd();
      }}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            quickInputRef.current?.focus();
          }}
          className="bottom-0 top-auto max-h-[85dvh] max-w-none translate-y-0 gap-0 overflow-y-auto rounded-b-none rounded-t-2xl p-4 sm:bottom-auto sm:top-1/2 sm:max-w-md sm:-translate-y-1/2 sm:rounded-2xl sm:p-5"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <DialogTitle className="text-sm font-semibold">{copy.addTitle}</DialogTitle>
              <button type="button" onClick={requestCloseQuickAdd} aria-label={copy.closeAdd}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground lg:h-9 lg:w-9">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* URL / Name input */}
            <label htmlFor="wishlist-quick-name" className="mb-1.5 block text-xs text-muted-foreground">{copy.productInput}</label>
            <div className="relative">
              <input id="wishlist-quick-name" ref={quickInputRef} aria-busy={quickScraping} value={quickName} onChange={(e) => {
                setQuickName(e.target.value);
                // Auto-scrape if URL pasted
                if (isUrl(e.target.value)) {
                  if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);
                  scrapeTimeoutRef.current = setTimeout(() => scrapeUrl(e.target.value), 600);
                }
              }}
                placeholder={copy.paste}
                onKeyDown={(e) => { if (e.key === 'Enter' && !quickExpanded) { if (isUrl(quickName)) { scrapeUrl(quickName); } else { setQuickExpanded(true); } } else if (e.key === 'Enter' && quickExpanded) { handleQuickAdd(); } }}
                className="min-h-11 w-full border border-border bg-transparent px-3 py-2.5 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all pr-10" />
              {quickScraping && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 aria-label={copy.loading} className="h-4 w-4 text-muted-foreground/50 animate-spin" />
                </div>
              )}
            </div>

            {quickScrapedSite && (
              <p className="text-[11px] text-muted-foreground/50 mt-1.5 flex items-center gap-1">
                <Globe className="h-3 w-3" /> {interpolate(copy.productDetails, { site: quickScrapedSite })}
              </p>
            )}

            {quickError && (
              <p role="status" className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                {quickError}
              </p>
            )}

            {/* Expanded fields */}
            {quickExpanded && (
              <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                  <div className="min-w-0">
                    <label htmlFor="wishlist-quick-price" className="mb-1.5 block text-xs text-muted-foreground">{copy.price}</label>
                    <input id="wishlist-quick-price" value={quickPrice} onChange={(e) => setQuickPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder="—" type="text" inputMode="decimal"
                      className="min-h-11 w-full min-w-0 border border-border bg-transparent px-3 py-2 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 tabular-nums" />
                  </div>
                  <div>
                    <label htmlFor="wishlist-quick-currency" className="mb-1.5 block text-xs text-muted-foreground">{copy.currency}</label>
                    <select id="wishlist-quick-currency" value={quickCurrency} onChange={(e) => setQuickCurrency(e.target.value)}
                      className="min-h-11 w-full border border-border bg-background px-2 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground/20">
                      {SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="wishlist-quick-url" className="mb-1.5 block text-xs text-muted-foreground">{copy.link}</label>
                    <input id="wishlist-quick-url" value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)}
                      placeholder="https://..." type="url"
                      className="min-h-11 w-full min-w-0 border border-border bg-transparent px-3 py-2 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="wishlist-quick-image-url" className="mb-1.5 block text-xs text-muted-foreground">{copy.imageUrl}</label>
                    <input id="wishlist-quick-image-url" value={quickImageUrl} onChange={(e) => setQuickImageUrl(e.target.value)}
                      placeholder="https://..." type="url"
                      className="min-h-11 w-full min-w-0 border border-border bg-transparent px-3 py-2 text-sm rounded-lg placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                  </div>
                </div>

                {/* Category pills */}
                <fieldset>
                  <legend className="mb-1.5 text-xs text-muted-foreground">{copy.category}</legend>
                  <div className="flex flex-wrap gap-1">
                    {VAULT_CATEGORIES.map((cat) => {
                      const Icon = CATEGORY_ICONS[cat.icon] || Package;
                      const sel = quickCategory === cat.id;
                      return (
                        <button type="button" key={cat.id} onClick={() => setQuickCategory(cat.id)} aria-pressed={sel}
                          className={cn('flex min-h-11 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            sel ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30')}>
                          <Icon className="h-2.5 w-2.5" strokeWidth={1.5} />{copy.categories[cat.id][0]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="wishlist-quick-notes" className="mb-1.5 block text-xs text-muted-foreground">{copy.notes}</label>
                  <textarea id="wishlist-quick-notes" value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)}
                    placeholder={copy.whyWant} rows={3}
                    className="min-h-[88px] w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4">
              {!quickExpanded && quickName.trim() && !isUrl(quickName) && (
                <button type="button" onClick={() => setQuickExpanded(true)}
                  className="min-h-11 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  {copy.more}
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {quickExpanded && (
                  <button type="button" onClick={() => { setQuickExpanded(false); }}
                    className="min-h-11 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                    {copy.less}
                  </button>
                )}
                <button type="button" onClick={handleQuickAdd} disabled={!quickName.trim() || quickScraping}
                  className={cn('inline-flex min-h-11 items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all',
                    quickName.trim() && !quickScraping
                      ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
                      : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                  <Plus className="h-3.5 w-3.5" /> {copy.add}
                </button>
              </div>
            </div>
        </DialogContent>
      </Dialog>
      <DraftDiscardDialog
        open={discardTarget === 'quick'}
        title={copy.discardTitle}
        description={copy.discardDescription}
        keepLabel={copy.keepEditing}
        discardLabel={copy.discard}
        onKeep={() => setDiscardTarget(null)}
        onDiscard={() => {
          setDiscardTarget(null);
          closeQuickAdd();
        }}
      />
    </div>
  );
}
