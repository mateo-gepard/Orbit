'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CompletionAnimationProps {
  type: 'task' | 'habit';
  streak?: number;
  onComplete?: () => void;
}

export function CompletionAnimation({ type, streak, onComplete }: CompletionAnimationProps) {
  const [stage, setStage] = useState<'enter' | 'celebrate' | 'exit'>('enter');

  useEffect(() => {
    if (type === 'task') {
      onComplete?.();
      return;
    }

    const enterTimer = setTimeout(() => setStage('celebrate'), 50);
    const exitTimer = setTimeout(() => setStage('exit'), 1_000);
    const completeTimer = setTimeout(() => onComplete?.(), 1_200);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [type, onComplete]);

  if (type === 'task') return null;

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-200',
        stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-2 transition-all duration-300',
          stage === 'celebrate' ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        )}
      >
        <div className="text-5xl">🔥</div>
        {streak && (
          <div className="rounded-full border border-orange-500/30 bg-orange-500/20 px-3 py-1.5">
            <p className="text-sm font-bold">
              <span className="text-orange-600 dark:text-orange-400">{streak}</span>
              <span className="ml-1 text-muted-foreground">day streak!</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
