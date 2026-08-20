import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AccountExport, AccountExportAttachment } from './account-data';
import {
  MAX_ACCOUNT_EXPORT_ARCHIVE_ATTACHMENT_BYTES,
  accountExportArchiveBytesAllowed,
  buildAccountExportArchive,
  redactAccountExportAttachmentUrls,
} from './account-export-archive';

function exportFixture(files: AccountExportAttachment[] = []): AccountExport {
  return {
    exportedAt: '2026-08-06T12:00:00.000Z',
    user: { uid: 'user-a', email: 'person@example.com' },
    items: [],
    toolData: [],
    settings: null,
    analytics: [],
    flightLogs: [],
    files,
    connections: [],
    nudges: [],
    localData: {},
  };
}

function attachment(overrides: Partial<AccountExportAttachment> = {}): AccountExportAttachment {
  return {
    id: 'file-1',
    itemId: 'item-1',
    name: 'notes.txt',
    size: 5,
    type: 'text/plain',
    storagePath: 'users/user-a/projects/item-1/notes.txt',
    uploadedAt: 1,
    uploadedBy: 'user-a',
    ...overrides,
  };
}

async function storedZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}

describe('durable account export archive', () => {
  it('enforces the 128 MiB in-memory attachment boundary without overflow', () => {
    expect(accountExportArchiveBytesAllowed(
      MAX_ACCOUNT_EXPORT_ARCHIVE_ATTACHMENT_BYTES - 1,
      1,
    )).toBe(true);
    expect(accountExportArchiveBytesAllowed(
      MAX_ACCOUNT_EXPORT_ARCHIVE_ATTACHMENT_BYTES,
      1,
    )).toBe(false);
    expect(accountExportArchiveBytesAllowed(0, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(accountExportArchiveBytesAllowed(0, 1.5)).toBe(false);
  });

  it('rejects oversized declared attachments before loading any Blob', async () => {
    const loadAttachment = vi.fn(async () => new Blob(['unused']));
    await expect(buildAccountExportArchive('user-a', exportFixture([
      attachment({ size: MAX_ACCOUNT_EXPORT_ARCHIVE_ATTACHMENT_BYTES }),
      attachment({ id: 'file-2', size: 1 }),
    ]), { loadAttachment })).rejects.toThrow(/paged export/);
    expect(loadAttachment).not.toHaveBeenCalled();
  });

  it('creates a complete, useful archive when there are no attachments', async () => {
    const result = await buildAccountExportArchive('user-a', exportFixture());
    const entries = await storedZipEntries(result.blob);
    expect([...entries.keys()]).toEqual(['account.json', 'manifest.json', 'README.txt']);
    expect(JSON.parse(new TextDecoder().decode(entries.get('manifest.json')))).toMatchObject({
      format: 'threadmap-account-archive',
      complete: true,
      attachmentCount: 0,
    });
  });

  it('embeds exact attachment bytes, checksums them, and removes bearer URLs', async () => {
    const file = attachment({
      url: 'https://legacy.example/bearer',
      downloadUrl: 'https://signed.example/temporary',
      downloadUrlExpiresAt: 123,
    });
    const data = exportFixture([file]);
    data.items = [{
      id: 'item-1',
      sourceUrl: 'https://example.com/keep-me',
      files: [{ ...file }],
    }];
    const payload = new TextEncoder().encode('hello');
    const result = await buildAccountExportArchive('user-a', data, {
      loadAttachment: vi.fn(async () => new Blob([payload], { type: 'text/plain' })),
    });
    const entries = await storedZipEntries(result.blob);
    const attachmentName = [...entries.keys()].find((name) => name.startsWith('attachments/'));
    expect(attachmentName).toBe('attachments/item-1/file-1--notes.txt');
    expect(entries.get(attachmentName!)).toEqual(payload);

    const accountText = new TextDecoder().decode(entries.get('account.json'));
    expect(accountText).not.toContain('signed.example');
    expect(accountText).not.toContain('legacy.example');
    expect(accountText).toContain('https://example.com/keep-me');
    const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
    expect(manifest.attachments[0]).toMatchObject({
      archivePath: attachmentName,
      byteCount: 5,
      sha256: createHash('sha256').update(payload).digest('hex'),
    });
  });

  it('does not produce a partial backup when an attachment is missing', async () => {
    await expect(buildAccountExportArchive('user-a', exportFixture([attachment()]), {
      loadAttachment: async () => { throw new Error('object-not-found'); },
    })).rejects.toThrow('No partial backup was downloaded');
  });

  it('refuses an account switch before reading any attachment', async () => {
    const loadAttachment = vi.fn(async () => new Blob(['hello']));
    const data = exportFixture([attachment()]);
    data.user = { uid: 'user-b' };
    await expect(buildAccountExportArchive('user-a', data, { loadAttachment }))
      .rejects.toThrow('signed-in account changed');
    expect(loadAttachment).not.toHaveBeenCalled();
  });

  it('sanitizes traversal-like names and keeps archive paths unique', async () => {
    const first = attachment({ id: '../same', itemId: 'CON', name: '../../secret.txt' });
    const second = attachment({ id: '../SAME', itemId: 'con', name: '../../SECRET.txt' });
    const result = await buildAccountExportArchive('user-a', exportFixture([first, second]), {
      loadAttachment: async () => new Blob(['hello']),
    });
    const entries = await storedZipEntries(result.blob);
    const names = [...entries.keys()]
      .filter((name) => name.startsWith('attachments/'));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.every((name) => !name.includes('..') && !name.startsWith('/'))).toBe(true);
    const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
    expect(manifest.attachments.map((entry: { archivePath: string }) => entry.archivePath))
      .toEqual(names);
  });

  it('redacts only attachment URL fields, not normal record URLs', () => {
    const data = exportFixture([attachment({ url: 'secret' })]);
    data.items = [{ id: 'item-1', url: 'https://normal.example', files: [{ ...data.files[0] }] }];
    data.localData = {
      'orbit-items:user-a': {
        items: [{ files: [{ ...data.files[0], downloadUrl: 'temporary-secret' }] }],
      },
    };
    const clean = redactAccountExportAttachmentUrls(data);
    expect((clean.items[0] as { url: string }).url).toBe('https://normal.example');
    expect(clean.files[0]).not.toHaveProperty('url');
    expect(((clean.items[0] as { files: unknown[] }).files[0])).not.toHaveProperty('url');
    expect(JSON.stringify(clean.localData)).not.toContain('temporary-secret');
    expect(JSON.stringify(clean.localData)).not.toContain('secret');
  });

  it('honors cancellation before packaging', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildAccountExportArchive('user-a', exportFixture(), {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
