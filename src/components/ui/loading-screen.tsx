'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';
import { ThreadmapMark } from '@/components/ui/threadmap-mark';

const HOCKEY_LOADING = [
  'Kabine wird vorbereitet... 🏒',
  'Trikots werden sortiert...',
  'Dr. Threadmap macht Aufwärmübungen...',
  'Strafbank wird poliert...',
  'Spielfeld wird gewässert...',
  'Schläger werden getaped...',
  'Stutzen werden hochgezogen...',
  'Mannschaftsaufstellung läuft...',
];

export function LoadingScreen() {
  const [mounted, setMounted] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const settings = useSettingsStore((state) => state.settings);
  const hockeyMode = settings.hockeyMode && settings.language === 'de';
  const language = settings.language;

  const loadingText = HOCKEY_LOADING[loadingIndex];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
      setLoadingIndex(Math.floor(Math.random() * HOCKEY_LOADING.length));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (hockeyMode) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Arbeitsbereich wird geladen"
        className={cn(
          'motion-surface fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300',
          mounted ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="flex flex-col items-center gap-5">
          {/* Hockey puck spinner */}
          <div className="relative h-20 w-20">
            {/* Field circle */}
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/15" />
            {/* Spinning hockey stick */}
            <div className="absolute inset-0 animate-spin-slow">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 text-xl">🏒</div>
            </div>
            {/* Center puck */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl animate-pulse">🏑</span>
            </div>
          </div>

          {/* Branding */}
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-lg font-semibold tracking-tight">
              THREADMAP <span className="text-cyan-600">🩺</span>
            </h1>
            <p className="text-[11px] text-foreground">
              {loadingText}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={language === 'de' ? 'Arbeitsbereich wird geladen' : 'Loading workspace'}
      className={cn(
        'motion-surface fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300',
        mounted ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] border border-border/60 bg-card shadow-[0_18px_45px_-28px_rgba(0,0,0,0.45)]">
          <ThreadmapMark className="h-14 w-14 text-foreground motion-safe:animate-pulse" />
        </div>
        
        {/* App name */}
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-semibold tracking-tight">THREADMAP</h1>
          <p className="text-[11px] text-foreground">
            {language === 'de' ? 'Dein Arbeitsbereich wird geladen…' : 'Loading your workspace…'}
          </p>
        </div>
      </div>
    </div>
  );
}
