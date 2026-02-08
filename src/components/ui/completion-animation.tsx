'use client';

import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompletionAnimationProps {
  type: 'task' | 'habit';
  streak?: number; // For habits
  onComplete?: () => void;
}

export function CompletionAnimation({ type, streak, onComplete }: CompletionAnimationProps) {
  const [stage, setStage] = useState<'enter' | 'celebrate' | 'exit'>('enter');

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => {
      setStage('celebrate');
    }, 100);

    // Exit animation
    const exitTimer = setTimeout(() => {
      setStage('exit');
    }, type === 'habit' && streak ? 1800 : 1200);

    // Cleanup
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, type === 'habit' && streak ? 2000 : 1400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [type, streak, onComplete]);

  if (type === 'task') {
    return (
      <div
        className={cn(
          'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-300',
          stage === 'enter' ? 'opacity-0' : stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Full-screen backdrop */}
        <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]" />
        
        <div
          className={cn(
            'relative z-10 flex items-center justify-center transition-all duration-500',
            stage === 'celebrate' ? 'scale-100' : 'scale-50'
          )}
        >
          {/* Check circle */}
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-foreground/10 backdrop-blur-sm flex items-center justify-center">
              <Check className="h-8 w-8 text-foreground/80" strokeWidth={2.5} />
            </div>
            {/* Ripple effect */}
            <div
              className={cn(
                'absolute inset-0 rounded-full border-2 border-foreground/20',
                stage === 'celebrate' && 'animate-ping-once'
              )}
            />
          </div>
        </div>
      </div>
    );
  }

  // Habit completion with streak
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-300',
        stage === 'enter' ? 'opacity-0' : stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Full-screen backdrop */}
      <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]" />
      <div
        className={cn(
          'relative z-10 flex flex-col items-center gap-3 transition-all duration-500',
          stage === 'celebrate' ? 'scale-100' : 'scale-50'
        )}
      >
        {/* Sparkle icon with glow */}
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-blue-500 dark:text-blue-400" strokeWidth={2} />
          </div>
          {/* Glow effect */}
          <div
            className={cn(
              'absolute inset-0 rounded-full bg-blue-500/20',
              stage === 'celebrate' && 'animate-pulse-glow'
            )}
          />
        </div>

        {/* Streak counter */}
        {streak && (
          <div
            className={cn(
              'px-4 py-2 rounded-full bg-foreground/10 backdrop-blur-sm transition-all duration-500 delay-100',
              stage === 'celebrate' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            )}
          >
            <p className="text-sm font-semibold">
              <span className="text-blue-500 dark:text-blue-400">{streak}</span>
              <span className="text-muted-foreground ml-1">day streak! 🔥</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
