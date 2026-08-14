const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const UTF8_FLAG = 0x0800;
const ZIP_VERSION_20 = 20;
const DOS_TIME_MIDNIGHT = 0;
const DOS_DATE_1980_01_01 = 0x0021;

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

export interface ZipEntry {
  name: string;
  data: Blob | string | Uint8Array;
}

export type ZipArchiveErrorCode =
  | 'TOO_MANY_ENTRIES'
  | 'ENTRY_TOO_LARGE'
  | 'ENTRY_NAME_TOO_LONG'
  | 'ARCHIVE_TOO_LARGE'
  | 'PATH_CONFLICT'
  | 'UNSUPPORTED_ENTRY_DATA'
  | 'ARCHIVE_CREATION_FAILED';

export class ZipArchiveError extends Error {
  readonly code: ZipArchiveErrorCode;

  constructor(code: ZipArchiveErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZipArchiveError';
    this.code = code;
  }
}

interface PreparedEntry {
  blob: Blob;
  crc32: number;
  localHeaderOffset: number;
  name: string;
  nameBytes: Uint8Array<ArrayBuffer>;
  size: number;
}

const textEncoder = new TextEncoder();

const crc32Table = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function sanitizePathSegment(segment: string): string {
  let safe = segment
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/[. ]+$/g, '_');

  if (!safe) safe = '_';

  // These names are treated as devices on Windows, even with an extension.
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    safe = `_${safe}`;
  }

  return safe;
}

/**
 * Converts an untrusted archive path into a relative, cross-platform-safe path.
 * Parent traversal is made explicit as `_` instead of being silently resolved.
 */
export function sanitizeZipPath(path: string): string {
  if (typeof path !== 'string') return 'unnamed';

  const segments = path
    .normalize('NFC')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .map((segment) => (segment === '..' ? '_' : sanitizePathSegment(segment)));

  return segments.join('/') || 'unnamed';
}

function collisionName(path: string, sequence: number): string {
  const slashIndex = path.lastIndexOf('/');
  const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : '';
  const filename = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = filename.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < filename.length - 1;
  const stem = hasExtension ? filename.slice(0, dotIndex) : filename;
  const extension = hasExtension ? filename.slice(dotIndex) : '';

  return `${directory}${stem} (${sequence})${extension}`;
}

function pathKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

function parentPaths(path: string): string[] {
  const segments = path.split('/');
  const parents: string[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    parents.push(segments.slice(0, index).join('/'));
  }

  return parents;
}

/**
 * Resolves names exactly as `createZipArchive` does. This is useful when a
 * manifest needs to record the final archive path before the ZIP is created.
 */
export function resolveZipEntryNames(paths: readonly string[]): string[] {
  const fileKeys = new Set<string>();
  const directoryKeys = new Set<string>();
  const nextCollisionSequence = new Map<string, number>();

  return paths.map((path) => {
    const sanitized = sanitizeZipPath(path);
    const sanitizedKey = pathKey(sanitized);
    let sequence = nextCollisionSequence.get(sanitizedKey) ?? 2;
    let candidate = sanitized;

    while (fileKeys.has(pathKey(candidate)) || directoryKeys.has(pathKey(candidate))) {
      candidate = collisionName(sanitized, sequence);
      sequence += 1;
    }
    nextCollisionSequence.set(sanitizedKey, sequence);

    const parents = parentPaths(candidate);
    const conflictingParent = parents.find((parent) => fileKeys.has(pathKey(parent)));
    if (conflictingParent) {
      throw new ZipArchiveError(
        'PATH_CONFLICT',
        `Cannot add "${candidate}" because "${conflictingParent}" is already a file. Rename one of these export entries and try again.`
      );
    }

    fileKeys.add(pathKey(candidate));
    for (const parent of parents) directoryKeys.add(pathKey(parent));
    return candidate;
  });
}

function toImmutableBlob(data: ZipEntry['data'], name: string): Blob {
  if (data instanceof Blob) return data;
  if (typeof data === 'string') return new Blob([data]);
  if (data instanceof Uint8Array) {
    // Copy the view so a caller cannot mutate bytes between CRC calculation and
    // construction of the final Blob.
    return new Blob([Uint8Array.from(data)]);
  }

  throw new ZipArchiveError(
    'UNSUPPORTED_ENTRY_DATA',
    `The export entry "${name}" has unsupported data. Use a Blob, string, or Uint8Array.`
  );
}

async function calculateBlobCrc32(blob: Blob): Promise<number> {
  const reader = blob.stream().getReader();
  let crc = 0xffffffff;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const byte of value) {
        crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function localFileHeader(entry: PreparedEntry): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);

  view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_20, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, DOS_TIME_MIDNIGHT, true);
  view.setUint16(12, DOS_DATE_1980_01_01, true);
  view.setUint32(14, entry.crc32, true);
  view.setUint32(18, entry.size, true);
  view.setUint32(22, entry.size, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  view.setUint16(28, 0, true);

  return header;
}

function centralDirectoryHeader(entry: PreparedEntry): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);

  view.setUint32(0, CENTRAL_DIRECTORY_HEADER_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_20, true);
  view.setUint16(6, ZIP_VERSION_20, true);
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, DOS_TIME_MIDNIGHT, true);
  view.setUint16(14, DOS_DATE_1980_01_01, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);

  return header;
}

function endOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Uint8Array<ArrayBuffer> {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function assertArchiveSize(size: number): void {
  if (size > MAX_UINT32) {
    throw new ZipArchiveError(
      'ARCHIVE_TOO_LARGE',
      'This export exceeds the 4 GiB limit of a browser-compatible ZIP. Export fewer attachments and try again.'
    );
  }
}

/**
 * Creates a deterministic, uncompressed classic ZIP archive entirely in the
 * browser. Entry data remains in Blob parts rather than being copied into one
 * large in-memory byte array.
 */
export async function createZipArchive(entries: readonly ZipEntry[]): Promise<Blob> {
  if (entries.length > MAX_UINT16) {
    throw new ZipArchiveError(
      'TOO_MANY_ENTRIES',
      'This export has more than 65,535 files, which a browser-compatible ZIP cannot hold. Split the export into smaller archives.'
    );
  }

  const resolvedNames = resolveZipEntryNames(entries.map((entry) => entry.name));
  const preparedEntries: PreparedEntry[] = [];
  let localSectionSize = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const source = entries[index];
    const name = resolvedNames[index];
    const nameBytes = textEncoder.encode(name);

    if (nameBytes.byteLength > MAX_UINT16) {
      throw new ZipArchiveError(
        'ENTRY_NAME_TOO_LONG',
        `The export filename "${name.slice(0, 80)}" is too long for a ZIP archive. Shorten it and try again.`
      );
    }

    const blob = toImmutableBlob(source.data, name);
    if (blob.size > MAX_UINT32) {
      throw new ZipArchiveError(
        'ENTRY_TOO_LARGE',
        `The export entry "${name}" exceeds the 4 GiB per-file ZIP limit. Export it separately or reduce its size.`
      );
    }

    const entrySize = 30 + nameBytes.byteLength + blob.size;
    assertArchiveSize(localSectionSize + entrySize);

    preparedEntries.push({
      blob,
      crc32: await calculateBlobCrc32(blob),
      localHeaderOffset: localSectionSize,
      name,
      nameBytes,
      size: blob.size,
    });
    localSectionSize += entrySize;
  }

  const centralDirectorySize = preparedEntries.reduce(
    (total, entry) => total + 46 + entry.nameBytes.byteLength,
    0
  );
  assertArchiveSize(centralDirectorySize);
  assertArchiveSize(localSectionSize + centralDirectorySize + 22);

  const parts: BlobPart[] = [];
  for (const entry of preparedEntries) {
    parts.push(localFileHeader(entry), entry.nameBytes, entry.blob);
  }
  for (const entry of preparedEntries) {
    parts.push(centralDirectoryHeader(entry), entry.nameBytes);
  }
  parts.push(endOfCentralDirectory(entries.length, centralDirectorySize, localSectionSize));

  try {
    return new Blob(parts, { type: 'application/zip' });
  } catch (error) {
    throw new ZipArchiveError(
      'ARCHIVE_CREATION_FAILED',
      'The browser could not assemble this ZIP archive. Free some memory or export fewer attachments, then try again.',
      { cause: error }
    );
  }
}
