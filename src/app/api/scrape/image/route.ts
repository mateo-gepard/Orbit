import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// ORBIT — Product Image & Price Search (Multi-source)
//
// Waterfall: Bing Images → DuckDuckGo → Google Images
// No API key required — works out of the box.
// If Google Custom Search API env vars are set, tries it first.
// ═══════════════════════════════════════════════════════════

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Sec-CH-UA': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"macOS"',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const CX = process.env.GOOGLE_SEARCH_CX;

function isGoodImage(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  // Skip search engine / CDN noise
  const blocked = [
    'gstatic.com', 'google.com', 'googleapis.com',
    'bing.com', 'bing.net', 'microsoft.com',
    'duckduckgo.com', 'wikipedia.org/static',
    'pixel.gif', '1x1', 'spacer', 'tracking',
  ];
  return !blocked.some((b) => url.includes(b));
}

// ── 1. Google Custom Search API (optional) ───────────────
async function searchGoogleApi(query: string): Promise<{ image?: string; price?: string }> {
  if (!API_KEY || !CX) return {};
  try {
    const params = new URLSearchParams({
      key: API_KEY, cx: CX, q: query, num: '5', gl: 'de', hl: 'de',
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[ORBIT] Google API ${res.status}`);
      return {};
    }
    const data = await res.json();
    const result: { image?: string; price?: string } = {};
    for (const item of data.items || []) {
      if (!result.image) {
        const pm = item.pagemap;
        const img =
          pm?.cse_image?.[0]?.src ??
          pm?.cse_thumbnail?.[0]?.src ??
          pm?.metatags?.[0]?.['og:image'];
        if (img && isGoodImage(img)) result.image = img;
      }
      if (!result.price) {
        const price =
          item.pagemap?.offer?.[0]?.price ??
          item.pagemap?.product?.[0]?.price;
        if (price) {
          result.price = price;
        } else if (item.snippet) {
          const m = item.snippet.match(/(\d{1,6}[.,]\d{2})\s*€|€\s*(\d{1,6}[.,]\d{2})/);
          if (m) result.price = (m[1] || m[2]).replace(',', '.');
        }
      }
      if (result.image && result.price) break;
    }
    return result;
  } catch (e) {
    console.error('[ORBIT] Google API error:', e);
    return {};
  }
}

// ── 2. Bing Images (primary scraping source) ─────────────
async function searchBingImages(query: string): Promise<string[]> {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1&count=15&qft=+filterui:photo-photo`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) {
      console.error(`[ORBIT] Bing ${res.status}`);
      return [];
    }
    const html = await res.text();
    const images: string[] = [];

    // Bing stores full-res URLs in "murl":"..." inside m= JSON attrs
    for (const m of html.matchAll(/"murl"\s*:\s*"(https?:\/\/[^"]+)"/gi)) {
      if (isGoodImage(m[1])) images.push(m[1]);
    }

    // Also try data-m JSON blobs
    for (const m of html.matchAll(/data-m=["'](\{[^"']*\})["']/gi)) {
      try {
        const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const parsed = JSON.parse(json);
        if (parsed.murl && isGoodImage(parsed.murl)) images.push(parsed.murl);
      } catch { /* skip */ }
    }

    // Fallback: src2/data-src on thumbnails
    if (images.length === 0) {
      for (const m of html.matchAll(/(?:src2|data-src)=["'](https?:\/\/[^"']+)["']/gi)) {
        if (isGoodImage(m[1])) images.push(m[1]);
      }
    }

    return [...new Set(images)];
  } catch (e) {
    console.error('[ORBIT] Bing error:', e);
    return [];
  }
}

// ── 3. DuckDuckGo (vqd token → d.js endpoint) ───────────
async function searchDuckDuckGo(query: string): Promise<string[]> {
  try {
    // Step 1: Get vqd token from the search page
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const pageRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(5000),
      headers: BROWSER_HEADERS,
    });
    if (!pageRes.ok) return [];
    const pageHtml = await pageRes.text();

    const vqdMatch = pageHtml.match(/vqd=["']([^"']+)["']/i) ?? pageHtml.match(/vqd=([\d-]+)/i);
    if (!vqdMatch) {
      console.error('[ORBIT] DDG: no vqd token found');
      return [];
    }
    const vqd = vqdMatch[1];

    // Step 2: Hit the images JSON endpoint
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,,,&p=1`;
    const imgRes = await fetch(imgUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        ...BROWSER_HEADERS,
        Referer: 'https://duckduckgo.com/',
      },
    });
    if (!imgRes.ok) return [];
    const data = await imgRes.json();

    const images: string[] = [];
    for (const r of data.results || []) {
      if (r.image && isGoodImage(r.image)) images.push(r.image);
      if (images.length >= 10) break;
    }
    return images;
  } catch (e) {
    console.error('[ORBIT] DDG error:', e);
    return [];
  }
}

// ── 4. Google Images scraping (last resort) ──────────────
async function searchGoogleImages(query: string): Promise<string[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) return [];
    const html = await res.text();
    const images: string[] = [];

    // Full-res URLs in JS: ["https://...",width,height]
    for (const m of html.matchAll(
      /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)\]/gi
    )) {
      const w = parseInt(m[2]), h = parseInt(m[3]);
      if (w >= 100 && h >= 100 && isGoodImage(m[1])) images.push(m[1]);
    }

    // imgurl= proxy URLs
    for (const m of html.matchAll(/imgurl=(https?(?:%3A|:)(?:%2F|\/){2}[^&"]+)/gi)) {
      try {
        const decoded = decodeURIComponent(m[1]);
        if (isGoodImage(decoded)) images.push(decoded);
      } catch { /* skip */ }
    }

    return [...new Set(images)];
  } catch (e) {
    console.error('[ORBIT] Google Images error:', e);
    return [];
  }
}

// ── 5. Scrape price from search engine snippets ──────────
async function scrapePrice(query: string): Promise<string | undefined> {
  // Headers that force uncompressed response (critical for Bing)
  const plainHeaders: Record<string, string> = {
    ...BROWSER_HEADERS,
    'Accept-Encoding': 'identity',
  };

  const prices: number[] = [];

  const extractPrices = (html: string) => {
    // € patterns (German/EU)
    for (const m of html.matchAll(/(\d{1,6})[.,](\d{2})\s*€/g)) {
      const val = parseFloat(`${m[1]}.${m[2]}`);
      if (val > 1 && val < 100000) prices.push(val);
    }
    for (const m of html.matchAll(/€\s*(\d{1,6})[.,](\d{2})/g)) {
      const val = parseFloat(`${m[1]}.${m[2]}`);
      if (val > 1 && val < 100000) prices.push(val);
    }
    for (const m of html.matchAll(/(\d{1,6})[.,](\d{2})\s*EUR/gi)) {
      const val = parseFloat(`${m[1]}.${m[2]}`);
      if (val > 1 && val < 100000) prices.push(val);
    }
    // $/ £ patterns
    for (const m of html.matchAll(/[$£]\s*(\d{1,6})\.(\d{2})/g)) {
      const val = parseFloat(`${m[1]}.${m[2]}`);
      if (val > 1 && val < 100000) prices.push(val);
    }
  };

  // 1. Bing web search (most reliable for snippets)
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' Preis €')}`;
    const bingRes = await fetch(bingUrl, {
      signal: AbortSignal.timeout(5000),
      headers: plainHeaders,
    });
    if (bingRes.ok) {
      const html = await bingRes.text();
      extractPrices(html);
      console.log(`[ORBIT] Bing price: found ${prices.length} candidates`);
    }
  } catch (e) {
    console.error('[ORBIT] Bing price error:', e);
  }

  // 2. Bing Shopping tab (has structured price data)
  if (prices.length === 0) {
    try {
      const shopUrl = `https://www.bing.com/shop?q=${encodeURIComponent(query)}&FORM=SHOPTB`;
      const shopRes = await fetch(shopUrl, {
        signal: AbortSignal.timeout(5000),
        headers: plainHeaders,
      });
      if (shopRes.ok) {
        const html = await shopRes.text();
        extractPrices(html);
        console.log(`[ORBIT] Bing Shopping: found ${prices.length} candidates`);
      }
    } catch (e) {
      console.error('[ORBIT] Bing Shopping error:', e);
    }
  }

  // 3. Google web search (backup)
  if (prices.length === 0) {
    try {
      const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' Preis €')}&hl=de&gl=de`;
      const gRes = await fetch(gUrl, {
        signal: AbortSignal.timeout(5000),
        headers: plainHeaders,
      });
      if (gRes.ok) {
        const html = await gRes.text();
        extractPrices(html);
        console.log(`[ORBIT] Google price: found ${prices.length} candidates`);
      }
    } catch (e) {
      console.error('[ORBIT] Google price error:', e);
    }
  }

  if (prices.length === 0) return undefined;

  // Return the median price (avoids shipping costs & outlier noise)
  prices.sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  return median.toFixed(2);
}

// ── Main handler ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  console.log(`[ORBIT] Image/price search: "${query}"`);

  try {
    const result: { image?: string; price?: string } = {};

    // 1. Try Google Custom Search API if configured
    if (API_KEY && CX) {
      const apiResult = await searchGoogleApi(query);
      if (apiResult.image) result.image = apiResult.image;
      if (apiResult.price) result.price = apiResult.price;
    }

    // 2. Bing Images (primary — most reliable for scraping)
    if (!result.image) {
      console.log('[ORBIT] Trying Bing Images...');
      const bingImages = await searchBingImages(query + ' product');
      if (bingImages.length > 0) {
        result.image = bingImages[0];
        console.log(`[ORBIT] Bing found ${bingImages.length} images`);
      }
    }

    // 3. DuckDuckGo (solid alternative with JSON endpoint)
    if (!result.image) {
      console.log('[ORBIT] Trying DuckDuckGo...');
      const ddgImages = await searchDuckDuckGo(query + ' product');
      if (ddgImages.length > 0) {
        result.image = ddgImages[0];
        console.log(`[ORBIT] DDG found ${ddgImages.length} images`);
      }
    }

    // 4. Google Images scraping (last resort)
    if (!result.image) {
      console.log('[ORBIT] Trying Google Images scraping...');
      const googleImages = await searchGoogleImages(query + ' product');
      if (googleImages.length > 0) {
        result.image = googleImages[0];
        console.log(`[ORBIT] Google found ${googleImages.length} images`);
      }
    }

    // 5. Price search (parallel-safe, only if still missing)
    if (!result.price) {
      result.price = await scrapePrice(query);
    }

    if (!result.image && !result.price) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }

    console.log(`[ORBIT] Result: image=${!!result.image}, price=${result.price ?? 'none'}`);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ORBIT] Search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
