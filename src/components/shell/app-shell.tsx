'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settings-store';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/mobile';
import { Sidebar } from './sidebar';
import { DetailPanel } from './detail-panel';
import { CommandBar } from './command-bar';
import { MobileNav } from './mobile-nav';
import { CompletionAnimation } from '@/components/ui/completion-animation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { setSidebarOpen, setCommandBarOpen, completionAnimation, setCompletionAnimation } = useOrbitStore();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');

  useEffect(() => {
    const setAppHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    window.visualViewport?.addEventListener('resize', setAppHeight);

    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
      window.visualViewport?.removeEventListener('resize', setAppHeight);
    };
  }, []);

  useEffect(() => {
    if (!loading && !user && pathname !== '/') {
      router.replace('/');
    }
  }, [loading, pathname, router, user]);

  if (!loading && !user) {
    return (
      <main className="min-h-[var(--app-height)] bg-background text-foreground">
        {pathname === '/' ? children : null}
      </main>
    );
  }

  return (
    <>
      <div className="flex h-[var(--app-height)] w-full max-w-[100vw] overflow-hidden bg-background">
        <Sidebar />

        <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <header
            className="z-30 flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 backdrop-blur-xl lg:hidden"
            style={{
              minHeight: 'calc(48px + var(--safe-top))',
              paddingTop: 'var(--safe-top)',
              paddingLeft: 'max(1rem, var(--safe-left))',
              paddingRight: 'max(1rem, var(--safe-right))',
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="-ml-1 h-10 w-10"
              aria-label="Open sidebar"
              onClick={() => {
                haptic('light');
                setSidebarOpen(true);
              }}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className={`flex h-6 w-6 items-center justify-center rounded-md font-semibold text-[10px] ${hockeyMode ? 'bg-cyan-600 text-white' : 'bg-foreground text-background'}`}>
              {hockeyMode ? '\u{1F3D2}' : 'O'}
            </div>
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
              {hockeyMode ? 'ORBIT \u{1FA7A}' : 'ORBIT'}
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground"
              aria-label="Search or create"
              onClick={() => {
                haptic('light');
                setCommandBarOpen(true);
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
          </header>

          <header className="hidden shrink-0 items-center border-b border-border px-6 py-2 lg:flex">
            <div className="flex-1" />
            <button
              onClick={() => {
                haptic('light');
                setCommandBarOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-[13px] text-muted-foreground/70 transition-all hover:border-border hover:bg-muted/60 hover:text-muted-foreground"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search or create...</span>
              <kbd className="ml-4 rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] leading-none">
                Cmd+K
              </kbd>
            </button>
            <div className="flex-1" />
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <main className="mobile-scroll flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-0 lg:pb-0">
              <div className="mobile-bottom-space overflow-x-hidden lg:pb-0">
                {children}
              </div>
            </main>
            <DetailPanel />
          </div>
        </div>
      </div>

      <MobileNav />
      <CommandBar />

      {completionAnimation && (
        <CompletionAnimation
          type={completionAnimation.type}
          streak={completionAnimation.streak}
          onComplete={() => setCompletionAnimation(null)}
        />
      )}
    </>
  );
}
