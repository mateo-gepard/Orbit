'use client';

import { useState, useRef } from 'react';
import { Upload, X, File, Loader2, Eye, Download, Trash2 } from 'lucide-react';
import { uploadProjectFile, deleteProjectFile, formatFileSize, getFileIcon, isPreviewable, type UploadProgress } from '@/lib/storage';
import { updateItem } from '@/lib/firestore';
import { useAuth } from '@/components/providers/auth-provider';
import type { OrbitItem, ProjectFile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileViewer } from '@/components/files/file-viewer';
import { format } from 'date-fns';

interface FileUploadProps {
  project: OrbitItem;
  onFilesChange?: () => void;
}

export function FileUpload({ project, onFilesChange }: FileUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = project.files || [];
  
  console.log('[FileUpload] Rendering with project:', project.id);
  console.log('[FileUpload] Files array:', files);
  console.log('[FileUpload] Files count:', files.length);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !user) return;

    setUploading(true);
    setError(null);
    setUploadProgress(null);

    try {
      // Upload all selected files
      const uploadPromises = Array.from(selectedFiles).map(file =>
        uploadProjectFile(file, project.id, user.uid, (progress) => {
          setUploadProgress(progress);
        })
      );

      const uploadedFiles = await Promise.all(uploadPromises);

      // Update project with new files
      const updatedFiles = [...files, ...uploadedFiles];
      console.log('[FileUpload] Uploading complete, updating Firestore...');
      console.log('[FileUpload] Project ID:', project.id);
      console.log('[FileUpload] Updated files:', updatedFiles);
      
      await updateItem(project.id, { files: updatedFiles });
      
      console.log('[FileUpload] ✅ Firestore updated successfully');
      onFilesChange?.();
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('[FileUpload] Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteFile = async (file: ProjectFile) => {
    if (!confirm(`Delete "${file.name}"?`)) return;

    try {
      // Delete from Firebase Storage
      await deleteProjectFile(file.storagePath);

      // Update project by removing file from array
      const updatedFiles = files.filter(f => f.id !== file.id);
      await updateItem(project.id, { files: updatedFiles });

      onFilesChange?.();
    } catch (err) {
      console.error('[FileUpload] Delete failed:', err);
      alert('Failed to delete file');
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full"
          variant="outline"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading... {uploadProgress && `${Math.round(uploadProgress.progress)}%`}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground/60 mt-2 text-center">
          PDF, Word, Excel, PowerPoint, Images, Text · Max 10MB per file
        </p>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Files List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Files · {files.length}
          </h4>
          <div className="space-y-2">
            {files.map(file => {
              const isPrev = isPreviewable(file.type);
              console.log('[FileUpload] File:', file.name, 'Type:', file.type, 'isPreviewable:', isPrev);

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
                      <span>{format(new Date(file.uploadedAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPrev && (
                      <button
                        onClick={() => setViewingFile(file)}
                        className="p-2 rounded-md bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <a
                      href={file.url}
                      download={file.name}
                      className="p-2 rounded-md bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteFile(file)}
                      className="p-2 rounded-md bg-foreground/[0.04] hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
