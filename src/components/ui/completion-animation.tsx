'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';
import { useOrbitStore } from '@/lib/store';

interface CompletionAnimationProps {
  type: 'task' | 'habit';
  streak?: number; // For habits
  onComplete?: () => void;
}

// Hockey fun facts / celebration lines (German)
const GOAL_CELEBRATIONS = [
  'TOR! 🚨',
  'TOOOR! 🚨',
  'TREFFER! 🏒',
  'VOLLTREFFER! 🎯',
  'EINGENETZT! 🥅',
];

const MEDICAL_QUIPS = [
  'Diagnose: Erfolgreich! 🩺',
  'Patient geheilt! ✅',
  'OP gelungen! 🩺',
  'Behandlung abgeschlossen! 💉',
  'Befund: Positiv! 📋',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function CompletionAnimation({ type, streak, onComplete }: CompletionAnimationProps) {
  const [stage, setStage] = useState<'enter' | 'celebrate' | 'exit'>('enter');
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');
  const items = useOrbitStore((s) => s.items);

  // Count how many tasks were completed today (for hat-trick detection)
  const completedToday = useMemo(() => {
    if (!hockeyMode || type !== 'task') return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const start = todayStart.getTime();
    return items.filter(
      (i) => i.type === 'task' && i.status === 'done' && i.completedAt && i.completedAt >= start
    ).length;
  }, [hockeyMode, type, items]);

  const isHatTrick = completedToday > 0 && completedToday % 3 === 0;
  const isMedicalMode = type === 'task' && Math.random() > 0.6; // 40% chance of medical quip

  // Stable random picks
  const celebrationText = useMemo(() => {
    if (isHatTrick) return 'HAT-TRICK! 🎩🏒🏒🏒';
    if (isMedicalMode) return pickRandom(MEDICAL_QUIPS);
    return pickRandom(GOAL_CELEBRATIONS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (type === 'task' && !hockeyMode) {
      onComplete?.();
      return;
    }

    const duration = hockeyMode && isHatTrick ? 2200 : hockeyMode ? 1700 : 1200;
    const exitDelay = duration - 200;

    const enterTimer = setTimeout(() => setStage('celebrate'), 50);
    const exitTimer = setTimeout(() => setStage('exit'), exitDelay);
    const completeTimer = setTimeout(() => onComplete?.(), duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [type, streak, onComplete, hockeyMode, isHatTrick]);

  if (type === 'task' && !hockeyMode) return null;

  // ═══ Hockey Mode: Task completion ═══
  if (hockeyMode && type === 'task') {
    return (
      <div
        className={cn(
          'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-200',
          stage === 'enter' ? 'opacity-0' : stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Red siren flash for hat-tricks */}
        {isHatTrick && (
          <div
            className={cn(
              'absolute inset-0 transition-opacity duration-150',
              stage === 'celebrate' ? 'animate-pulse' : 'opacity-0'
            )}
            style={{
              background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.12) 0%, transparent 70%)',
              animationDuration: '0.3s',
            }}
          />
        )}

        {/* Subtle dark overlay */}
        <div
          className={cn(
            'absolute inset-0 bg-black/8 transition-opacity duration-300',
            stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Flying pucks decoration */}
        {stage === 'celebrate' && (
          <>
            <div className="absolute text-2xl animate-bounce" style={{ top: '25%', left: '18%', animationDelay: '0ms', animationDuration: '0.6s' }}>🏒</div>
            <div className="absolute text-xl animate-bounce" style={{ top: '30%', right: '22%', animationDelay: '150ms', animationDuration: '0.5s' }}>🏑</div>
            {isHatTrick && (
              <>
                <div className="absolute text-2xl animate-bounce" style={{ bottom: '30%', left: '25%', animationDelay: '100ms', animationDuration: '0.7s' }}>🩺</div>
                <div className="absolute text-xl animate-bounce" style={{ bottom: '25%', right: '18%', animationDelay: '200ms', animationDuration: '0.5s' }}>⚕️</div>
              </>
            )}
          </>
        )}

        <div
          className={cn(
            'relative flex flex-col items-center gap-3 transition-all',
            isHatTrick ? 'duration-700' : 'duration-500',
            stage === 'celebrate' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          )}
        >
          {/* Main emoji — goal net or hat */}
          <div className="relative">
            <div
              className={cn(
                'transition-transform',
                isHatTrick ? 'text-7xl' : 'text-6xl',
                stage === 'celebrate' ? 'scale-110' : 'scale-100'
              )}
              style={stage === 'celebrate' ? { animation: 'bounce 0.4s ease-in-out 2' } : undefined}
            >
              {isHatTrick ? '🎩' : '🥅'}
            </div>
          </div>

          {/* Celebration text */}
          <div
            className={cn(
              'px-5 py-2.5 rounded-2xl backdrop-blur-sm transition-all duration-400',
              isHatTrick
                ? 'bg-gradient-to-r from-amber-500/90 to-red-500/90 shadow-lg shadow-amber-500/20'
                : isMedicalMode
                ? 'bg-emerald-600/90 shadow-lg shadow-emerald-500/10'
                : 'bg-foreground/90',
              stage === 'celebrate' ? 'scale-100 opacity-100 translate-y-0' : 'scale-0 opacity-0 translate-y-4'
            )}
          >
            <p className={cn(
              'font-black tracking-wider text-background',
              isHatTrick ? 'text-xl' : 'text-lg'
            )}>
              {celebrationText}
            </p>
          </div>

          {/* Goal count subtitle */}
          {completedToday > 1 && (
            <div
              className={cn(
                'px-3 py-1 rounded-full bg-foreground/10 backdrop-blur-sm transition-all duration-300 delay-200',
                stage === 'celebrate' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              )}
            >
              <p className="text-[11px] font-semibold text-foreground/60 tabular-nums">
                {completedToday}. Tor heute
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══ Hockey Mode: Habit streak ═══
  if (hockeyMode && type === 'habit') {
    return (
      <div
        className={cn(
          'fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-200',
          stage === 'enter' ? 'opacity-0' : stage === 'celebrate' ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div
          className={cn(
            'flex flex-col items-center gap-2.5 transition-all duration-300',
            stage === 'celebrate' ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          )}
        >
          {/* Hockey stick + medical cross combo */}
          <div className="relative flex items-center gap-1">
            <div className="text-4xl" style={stage === 'celebrate' ? { animation: 'bounce 0.5s ease-in-out' } : undefined}>🏒</div>
            <div className="text-3xl">⚕️</div>
          </div>

          {/* Streak as "Siegesserie" with jersey-style number */}
          {streak && (
            <div className="px-4 py-2.5 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 backdrop-blur-sm">
              <p className="text-sm font-bold text-center">
                <span className="text-cyan-600 dark:text-cyan-400 tabular-nums text-xl font-black">{streak}</span>
                <br />
                <span className="text-muted-foreground text-[11px]">
                  {streak === 1 ? 'Tag am Stück!' : 'Tage Siegesserie! 🔥'}
                </span>
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
        <div className="relative">
          <div className="text-5xl">🔥</div>
        </div>
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
