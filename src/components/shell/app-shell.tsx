'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settings-store';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/mobile';
import {
  MCP_CONSENT_PATH,
  clearPendingConsentPath,
  readPendingConsentPath,
} from '@/lib/mcp-consent-return';
import { Sidebar } from './sidebar';
import { CommandBar } from './command-bar';
import { MobileNav } from './mobile-nav';
import { CompletionAnimation } from '@/components/ui/completion-animation';

const DetailPanel = dynamic(
  () => import('./detail-panel').then((module) => module.DetailPanel),
  { ssr: false }
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const setSidebarOpen = useOrbitStore((state) => state.setSidebarOpen);
  const sidebarOpen = useOrbitStore((state) => state.sidebarOpen);
  const setCommandBarOpen = useOrbitStore((state) => state.setCommandBarOpen);
  const detailPanelOpen = useOrbitStore((state) => state.detailPanelOpen);
  const completionAnimation = useOrbitStore((state) => state.completionAnimation);
  const setCompletionAnimation = useOrbitStore((state) => state.setCompletionAnimation);
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const language = useSettingsStore((s) => s.settings.language);
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');
  const german = language === 'de';

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
    if (loading) return;

    if (!user) {
      // The MCP consent screen owns its own signed-out state: bouncing it to '/'
      // would discard the one-time `?request=` token and dead-end the client's
      // authorization flow.
      if (pathname === MCP_CONSENT_PATH || pathname === '/') return;
      router.replace('/');
      return;
    }

    // Returning from sign-in that started on the consent screen.
    const pending = readPendingConsentPath();
    if (pending) {
      clearPendingConsentPath();
      if (pathname !== pending) router.replace(pending);
    }
  }, [loading, pathname, router, user]);

  // The MCP consent screen is a standalone decision surface. It renders without
  // the sidebar, bottom nav, or detail panel so that the grant being approved is
  // the only thing on screen — and because it provides its own <main>, wrapping
  // it here would nest two landmarks. It also renders while auth is still
  // resolving, since it shows its own progress and sign-in states.
  if (pathname === MCP_CONSENT_PATH) {
    return <>{children}</>;
  }

  if (loading) {
    return <main className="min-h-screen bg-background text-foreground" />;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        {pathname === '/' ? children : null}
      </main>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        {german ? 'Zum Hauptinhalt springen' : 'Skip to main content'}
      </a>
      <div className="flex h-[var(--app-height)] w-full max-w-[100vw] overflow-hidden bg-background lg:h-screen">
        <Sidebar />

        <div
          className="flex flex-1 flex-col overflow-hidden min-w-0 max-w-full"
          inert={sidebarOpen ? true : undefined}
          aria-hidden={sidebarOpen ? true : undefined}
        >
          <header
            className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 backdrop-blur-xl px-4 lg:hidden"
            style={{
              minHeight: '48px',
              paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 h-11 w-11"
              aria-label={german ? 'Navigation öffnen' : 'Open navigation'}
              onClick={() => {
                haptic('light');
                setSidebarOpen(true);
              }}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className={`flex h-6 w-6 items-center justify-center rounded-md font-semibold text-[10px] ${hockeyMode ? 'bg-cyan-600 text-white' : 'bg-foreground text-background'}`}>
              {hockeyMode ? '\u{1F3D2}' : 'T'}
            </div>
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
              {hockeyMode ? 'THREADMAP \u{1FA7A}' : 'THREADMAP'}
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 h-11 w-11 text-muted-foreground"
              aria-label={german ? 'Suchen oder erstellen' : 'Search or create'}
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
              className="surface-card orbit-pressable flex min-w-72 items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] text-muted-foreground/70 outline-none hover:bg-background hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/25"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{german ? 'Suchen oder erstellen …' : 'Search or create…'}</span>
            </button>
            <div className="flex-1" />
          </header>

          <div className="flex flex-1 overflow-hidden min-h-0">
            <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-0 lg:pb-0">
              <div className="pb-[calc(48px+env(safe-area-inset-bottom,0px)+16px)] lg:pb-0 overflow-x-hidden">
                {children}
              </div>
            </main>
            {detailPanelOpen && <DetailPanel />}
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
