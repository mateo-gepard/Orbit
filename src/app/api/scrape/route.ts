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

  // Decode ALL HTML entities — full map + numeric
  const ENTITY_MAP: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '\u2018', rsquo: '\u2019',
    ldquo: '\u201C', rdquo: '\u201D', bull: '•', hellip: '…',
    trade: '™', copy: '©', reg: '®', euro: '€', pound: '£',
    yen: '¥', cent: '¢', auml: 'ä', Auml: 'Ä', ouml: 'ö',
    Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß', eacute: 'é',
    Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', Ecirc: 'Ê',
    agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', ocirc: 'ô',
    Ocirc: 'Ô', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
    iacute: 'í', Iacute: 'Í', uacute: 'ú', Uacute: 'Ú', oacute: 'ó',
    Oacute: 'Ó', aacute: 'á', Aacute: 'Á', atilde: 'ã', Atilde: 'Ã',
    otilde: 'õ', Otilde: 'Õ', aring: 'å', Aring: 'Å', aelig: 'æ',
    AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', thorn: 'þ', ETH: 'Ð',
    times: '×', divide: '÷', micro: 'µ', para: '¶', sect: '§',
    middot: '·', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿',
  };

  const decode = (str: string | undefined): string | undefined => {
    if (!str) return str;
    return str
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&([a-zA-Z]+);/g, (full, name) => ENTITY_MAP[name] ?? full);
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

/** Extract a human-readable title from a URL path as fallback */
function titleFromUrl(parsed: URL): string | null {
  // Try the last meaningful path segment: /product/ball-star-sneaker → "ball star sneaker"
  const segments = parsed.pathname.split('/').filter(Boolean);
  // Skip numeric-only segments (IDs like /product/337100077)
  const meaningful = segments.filter((s) => !/^\d+$/.test(s) && s.length > 2);
  const last = meaningful.pop();
  if (!last) return null;
  // Remove file extensions, decode URI, replace hyphens/underscores
  const cleaned = decodeURIComponent(last)
    .replace(/\.\w{2,5}$/, '')        // .html, .php, etc.
    .replace(/[-_]+/g, ' ')           // hyphens/underscores → spaces
    .replace(/cod\s*\d+/gi, '')       // remove "cod 8050235..." product codes
    .trim();
  if (cleaned.length < 3) return null;
  // Title-case
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Validate URL
    const parsedUrl = new URL(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Use realistic browser headers — many sites block bot-like User-Agents
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // Fallback: try to extract a title from the URL path
      const fallback = titleFromUrl(parsedUrl);
      if (fallback) {
        return NextResponse.json({ title: fallback, siteName: parsedUrl.hostname.replace('www.', '') }, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
      }
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
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ORBIT] Scrape error:', message);
    // Fallback: try to extract a title from the URL path
    try {
      const parsed = new URL(url);
      const fallback = titleFromUrl(parsed);
      if (fallback) {
        return NextResponse.json({ title: fallback, siteName: parsed.hostname.replace('www.', '') }, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
      }
    } catch { /* ignore */ }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
