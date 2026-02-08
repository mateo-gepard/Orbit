'use client';

import { useState, useMemo } from 'react';
import { useOrbitStore } from '@/lib/store';
import { FileText, Folder, Search, Download, Trash2, Eye } from 'lucide-react';
import { formatFileSize, getFileIcon, isPreviewable } from '@/lib/storage';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function FilesPage() {
  const { items, setSelectedItemId, setDetailPanelOpen } = useOrbitStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Get all projects with files
  const projectsWithFiles = useMemo(() => {
    return items
      .filter(item => item.type === 'project' && item.files && item.files.length > 0)
      .map(project => ({
        ...project,
        fileCount: project.files?.length || 0,
      }))
      .sort((a, b) => b.fileCount - a.fileCount);
  }, [items]);

  // Get all files across all projects
  const allFiles = useMemo(() => {
    const files: Array<{
      file: any;
      project: any;
    }> = [];

    items.forEach(item => {
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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 lg:px-6 py-4 lg:py-5 border-b border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">Files</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalFiles} {totalFiles === 1 ? 'file' : 'files'} · {formatFileSize(totalSize)}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
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
                onClick={() => setSelectedProject(null)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  !selectedProject
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                )}
              >
                All Projects
              </button>
              {projectsWithFiles.map(project => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
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
              {searchQuery ? 'No files match your search' : 'No files uploaded yet'}
            </p>
            <p className="text-sm text-muted-foreground/40 mt-1">
              Upload files from project dashboards
            </p>
          </div>
        ) : (
          <div className="p-4 lg:p-6 space-y-2">
            {filteredFiles.map(({ file, project }) => {
              const isPrev = isPreviewable(file.type);

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
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/60">
                      <button
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
                      <span>{format(new Date(file.uploadedAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPrev && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground transition-colors"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </a>
                    )}
                    <a
                      href={file.url}
                      download={file.name}
                      className="p-2 rounded-lg hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground transition-colors"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
