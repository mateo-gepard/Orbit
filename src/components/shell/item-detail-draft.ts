import { scopedStorageKey } from '@/lib/account-storage';
import type { ItemType, OrbitItem } from '@/lib/types';
import { removeStorageVerified, writeStorageVerified } from '@/lib/verified-storage';

export const ITEM_DETAIL_DRAFT_STORAGE_PREFIX = 'orbit-item-detail-draft';

export interface DurableItemDetailDraft {
  title: string;
  content: string;
  metric: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

interface ItemDetailDraftRecord {
  version: 1;
  itemId: string;
  itemType: ItemType;
  userId: string;
  baseRevision: number;
  baseUpdatedAt: number;
  savedAt: number;
  draft: DurableItemDetailDraft;
}

export interface RecoveredItemDetailDraft {
  draft: DurableItemDetailDraft;
  baseRevision: number;
  baseUpdatedAt: number;
  safeToRestore: boolean;
  matchesCurrent: boolean;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): DraftStorage {
  if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  return localStorage;
}

function draftKey(item: Pick<OrbitItem, 'id' | 'userId'>): string {
  return scopedStorageKey(`${ITEM_DETAIL_DRAFT_STORAGE_PREFIX}:${item.id}`, item.userId);
}

function validDraft(value: unknown): value is DurableItemDetailDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<DurableItemDetailDraft>;
  return typeof draft.title === 'string'
    && typeof draft.content === 'string'
    && typeof draft.metric === 'string'
    && typeof draft.startDate === 'string'
    && typeof draft.endDate === 'string'
    && typeof draft.startTime === 'string'
    && typeof draft.endTime === 'string';
}

function validItemType(value: unknown): value is ItemType {
  return ['task', 'project', 'habit', 'event', 'goal', 'note'].includes(String(value));
}

export function itemDetailDraftFromItem(item: OrbitItem): DurableItemDetailDraft {
  return {
    title: item.title,
    content: item.content || '',
    metric: item.metric || '',
    startDate: item.startDate || '',
    endDate: item.endDate || '',
    startTime: item.startTime || '',
    endTime: item.endTime || '',
  };
}

export function itemDetailDraftsEqual(
  left: DurableItemDetailDraft,
  right: DurableItemDetailDraft,
): boolean {
  return left.title === right.title
    && left.content === right.content
    && left.metric === right.metric
    && left.startDate === right.startDate
    && left.endDate === right.endDate
    && left.startTime === right.startTime
    && left.endTime === right.endTime;
}

export function readItemDetailDraft(
  item: OrbitItem,
  storage: DraftStorage = browserStorage(),
): RecoveredItemDetailDraft | null {
  try {
    const parsed = JSON.parse(storage.getItem(draftKey(item)) || '') as Partial<ItemDetailDraftRecord>;
    if (parsed.version !== 1
        || parsed.itemId !== item.id
        || parsed.userId !== item.userId
        || !validItemType(parsed.itemType)
        || !Number.isSafeInteger(parsed.baseRevision)
        || Number(parsed.baseRevision) < 0
        || typeof parsed.baseUpdatedAt !== 'number'
        || !Number.isFinite(parsed.baseUpdatedAt)
        || !validDraft(parsed.draft)) return null;

    const matchesCurrent = parsed.itemType === item.type
      && itemDetailDraftsEqual(parsed.draft, itemDetailDraftFromItem(item));
    const matchesBase = parsed.itemType === item.type
      && Number(parsed.baseRevision) === Number(item.revision || 0)
      && parsed.baseUpdatedAt === item.updatedAt;

    return {
      draft: parsed.draft,
      baseRevision: Number(parsed.baseRevision),
      baseUpdatedAt: parsed.baseUpdatedAt,
      safeToRestore: matchesBase || matchesCurrent,
      matchesCurrent,
    };
  } catch {
    return null;
  }
}

export function writeItemDetailDraft(
  item: Pick<OrbitItem, 'id' | 'type' | 'userId'>,
  draft: DurableItemDetailDraft,
  base: { revision: number; updatedAt: number },
  storage: DraftStorage = browserStorage(),
): void {
  const record: ItemDetailDraftRecord = {
    version: 1,
    itemId: item.id,
    itemType: item.type,
    userId: item.userId,
    baseRevision: base.revision,
    baseUpdatedAt: base.updatedAt,
    savedAt: Date.now(),
    draft,
  };
  writeStorageVerified(storage, draftKey(item), JSON.stringify(record));
}

export function clearItemDetailDraft(
  item: Pick<OrbitItem, 'id' | 'userId'>,
  storage: DraftStorage = browserStorage(),
): void {
  removeStorageVerified(storage, draftKey(item));
}
