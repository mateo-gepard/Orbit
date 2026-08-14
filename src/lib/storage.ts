// ═══════════════════════════════════════════════════════════
// Threadmap — Firebase Storage for File Uploads
// ═══════════════════════════════════════════════════════════

import {
  getStorage,
  ref,
  getBlob,
} from 'firebase/storage';
import { app, isFirebaseStorageConfigured } from './firebase';
import { cloudFunctions, db } from './firebase';
import { httpsCallable } from 'firebase/functions';
import type { OrbitItem, ProjectFile } from './types';
import { useOrbitStore } from './store';

const storage = app && isFirebaseStorageConfigured ? getStorage(app) : null;

// Maximum file size: 10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 10;
export const MAX_FILES_PER_PROJECT = 50;
export const MAX_PARALLEL_UPLOADS = 3;

// Allowed file types
const ALLOWED_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  
  // Archives
  'application/zip',
  'application/x-zip-compressed',
];

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  zip: 'application/zip',
};

function attachmentContentType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const inferred = EXTENSION_TYPES[extension];
  const reported = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  return inferred && (!reported || !ALLOWED_TYPES.includes(reported)) ? inferred : reported;
}

export interface UploadProgress {
  progress: number; // 0-100
  bytesTransferred: number;
  totalBytes: number;
}

function validateResumableUploadUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Cloud upload preparation returned an invalid transfer URL.');
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleapis.com')) {
    throw new Error('Cloud upload preparation returned an untrusted transfer URL.');
  }
  return url.toString();
}

function uploadThroughResumableSession(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl, true);
    request.timeout = 5 * 60_000;
    request.setRequestHeader('Content-Type', contentType);
    request.upload.addEventListener('progress', (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size;
      const bytesTransferred = Math.min(event.loaded, totalBytes);
      onProgress?.({
        progress: totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 100,
        bytesTransferred,
        totalBytes,
      });
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.({ progress: 100, bytesTransferred: file.size, totalBytes: file.size });
        resolve();
        return;
      }
      reject(new Error(`Cloud storage rejected the transfer (${request.status}).`));
    });
    request.addEventListener('error', () => reject(new Error('The cloud transfer could not reach storage.')));
    request.addEventListener('timeout', () => reject(new Error('The cloud transfer timed out.')));
    request.addEventListener('abort', () => reject(new Error('The cloud transfer was cancelled.')));
    request.send(file);
  });
}

/**
 * Upload a file to Firebase Storage for a specific Threadmap item.
 * The historical `/projects/` namespace is retained for existing objects.
 */
export async function uploadProjectFile(
  file: File,
  projectId: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<ProjectFile> {
  if (!storage) {
    throw new Error('Firebase Storage not initialized');
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const contentType = attachmentContentType(file);
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new Error('File type not allowed. Please upload a document, image, or archive file.');
  }

  if (!cloudFunctions) throw new Error('Cloud upload preparation is unavailable.');
  const begin = httpsCallable<
    { itemId: string; name: string; size: number; type: string },
    { file: ProjectFile; expiresAt: number; uploadUrl: string }
  >(cloudFunctions, 'beginThreadmapUpload');
  const intent = await begin({ itemId: projectId, name: file.name, size: file.size, type: contentType });
  const projectFile = intent.data.file;
  assertAttachmentOwner(projectId, userId, projectFile);
  const uploadUrl = validateResumableUploadUrl(intent.data.uploadUrl);

  try {
    await uploadThroughResumableSession(uploadUrl, file, contentType, onProgress);
    return projectFile;
  } catch (error) {
    console.error('[Storage] Upload failed:', error);
    void cleanupUnattachedUpload(projectId, projectFile.storagePath).catch((cleanupError) => {
      console.warn('[Storage] Failed upload cleanup remains queued:', cleanupError);
    });
    throw new Error('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown transfer error.'));
  }
}

async function cleanupUnattachedUpload(
  projectId: string,
  storagePath: string
): Promise<void> {
  if (!cloudFunctions) throw new Error('Cloud upload cleanup is unavailable.');
  const callable = httpsCallable<
    { itemId: string; storagePath: string },
    { success: boolean; cleanupPending: boolean }
  >(cloudFunctions, 'cleanupThreadmapUpload');
  const result = await callable({ itemId: projectId, storagePath });
  if (!result.data.success) throw new Error('Upload cleanup did not complete.');
  if (result.data.cleanupPending) {
    console.warn('[Storage] Unattached upload cleanup is queued for server retry.');
  }
}

function assertAttachmentOwner(projectId: string, userId: string, file: ProjectFile): void {
  const newPrefix = `users/${userId}/projects/${projectId}/`;
  if (!file.storagePath.startsWith(newPrefix)) {
    throw new Error('Attachment path does not belong to this project and account.');
  }
}

/**
 * Reconcile a callable attachment result without letting a late response cross
 * accounts or overwrite a newer Firestore snapshot. A same-revision snapshot
 * is already authoritative, so only a strictly newer server revision is safe
 * to apply locally.
 */
function applyScopedAttachmentCommit(
  projectId: string,
  userId: string,
  committedRevision: number | null,
  update: (item: OrbitItem) => OrbitItem,
): void {
  if (!Number.isSafeInteger(committedRevision) || committedRevision === null || committedRevision < 1) {
    return;
  }

  const state = useOrbitStore.getState();
  if (state._syncUserId !== userId) return;

  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== projectId || item.userId !== userId) return item;
    const localRevision = Number.isSafeInteger(item.revision) && Number(item.revision) >= 0
      ? Number(item.revision)
      : 0;
    if (committedRevision <= localRevision) return item;
    changed = true;
    return update(item);
  });

  if (changed && useOrbitStore.getState()._syncUserId === userId) {
    useOrbitStore.getState().setItems(items);
  }
}

/**
 * Upload and attach in one compensated workflow. If Firestore rejects the
 * owner-checked metadata transaction, the newly uploaded blob is removed.
 */
export async function uploadAndAttachProjectFile(
  file: File,
  projectId: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<ProjectFile> {
  if (!db || userId === 'demo-user') throw new Error('Sign in to upload project files.');
  const uploaded = await uploadProjectFile(file, projectId, userId, onProgress);
  try {
    if (!cloudFunctions) throw new Error('Cloud attachment finalization is unavailable.');
    const attach = httpsCallable<
      { itemId: string; storagePath: string },
      { success: boolean; file: ProjectFile; updatedAt: number; revision: number }
    >(cloudFunctions, 'attachThreadmapUpload');
    const result = await attach({ itemId: projectId, storagePath: uploaded.storagePath });
    if (!result.data.success) throw new Error('Upload attachment did not complete.');
    const committedUpdatedAt = result.data.updatedAt;
    const committedRevision = result.data.revision;
    const attachedFile = result.data.file;
    assertAttachmentOwner(projectId, userId, attachedFile);
    if (attachedFile.id !== uploaded.id || attachedFile.storagePath !== uploaded.storagePath) {
      throw new Error('Attachment finalization returned an unexpected upload.');
    }
    applyScopedAttachmentCommit(projectId, userId, committedRevision, (item) => ({
      ...item,
      files: item.files?.some((candidate) => candidate.id === attachedFile.id)
        ? item.files.map((candidate) => candidate.id === attachedFile.id ? attachedFile : candidate)
        : [...(item.files || []), attachedFile],
      updatedAt: committedUpdatedAt,
      revision: committedRevision,
    }));
    return attachedFile;
  } catch (error) {
    await cleanupUnattachedUpload(projectId, uploaded.storagePath).catch((cleanupError) => {
      console.error('[Storage] Unattached upload cleanup could not be queued:', cleanupError);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadmap:sync-warning', {
          detail: { message: 'The file could not be attached, and server cleanup could not be confirmed. It will be removed with account cleanup.' },
        }));
      }
    });
    throw error;
  }
}

/** Atomically remove metadata and enqueue durable, server-owned blob cleanup. */
export async function removeAttachedProjectFile(
  projectId: string,
  userId: string,
  file: ProjectFile
): Promise<void> {
  if (!db || userId === 'demo-user') throw new Error('Sign in to delete project files.');
  if (!cloudFunctions) throw new Error('Cloud file deletion is unavailable.');
  assertAttachmentOwner(projectId, userId, file);
  const callable = httpsCallable<
    { itemId: string; fileId: string },
    { success: boolean; cleanupPending: boolean; updatedAt: number | null; revision: number | null }
  >(cloudFunctions, 'deleteThreadmapAttachment');
  const result = await callable({ itemId: projectId, fileId: file.id });
  if (!result.data.success) throw new Error('File deletion did not complete.');
  applyScopedAttachmentCommit(projectId, userId, result.data.revision, (item) => ({
    ...item,
    files: (item.files || []).filter((candidate) => candidate.id !== file.id),
    updatedAt: result.data.updatedAt ?? item.updatedAt,
    revision: result.data.revision ?? item.revision,
  }));
  if (result.data.cleanupPending) {
    console.warn('[Storage] Attachment cleanup is queued for server retry.');
  }
}

/** Resolve an authenticated, revocable browser URL without creating download tokens. */
export async function getProjectFileObjectUrl(storagePath: string): Promise<string> {
  if (!storage) throw new Error('Firebase Storage not initialized');
  const blob = await getBlob(ref(storage, storagePath), MAX_FILE_SIZE + 1);
  return URL.createObjectURL(blob);
}

/**
 * Read an attachment for a durable account archive. The caller must provide
 * the account and item from the export manifest; validating both here keeps a
 * compromised or stale manifest from turning this into an arbitrary Storage
 * path reader.
 */
export async function getOwnedProjectFileBlob(
  userId: string,
  itemId: string,
  file: Pick<ProjectFile, 'id' | 'storagePath' | 'size'>,
): Promise<Blob> {
  const prefix = `users/${userId}/projects/${itemId}/`;
  const relativePath = file.storagePath.startsWith(prefix)
    ? file.storagePath.slice(prefix.length)
    : '';
  const pathParts = relativePath.split('/').filter(Boolean);
  const validLegacyPath = pathParts.length === 1;
  const validIntentPath = pathParts.length === 2 && pathParts[0] === file.id;
  if (!relativePath || (!validLegacyPath && !validIntentPath)) {
    throw new Error('An attachment path does not belong to this account export.');
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_FILE_SIZE) {
    throw new Error('An attachment has invalid or unsupported size metadata.');
  }
  if (!storage) throw new Error('Firebase Storage is unavailable.');
  const blob = await getBlob(ref(storage, file.storagePath), MAX_FILE_SIZE + 1);
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error('An attachment exceeds the maximum supported export size.');
  }
  if (blob.size !== file.size) {
    throw new Error('An attachment changed while the account export was being prepared.');
  }
  return blob;
}

export async function downloadProjectFile(file: ProjectFile): Promise<void> {
  const objectUrl = await getProjectFileObjectUrl(file.storagePath);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = file.name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Safari may consume the blob URL after the click task has returned. A
  // zero-delay revoke intermittently cancels the download, especially in PWAs.
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file icon based on MIME type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.startsWith('text/')) return '📃';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
  return '📎';
}

/**
 * Check if file type is previewable in browser
 */
export function isPreviewable(mimeType: string): boolean {
  return (
    (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
    mimeType === 'application/msword' || // .doc
    mimeType.startsWith('text/')
  );
}
