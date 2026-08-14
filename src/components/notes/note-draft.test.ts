import { describe, expect, it } from 'vitest';
import { clearNoteDraft, readNoteDraft, writeNoteDraft, type DurableNoteDraft } from './note-draft';

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

const note = {
  id: 'note-1',
  userId: 'user-a',
  updatedAt: 10,
  title: 'Cloud note',
  content: '',
  tags: [] as string[],
  noteSubtype: 'general' as const,
};
const draft: DurableNoteDraft = {
  title: 'Draft',
  content: 'Never lose this',
  tags: ['idea'],
  noteSubtype: 'idea',
};

describe('durable note draft', () => {
  it('round-trips a verified account-scoped draft', () => {
    const storage = memoryStorage();
    writeNoteDraft(note, draft, { revision: 0, updatedAt: 10 }, storage);
    expect(readNoteDraft(note, storage)).toEqual({
      draft,
      baseRevision: 0,
      baseUpdatedAt: 10,
      safeToRestore: true,
      matchesCurrent: false,
    });
    expect(readNoteDraft({ ...note, userId: 'user-b' }, storage)).toBeNull();
  });

  it('retains but does not automatically restore a draft based on an older note', () => {
    const storage = memoryStorage();
    writeNoteDraft(note, draft, { revision: 0, updatedAt: 10 }, storage);
    expect(readNoteDraft({ ...note, updatedAt: 11 }, storage)).toMatchObject({ draft, safeToRestore: false });
  });

  it('clears only after a save acknowledgement', () => {
    const storage = memoryStorage();
    writeNoteDraft(note, draft, { revision: 0, updatedAt: 10 }, storage);
    clearNoteDraft(note, storage);
    expect(readNoteDraft(note, storage)).toBeNull();
  });
});
