import { scopedStorageKey } from '@/lib/account-storage';
import { removeStorageVerified, writeStorageVerified } from '@/lib/verified-storage';
import type { NoteSubtype, OrbitItem } from '@/lib/types';

export const NOTE_DRAFT_STORAGE_PREFIX = 'orbit-note-draft';

export interface DurableNoteDraft {
  title: string;
  content: string;
  tags: string[];
  noteSubtype: NoteSubtype;
}

interface NoteDraftRecord {
  version: 1;
  noteId: string;
  userId: string;
  baseRevision: number;
  baseUpdatedAt: number;
  savedAt: number;
  draft: DurableNoteDraft;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): DraftStorage {
  if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  return localStorage;
}

function draftKey(note: Pick<OrbitItem, 'id' | 'userId'>): string {
  return scopedStorageKey(`${NOTE_DRAFT_STORAGE_PREFIX}:${note.id}`, note.userId);
}

function validDraft(value: unknown): value is DurableNoteDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<DurableNoteDraft>;
  return typeof draft.title === 'string'
    && typeof draft.content === 'string'
    && Array.isArray(draft.tags)
    && draft.tags.every((tag) => typeof tag === 'string')
    && ['general', 'idea', 'principle', 'plan', 'journal'].includes(String(draft.noteSubtype));
}

export function readNoteDraft(
  note: Pick<OrbitItem, 'id' | 'userId' | 'updatedAt' | 'revision' | 'title' | 'content' | 'tags' | 'noteSubtype'>,
  storage: DraftStorage = browserStorage(),
): {
  draft: DurableNoteDraft;
  baseRevision: number;
  baseUpdatedAt: number;
  safeToRestore: boolean;
  matchesCurrent: boolean;
} | null {
  try {
    const parsed = JSON.parse(storage.getItem(draftKey(note)) || '') as Partial<NoteDraftRecord>;
    if (parsed.version !== 1
        || parsed.noteId !== note.id
        || parsed.userId !== note.userId
        || !Number.isSafeInteger(parsed.baseRevision)
        || typeof parsed.baseUpdatedAt !== 'number'
        || !validDraft(parsed.draft)) return null;
    const matchesCurrent = parsed.draft.title === note.title
      && parsed.draft.content === (note.content || '')
      && parsed.draft.noteSubtype === (note.noteSubtype || 'general')
      && parsed.draft.tags.length === (note.tags || []).length
      && parsed.draft.tags.every((tag, index) => tag === (note.tags || [])[index]);
    return {
      draft: parsed.draft,
      baseRevision: Number(parsed.baseRevision),
      baseUpdatedAt: parsed.baseUpdatedAt,
      safeToRestore: (parsed.baseRevision === Number(note.revision || 0)
        && parsed.baseUpdatedAt === note.updatedAt) || matchesCurrent,
      matchesCurrent,
    };
  } catch {
    return null;
  }
}

export function writeNoteDraft(
  note: Pick<OrbitItem, 'id' | 'userId'>,
  draft: DurableNoteDraft,
  base: { revision: number; updatedAt: number },
  storage: DraftStorage = browserStorage(),
): void {
  const record: NoteDraftRecord = {
    version: 1,
    noteId: note.id,
    userId: note.userId,
    baseRevision: base.revision,
    baseUpdatedAt: base.updatedAt,
    savedAt: Date.now(),
    draft,
  };
  writeStorageVerified(storage, draftKey(note), JSON.stringify(record));
}

export function clearNoteDraft(
  note: Pick<OrbitItem, 'id' | 'userId'>,
  storage: DraftStorage = browserStorage(),
): void {
  removeStorageVerified(storage, draftKey(note));
}
