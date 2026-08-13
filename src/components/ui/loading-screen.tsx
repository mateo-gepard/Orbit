'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';
import { ThreadmapMark } from '@/components/ui/threadmap-mark';

export function LoadingScreen() {
  const [mounted, setMounted] = useState(false);
  const language = useSettingsStore((state) => state.settings.language);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={language === 'de' ? 'Arbeitsbereich wird geladen' : 'Loading workspace'}
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300',
        mounted ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] border border-border/60 bg-card shadow-[0_18px_45px_-28px_rgba(0,0,0,0.45)]">
          <ThreadmapMark className="h-14 w-14 text-foreground motion-safe:animate-pulse" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-semibold tracking-tight">THREADMAP</h1>
          <p className="text-[11px] text-muted-foreground/70 motion-safe:animate-pulse">
            {language === 'de' ? 'Dein Arbeitsbereich wird geladen...' : 'Loading your workspace...'}
          </p>
        </div>
      </div>
    </div>
  );
}
