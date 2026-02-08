'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Paperclip, Image, FileText, File, FileCode, FileSpreadsheet } from 'lucide-react';
import type { ProjectFile } from '@/lib/types';

interface FileNodeData {
  file: ProjectFile;
  [key: string]: unknown;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return FileSpreadsheet;
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css')) return FileCode;
  if (mimeType.startsWith('text/')) return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileNodeComponent({ data }: { data: FileNodeData }) {
  const { file } = data;
  const Icon = getFileIcon(file.type);

  return (
    <div className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 min-w-[120px] max-w-[160px] shadow-sm hover:shadow-md transition-all cursor-pointer opacity-80 hover:opacity-100">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-400 !border-background !w-2 !h-2 !-left-1"
      />

      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-6 w-6 rounded bg-slate-200/80 dark:bg-slate-700/60 shrink-0">
          <Icon className="h-3 w-3 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium truncate leading-tight text-foreground">
            {file.name}
          </p>
          <p className="text-[8px] text-muted-foreground/60">
            {formatFileSize(file.size)}
          </p>
        </div>
        <Paperclip className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
      </div>
    </div>
  );
}

export const FileNode = memo(FileNodeComponent);
