import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// ORBIT — URL Metadata Scraper
// Fetches Open Graph / meta tags from a URL for quick-add.
// Runs server-side to avoid CORS issues.
// ═══════════════════════════════════════════════════════════

export interface ScrapeResult {
  title?: string;
  image?: string;
  price?: string;
  currency?: string;
  description?: string;
  siteName?: string;
}

function extractMeta(html: string, url: string): ScrapeResult {
  const get = (pattern: RegExp): string | undefined => {
    const match = html.match(pattern);
    return match?.[1]?.trim();
  };

  // Decode HTML entities
  const decode = (str: string | undefined) => {
    if (!str) return str;
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
  };

  // Title: og:title > twitter:title > <title>
  const title = decode(
    get(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ??
    get(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<title[^>]*>([^<]+)<\/title>/i)
  );

  // Image: og:image > twitter:image
  let image =
    get(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ??
    get(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);

  // Make relative image URLs absolute
  if (image && !image.startsWith('http')) {
    try {
      const base = new URL(url);
      image = new URL(image, base.origin).href;
    } catch { /* ignore */ }
  }

  // Price: og:price:amount > product:price:amount > schema.org price patterns
  const priceRaw =
    get(/<meta[^>]*property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:price:amount["']/i) ??
    get(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:amount["']/i) ??
    // JSON-LD price
    get(/"price"\s*:\s*"?(\d+[.,]?\d*)"?/i) ??
    // Common price patterns in HTML (e.g. Amazon, shops)
    get(/class="[^"]*price[^"]*"[^>]*>[\s$€£¥]*(\d+[.,]?\d*)/i);

  // Currency: og:price:currency > product:price:currency
  const currency =
    get(/<meta[^>]*property=["']og:price:currency["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:price:currency["']/i) ??
    get(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:currency["']/i) ??
    get(/"priceCurrency"\s*:\s*"([A-Z]{3})"/i);

  // Description
  const description = decode(
    get(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ??
    get(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
  );

  // Site name
  const siteName = decode(
    get(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ??
    get(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i)
  );

  // Clean the price
  const price = priceRaw?.replace(/[^\d.,]/g, '').replace(',', '.');

  return { title, image, price, currency, description, siteName };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Validate URL
    new URL(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OrbitBot/1.0; +https://orbit.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: `HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({ error: 'Not an HTML page' }, { status: 400 });
    }

    // Only read first 100KB to avoid huge pages
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 502 });
    }

    let html = '';
    const decoder = new TextDecoder();
    const maxBytes = 100_000;
    let bytesRead = 0;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.length;
    }
    reader.cancel();

    const result = extractMeta(html, url);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ORBIT] Scrape error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
