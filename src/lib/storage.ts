// ═══════════════════════════════════════════════════════════
// Threadmap — Firebase Storage for File Uploads
// ═══════════════════════════════════════════════════════════

import {
  getStorage,
  ref,
  uploadBytesResumable,
  getBlob,
  type UploadTask,
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
  
  // Archives
  'application/zip',
  'application/x-zip-compressed',
];

export interface UploadProgress {
  progress: number; // 0-100
  bytesTransferred: number;
  totalBytes: number;
}

/**
 * Upload a file to Firebase Storage for a specific project
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

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('File type not allowed. Please upload a document, image, or archive file.');
  }

  if (!cloudFunctions) throw new Error('Cloud upload preparation is unavailable.');
  const begin = httpsCallable<
    { itemId: string; name: string; size: number; type: string },
    { file: ProjectFile; expiresAt: number }
  >(cloudFunctions, 'beginThreadmapUpload');
  const intent = await begin({ itemId: projectId, name: file.name, size: file.size, type: file.type });
  const projectFile = intent.data.file;
  assertAttachmentOwner(projectId, userId, projectFile);

  // Create storage reference
  const storageRef = ref(storage, projectFile.storagePath);

  // Upload file
  const uploadTask: UploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: { threadmapUploadId: projectFile.id },
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.({
          progress,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        });
      },
      (error) => {
        console.error('[Storage] Upload failed:', error);
        void cleanupUnattachedUpload(projectId, projectFile.storagePath).catch((cleanupError) => {
          console.warn('[Storage] Failed upload cleanup remains queued:', cleanupError);
        });
        reject(new Error('Upload failed: ' + error.message));
      },
      () => resolve(projectFile),
    );
  });
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
    if (item.id !== projectId || item.userId !== userId || item.type !== 'project') return item;
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
  file: Pick<ProjectFile, 'storagePath' | 'size'>,
): Promise<Blob> {
  const prefix = `users/${userId}/projects/${itemId}/`;
  const filename = file.storagePath.startsWith(prefix)
    ? file.storagePath.slice(prefix.length)
    : '';
  if (!filename || filename.includes('/')) {
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
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = file.name;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
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
