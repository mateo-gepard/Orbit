'use client';

import { useState, useCallback, useRef } from 'react';

interface UseSwipeToCloseOptions {
  onClose: () => void;
  threshold?: number;
}

export function useSwipeToClose({ onClose, threshold = 100 }: UseSwipeToCloseOptions) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(false);
    setIsClosing(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    // Only allow dragging downward
    if (diff > 0) {
      setDragOffset(diff);
      setIsDragging(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current === null) return;

    if (dragOffset > threshold) {
      // Past threshold — animate out then close
      setIsClosing(true);
      setDragOffset(window.innerHeight);
      // Wait for the CSS transition to finish before calling onClose
      setTimeout(() => {
        onClose();
        setDragOffset(0);
        setIsDragging(false);
        setIsClosing(false);
      }, 300);
    } else {
      // Below threshold — spring back
      setDragOffset(0);
      setIsDragging(false);
    }

    touchStartY.current = null;
  }, [dragOffset, threshold, onClose]);

  return {
    isDragging,
    isClosing,
    dragOffset,
    swipeStyles: {
      transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
      transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
    } as React.CSSProperties,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
