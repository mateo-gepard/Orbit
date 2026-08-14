/**
 * Carries an in-progress MCP authorization across a sign-in.
 *
 * The consent screen is reached from a client (ChatGPT, Claude, Claude Code) with
 * a single-use `?request=` token in the URL. If the owner is not signed in yet,
 * that URL has to survive the trip through the sign-in screen, or the client's
 * authorization flow dead-ends and has to be restarted.
 *
 * `sessionStorage` is used rather than a `?next=` query parameter so the value is
 * never reflected into a redirect that an attacker could influence: only a path
 * this module wrote, and only one that still points at the consent screen, is
 * ever returned.
 */

export const MCP_CONSENT_PATH = '/integrations/authorize';

const STORAGE_KEY = 'threadmap-mcp-consent-return';

function isConsentPath(value: string): boolean {
  // Must be a same-origin absolute path pointing at the consent screen. The
  // leading `//` check rejects protocol-relative URLs, which are absolute.
  return value.startsWith(`${MCP_CONSENT_PATH}?`) && !value.startsWith('//');
}

export function storePendingConsentPath(pathWithQuery: string): void {
  if (typeof window === 'undefined' || !isConsentPath(pathWithQuery)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, pathWithQuery);
  } catch {
    // A full or unavailable sessionStorage only costs the convenience hop; the
    // client can always restart authorization.
  }
}

export function readPendingConsentPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value && isConsentPath(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingConsentPath(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover: a stale entry is discarded on the next read anyway.
  }
}
