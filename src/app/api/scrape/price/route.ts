import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// ORBIT — Google Price Search Fallback
// For items where the scraper couldn't find a price (SPA sites
// like LEGO.com), we search Google Shopping and extract prices
// from the search results. No API key needed.
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  try {
    // Search Google Shopping for the product price
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' preis')}&hl=de&gl=de`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: `Google returned ${response.status}` }, { status: 502 });
    }

    const html = await response.text();

    // Google embeds prices in various formats in search results
    const prices: { value: number; currency: string; source?: string }[] = [];

    // Pattern 1: Euro prices like "199,99 €" or "€199.99" or "EUR 199,99"
    const euroPrices = html.matchAll(/(\d{1,6}[.,]\d{2})\s*€|€\s*(\d{1,6}[.,]\d{2})|EUR\s*(\d{1,6}[.,]\d{2})/gi);
    for (const m of euroPrices) {
      const raw = (m[1] || m[2] || m[3]).replace(',', '.');
      const value = parseFloat(raw);
      if (value > 0 && value < 100000) {
        prices.push({ value, currency: 'EUR' });
      }
    }

    // Pattern 2: Dollar prices like "$199.99" or "199.99 USD"
    const dollarPrices = html.matchAll(/\$\s*(\d{1,6}[.,]\d{2})|(\d{1,6}[.,]\d{2})\s*(?:USD|\$)/gi);
    for (const m of dollarPrices) {
      const raw = (m[1] || m[2]).replace(',', '.');
      const value = parseFloat(raw);
      if (value > 0 && value < 100000) {
        prices.push({ value, currency: 'USD' });
      }
    }

    // Pattern 3: Pound prices
    const poundPrices = html.matchAll(/£\s*(\d{1,6}[.,]\d{2})|(\d{1,6}[.,]\d{2})\s*(?:GBP|£)/gi);
    for (const m of poundPrices) {
      const raw = (m[1] || m[2]).replace(',', '.');
      const value = parseFloat(raw);
      if (value > 0 && value < 100000) {
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
      { headers: { 'Cache-Control': 'public, max-age=3600' } } // cache for 1 hour
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ORBIT] Price search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
