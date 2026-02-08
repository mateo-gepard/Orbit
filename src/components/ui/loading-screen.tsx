'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function LoadingScreen() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Auto-hide after data loads (controlled by parent)
  }, []);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-300',
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
