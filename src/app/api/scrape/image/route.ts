import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// ORBIT — Google Image Search Fallback
// For items where the scraper couldn't find an OG image,
// we search Google Images and return the first result.
// No API key needed — we scrape the HTML search results page.
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  try {
    // Search Google Images for product photos
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' product')}&tbm=isch&hl=en`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: `Google returned ${response.status}` }, { status: 502 });
    }

    const html = await response.text();

    // Google Images embeds image URLs in various formats.
    // Method 1: Look for data attributes or JSON-embedded image URLs
    const images: string[] = [];

    // Google Images embeds full-res URLs in scripts as ["https://...",width,height]
    // They appear in AF_initDataCallback scripts
    const fullResMatches = html.matchAll(/\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)\]/gi);
    for (const m of fullResMatches) {
      const url = m[1];
      const width = parseInt(m[2]);
      const height = parseInt(m[3]);
      // Skip tiny thumbnails and Google's own assets
      if (width >= 100 && height >= 100 && !url.includes('gstatic.com') && !url.includes('google.com')) {
        images.push(url);
      }
    }

    // Method 2: Base64 encoded thumbnails (less useful but better than nothing)
    // Skip these — prefer actual URLs

    // Method 3: Look for image URLs in data-src or data-iurl attributes
    const dataSrcMatches = html.matchAll(/(?:data-src|data-iurl)=["'](https?:\/\/[^"']+)["']/gi);
    for (const m of dataSrcMatches) {
      if (!m[1].includes('gstatic.com') && !m[1].includes('google.com')) {
        images.push(m[1]);
      }
    }

    // Method 4: Look for image proxy URLs that contain the original URL
    const proxyMatches = html.matchAll(/imgurl=(https?(?:%3A|:)(?:%2F|\/){2}[^&"]+)/gi);
    for (const m of proxyMatches) {
      try {
        const decoded = decodeURIComponent(m[1]);
        if (!decoded.includes('gstatic.com')) {
          images.push(decoded);
        }
      } catch { /* skip malformed URLs */ }
    }

    if (images.length === 0) {
      return NextResponse.json({ error: 'No images found' }, { status: 404 });
    }

    // Deduplicate and return top results
    const unique = [...new Set(images)].slice(0, 5);

    return NextResponse.json(
      { images: unique, image: unique[0] },
      { headers: { 'Cache-Control': 'public, max-age=86400' } } // cache for 1 day
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ORBIT] Image search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
