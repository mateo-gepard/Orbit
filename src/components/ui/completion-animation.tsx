'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';

interface CompletionAnimationProps {
  type: 'task' | 'habit';
  streak?: number; // For habits
  onComplete?: () => void;
}

export function CompletionAnimation({ type, streak, onComplete }: CompletionAnimationProps) {
  const [stage, setStage] = useState<'enter' | 'celebrate' | 'exit'>('enter');
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');

  useEffect(() => {
    // Normal mode: only animate habits
    // Hockey mode: animate BOTH tasks and habits
    if (type === 'task' && !hockeyMode) {
      onComplete?.();
      return;
    }

    const enterTimer = setTimeout(() => setStage('celebrate'), 50);
    const exitTimer = setTimeout(() => setStage('exit'), hockeyMode ? 1600 : 1200);
    const completeTimer = setTimeout(() => onComplete?.(), hockeyMode ? 1800 : 1400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [type, streak, onComplete, hockeyMode]);

  // Normal mode: no animation for tasks
  if (type === 'task' && !hockeyMode) return null;

  // ═══ Hockey Mode Animations ═══
  if (hockeyMode) {
    if (type === 'task') {
      // 🏒 GOAL animation — puck into net
      return (
        <div
          className={cn(
            'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-200',
            stage === 'enter' ? 'opacity-0' : stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
          )}
        >
          {/* Subtle dark overlay for drama */}
          <div
            className={cn(
              'absolute inset-0 bg-black/10 transition-opacity duration-300',
              stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
            )}
          />

          <div
            className={cn(
              'relative flex flex-col items-center gap-3 transition-all duration-500',
              stage === 'celebrate' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            )}
          >
            {/* Goal net emoji */}
            <div className="relative">
              {/* Puck flying in from left */}
              <div
                className={cn(
                  'absolute -left-8 top-1/2 -translate-y-1/2 text-2xl transition-all duration-500',
                  stage === 'celebrate' ? 'translate-x-8 opacity-0 scale-50' : 'translate-x-0 opacity-100'
                )}
              >
                🏒
              </div>
              <div
                className={cn(
                  'text-6xl transition-transform duration-300',
                  stage === 'celebrate' ? 'scale-110 animate-bounce' : 'scale-100'
                )}
                style={{ animationDuration: '0.4s', animationIterationCount: '2' }}
              >
                🥅
              </div>
            </div>

            {/* TOR! text */}
            <div
              className={cn(
                'px-5 py-2 rounded-2xl bg-foreground/90 backdrop-blur-sm transition-all duration-300',
                stage === 'celebrate' ? 'scale-100 opacity-100 translate-y-0' : 'scale-0 opacity-0 translate-y-4'
              )}
            >
              <p className="text-lg font-black tracking-widest text-background">
                TOR! 🚨
              </p>
            </div>
          </div>
        </div>
      );
    }

    // 🩺 Habit streak — hockey streak with medical flair
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
          {/* Hockey stick + medical cross combo */}
          <div className="relative flex items-center gap-1">
            <div className="text-4xl">🏒</div>
            <div className="text-3xl">⚕️</div>
          </div>

          {/* Streak as "Siegesserie" */}
          {streak && (
            <div className="px-4 py-2 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 backdrop-blur-sm">
              <p className="text-sm font-bold">
                <span className="text-cyan-600 dark:text-cyan-400 tabular-nums text-base">{streak}</span>
                <span className="text-muted-foreground ml-1.5">Tage Siegesserie!</span>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══ Normal Mode — Habit streaks ═══
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
