'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { Badge } from '@/lib/badges';
import { cn } from '@/lib/utils';

interface BadgeUnlockAnimationProps {
  badge: Badge | null;
  onClose: () => void;
}

export function BadgeUnlockAnimation({ badge, onClose }: BadgeUnlockAnimationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (badge) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(onClose, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [badge, onClose]);

  if (!badge) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-300',
        show ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
      onClick={() => {
        setShow(false);
        setTimeout(onClose, 300);
      }}
    >
      <div
        className={cn(
          'relative mx-4 max-w-sm transform transition-all duration-500',
          show ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        )}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Sparkle effects */}
        <div className="absolute -top-4 -right-4 animate-pulse">
          <Sparkles className="h-6 w-6 text-yellow-500" fill="currentColor" />
        </div>
        <div className="absolute -bottom-4 -left-4 animate-pulse animation-delay-150">
          <Sparkles className="h-5 w-5 text-yellow-400" fill="currentColor" />
        </div>
        
        {/* Main card */}
        <div className="rounded-2xl border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 p-6 shadow-2xl relative">
          {/* Close button */}
          <button
            onClick={() => {
              setShow(false);
              setTimeout(onClose, 300);
            }}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-foreground/5 transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground/50" />
          </button>

          <div className="text-center space-y-4">
            {/* Badge emoji with glow */}
            <div className="relative inline-block animate-bounce-slow">
              <div className="absolute inset-0 blur-2xl bg-yellow-400/30 rounded-full" />
              <span className="relative text-7xl block animate-wiggle">{badge.emoji}</span>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-yellow-600 dark:text-yellow-400 animate-fade-in">
                🎉 Badge Unlocked!
              </p>
              <h2 className="text-2xl font-bold animate-fade-in-up">{badge.name}</h2>
              <p className="text-sm text-muted-foreground animate-fade-in-up animation-delay-100">
                {badge.description}
              </p>
            </div>

            {/* Tier indicator */}
            {badge.tier && (
              <div className="inline-block px-3 py-1 rounded-full bg-foreground/10 text-xs font-semibold uppercase tracking-wider animate-fade-in-up animation-delay-200">
                {badge.tier} Tier
              </div>
            )}

            {/* Tap to close hint */}
            <p className="text-xs text-muted-foreground/50 pt-2 animate-fade-in animation-delay-300">
              Tap anywhere to continue
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
