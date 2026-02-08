'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompletionAnimationProps {
  type: 'task' | 'habit';
  streak?: number; // For habits
  onComplete?: () => void;
}

export function CompletionAnimation({ type, streak, onComplete }: CompletionAnimationProps) {
  const [stage, setStage] = useState<'enter' | 'celebrate' | 'exit'>('enter');

  useEffect(() => {
    // Only show animation for habits, not tasks
    if (type === 'task') {
      onComplete?.();
      return;
    }

    // Enter animation
    const enterTimer = setTimeout(() => {
      setStage('celebrate');
    }, 50);

    // Exit animation
    const exitTimer = setTimeout(() => {
      setStage('exit');
    }, 1200);

    // Cleanup
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, 1400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [type, streak, onComplete]);

  // Don't render anything for tasks
  if (type === 'task') {
    return null;
  }

  // Habit completion with streak
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-200',
        stage === 'enter' ? 'opacity-0' : stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-2 transition-all duration-300',
          stage === 'celebrate' ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        )}
      >
        {/* Fire emoji with glow */}
        <div className="relative">
          <div className="text-5xl">🔥</div>
        </div>

        {/* Streak counter */}
        {streak && (
          <div className="px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/30">
            <p className="text-sm font-bold">
              <span className="text-orange-600 dark:text-orange-400">{streak}</span>
              <span className="text-muted-foreground ml-1">day streak!</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
