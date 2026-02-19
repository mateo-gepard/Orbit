'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';

const HOCKEY_LOADING = [
  'Kabine wird vorbereitet... 🏒',
  'Trikots werden sortiert...',
  'Dr. Orbit macht Aufwärmübungen...',
  'Strafbank wird poliert...',
  'Spielfeld wird gewässert...',
  'Schläger werden getaped...',
  'Stutzen werden hochgezogen...',
  'Mannschaftsaufstellung läuft...',
];

export function LoadingScreen() {
  const [mounted, setMounted] = useState(false);
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');

  const loadingText = useMemo(
    () => HOCKEY_LOADING[Math.floor(Math.random() * HOCKEY_LOADING.length)],
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (hockeyMode) {
    return (
      <div
        className={cn(
          'fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300',
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
              ORBIT <span className="text-cyan-600">🩺</span>
            </h1>
            <p className="text-[11px] text-muted-foreground/60 animate-pulse">
              {loadingText}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300',
        mounted ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Orbit logo animation */}
        <div className="relative h-16 w-16">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-foreground/10" />
          {/* Spinning orbit ring */}
          <div className="absolute inset-0 animate-spin-slow">
            <div className="h-full w-full rounded-full border-2 border-transparent border-t-foreground/40" />
          </div>
          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-foreground/60 animate-pulse" />
          </div>
        </div>
        
        {/* App name */}
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-semibold tracking-tight">ORBIT</h1>
          <p className="text-[11px] text-muted-foreground/60">Loading your workspace...</p>
        </div>
      </div>
    </div>
  );
}
