import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return nums;
}

export function isPrivateIpAddress(ip: string): boolean {
  const normalized = ip.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpAddress(mappedIpv4);

  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('ff')
    );
  }

  return true;
}

export function parseHttpUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not supported.');
  }
  if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    throw new Error('Local network URLs are not supported.');
  }
  if (isIP(parsed.hostname) && isPrivateIpAddress(parsed.hostname)) {
    throw new Error('Local network URLs are not supported.');
  }
  return parsed;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = parseHttpUrl(rawUrl);
  if (isIP(parsed.hostname)) return parsed;

  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('URL host could not be resolved.');
  }
  if (addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error('Local network URLs are not supported.');
  }

  return parsed;
}

export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 3
): Promise<{ response: Response; url: URL }> {
  let currentUrl = await assertPublicHttpUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl.href, { ...init, redirect: 'manual' });
    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);

    if (!isRedirect) return { response, url: currentUrl };
    currentUrl = await assertPublicHttpUrl(new URL(location!, currentUrl).href);
  }

  throw new Error('Too many redirects.');
}
