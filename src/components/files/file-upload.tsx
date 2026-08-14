'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2, Eye, Download, Trash2, LogIn } from 'lucide-react';
import {
  uploadAndAttachProjectFile,
  removeAttachedProjectFile,
  downloadProjectFile,
  formatFileSize,
  getFileIcon,
  MAX_FILES_PER_BATCH,
  MAX_FILES_PER_PROJECT,
  MAX_PARALLEL_UPLOADS,
  type UploadProgress,
} from '@/lib/storage';
import { useAuth } from '@/components/providers/auth-provider';
import type { OrbitItem, ProjectFile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FileViewer } from '@/components/files/file-viewer';
import { format, isValid } from 'date-fns';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from '@/lib/i18n';
import { getLocale } from '@/lib/utils';

interface FileUploadProps {
  /**
   * Any item. `files` has always lived on the universal item; only the project
   * dashboard ever rendered this, so tasks, notes, goals and events could not
   * hold an attachment — which cut against the unified-item premise.
   */
  item: OrbitItem;
}

export function FileUpload({ item }: FileUploadProps) {
  const { user, isDemo, signOut } = useAuth();
  const { t, tp, lang } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [openingSignIn, setOpeningSignIn] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = item.files || [];
  const canUpload = Boolean(user && !isDemo && user.uid !== 'demo-user');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !user || !canUpload) return;

    const filesToUpload = Array.from(selectedFiles);
    if (filesToUpload.length > MAX_FILES_PER_BATCH) {
      setError(t('files.batchLimit', { count: MAX_FILES_PER_BATCH }));
      e.target.value = '';
      return;
    }
    if (files.length + filesToUpload.length > MAX_FILES_PER_PROJECT) {
      const remaining = Math.max(0, MAX_FILES_PER_PROJECT - files.length);
      setError(remaining > 0
        ? tp('files.remaining.one', 'files.remaining.other', remaining)
        : t('files.projectLimit', { count: MAX_FILES_PER_PROJECT }));
      e.target.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(null);

    try {
      const perFileProgress = new Map<number, UploadProgress>();
      const totalBytes = filesToUpload.reduce((sum, file) => sum + file.size, 0);
      const results: PromiseSettledResult<ProjectFile>[] = [];
      for (let start = 0; start < filesToUpload.length; start += MAX_PARALLEL_UPLOADS) {
        const batch = filesToUpload.slice(start, start + MAX_PARALLEL_UPLOADS);
        const batchResults = await Promise.allSettled(batch.map((file, offset) => {
          const index = start + offset;
          return uploadAndAttachProjectFile(file, item.id, user.uid, (progress) => {
            perFileProgress.set(index, progress);
            const bytesTransferred = Array.from(perFileProgress.values()).reduce(
              (sum, current) => sum + current.bytesTransferred,
              0
            );
            setUploadProgress({
              bytesTransferred,
              totalBytes,
              progress: totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0,
            });
          });
        }));
        results.push(...batchResults);
      }

      const uploadedCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - uploadedCount;
      if (uploadedCount > 0) {
        toast.success(tp('files.uploaded.one', 'files.uploaded.other', uploadedCount));
      }
      if (failedCount > 0) {
        const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        const reason = firstFailure?.reason instanceof Error ? firstFailure.reason.message : '';
        results.forEach((result) => {
          if (result.status === 'rejected') console.error('[FileUpload] Upload failed:', result.reason);
        });
        setError(`${tp('files.uploadFailed.one', 'files.uploadFailed.other', failedCount)}${reason ? ` ${reason}` : ''}`);
      }
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('[FileUpload] Upload failed:', err);
      setError(t('files.uploadError'));
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleOpenSignIn = async () => {
    setOpeningSignIn(true);
    setError(null);
    try {
      // Leaving local/demo mode returns the app to its sign-in screen. Local
      // items remain stored on this device.
      await signOut();
    } catch (err) {
      console.error('[FileUpload] Could not open sign in:', err);
      setError(t('files.signInOpenError'));
      setOpeningSignIn(false);
    }
  };

  const handleDeleteFile = async (file: ProjectFile): Promise<boolean> => {
    if (!user) return false;
    try {
      await removeAttachedProjectFile(item.id, user.uid, file);
      toast.success(t('files.deleted', { name: file.name }));
      return true;
    } catch (err) {
      console.error('[FileUpload] Delete failed:', err);
      setError(t('files.deleteError'));
      return false;
    }
  };

  const handleDownload = async (file: ProjectFile) => {
    try {
      await downloadProjectFile(file);
    } catch {
      toast.error(t('files.downloadError', { name: file.name }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <div>
        <input
          id={`item-files-${item.id}`}
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          aria-label={t('files.chooseLabel')}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.zip"
        />
        {canUpload ? (
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="min-h-11 w-full"
            variant="outline"
            aria-describedby={`item-files-help-${item.id}`}
          >
            {uploading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 mr-2 animate-spin" />
                {t('files.uploading')} {uploadProgress && `${Math.round(uploadProgress.progress)}%`}
              </>
            ) : (
              <>
                <Upload aria-hidden="true" className="h-4 w-4 mr-2" />
                {t('files.uploadFiles')}
              </>
            )}
          </Button>
        ) : (
          <div className="rounded-xl border border-border/70 bg-foreground/[0.025] p-3" role="note">
            <div className="flex items-start gap-3">
              <LogIn aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t('files.signInTitle')}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t('files.signInDescription')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void handleOpenSignIn()}
              disabled={openingSignIn}
              size="sm"
              variant="outline"
              className="mt-3 min-h-11 w-full"
            >
              {openingSignIn ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn aria-hidden="true" className="h-4 w-4" />
              )}
              {openingSignIn ? t('files.openingSignIn') : t('files.goToSignIn')}
            </Button>
          </div>
        )}

        <p id={`item-files-help-${item.id}`} className="text-xs text-muted-foreground/60 mt-2 text-center">
          {t('files.limitsHint', { batch: MAX_FILES_PER_BATCH, project: MAX_FILES_PER_PROJECT })}
        </p>

        {error && (
          <div role="alert" className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Files List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            {tp('files.count.one', 'files.count.other', files.length)}
          </h4>
          <div className="space-y-2">
            {files.map(file => {
              const isPrev = file.type.startsWith('image/') || file.type === 'application/pdf';
              const uploadedDate = new Date(file.uploadedAt);

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-border hover:bg-foreground/[0.02] transition-all"
                >
                  {/* File Icon */}
                  <div className="text-2xl shrink-0">
                    {getFileIcon(file.type)}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <h5 className="font-medium text-sm truncate">
                      {file.name}
                    </h5>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/60">
                      <span>{formatFileSize(file.size)}</span>
                      <span>·</span>
                      <span>
                        {isValid(uploadedDate)
                          ? t('files.uploadedAt', { date: format(uploadedDate, 'PP', { locale: getLocale(lang) }) })
                          : t('common.dateUnavailable')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPrev && (
                      <button
                        type="button"
                        onClick={() => setViewingFile(file)}
                        aria-label={t('files.previewFile', { name: file.name })}
                        className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground/[0.04] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground lg:h-8 lg:w-8"
                        title={t('files.preview')}
                      >
                        <Eye aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(file)}
                      className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground/[0.04] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground lg:h-8 lg:w-8"
                      title={t('files.download')}
                      aria-label={t('files.downloadFile', { name: file.name })}
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFileToDelete(file)}
                      aria-label={t('files.deleteFile', { name: file.name })}
                      className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground/[0.04] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 lg:h-8 lg:w-8"
                      title={t('common.delete')}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <FileViewer
          file={viewingFile}
          files={files}
          onClose={() => setViewingFile(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(fileToDelete)}
        onOpenChange={(open) => !open && setFileToDelete(null)}
        title={t('files.deleteTitle', { name: fileToDelete?.name || t('files.title').toLocaleLowerCase(lang) })}
        description={t('files.deleteDescription')}
        onConfirm={async () => {
          if (!fileToDelete) return false;
          const deleted = await handleDeleteFile(fileToDelete);
          if (deleted) setFileToDelete(null);
          return deleted;
        }}
      />
    </div>
  );
}
