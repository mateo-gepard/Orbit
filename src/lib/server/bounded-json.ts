export class BoundedJsonError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = 'BoundedJsonError';
  }
}

/**
 * Read a small JSON request without trusting Content-Length. Route handlers
 * use this for user-entered lookup terms so they stay out of query-string
 * access logs without allowing an unbounded POST body into server memory.
 */
export async function readBoundedJsonObject(
  request: Request,
  maximumBytes = 4_096,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new BoundedJsonError('Request body is too large.', 413);
  }
  if (!request.body) throw new BoundedJsonError('A JSON request body is required.', 400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        break;
      }
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        throw new BoundedJsonError('Request body is too large.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BoundedJsonError('Request body must be valid JSON.', 400);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BoundedJsonError('Request body must be a JSON object.', 400);
  }
  return value as Record<string, unknown>;
}

export function hasOnlyObjectKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
