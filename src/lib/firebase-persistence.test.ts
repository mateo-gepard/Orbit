import { describe, expect, it } from 'vitest';
import {
  firestorePersistenceShouldBeBlocked,
  recordFirestorePersistenceCleared,
  writeFirestoreClearCoordinationMarkers,
} from './firebase';

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

describe('Firestore persistence privacy fallback', () => {
  it('chooses memory-only persistence when browser storage reads throw', () => {
    const throwing = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(firestorePersistenceShouldBeBlocked(throwing)).toBe(true);
    expect(firestorePersistenceShouldBeBlocked(null)).toBe(true);
  });

  it('reports incomplete cross-tab coordination when marker writes throw', () => {
    const throwing = {
      setItem: () => { throw new DOMException('blocked', 'QuotaExceededError'); },
    };

    expect(writeFirestoreClearCoordinationMarkers(throwing, 'request-id')).toBe(false);
  });

  it('keeps the multi-tab persistence block monotonic after a successful clear', () => {
    const storage = memoryStorage();
    expect(writeFirestoreClearCoordinationMarkers(storage, 'tab-a-request')).toBe(true);
    expect(recordFirestorePersistenceCleared(storage, 1_000)).toBe(true);
    expect(firestorePersistenceShouldBeBlocked(storage)).toBe(true);

    // A later sibling request cannot be undone by the earlier tab's cleared
    // marker or by another initialization pass.
    expect(writeFirestoreClearCoordinationMarkers(storage, 'tab-b-request')).toBe(true);
    expect(recordFirestorePersistenceCleared(storage, 1_001)).toBe(true);
    expect(firestorePersistenceShouldBeBlocked(storage)).toBe(true);
  });
});
