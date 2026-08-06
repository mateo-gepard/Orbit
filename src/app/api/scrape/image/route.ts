import { NextRequest, NextResponse } from 'next/server';
import {
  acquireConcurrency,
  checkDistributedScrapeRateLimit,
  checkRateLimit,
} from '@/lib/server/rate-limit';
import { authErrorResponse, requireFirebaseUser } from '@/lib/server/firebase-auth';
import { readResponseText } from '@/lib/server/url-safety';

// ═══════════════════════════════════════════════════════════
// Threadmap — Product Image & Price Search (Multi-source)
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
  if (!url || url.length > 2_048) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
  } catch {
    return false;
  }
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
async function searchGoogleApi(query: string, signal: AbortSignal): Promise<{ image?: string; price?: string }> {
  if (!API_KEY || !CX) return {};
  try {
    const params = new URLSearchParams({
      key: API_KEY, cx: CX, q: query, num: '5', gl: 'de', hl: 'de',
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal,
    });
    if (!res.ok) {
      console.error(`[THREADMAP] Google API ${res.status}`);
      return {};
    }
    const data = JSON.parse(await readResponseText(res, 1_000_000));
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
          result.price = String(price).slice(0, 32);
        } else if (item.snippet) {
          const m = item.snippet.match(/(\d{1,6}[.,]\d{2})\s*€|€\s*(\d{1,6}[.,]\d{2})/);
          if (m) result.price = (m[1] || m[2]).replace(',', '.');
        }
      }
      if (result.image && result.price) break;
    }
    return result;
  } catch (e) {
    console.error('[THREADMAP] Google API error:', e);
    return {};
  }
}

// ── 2. Bing Images (primary scraping source) ─────────────
async function searchBingImages(query: string, signal: AbortSignal): Promise<string[]> {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1&count=15&qft=+filterui:photo-photo`;
    const res = await fetch(url, {
      signal,
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) {
      console.error(`[THREADMAP] Bing ${res.status}`);
      return [];
    }
    const html = await readResponseText(res, 600_000);
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
    console.error('[THREADMAP] Bing error:', e);
    return [];
  }
}

// ── 3. DuckDuckGo (vqd token → d.js endpoint) ───────────
async function searchDuckDuckGo(query: string, signal: AbortSignal): Promise<string[]> {
  try {
    // Step 1: Get vqd token from the search page
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const pageRes = await fetch(searchUrl, {
      signal,
      headers: BROWSER_HEADERS,
    });
    if (!pageRes.ok) return [];
    const pageHtml = await readResponseText(pageRes, 600_000);

    const vqdMatch = pageHtml.match(/vqd=["']([^"']+)["']/i) ?? pageHtml.match(/vqd=([\d-]+)/i);
    if (!vqdMatch) {
      console.error('[THREADMAP] DDG: no vqd token found');
      return [];
    }
    const vqd = vqdMatch[1];

    // Step 2: Hit the images JSON endpoint
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,,,&p=1`;
    const imgRes = await fetch(imgUrl, {
      signal,
      headers: {
        ...BROWSER_HEADERS,
        Referer: 'https://duckduckgo.com/',
      },
    });
    if (!imgRes.ok) return [];
    const data = JSON.parse(await readResponseText(imgRes, 1_000_000));

    const images: string[] = [];
    for (const r of data.results || []) {
      if (r.image && isGoodImage(r.image)) images.push(r.image);
      if (images.length >= 10) break;
    }
    return images;
  } catch (e) {
    console.error('[THREADMAP] DDG error:', e);
    return [];
  }
}

// ── 4. Google Images scraping (last resort) ──────────────
async function searchGoogleImages(query: string, signal: AbortSignal): Promise<string[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en`;
    const res = await fetch(url, {
      signal,
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) return [];
    const html = await readResponseText(res, 600_000);
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
    console.error('[THREADMAP] Google Images error:', e);
    return [];
  }
}

// ── 5. Scrape price from search engine snippets ──────────
async function scrapePrice(query: string, signal: AbortSignal): Promise<string | undefined> {
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
      signal,
      headers: plainHeaders,
    });
    if (bingRes.ok) {
      const html = await readResponseText(bingRes, 600_000);
      extractPrices(html);
      console.log(`[THREADMAP] Bing price: found ${prices.length} candidates`);
    }
  } catch (e) {
    console.error('[THREADMAP] Bing price error:', e);
  }

  // 2. Bing Shopping tab (has structured price data)
  if (prices.length === 0) {
    try {
      const shopUrl = `https://www.bing.com/shop?q=${encodeURIComponent(query)}&FORM=SHOPTB`;
      const shopRes = await fetch(shopUrl, {
        signal,
        headers: plainHeaders,
      });
      if (shopRes.ok) {
        const html = await readResponseText(shopRes, 600_000);
        extractPrices(html);
        console.log(`[THREADMAP] Bing Shopping: found ${prices.length} candidates`);
      }
    } catch (e) {
      console.error('[THREADMAP] Bing Shopping error:', e);
    }
  }

  // 3. Google web search (backup)
  if (prices.length === 0) {
    try {
      const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' Preis €')}&hl=de&gl=de`;
      const gRes = await fetch(gUrl, {
        signal,
        headers: plainHeaders,
      });
      if (gRes.ok) {
        const html = await readResponseText(gRes, 600_000);
        extractPrices(html);
        console.log(`[THREADMAP] Google price: found ${prices.length} candidates`);
      }
    } catch (e) {
      console.error('[THREADMAP] Google price error:', e);
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
  const preAuthLimited = checkRateLimit(request, {
    name: 'scrape-auth', max: 30, windowMs: 60_000,
  });
  if (preAuthLimited) return preAuthLimited;

  let user;
  try {
    user = await requireFirebaseUser(request);
  } catch (error) {
    return authErrorResponse(error) || NextResponse.json({ error: 'Authentication failed.' }, { status: 500 });
  }
  const rateLimited = checkRateLimit(request, {
    name: 'scrape-image', max: 6, windowMs: 60_000, identity: user.uid,
  });
  if (rateLimited) return rateLimited;

  const query = request.nextUrl.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    // All independent sources share one route-wide deadline. DDG and price
    // retain their internal dependent steps, but cannot extend total runtime.
    const [apiResult, bingImages, ddgImages, googleImages, scrapedPrice] = await Promise.all([
      searchGoogleApi(query, controller.signal),
      searchBingImages(`${query} product`, controller.signal),
      searchDuckDuckGo(`${query} product`, controller.signal),
      searchGoogleImages(`${query} product`, controller.signal),
      scrapePrice(query, controller.signal),
    ]);
    const image = [apiResult.image, bingImages[0], ddgImages[0], googleImages[0]]
      .find((candidate): candidate is string => Boolean(candidate && isGoodImage(candidate)));
    const rawPrice = apiResult.price || scrapedPrice;
    const price = rawPrice?.match(/^\d{1,8}(?:[.,]\d{1,2})?/)?.[0]?.replace(',', '.');
    const result: { image?: string; price?: string } = { image, price };

    if (controller.signal.aborted) {
      return NextResponse.json({ error: 'Product search timed out.' }, { status: 504 });
    }

    if (!result.image && !result.price) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }

    console.log(`[THREADMAP] Result: image=${!!result.image}, price=${result.price ?? 'none'}`);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[THREADMAP] Search error:', message);
    if ((err as { name?: string })?.name === 'AbortError') {
      return NextResponse.json({ error: 'Product search timed out.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Product search failed.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
    release();
  }
}
