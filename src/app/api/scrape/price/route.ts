import { NextRequest, NextResponse } from 'next/server';
import {
  acquireConcurrency,
  checkDistributedScrapeRateLimit,
  checkRateLimit,
} from '@/lib/server/rate-limit';
import { authErrorResponse, requireFirebaseUser } from '@/lib/server/firebase-auth';
import { readResponseText } from '@/lib/server/url-safety';
import { AMOUNT_PATTERN, normalizePrice } from '@/lib/server/scrape-parsing';
import {
  BoundedJsonError,
  hasOnlyObjectKeys,
  readBoundedJsonObject,
} from '@/lib/server/bounded-json';

// ═══════════════════════════════════════════════════════════
// Threadmap — Google Price Search Fallback
// For items where the scraper couldn't find a price (SPA sites
// like LEGO.com), we search Google Shopping and extract prices
// from the search results. No API key needed.
// ═══════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const preAuthLimited = checkRateLimit(request, {
    name: 'scrape-auth', max: 30, windowMs: 60_000,
  });
  if (preAuthLimited) return preAuthLimited;

  let user;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    user = await requireFirebaseUser(request);
  } catch (error) {
    return authErrorResponse(error) || NextResponse.json({ error: 'Authentication failed.' }, { status: 500 });
  }
  const rateLimited = checkRateLimit(request, {
    name: 'scrape-price', max: 10, windowMs: 60_000, identity: user.uid,
  });
  if (rateLimited) return rateLimited;

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request);
  } catch (error) {
    const status = error instanceof BoundedJsonError ? error.status : 400;
    return NextResponse.json({ error: 'Invalid price lookup request.' }, { status });
  }
  if (!hasOnlyObjectKeys(body, ['query']) || typeof body.query !== 'string' || !body.query.trim()) {
    return NextResponse.json({ error: 'A product search term is required.' }, { status: 400 });
  }
  const query = body.query.trim();
  if (query.length > 160) {
    return NextResponse.json({ error: 'Query too long' }, { status: 400 });
  }

  const sharedRateLimited = await checkDistributedScrapeRateLimit(request, user.uid);
  if (sharedRateLimited) return sharedRateLimited;

  const release = acquireConcurrency('scrape', user.uid, 2);
  if (!release) {
    return NextResponse.json(
      { code: 'SCRAPE_BUSY', error: 'Too many product imports are already running.' },
      { status: 429, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } }
    );
  }

  try {
    // Search Google Shopping for the product price
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' preis')}&hl=de&gl=de`;

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: `Google returned ${response.status}` }, { status: 502 });
    }

    const html = await readResponseText(response, 600_000);

    // Google embeds prices in various formats in search results
    const prices: { value: number; currency: string; source?: string }[] = [];

    // Pattern 1: Euro prices like "199,99 €" or "€199.99" or "EUR 1.234,56"
    const euroPrices = html.matchAll(
      new RegExp(`(${AMOUNT_PATTERN})\\s*€|€\\s*(${AMOUNT_PATTERN})|EUR\\s*(${AMOUNT_PATTERN})`, 'gi')
    );
    for (const m of euroPrices) {
      const value = parseFloat(normalizePrice(m[1] || m[2] || m[3]) ?? '');
      if (Number.isFinite(value) && value > 0 && value < 100000) {
        prices.push({ value, currency: 'EUR' });
      }
    }

    // Pattern 2: Dollar prices like "$199.99" or "1,299.99 USD"
    const dollarPrices = html.matchAll(
      new RegExp(`\\$\\s*(${AMOUNT_PATTERN})|(${AMOUNT_PATTERN})\\s*(?:USD|\\$)`, 'gi')
    );
    for (const m of dollarPrices) {
      const value = parseFloat(normalizePrice(m[1] || m[2]) ?? '');
      if (Number.isFinite(value) && value > 0 && value < 100000) {
        prices.push({ value, currency: 'USD' });
      }
    }

    // Pattern 3: Pound prices
    const poundPrices = html.matchAll(
      new RegExp(`£\\s*(${AMOUNT_PATTERN})|(${AMOUNT_PATTERN})\\s*(?:GBP|£)`, 'gi')
    );
    for (const m of poundPrices) {
      const value = parseFloat(normalizePrice(m[1] || m[2]) ?? '');
      if (Number.isFinite(value) && value > 0 && value < 100000) {
        prices.push({ value, currency: 'GBP' });
      }
    }

    if (prices.length === 0) {
      return NextResponse.json({ error: 'No prices found' }, { status: 404 });
    }

    // Find the most common price (likely the real retail price)
    const priceMap = new Map<string, number>();
    for (const p of prices) {
      const key = `${p.value.toFixed(2)}_${p.currency}`;
      priceMap.set(key, (priceMap.get(key) || 0) + 1);
    }

    // Sort by frequency, then pick the most common one
    const sorted = [...priceMap.entries()].sort((a, b) => b[1] - a[1]);
    const [bestKey] = sorted[0];
    const [bestValue, bestCurrency] = bestKey.split('_');

    return NextResponse.json(
      {
        price: bestValue,
        currency: bestCurrency,
        allPrices: prices.slice(0, 10),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[THREADMAP] Price search error:', message);
    if ((err as { name?: string })?.name === 'AbortError') {
      return NextResponse.json({ error: 'Price lookup timed out.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Price lookup failed.' }, { status: 502 });
  } finally {
    if (timeout) clearTimeout(timeout);
    release();
  }
}
