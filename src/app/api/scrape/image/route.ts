import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// ORBIT — Google Custom Search Fallback
// For items where the scraper couldn't find an image or price,
// we use Google Custom Search JSON API to find product data.
//
// Requires env vars:
//   GOOGLE_SEARCH_API_KEY — from Google Cloud Console
//   GOOGLE_SEARCH_CX      — Custom Search Engine ID
//
// Falls back to HTML scraping if API keys aren't configured.
// ═══════════════════════════════════════════════════════════

const API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const CX = process.env.GOOGLE_SEARCH_CX;

/** Use Google Custom Search JSON API (clean, structured) */
async function searchWithApi(query: string, searchType?: 'image'): Promise<{ image?: string; price?: string; snippet?: string }> {
  if (!API_KEY || !CX) return {};

  const params = new URLSearchParams({
    key: API_KEY,
    cx: CX,
    q: query,
    num: '5',
    gl: 'de',
    hl: 'de',
  });
  if (searchType === 'image') {
    params.set('searchType', 'image');
    params.set('imgSize', 'large');
  }

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    console.error(`[ORBIT] Google API ${res.status}:`, await res.text().catch(() => ''));
    return {};
  }

  const data = await res.json();
  const result: { image?: string; price?: string; snippet?: string } = {};

  if (searchType === 'image' && data.items?.length) {
    // Image search — return the first image link
    result.image = data.items[0].link;
  } else if (data.items?.length) {
    // Web search — extract image from pagemap and price from snippets
    for (const item of data.items) {
      // Image from pagemap (cse_image, cse_thumbnail, or metatags og:image)
      if (!result.image) {
        const pm = item.pagemap;
        if (pm?.cse_image?.[0]?.src) result.image = pm.cse_image[0].src;
        else if (pm?.cse_thumbnail?.[0]?.src) result.image = pm.cse_thumbnail[0].src;
        else if (pm?.metatags?.[0]?.['og:image']) result.image = pm.metatags[0]['og:image'];
      }

      // Price from pagemap offer
      if (!result.price) {
        const offers = item.pagemap?.offer;
        if (offers?.[0]?.price) result.price = offers[0].price;
        else if (offers?.[0]?.lowprice) result.price = offers[0].lowprice;
      }

      // Price from product pagemap
      if (!result.price) {
        const products = item.pagemap?.product;
        if (products?.[0]?.price) result.price = products[0].price;
      }

      // Price from snippet text (e.g. "ab 199,99 €")
      if (!result.price && item.snippet) {
        const priceMatch = item.snippet.match(/(\d{1,6}[.,]\d{2})\s*€|€\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) {
          result.price = (priceMatch[1] || priceMatch[2]).replace(',', '.');
        }
      }

      if (!result.snippet && item.snippet) {
        result.snippet = item.snippet;
      }

      // Stop if we have both
      if (result.image && result.price) break;
    }
  }

  return result;
}

/** Fallback: scrape Google Images HTML (no API key needed) */
async function searchWithScraping(query: string): Promise<{ image?: string }> {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' product')}&tbm=isch&hl=en`;

  const response = await fetch(searchUrl, {
    signal: AbortSignal.timeout(6000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) return {};

  const html = await response.text();
  const images: string[] = [];

  // Full-res URLs in scripts: ["https://...",width,height]
  const fullResMatches = html.matchAll(/\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)\]/gi);
  for (const m of fullResMatches) {
    const w = parseInt(m[2]), h = parseInt(m[3]);
    if (w >= 100 && h >= 100 && !m[1].includes('gstatic.com') && !m[1].includes('google.com')) {
      images.push(m[1]);
    }
  }

  // data-src / data-iurl attributes
  const dataSrcMatches = html.matchAll(/(?:data-src|data-iurl)=["'](https?:\/\/[^"']+)["']/gi);
  for (const m of dataSrcMatches) {
    if (!m[1].includes('gstatic.com') && !m[1].includes('google.com')) images.push(m[1]);
  }

  // imgurl= proxy URLs
  const proxyMatches = html.matchAll(/imgurl=(https?(?:%3A|:)(?:%2F|\/){2}[^&"]+)/gi);
  for (const m of proxyMatches) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (!decoded.includes('gstatic.com')) images.push(decoded);
    } catch { /* ignore */ }
  }

  const unique = [...new Set(images)];
  return unique.length > 0 ? { image: unique[0] } : {};
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');
  const type = request.nextUrl.searchParams.get('type'); // 'image' | 'price' | 'all' (default)

  if (!query) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  try {
    const result: { image?: string; price?: string; images?: string[] } = {};

    if (API_KEY && CX) {
      // ── Google Custom Search API (preferred) ──
      if (type === 'image') {
        // Image-only search
        const apiResult = await searchWithApi(query, 'image');
        if (apiResult.image) result.image = apiResult.image;
      } else {
        // Web search — gets both image and price from structured data
        const apiResult = await searchWithApi(query);
        if (apiResult.image) result.image = apiResult.image;
        if (apiResult.price) result.price = apiResult.price;

        // If still no image, try image-specific search
        if (!result.image) {
          const imgResult = await searchWithApi(query, 'image');
          if (imgResult.image) result.image = imgResult.image;
        }
      }
    } else {
      // ── Fallback: HTML scraping (no API key) ──
      console.warn('[ORBIT] No GOOGLE_SEARCH_API_KEY/GOOGLE_SEARCH_CX — using HTML scraping fallback');
      const scraped = await searchWithScraping(query);
      if (scraped.image) result.image = scraped.image;
    }

    if (!result.image && !result.price) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ORBIT] Search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
