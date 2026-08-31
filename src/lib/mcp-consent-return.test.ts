import { describe, expect, it } from 'vitest';
import {
  clearPendingConsentPath,
  readPendingConsentPath,
  storePendingConsentPath,
} from './mcp-consent-return';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('MCP consent handoff teardown', () => {
  it('removes an in-progress authorization before another account can reuse the tab', () => {
    const storage = memoryStorage();
    storePendingConsentPath('/integrations/authorize?request=tmar_secret', storage);
    expect(readPendingConsentPath(storage)).toContain('tmar_secret');

    expect(clearPendingConsentPath(storage)).toBe(true);
    expect(readPendingConsentPath(storage)).toBeNull();
  });

  it('reports blocked session storage without throwing through sign-out', () => {
    const blocked = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(clearPendingConsentPath(blocked)).toBe(false);
    expect(readPendingConsentPath(blocked)).toBeNull();
  });
});
