'use client';

import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react';
import { Check, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/mobile';

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  rightIcon?: typeof Check;
  leftIcon?: typeof Archive;
  leftTone?: 'neutral' | 'destructive';
  disabled?: boolean;
}

export function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Done',
  leftLabel = 'Archive',
  rightIcon: RightIcon = Check,
  leftIcon: LeftIcon = Archive,
  leftTone = 'neutral',
  disabled = false,
}: SwipeableRowProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffset = useRef(0);
  const isTracking = useRef(false);
  const thresholdHapticFired = useRef(false);
  const direction = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const [offset, setOffset] = useState(0);
  const [isReleasing, setIsReleasing] = useState(false);

  const THRESHOLD = 80;
  const MAX_SWIPE = 120;

  const reset = useCallback(() => {
    isTracking.current = false;
    direction.current = 'none';
    thresholdHapticFired.current = false;
    currentOffset.current = 0;
    setOffset(0);
    setIsReleasing(false);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    currentOffset.current = 0;
    isTracking.current = true;
    thresholdHapticFired.current = false;
    direction.current = 'none';
    setIsReleasing(false);
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTracking.current || disabled) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (direction.current === 'none') {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        direction.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      return;
    }

    if (direction.current === 'vertical') return;
    if (dx > 0 && !onSwipeRight) return;
    if (dx < 0 && !onSwipeLeft) return;

    const clampedOffset = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, dx));
    currentOffset.current = clampedOffset;
    setOffset(clampedOffset);

    const passedThreshold = Math.abs(clampedOffset) > THRESHOLD;
    if (passedThreshold && !thresholdHapticFired.current) {
      haptic('light');
      thresholdHapticFired.current = true;
    } else if (!passedThreshold) {
      thresholdHapticFired.current = false;
    }
  }, [disabled, onSwipeRight, onSwipeLeft]);

  const handleTouchEnd = useCallback(() => {
    if (!isTracking.current || disabled) return;
    const releaseOffset = currentOffset.current;
    isTracking.current = false;
    thresholdHapticFired.current = false;
    setIsReleasing(true);

    if (releaseOffset > THRESHOLD && onSwipeRight) {
      haptic('success');
      setOffset(MAX_SWIPE + 20);
      setTimeout(() => {
        onSwipeRight();
        reset();
      }, 180);
    } else if (releaseOffset < -THRESHOLD && onSwipeLeft) {
      haptic(leftTone === 'destructive' ? 'error' : 'medium');
      setOffset(-(MAX_SWIPE + 20));
      setTimeout(() => {
        onSwipeLeft();
        reset();
      }, 180);
    } else {
      setOffset(0);
      setTimeout(reset, 180);
    }
  }, [disabled, leftTone, onSwipeRight, onSwipeLeft, reset]);

  const handleTouchCancel = useCallback(() => {
    if (!isTracking.current) return;
    setIsReleasing(true);
    setOffset(0);
    setTimeout(reset, 180);
  }, [reset]);

  const isSwipingRight = offset > 0;
  const isSwipingLeft = offset < 0;
  const passedThreshold = Math.abs(offset) > THRESHOLD;
  const leftActiveClasses = leftTone === 'destructive'
    ? 'bg-red-500/15 dark:bg-red-500/20'
    : 'bg-blue-500/15 dark:bg-blue-500/20';
  const leftTextClasses = leftTone === 'destructive'
    ? 'text-red-600 dark:text-red-400'
    : 'text-blue-600 dark:text-blue-400';

  return (
    <div className="swipe-item relative overflow-hidden">
      {onSwipeRight && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex items-center pl-4 transition-colors duration-150',
            passedThreshold && isSwipingRight
              ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
              : 'bg-foreground/[0.03]',
          )}
          style={{ width: Math.max(0, offset) }}
        >
          <div className={cn(
            'flex items-center gap-1.5 transition-all duration-150',
            passedThreshold && isSwipingRight ? 'scale-110 opacity-100' : 'scale-90 opacity-60',
          )}>
            <RightIcon className={cn(
              'h-4 w-4',
              passedThreshold && isSwipingRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60',
            )} />
            {Math.abs(offset) > 50 && (
              <span className={cn(
                'whitespace-nowrap text-[11px] font-medium',
                passedThreshold && isSwipingRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60',
              )}>
                {rightLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {onSwipeLeft && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex items-center justify-end pr-4 transition-colors duration-150',
            passedThreshold && isSwipingLeft ? leftActiveClasses : 'bg-foreground/[0.03]',
          )}
          style={{ width: Math.max(0, -offset) }}
        >
          <div className={cn(
            'flex items-center gap-1.5 transition-all duration-150',
            passedThreshold && isSwipingLeft ? 'scale-110 opacity-100' : 'scale-90 opacity-60',
          )}>
            {Math.abs(offset) > 50 && (
              <span className={cn(
                'whitespace-nowrap text-[11px] font-medium',
                passedThreshold && isSwipingLeft ? leftTextClasses : 'text-muted-foreground/60',
              )}>
                {leftLabel}
              </span>
            )}
            <LeftIcon className={cn(
              'h-4 w-4',
              passedThreshold && isSwipingLeft ? leftTextClasses : 'text-muted-foreground/60',
            )} />
          </div>
        </div>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isReleasing ? 'transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
        className="relative z-10 bg-card"
      >
        {children}
      </div>
    </div>
  );
}
