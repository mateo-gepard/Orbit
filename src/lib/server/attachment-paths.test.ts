import { describe, expect, it } from 'vitest';
import {
  isSafeAttachmentPath,
  safeAttachmentPaths,
} from '../../../functions/src/attachment-paths';

describe('Admin attachment path allowlist', () => {
  it('accepts only the owning account and exact item prefixes', () => {
    expect(isSafeAttachmentPath('user-a', 'item-1', 'users/user-a/projects/item-1/file.pdf')).toBe(true);
    expect(isSafeAttachmentPath('user-a', 'item-1', 'projects/item-1/legacy.pdf')).toBe(false);
    expect(isSafeAttachmentPath('user-a', 'item-1', 'users/user-b/projects/item-1/private.pdf')).toBe(false);
    expect(isSafeAttachmentPath('user-a', 'item-1', 'users/user-a/projects/item-10/lookalike.pdf')).toBe(false);
    expect(isSafeAttachmentPath('user-a', 'item-1', 'projects/item-10/lookalike.pdf')).toBe(false);
  });

  it('filters forged file metadata before Admin download signing or deletion', () => {
    expect(safeAttachmentPaths('user-a', 'item-1', [
      { storagePath: 'users/user-a/projects/item-1/owned.pdf' },
      { storagePath: 'users/user-b/projects/item-1/private.pdf' },
      { storagePath: 'projects/item-1/legacy.pdf', legacyStoragePath: 'users/user-a/projects/item-1/forged.pdf' },
    ])).toEqual([
      'users/user-a/projects/item-1/owned.pdf',
    ]);
  });
});
