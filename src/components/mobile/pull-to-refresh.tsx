'use client';

import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

export function PullToRefresh({ children, onRefresh, className }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTracking, setIsTracking] = useState(false);

  const THRESHOLD = 70;
  const MAX_PULL = 100;
  const RESISTANCE = 0.4;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    setIsTracking(true);
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTracking || isRefreshing) return;
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) {
      setPullDistance(0);
      return;
    }

    const dy = (e.touches[0].clientY - startY.current) * RESISTANCE;
    if (dy < 0) {
      setPullDistance(0);
      return;
    }
    setPullDistance(Math.min(dy, MAX_PULL));
  }, [isTracking, isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isTracking) return;
    setIsTracking(false);

    if (pullDistance > THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(50); // Stay pulled slightly
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh, isTracking]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const passedThreshold = pullDistance > THRESHOLD;

  return (
    <div className={cn('relative', className)}>
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
        style={{
          top: 0,
          height: pullDistance,
          opacity: progress,
          transition: isTracking ? 'none' : 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className={cn(
          'flex items-center justify-center',
          isRefreshing && 'ptr-spinner'
        )}>
          <RefreshCw
            className={cn(
              'h-5 w-5 transition-colors',
              passedThreshold || isRefreshing
                ? 'text-foreground'
                : 'text-muted-foreground/40'
            )}
            style={{
              transform: `rotate(${progress * 180}deg)`,
              transition: isTracking ? 'none' : 'transform 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="h-full overflow-y-auto"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isTracking ? 'none' : 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
