'use client';

import { useState, useMemo } from 'react';
import { useOrbitStore } from '@/lib/store';
import { FileText, Search, Download, Eye } from 'lucide-react';
import { downloadProjectFile, formatFileSize, getFileIcon } from '@/lib/storage';
import { Input } from '@/components/ui/input';
import { cn, getLocale } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import type { OrbitItem, ProjectFile } from '@/lib/types';
import { FileViewer } from '@/components/files/file-viewer';
import Link from 'next/link';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

export default function FilesPage() {
  const { items, setSelectedItemId, setDetailPanelOpen } = useOrbitStore();
  const { t, tp, lang } = useTranslation();
  const locale = getLocale(lang);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);

  // Get all projects with files
  const projectsWithFiles = useMemo(() => {
    return items
      .filter(item => item.type === 'project' && item.status !== 'archived' && item.files && item.files.length > 0)
      .map(project => ({
        ...project,
        fileCount: project.files?.length || 0,
      }))
      .sort((a, b) => b.fileCount - a.fileCount);
  }, [items]);

  // Get all files across all projects
  const allFiles = useMemo(() => {
    const files: Array<{
      file: ProjectFile;
      project: OrbitItem;
    }> = [];

    items.filter((item) => item.type === 'project' && item.status !== 'archived').forEach(item => {
      if (item.files && item.files.length > 0) {
        item.files.forEach(file => {
          files.push({ file, project: item });
        });
      }
    });

    return files.sort((a, b) => b.file.uploadedAt - a.file.uploadedAt);
  }, [items]);

  // Filter files based on search and selected project
  const filteredFiles = useMemo(() => {
    let result = allFiles;

    if (selectedProject) {
      result = result.filter(({ project }) => project.id === selectedProject);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(({ file }) =>
        file.name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [allFiles, searchQuery, selectedProject]);

  const totalFiles = allFiles.length;
  const totalSize = allFiles.reduce((sum, { file }) => sum + file.size, 0);

  const handleDownload = async (file: ProjectFile) => {
    try {
      await downloadProjectFile(file);
    } catch {
      toast.error(t('files.downloadError', { name: file.name }));
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 lg:px-6 py-4 lg:py-5 border-b border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">{t('files.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tp('files.count.one', 'files.count.other', totalFiles)} · {formatFileSize(totalSize)}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            aria-label={t('files.searchLabel')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('files.searchPlaceholder')}
            className="pl-9 h-10 bg-background/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Project Filter */}
        {projectsWithFiles.length > 0 && (
          <div className="px-4 lg:px-6 py-4 border-b border-border/40">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0">
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                aria-pressed={!selectedProject}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  !selectedProject
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                )}
              >
                {t('files.allProjects')}
              </button>
              {projectsWithFiles.map(project => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProject(project.id)}
                  aria-pressed={selectedProject === project.id}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2',
                    selectedProject === project.id
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                  )}
                >
                  <span>{project.emoji || '📁'}</span>
                  <span>{project.title}</span>
                  <span className="text-xs opacity-60">({project.fileCount})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Files List */}
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <FileText className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground/60">
              {searchQuery ? t('files.noMatch') : t('files.none')}
            </p>
            <p className="text-sm text-muted-foreground/40 mt-1">
              {t('files.uploadHint')}
            </p>
            {!searchQuery && (
              <Link href="/projects" className="mt-4 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">
                {t('files.openProjects')}
              </Link>
            )}
          </div>
        ) : (
          <div className="p-4 lg:p-6 space-y-2">
            {filteredFiles.map(({ file, project }) => {
              const isPrev = file.type.startsWith('image/') || file.type === 'application/pdf';
              const uploadedDate = new Date(file.uploadedAt);

              return (
                <div
                  key={file.id}
                  className="group flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-xl border border-border/60 hover:border-border hover:bg-foreground/[0.02] transition-all"
                >
                  {/* File Icon */}
                  <div className="text-3xl lg:text-4xl shrink-0">
                    {getFileIcon(file.type)}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm lg:text-base truncate">
                      {file.name}
                    </h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/60">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItemId(project.id);
                          setDetailPanelOpen(true);
                        }}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        <span>{project.emoji || '📁'}</span>
                        <span>{project.title}</span>
                      </button>
                      <span>·</span>
                      <span>{formatFileSize(file.size)}</span>
                      <span>·</span>
                      <span>{isValid(uploadedDate) ? format(uploadedDate, 'PP', { locale }) : t('common.dateUnavailable')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPrev && (
                      <button
                        type="button"
                        onClick={() => setViewingFile(file)}
                        className="p-2 rounded-lg hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground transition-colors"
                        title={t('files.preview')}
                        aria-label={t('files.previewFile', { name: file.name })}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(file)}
                      className="p-2 rounded-lg hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground transition-colors"
                      title={t('files.download')}
                      aria-label={t('files.downloadFile', { name: file.name })}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {viewingFile && (
        <FileViewer
          file={viewingFile}
          files={filteredFiles.map(({ file }) => file)}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}
