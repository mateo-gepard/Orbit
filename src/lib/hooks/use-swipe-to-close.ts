'use client';

import { useState, useCallback } from 'react';

interface UseSwipeToCloseOptions {
  onClose: () => void;
  threshold?: number;
}

export function useSwipeToClose({ onClose, threshold = 100 }: UseSwipeToCloseOptions) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart(touch.clientY);
    setTouchCurrent(touch.clientY);
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touch = e.touches[0];
    const diff = touch.clientY - touchStart;
    if (diff > 0) {
      setTouchCurrent(touch.clientY);
      setIsDragging(true);
    }
  }, [touchStart]);

  const handleTouchEnd = useCallback(() => {
    if (touchStart === null || touchCurrent === null) return;
    const diff = touchCurrent - touchStart;
    if (diff > threshold) {
      onClose();
    }
    setTouchStart(null);
    setTouchCurrent(null);
    setIsDragging(false);
  }, [touchStart, touchCurrent, threshold, onClose]);

  return {
    isDragging,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
