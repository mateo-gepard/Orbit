'use client';

import {
  exportAccountData,
  type AccountExport,
  type AccountExportAttachment,
} from './account-data';
import { createZipArchive, resolveZipEntryNames } from './zip';

export type AccountExportPhase = 'fetching' | 'attachments' | 'packaging' | 'complete';

export interface AccountExportProgress {
  phase: AccountExportPhase;
  completed: number;
  total: number;
  currentFile?: string;
}

export interface DurableAccountExport {
  blob: Blob;
  attachmentCount: number;
  byteCount: number;
}

export interface BuildAccountExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: AccountExportProgress) => void;
  loadAttachment?: (
    userId: string,
    itemId: string,
    file: AccountExportAttachment,
  ) => Promise<Blob>;
}

interface ArchivedAttachment {
  itemId: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  byteCount: number;
  sha256: string;
  storagePath: string;
  archivePath: string;
}

const REDACTED_ATTACHMENT_KEYS = new Set([
  'url',
  'downloadUrl',
  'downloadUrlExpiresAt',
  'downloadUnavailable',
  'missingFromStorage',
]);

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Account export cancelled.');
  error.name = 'AbortError';
  throw error;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return normalized || fallback;
}

function uniqueArchivePath(
  file: AccountExportAttachment,
  usedPaths: Set<string>,
): string {
  const itemSegment = safeSegment(file.itemId, 'item');
  const fileSegment = safeSegment(file.id, 'file');
  const nameSegment = safeSegment(file.name, 'attachment');
  const base = `attachments/${itemSegment}/${fileSegment}--${nameSegment}`;
  let candidate = base;
  let duplicate = 2;
  while (usedPaths.has(candidate)) {
    candidate = `${base}--${duplicate}`;
    duplicate += 1;
  }
  usedPaths.add(candidate);
  return candidate;
}

function redactedAttachment(
  file: Record<string, unknown>,
  archived?: ArchivedAttachment,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file)) {
    if (!REDACTED_ATTACHMENT_KEYS.has(key)) clean[key] = value;
  }
  if (archived) {
    clean.archivePath = archived.archivePath;
    clean.sha256 = archived.sha256;
    clean.archivedByteCount = archived.byteCount;
  }
  return clean;
}

function redactEmbeddedAttachmentUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEmbeddedAttachmentUrls);
  const record = recordValue(value);
  if (!record) return value;
  const looksLikeAttachment = typeof record.storagePath === 'string';
  const clean: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (looksLikeAttachment && REDACTED_ATTACHMENT_KEYS.has(key)) continue;
    clean[key] = redactEmbeddedAttachmentUrls(child);
  }
  return clean;
}

/** Strip expiring/bearer attachment URLs while preserving normal item URLs. */
export function redactAccountExportAttachmentUrls(
  data: AccountExport,
  archived: ArchivedAttachment[] = [],
): AccountExport {
  const archivedByKey = new Map(
    archived.map((entry) => [`${entry.itemId}\u0000${entry.fileId}`, entry]),
  );
  const files = data.files.map((file) => redactedAttachment(
    file as unknown as Record<string, unknown>,
    archivedByKey.get(`${file.itemId}\u0000${file.id}`),
  )) as unknown as AccountExportAttachment[];
  const items = data.items.map((item) => {
    const record = recordValue(item);
    if (!record || !Array.isArray(record.files)) return item;
    const itemId = typeof record.id === 'string' ? record.id : '';
    return {
      ...record,
      files: record.files.map((candidate) => {
        const file = recordValue(candidate);
        if (!file) return candidate;
        const fileId = typeof file.id === 'string' ? file.id : '';
        return redactedAttachment(file, archivedByKey.get(`${itemId}\u0000${fileId}`));
      }),
    };
  });
  return {
    ...data,
    files,
    items,
    localData: data.localData
      ? redactEmbeddedAttachmentUrls(data.localData) as Record<string, unknown>
      : data.localData,
  };
}

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot verify attachment checksums.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertValidAttachment(value: AccountExportAttachment): void {
  if (
    !value
    || typeof value.id !== 'string'
    || !value.id
    || typeof value.itemId !== 'string'
    || !value.itemId
    || typeof value.name !== 'string'
    || !value.name
    || typeof value.storagePath !== 'string'
    || !value.storagePath
    || typeof value.type !== 'string'
    || !Number.isFinite(value.size)
    || value.size < 0
  ) {
    throw new Error('The server returned incomplete attachment metadata. No backup was downloaded.');
  }
  if (value.missingFromStorage || value.downloadUnavailable) {
    throw new Error(`Attachment "${value.name}" is unavailable. No partial backup was downloaded.`);
  }
}

export async function buildAccountExportArchive(
  userId: string,
  data: AccountExport,
  options: BuildAccountExportOptions = {},
): Promise<DurableAccountExport> {
  abortIfRequested(options.signal);
  if (data.user && data.user.uid !== userId) {
    throw new Error('The signed-in account changed while the export was being prepared.');
  }

  const loadAttachment = options.loadAttachment ?? (async (
    expectedUserId: string,
    itemId: string,
    file: AccountExportAttachment,
  ) => {
    // Keep Firebase Storage and the Orbit store out of JSON-only/demo exports
    // and out of the initial settings bundle until an attachment is needed.
    const { getOwnedProjectFileBlob } = await import('./storage');
    return getOwnedProjectFileBlob(expectedUserId, itemId, file);
  });
  const usedPaths = new Set<string>();
  const attachmentEntries: Array<{ name: string; data: Blob }> = [];
  const archivedAttachments: ArchivedAttachment[] = [];
  let byteCount = 0;

  for (let index = 0; index < data.files.length; index += 1) {
    abortIfRequested(options.signal);
    const file = data.files[index];
    assertValidAttachment(file);
    options.onProgress?.({
      phase: 'attachments',
      completed: index,
      total: data.files.length,
      currentFile: file.name,
    });
    let blob: Blob;
    try {
      blob = await loadAttachment(userId, file.itemId, file);
    } catch {
      throw new Error(`Attachment "${file.name}" could not be read. No partial backup was downloaded.`);
    }
    abortIfRequested(options.signal);
    if (blob.size !== file.size) {
      throw new Error(`Attachment "${file.name}" changed during export. No partial backup was downloaded.`);
    }
    const archivePath = uniqueArchivePath(file, usedPaths);
    const digest = await sha256(blob);
    archivedAttachments.push({
      itemId: file.itemId,
      fileId: file.id,
      originalName: file.name,
      mimeType: file.type || blob.type || 'application/octet-stream',
      byteCount: blob.size,
      sha256: digest,
      storagePath: file.storagePath,
      archivePath,
    });
    attachmentEntries.push({ name: archivePath, data: blob });
    byteCount += blob.size;
    options.onProgress?.({
      phase: 'attachments',
      completed: index + 1,
      total: data.files.length,
      currentFile: file.name,
    });
  }

  abortIfRequested(options.signal);
  options.onProgress?.({
    phase: 'packaging',
    completed: data.files.length,
    total: data.files.length,
  });
  const resolvedEntryNames = resolveZipEntryNames([
    'account.json',
    'manifest.json',
    'README.txt',
    ...attachmentEntries.map((entry) => entry.name),
  ]);
  for (let index = 0; index < attachmentEntries.length; index += 1) {
    const resolvedName = resolvedEntryNames[index + 3];
    attachmentEntries[index].name = resolvedName;
    archivedAttachments[index].archivePath = resolvedName;
  }
  const cleanAccount = redactAccountExportAttachmentUrls(data, archivedAttachments);
  const manifest = {
    format: 'threadmap-account-archive',
    version: 1,
    complete: true,
    exportedAt: data.exportedAt,
    packagedAt: new Date().toISOString(),
    accountUid: userId,
    attachmentCount: archivedAttachments.length,
    attachmentByteCount: byteCount,
    attachments: archivedAttachments,
  };
  const readme = [
    'Threadmap account archive',
    '',
    'account.json contains your exported account records and local recovery data.',
    'manifest.json lists every embedded attachment with its SHA-256 checksum.',
    'The attachments directory contains the original file bytes.',
    '',
    'This archive is complete only when manifest.json has complete=true.',
  ].join('\n');
  const blob = await createZipArchive([
    { name: 'account.json', data: JSON.stringify(cleanAccount, null, 2) },
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'README.txt', data: readme },
    ...attachmentEntries,
  ]);
  abortIfRequested(options.signal);
  options.onProgress?.({
    phase: 'complete',
    completed: data.files.length,
    total: data.files.length,
  });
  return { blob, attachmentCount: archivedAttachments.length, byteCount };
}

export async function createDurableAccountExport(
  userId: string,
  localOnly: boolean,
  options: BuildAccountExportOptions = {},
): Promise<DurableAccountExport> {
  abortIfRequested(options.signal);
  options.onProgress?.({ phase: 'fetching', completed: 0, total: 0 });
  const data = await exportAccountData(userId, localOnly);
  abortIfRequested(options.signal);
  return buildAccountExportArchive(userId, data, options);
}
