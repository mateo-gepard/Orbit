'use client';

import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react';
import { Check, Archive, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  rightIcon?: typeof Check;
  leftIcon?: typeof Archive;
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
  disabled = false,
}: SwipeableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isTracking = useRef(false);
  const direction = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const [offset, setOffset] = useState(0);
  const [isReleasing, setIsReleasing] = useState(false);

  const THRESHOLD = 80;
  const MAX_SWIPE = 120;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    currentX.current = touch.clientX;
    isTracking.current = true;
    direction.current = 'none';
    setIsReleasing(false);
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTracking.current || disabled) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // Determine direction lock
    if (direction.current === 'none') {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        direction.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      return;
    }

    if (direction.current === 'vertical') return;

    // Only allow if handler exists for that direction
    if (dx > 0 && !onSwipeRight) return;
    if (dx < 0 && !onSwipeLeft) return;

    currentX.current = touch.clientX;
    const clampedOffset = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, dx));
    setOffset(clampedOffset);
  }, [disabled, onSwipeRight, onSwipeLeft]);

  const handleTouchEnd = useCallback(() => {
    if (!isTracking.current || disabled) return;
    isTracking.current = false;
    setIsReleasing(true);

    if (offset > THRESHOLD && onSwipeRight) {
      setOffset(MAX_SWIPE + 20);
      setTimeout(() => {
        onSwipeRight();
        setOffset(0);
        setIsReleasing(false);
      }, 200);
    } else if (offset < -THRESHOLD && onSwipeLeft) {
      setOffset(-(MAX_SWIPE + 20));
      setTimeout(() => {
        onSwipeLeft();
        setOffset(0);
        setIsReleasing(false);
      }, 200);
    } else {
      setOffset(0);
      setTimeout(() => setIsReleasing(false), 200);
    }
  }, [offset, onSwipeRight, onSwipeLeft, disabled]);

  const isSwipingRight = offset > 0;
  const isSwipingLeft = offset < 0;
  const passedThreshold = Math.abs(offset) > THRESHOLD;

  return (
    <div ref={containerRef} className="relative overflow-hidden swipe-item">
      {/* Right action background (swipe right = complete) */}
      {onSwipeRight && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex items-center pl-4 transition-colors duration-150',
            passedThreshold && isSwipingRight
              ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
              : 'bg-foreground/[0.03]'
          )}
          style={{ width: Math.max(0, offset) }}
        >
          <div className={cn(
            'flex items-center gap-1.5 transition-all duration-150',
            passedThreshold && isSwipingRight ? 'scale-110 opacity-100' : 'scale-90 opacity-60'
          )}>
            <RightIcon className={cn(
              'h-4 w-4',
              passedThreshold && isSwipingRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'
            )} />
            {Math.abs(offset) > 50 && (
              <span className={cn(
                'text-[11px] font-medium whitespace-nowrap',
                passedThreshold && isSwipingRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'
              )}>
                {rightLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Left action background (swipe left = archive) */}
      {onSwipeLeft && (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex items-center justify-end pr-4 transition-colors duration-150',
            passedThreshold && isSwipingLeft
              ? 'bg-orange-500/15 dark:bg-orange-500/20'
              : 'bg-foreground/[0.03]'
          )}
          style={{ width: Math.max(0, -offset) }}
        >
          <div className={cn(
            'flex items-center gap-1.5 transition-all duration-150',
            passedThreshold && isSwipingLeft ? 'scale-110 opacity-100' : 'scale-90 opacity-60'
          )}>
            {Math.abs(offset) > 50 && (
              <span className={cn(
                'text-[11px] font-medium whitespace-nowrap',
                passedThreshold && isSwipingLeft ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground/60'
              )}>
                {leftLabel}
              </span>
            )}
            <LeftIcon className={cn(
              'h-4 w-4',
              passedThreshold && isSwipingLeft ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground/60'
            )} />
          </div>
        </div>
      )}

      {/* Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isReleasing ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
        className="relative bg-card z-10"
      >
        {children}
      </div>
    </div>
  );
}
