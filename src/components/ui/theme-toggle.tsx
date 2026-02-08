'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50">
        <div className="h-4 w-4" />
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200',
        'hover:bg-foreground/[0.05] active:scale-95',
        'text-muted-foreground/60 hover:text-foreground'
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div className="relative h-4 w-4">
        {/* Moon icon (dark mode) */}
        <Moon
          className={cn(
            'absolute inset-0 h-4 w-4 transition-all duration-300',
            isDark
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-0 opacity-0'
          )}
          strokeWidth={2}
        />
        {/* Sun icon (light mode) */}
        <Sun
          className={cn(
            'absolute inset-0 h-4 w-4 transition-all duration-300',
            isDark
              ? '-rotate-90 scale-0 opacity-0'
              : 'rotate-0 scale-100 opacity-100'
          )}
          strokeWidth={2}
        />
      </div>
    </button>
  );
}
