import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed: ${res.status}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({ error: 'Not an HTML page' }, { status: 400 });
    }

    // Read only the first 200KB to keep things fast
    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'No body' }, { status: 502 });

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 200_000;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    reader.cancel();

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const html = decoder.decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    // Parse meta tags with regex (no DOM on server)
    const getMeta = (names: string[]): string | undefined => {
      for (const name of names) {
        // Match both property="..." and name="..."
        const patterns = [
          new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegex(name)}["']`, 'i'),
        ];
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match?.[1]) return decodeHtmlEntities(match[1]);
        }
      }
      return undefined;
    };

    // Title
    const title =
      getMeta(['og:title', 'twitter:title']) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    // Description
    const description = getMeta([
      'og:description',
      'twitter:description',
      'description',
    ]);

    // Image
    let imageUrl = getMeta(['og:image', 'twitter:image', 'twitter:image:src']);
    // Make relative images absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, parsed.origin).toString();
      } catch { /* keep as-is */ }
    }

    const siteName = getMeta(['og:site_name']);

    // Price from meta tags
    let price: number | undefined;
    let currency: string | undefined;

    const priceStr = getMeta(['product:price:amount', 'og:price:amount']);
    const currStr = getMeta(['product:price:currency', 'og:price:currency']);
    if (priceStr) {
      const p = parseFloat(priceStr);
      if (!isNaN(p)) {
        price = p;
        currency = currStr || undefined;
      }
    }

    // Price from JSON-LD
    if (price == null) {
      const ldMatches = html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      );
      for (const m of ldMatches) {
        try {
          const data = JSON.parse(m[1]);
          const offers = data?.offers;
          const offer = Array.isArray(offers) ? offers[0] : offers;
          if (offer?.price) {
            const p = parseFloat(offer.price);
            if (!isNaN(p)) {
              price = p;
              currency = offer.priceCurrency || undefined;
              break;
            }
          }
          // Also check nested @graph
          if (data?.['@graph']) {
            for (const node of data['@graph']) {
              const o = Array.isArray(node?.offers) ? node.offers[0] : node?.offers;
              if (o?.price) {
                const p = parseFloat(o.price);
                if (!isNaN(p)) {
                  price = p;
                  currency = o.priceCurrency || undefined;
                  break;
                }
              }
            }
          }
        } catch { /* ignore malformed JSON-LD */ }
      }
    }

    return NextResponse.json({
      title: title ? decodeHtmlEntities(title) : undefined,
      description: description ? decodeHtmlEntities(description) : undefined,
      imageUrl,
      price,
      currency,
      siteName: siteName ? decodeHtmlEntities(siteName) : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
