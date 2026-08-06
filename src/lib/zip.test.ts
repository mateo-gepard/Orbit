import { describe, expect, it } from 'vitest';
import {
  createZipArchive,
  resolveZipEntryNames,
  sanitizeZipPath,
  ZipArchiveError,
} from './zip';

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

interface ParsedZipEntry {
  bytes: Uint8Array;
  crc32: number;
  flags: number;
  name: string;
}

async function parseZip(blob: Blob): Promise<ParsedZipEntry[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.byteLength - 22;

  expect(view.getUint32(endOffset, true)).toBe(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  expect(centralDirectoryOffset + centralDirectorySize).toBe(endOffset);

  const decoder = new TextDecoder();
  const parsed: ParsedZipEntry[] = [];
  let centralOffset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    expect(view.getUint32(centralOffset, true)).toBe(CENTRAL_DIRECTORY_HEADER_SIGNATURE);

    const flags = view.getUint16(centralOffset + 8, true);
    const crc32 = view.getUint32(centralOffset + 16, true);
    const size = view.getUint32(centralOffset + 24, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(
      bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength)
    );

    expect(view.getUint32(localOffset, true)).toBe(LOCAL_FILE_HEADER_SIGNATURE);
    expect(view.getUint16(localOffset + 6, true)).toBe(flags);
    expect(view.getUint32(localOffset + 14, true)).toBe(crc32);
    expect(view.getUint32(localOffset + 22, true)).toBe(size);

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const localName = decoder.decode(
      bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)
    );
    expect(localName).toBe(name);

    parsed.push({
      bytes: bytes.slice(dataOffset, dataOffset + size),
      crc32,
      flags,
      name,
    });

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  expect(centralOffset).toBe(endOffset);
  return parsed;
}

describe('createZipArchive', () => {
  it('writes valid local headers, central directory records, CRC32, and exact bytes', async () => {
    const archive = await createZipArchive([
      { name: 'text/hello.txt', data: '123456789' },
      { name: 'binary/data.bin', data: new Uint8Array([0, 1, 127, 128, 255]) },
      { name: 'blob/value.dat', data: new Blob([new Uint8Array([9, 8, 7])]) },
    ]);

    expect(archive.type).toBe('application/zip');
    const entries = await parseZip(archive);

    expect(entries.map((entry) => entry.name)).toEqual([
      'text/hello.txt',
      'binary/data.bin',
      'blob/value.dat',
    ]);
    expect(entries[0].crc32).toBe(0xcbf43926);
    expect(entries[0].bytes).toEqual(new TextEncoder().encode('123456789'));
    expect(entries[1].bytes).toEqual(new Uint8Array([0, 1, 127, 128, 255]));
    expect(entries[2].bytes).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('stores UTF-8 paths and marks both headers with the UTF-8 flag', async () => {
    const archive = await createZipArchive([
      { name: 'données/你好.txt', data: 'Grüße 👋' },
    ]);
    const [entry] = await parseZip(archive);

    expect(entry.name).toBe('données/你好.txt');
    expect(entry.flags & 0x0800).toBe(0x0800);
    expect(new TextDecoder().decode(entry.bytes)).toBe('Grüße 👋');
  });

  it('sanitizes traversal and absolute paths and resolves collisions deterministically', async () => {
    expect(sanitizeZipPath('../../secret.txt')).toBe('_/_/secret.txt');
    expect(sanitizeZipPath('C:\\temp\\report?.txt')).toBe('C_/temp/report_.txt');
    expect(sanitizeZipPath('/safe/./file.txt')).toBe('safe/file.txt');

    const inputNames = [
      '../report.txt',
      '..\\report.txt',
      '/report.txt',
      'report.txt',
      'REPORT.TXT',
    ];
    expect(resolveZipEntryNames(inputNames)).toEqual([
      '_/report.txt',
      '_/report (2).txt',
      'report.txt',
      'report (2).txt',
      'REPORT (3).TXT',
    ]);

    const archive = await createZipArchive(
      inputNames.map((name, index) => ({ name, data: String(index) }))
    );
    const entries = await parseZip(archive);
    expect(entries.map((entry) => entry.name)).toEqual(resolveZipEntryNames(inputNames));
    expect(
      entries.every((entry) => !entry.name.startsWith('/') && !entry.name.includes('..'))
    ).toBe(true);
  });

  it('normalizes Unicode before resolving filename collisions', () => {
    expect(resolveZipEntryNames(['Résumé.txt', 'Re\u0301sume\u0301.txt'])).toEqual([
      'Résumé.txt',
      'Résumé (2).txt',
    ]);
  });

  it('creates the standard 22-byte empty ZIP archive', async () => {
    const archive = await createZipArchive([]);
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(bytes.byteLength).toBe(22);
    expect(view.getUint32(0, true)).toBe(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
    expect(view.getUint16(8, true)).toBe(0);
    expect(await parseZip(archive)).toEqual([]);
  });

  it('fails early with actionable classic-ZIP limit errors', async () => {
    const tooMany = new Array(65_536).fill({ name: 'file.txt', data: '' });
    await expect(createZipArchive(tooMany)).rejects.toMatchObject({
      code: 'TOO_MANY_ENTRIES',
    });

    await expect(
      createZipArchive([{ name: 'a'.repeat(65_536), data: '' }])
    ).rejects.toMatchObject({ code: 'ENTRY_NAME_TOO_LONG' });
  });

  it('rejects unsafe file-versus-directory conflicts with a typed error', async () => {
    await expect(
      createZipArchive([
        { name: 'attachments', data: 'file' },
        { name: 'attachments/photo.jpg', data: 'image' },
      ])
    ).rejects.toBeInstanceOf(ZipArchiveError);
    await expect(
      createZipArchive([
        { name: 'attachments', data: 'file' },
        { name: 'attachments/photo.jpg', data: 'image' },
      ])
    ).rejects.toMatchObject({ code: 'PATH_CONFLICT' });
  });
});
