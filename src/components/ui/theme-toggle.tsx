'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/settings-store';

export function ThemeToggle() {
  const { resolvedTheme } = useTheme();
  const language = useSettingsStore((state) => state.settings.language);
  const updateSettings = useSettingsStore((state) => state.update);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label={language === 'de' ? 'Design umschalten' : 'Toggle theme'}
        disabled
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/50 lg:h-8 lg:w-8"
      >
        <div className="h-4 w-4" />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';
  const label = isDark
    ? (language === 'de' ? 'Helles Design verwenden' : 'Switch to light mode')
    : (language === 'de' ? 'Dunkles Design verwenden' : 'Switch to dark mode');

  return (
    <button
      type="button"
      onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-lg transition-all duration-200 lg:h-8 lg:w-8',
        'hover:bg-foreground/[0.05] active:scale-95',
        'text-muted-foreground/60 hover:text-foreground'
      )}
      aria-label={label}
      title={label}
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
