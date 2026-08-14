import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function normalizedHostname(parsed: URL): string {
  return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return nums;
}

function parseIpv6(ip: string): number[] | null {
  const withoutZone = ip.split('%', 1)[0].toLowerCase();
  if (withoutZone.split('::').length > 2) return null;
  let value = withoutZone;
  const dottedTail = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dottedTail) {
    const ipv4 = parseIpv4(dottedTail);
    if (!ipv4) return null;
    const replacement = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
    value = value.slice(0, -dottedTail.length) + replacement;
  }
  const [leftRaw, rightRaw = ''] = value.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const zeroCount = value.includes('::') ? 8 - left.length - right.length : 0;
  if (zeroCount < 0 || (!value.includes('::') && left.length !== 8)) return null;
  const parts = [...left, ...Array(zeroCount).fill('0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
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
    const ipv6 = parseIpv6(normalized);
    if (!ipv6) return true;
    const isUnspecified = ipv6.every((part) => part === 0);
    const isLoopback = ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1;
    const isMappedIpv4 = ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff;
    if (isMappedIpv4) {
      return isPrivateIpAddress([
        ipv6[6] >> 8,
        ipv6[6] & 0xff,
        ipv6[7] >> 8,
        ipv6[7] & 0xff,
      ].join('.'));
    }
    return (
      isUnspecified ||
      isLoopback ||
      (ipv6[0] & 0xfe00) === 0xfc00 || // unique-local fc00::/7
      (ipv6[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
      (ipv6[0] & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
      (ipv6[0] & 0xff00) === 0xff00 || // multicast ff00::/8
      (ipv6[0] === 0x0064 && ipv6[1] === 0xff9b) || // NAT64 well-known prefix
      (ipv6[0] === 0x0100 && ipv6.slice(1, 4).every((part) => part === 0)) || // discard-only
      (ipv6[0] === 0x2001 && ipv6[1] === 0x0000) || // Teredo
      (ipv6[0] === 0x2001 && ipv6[1] === 0x0002) || // benchmarking
      (ipv6[0] === 0x2001 && ipv6[1] === 0x0db8) || // documentation
      (ipv6[0] === 0x2001 && (ipv6[1] & 0xfff0) === 0x0020) || // ORCHIDv2
      ipv6[0] === 0x2002 || // 6to4 can encode private IPv4
      (ipv6[0] & 0xfff0) === 0x3ff0 || // documentation 3fff::/20
      (ipv6[0] & 0xe000) !== 0x2000 // permit only global-unicast 2000::/3
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
  const hostname = normalizedHostname(parsed);
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('Local network URLs are not supported.');
  }
  if (isIP(hostname) && isPrivateIpAddress(hostname)) {
    throw new Error('Local network URLs are not supported.');
  }
  const allowedPort = parsed.port === '' ||
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443');
  if (!allowedPort) {
    throw new Error('Non-standard URL ports are not supported.');
  }
  return parsed;
}

async function withAbort<T>(operation: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('The request was aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function assertPublicHttpUrl(rawUrl: string, signal?: AbortSignal | null): Promise<URL> {
  return (await resolvePublicHttpUrl(rawUrl, signal)).url;
}

interface ResolvedPublicUrl {
  url: URL;
  addresses: Array<{ address: string; family: 4 | 6 }>;
}

async function resolvePublicHttpUrl(rawUrl: string, signal?: AbortSignal | null): Promise<ResolvedPublicUrl> {
  const parsed = parseHttpUrl(rawUrl);
  const hostname = normalizedHostname(parsed);
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    return {
      url: parsed,
      addresses: [{ address: hostname, family: literalFamily as 4 | 6 }],
    };
  }

  const addresses = await withAbort(
    lookup(hostname, { all: true, verbatim: true }),
    signal
  );
  if (addresses.length === 0) {
    throw new Error('URL host could not be resolved.');
  }
  if (addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error('Local network URLs are not supported.');
  }

  return {
    url: parsed,
    addresses: addresses.map((entry) => ({
      address: entry.address,
      family: entry.family as 4 | 6,
    })),
  };
}

function pinnedAgent(hostname: string, addresses: ResolvedPublicUrl['addresses']): Agent {
  let cursor = 0;
  const pinnedLookup: LookupFunction = (_requestedHostname, options, callback) => {
    const requestedFamily = typeof options.family === 'number' && options.family !== 0
      ? options.family
      : null;
    const eligible = requestedFamily
      ? addresses.filter((entry) => entry.family === requestedFamily)
      : addresses;
    const hostnameMatches = _requestedHostname.toLowerCase() === hostname.toLowerCase();
    if (eligible.length === 0 || !hostnameMatches) {
      const error = new Error('The validated URL host changed before connection.') as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '', 0);
      return;
    }
    if (options.all) {
      (callback as unknown as (
        error: NodeJS.ErrnoException | null,
        addresses: Array<{ address: string; family: 4 | 6 }>,
      ) => void)(null, eligible);
      return;
    }
    const selected = eligible[cursor % eligible.length];
    cursor += 1;
    callback(null, selected.address, selected.family);
  };
  return new Agent({ connect: { lookup: pinnedLookup } });
}

function responseWithAgentCleanup(response: Response, agent: Agent): Response {
  const reader = response.body?.getReader();
  if (!reader) {
    void agent.close();
    return response;
  }
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void agent.close();
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          cleanup();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        controller.error(error);
        cleanup();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        cleanup();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 3
): Promise<{ response: Response; url: URL }> {
  const signal = init.signal;
  let current = await resolvePublicHttpUrl(rawUrl, signal);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const agent = pinnedAgent(normalizedHostname(current.url), current.addresses);
    let response: Response;
    try {
      const fetched = await undiciFetch(current.url.href, {
        ...init,
        redirect: 'manual',
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1]);
      // Keep the public API in terms of the platform Response type while the
      // request and pinned Agent deliberately come from the same Undici build.
      response = fetched as unknown as Response;
    } catch (error) {
      await agent.close().catch(() => {});
      throw error;
    }
    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);

    if (!isRedirect) {
      return { response: responseWithAgentCleanup(response, agent), url: current.url };
    }
    await response.body?.cancel().catch(() => {});
    await agent.close().catch(() => {});
    current = await resolvePublicHttpUrl(new URL(location!, current.url).href, signal);
  }

  throw new Error('Too many redirects.');
}

export async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Remote response is too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Remote response has no body.');
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  try {
    while (bytesRead <= maxBytes) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) throw new Error('Remote response is too large.');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error('Remote response is too large.');
}
