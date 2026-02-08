'use client';

import { useState, useEffect } from 'react';
import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProjectFile } from '@/lib/types';

interface FileViewerProps {
  file: ProjectFile;
  files?: ProjectFile[];
  onClose: () => void;
}

export function FileViewer({ file, files = [], onClose }: FileViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(files.findIndex(f => f.id === file.id) || 0);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);

  const currentFile = files[currentIndex] || file;
  const canNavigate = files.length > 1;

  const isImage = currentFile.type.startsWith('image/');
  const isPDF = currentFile.type === 'application/pdf';
  const isPreviewable = isImage || isPDF;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (canNavigate && e.key === 'ArrowLeft') handlePrevious();
      if (canNavigate && e.key === 'ArrowRight') handleNext();
      if (isImage && e.key === '+') setZoom(z => Math.min(z + 25, 400));
      if (isImage && e.key === '-') setZoom(z => Math.max(z - 25, 25));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, canNavigate, isImage]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setZoom(100);
      setRotation(0);
      setLoading(true);
    }
  };

  const handleNext = () => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setZoom(100);
      setRotation(0);
      setLoading(true);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentFile.url;
    link.download = currentFile.name;
    link.click();
  };

  const handleOpenExternal = () => {
    window.open(currentFile.url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm md:text-base font-medium text-white truncate">
              {currentFile.name}
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              {currentFile.type.split('/')[1]?.toUpperCase()} · {Math.round(currentFile.size / 1024)} KB
              {canNavigate && ` · ${currentIndex + 1} of ${files.length}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 md:h-9 md:w-9 text-white hover:bg-white/10"
                  onClick={() => setZoom(z => Math.max(z - 25, 25))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="hidden md:inline text-xs text-white/80 min-w-[3ch] text-center">
                  {zoom}%
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 md:h-9 md:w-9 text-white hover:bg-white/10"
                  onClick={() => setZoom(z => Math.min(z + 25, 400))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 md:h-9 md:w-9 text-white hover:bg-white/10"
                  onClick={() => setRotation((rotation + 90) % 360)}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 md:h-9 md:w-9 text-white hover:bg-white/10"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="hidden md:flex h-9 w-9 text-white hover:bg-white/10"
              onClick={handleOpenExternal}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 md:h-9 md:w-9 text-white hover:bg-white/10"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center p-4 md:p-12">
        {isPreviewable ? (
          <>
            {isImage && (
              <div className="relative max-w-full max-h-full overflow-auto">
                <img
                  src={currentFile.url}
                  alt={currentFile.name}
                  className={cn(
                    "max-w-full max-h-full object-contain transition-all duration-200",
                    loading && "opacity-0"
                  )}
                  style={{
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center'
                  }}
                  onLoad={() => setLoading(false)}
                />
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-8 w-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {isPDF && (
              <iframe
                src={currentFile.url}
                className="w-full h-full rounded-lg border border-white/10"
                onLoad={() => setLoading(false)}
              />
            )}
          </>
        ) : (
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-lg font-medium text-white mb-2">Preview not available</h3>
            <p className="text-sm text-white/60 mb-6">
              This file type can't be previewed in the browser.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" />
                Download File
              </Button>
              <Button onClick={handleOpenExternal} variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Open Externally
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Arrows (Desktop) */}
      {canNavigate && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all",
              currentIndex === 0 && "opacity-30 cursor-not-allowed"
            )}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all",
              currentIndex === files.length - 1 && "opacity-30 cursor-not-allowed"
            )}
            onClick={handleNext}
            disabled={currentIndex === files.length - 1}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {/* Bottom Navigation (Mobile) */}
      {canNavigate && (
        <div className="md:hidden absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="flex items-center justify-center gap-4">
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-10 w-10 rounded-full bg-white/10 text-white",
                currentIndex === 0 && "opacity-30"
              )}
              onClick={handlePrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <span className="text-sm text-white/80 min-w-[4ch] text-center">
              {currentIndex + 1} / {files.length}
            </span>

            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-10 w-10 rounded-full bg-white/10 text-white",
                currentIndex === files.length - 1 && "opacity-30"
              )}
              onClick={handleNext}
              disabled={currentIndex === files.length - 1}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
