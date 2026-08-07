'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ProjectFile } from '@/lib/types';
import { downloadProjectFile, formatFileSize, getProjectFileObjectUrl } from '@/lib/storage';
import { toast } from 'sonner';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';

interface FileViewerProps {
  file: ProjectFile;
  files?: ProjectFile[];
  onClose: () => void;
}

export function FileViewer({ file, files = [], onClose }: FileViewerProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [currentIndex, setCurrentIndex] = useState(() => files.findIndex(f => f.id === file.id));
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const currentFile = currentIndex >= 0 ? files[currentIndex] || file : file;
  const canNavigate = currentIndex >= 0 && files.length > 1;

  const isImage = currentFile.type.startsWith('image/') && currentFile.type !== 'image/svg+xml';
  const isPDF = currentFile.type === 'application/pdf';
  const isPreviewable = isImage || isPDF;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getProjectFileObjectUrl(currentFile.storagePath)
      .then((resolvedUrl) => {
        objectUrl = resolvedUrl;
        if (cancelled) {
          URL.revokeObjectURL(resolvedUrl);
          return;
        }
        setPreviewUrl(resolvedUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setPreviewError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentFile.id, currentFile.storagePath]);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const resetPreview = () => {
    setZoom(100);
    setRotation(0);
    setLoading(true);
    setPreviewError(false);
    setPreviewUrl(null);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      resetPreview();
    }
  };

  const handleNext = () => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetPreview();
    }
  };

  const handleTouchEnd = () => {
    if (touchStart === null || touchEnd === null || !canNavigate) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && currentIndex < files.length - 1) {
      handleNext();
    }
    if (isRightSwipe && currentIndex > 0) {
      handlePrevious();
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (canNavigate && e.key === 'ArrowLeft') handlePrevious();
    if (canNavigate && e.key === 'ArrowRight') handleNext();
    if (isImage && (e.key === '+' || e.key === '=')) setZoom(z => Math.min(z + 25, 400));
    if (isImage && e.key === '-') setZoom(z => Math.max(z - 25, 25));
  };

  const handleDownload = async () => {
    try {
      await downloadProjectFile(currentFile);
    } catch {
      toast.error(t('files.downloadError', { name: currentFile.name }));
    }
  };

  const handleOpenExternal = () => {
    if (!previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black/95 p-0 text-white shadow-none backdrop-blur-sm sm:max-w-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButtonRef.current?.focus();
        }}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      {/* Header - Simplified for mobile */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/90 to-transparent pt-safe">
        <div className="flex items-center justify-between gap-3 p-3 md:p-4">
          <div className="flex-1 min-w-0">
            <DialogTitle className="truncate text-xs font-medium text-white md:text-sm">
              {currentFile.name}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[10px] text-white/60 md:text-xs">
              {formatFileSize(currentFile.size)}
              {canNavigate && ` · ${t('fileViewer.position', { current: currentIndex + 1, total: files.length })}`}
            </DialogDescription>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            {isImage && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white hover:bg-white/10"
                  onClick={() => setZoom(z => Math.max(z - 25, 25))}
                  aria-label={t('fileViewer.zoomOut')}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-white/80 min-w-[3ch] text-center">
                  {zoom}%
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white hover:bg-white/10"
                  onClick={() => setZoom(z => Math.min(z + 25, 400))}
                  aria-label={t('fileViewer.zoomIn')}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-white hover:bg-white/10"
                  onClick={() => setRotation((rotation + 90) % 360)}
                  aria-label={t('fileViewer.rotateClockwise')}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-white hover:bg-white/10"
              onClick={handleDownload}
              aria-label={t('files.downloadFile', { name: currentFile.name })}
            >
              <Download className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-white hover:bg-white/10"
              onClick={handleOpenExternal}
              disabled={!previewUrl}
              aria-label={t('fileViewer.openNewTab', { name: currentFile.name })}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>

          </div>

          {/* A single close control gives the dialog a stable initial-focus target. */}
          <Button
            ref={closeButtonRef}
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 text-white hover:bg-white/10"
            onClick={onClose}
            aria-label={t('fileViewer.closePreview')}
          >
            <ArrowLeft className="h-5 w-5 md:hidden" />
            <X className="hidden h-5 w-5 md:block" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center pt-[max(4rem,env(safe-area-inset-top)+3.5rem)] pb-[max(5rem,env(safe-area-inset-bottom)+3.5rem)] md:pt-20 md:pb-4">
        {previewError ? (
          <div role="alert" className="max-w-md px-6 text-center text-white">
            <h3 className="text-lg font-medium">{t('fileViewer.previewUnavailable')}</h3>
            <p className="mt-2 text-sm text-white/65">{t('fileViewer.secureLoadError')}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button onClick={handleDownload}><Download className="mr-2 h-4 w-4" />{t('files.download')}</Button>
              <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
            </div>
          </div>
        ) : isPreviewable ? (
          <>
            {loading && !previewUrl && (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-label={t('fileViewer.loading')} role="status" />
            )}
            {isImage && previewUrl && (
              <div className="relative w-full h-full flex items-center justify-center p-4">
                <Image
                  src={previewUrl}
                  alt={currentFile.name}
                  fill
                  unoptimized
                  sizes="100vw"
                  className={cn(
                    "object-contain transition-all duration-200",
                    loading && "opacity-0"
                  )}
                  style={{
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center'
                  }}
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setPreviewError(true);
                  }}
                />
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-8 w-8 border-4 border-white/20 border-t-white rounded-full animate-spin" aria-label={t('fileViewer.loading')} role="status" />
                  </div>
                )}
              </div>
            )}

            {isPDF && previewUrl && (
              <div className="w-full h-full px-2 md:px-4">
                <iframe
                  src={previewUrl || undefined}
                  title={t('fileViewer.pdfTitle', { name: currentFile.name })}
                  sandbox=""
                  className="w-full h-full border-0 rounded-lg"
                  onLoad={() => setLoading(false)}
                />
              </div>
            )}

          </>
        ) : (
          <div className="text-center max-w-md px-4">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-lg font-medium text-white mb-2">{t('fileViewer.typeUnavailable')}</h3>
            <p className="text-sm text-white/60 mb-6">
              {t('fileViewer.typeUnavailableDescription')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" />
                {t('fileViewer.downloadFile')}
              </Button>
              <Button onClick={handleOpenExternal} disabled={!previewUrl} variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                {t('fileViewer.openExternally')}
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
            aria-label={t('fileViewer.previousFile')}
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
            aria-label={t('fileViewer.nextFile')}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {/* Mobile controls: all image actions remain available without gestures. */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 md:hidden">
        <div className="flex items-center justify-center gap-2">
          {canNavigate && (
            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-white/10 text-white" onClick={handlePrevious} disabled={currentIndex === 0} aria-label={t('fileViewer.previousFile')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {isImage && (
            <>
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-white/10 text-white" onClick={() => setZoom(z => Math.max(z - 25, 25))} aria-label={t('fileViewer.zoomOut')}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-white/10 text-white" onClick={() => setZoom(z => Math.min(z + 25, 400))} aria-label={t('fileViewer.zoomIn')}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-white/10 text-white" onClick={() => setRotation((rotation + 90) % 360)} aria-label={t('fileViewer.rotateClockwise')}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-white/10 text-white" onClick={handleDownload} aria-label={t('files.downloadFile', { name: currentFile.name })}>
            <Download className="h-4 w-4" />
          </Button>
          {canNavigate && (
            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full bg-white/10 text-white" onClick={handleNext} disabled={currentIndex === files.length - 1} aria-label={t('fileViewer.nextFile')}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>
        {canNavigate && <p className="mt-1 text-center text-[11px] text-white/70">{t('fileViewer.position', { current: currentIndex + 1, total: files.length })}</p>}
      </div>
      </DialogContent>
    </Dialog>
  );
}
