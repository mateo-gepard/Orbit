'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { useThreadmapStore } from '@/lib/store';
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
import { MobileNav } from './mobile-nav';
import { ThreadmapMark } from '@/components/ui/threadmap-mark';

const DetailPanel = dynamic(
  () => import('./detail-panel').then((module) => module.DetailPanel),
  { ssr: false }
);

const CommandBar = dynamic(
  () => import('./command-bar').then((module) => module.CommandBar),
  { ssr: false }
);

const CompletionAnimation = dynamic(
  () => import('@/components/ui/completion-animation').then((module) => module.CompletionAnimation),
  { ssr: false }
);

const PUBLIC_PATHS = new Set(['/', '/about', '/privacy', '/security', '/terms']);
const STANDALONE_PUBLIC_PATHS = new Set(['/about', '/privacy', '/security', '/terms']);

function ShellLoadingFrame({ german }: { german: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="h-[var(--app-height)] w-full overflow-hidden bg-background text-foreground lg:h-screen"
    >
      <span className="sr-only">{german ? 'Arbeitsbereich wird geladen' : 'Loading workspace'}</span>
      <div aria-hidden="true" className="flex h-full w-full animate-pulse motion-reduce:animate-none">
        <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar/95 lg:flex">
          <div className="flex h-20 items-center gap-3 border-b border-sidebar-border/40 px-5">
            <ThreadmapMark className="h-8 w-8 text-foreground" />
            <div className="h-3 w-24 rounded-full bg-foreground/10" />
          </div>
          <div className="space-y-6 px-4 py-5">
            <div className="h-11 rounded-xl bg-foreground/[0.055]" />
            {[4, 3, 4].map((rowCount, sectionIndex) => (
              <div key={sectionIndex} className="space-y-2.5">
                <div className="ml-2 h-2 w-14 rounded-full bg-foreground/[0.055]" />
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                  <div key={rowIndex} className="flex h-8 items-center gap-3 rounded-xl px-2.5">
                    <div className="h-4 w-4 rounded bg-foreground/[0.07]" />
                    <div className="h-2.5 rounded-full bg-foreground/[0.07]" style={{ width: `${58 + rowIndex * 9}px` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header
            className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 lg:hidden"
            style={{ height: 'calc(48px + var(--safe-top))', paddingTop: 'var(--safe-top)' }}
          >
            <div className="h-8 w-8 rounded-xl bg-foreground/[0.06]" />
            <ThreadmapMark className="h-7 w-7 text-foreground" />
            <div className="h-2.5 w-20 rounded-full bg-foreground/[0.08]" />
            <div className="flex-1" />
            <div className="h-8 w-8 rounded-xl bg-foreground/[0.06]" />
          </header>
          <header className="hidden h-12 shrink-0 items-center justify-center border-b border-border lg:flex">
            <div className="h-8 w-72 rounded-xl bg-foreground/[0.055]" />
          </header>

          <main className="min-h-0 flex-1 overflow-hidden" />
        </div>

        <div
          className="fixed inset-x-0 bottom-0 border-t border-border/40 bg-background lg:hidden"
          style={{ height: 'calc(var(--bottom-nav-height) + var(--safe-bottom))', paddingBottom: 'var(--safe-bottom)' }}
        />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const setSidebarOpen = useThreadmapStore((state) => state.setSidebarOpen);
  const sidebarOpen = useThreadmapStore((state) => state.sidebarOpen);
  const commandBarOpen = useThreadmapStore((state) => state.commandBarOpen);
  const setCommandBarOpen = useThreadmapStore((state) => state.setCommandBarOpen);
  const detailPanelOpen = useThreadmapStore((state) => state.detailPanelOpen);
  const completionAnimation = useThreadmapStore((state) => state.completionAnimation);
  const setCompletionAnimation = useThreadmapStore((state) => state.setCompletionAnimation);
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const language = useSettingsStore((s) => s.settings.language);
  const german = language === 'de';
  const publicSignedOutRoute = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // The MCP consent screen owns its own signed-out state: bouncing it to '/'
      // would discard the one-time `?request=` token and dead-end the client's
      // authorization flow.
      if (pathname === MCP_CONSENT_PATH || publicSignedOutRoute) return;
      router.replace('/');
      return;
    }

    // Returning from sign-in that started on the consent screen.
    const pending = readPendingConsentPath();
    if (pending) {
      clearPendingConsentPath();
      if (pathname !== pending) router.replace(pending);
    }
  }, [loading, pathname, publicSignedOutRoute, router, user]);

  // The MCP consent screen is a standalone decision surface. It renders without
  // the sidebar, bottom nav, or detail panel so that the grant being approved is
  // the only thing on screen — and because it provides its own <main>, wrapping
  // it here would nest two landmarks. It also renders while auth is still
  // resolving, since it shows its own progress and sign-in states.
  if (pathname === MCP_CONSENT_PATH) {
    return <>{children}</>;
  }

  // These routes own their page landmarks in both auth states. Keeping them
  // outside the workspace prevents nested main landmarks after sign-in. The
  // document itself is intentionally non-scrolling, so standalone pages must
  // also own the viewport scroll container in every auth state.
  if (STANDALONE_PUBLIC_PATHS.has(pathname)) {
    return (
      <div
        className="h-[var(--app-height)] min-h-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background text-foreground"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>
    );
  }

  if (loading) {
    // Reserve the same sidebar, header, content and mobile-navigation geometry
    // that replaces this bounded auth state. That prevents the workspace from
    // visibly jumping when Firebase resolves a persisted session.
    return <ShellLoadingFrame german={german} />;
  }

  if (!user) {
    if (publicSignedOutRoute) {
      return (
        <div
          className="h-[var(--app-height)] touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background text-foreground"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      );
    }
    return <main className="min-h-screen bg-background text-foreground" />;
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
              height: 'calc(48px + var(--safe-top))',
              paddingTop: 'var(--safe-top)',
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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center">
              {(
                <ThreadmapMark className="h-7 w-7 text-foreground" />
              )}
            </div>
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
              {'THREADMAP'}
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
              {/* No overflow here. `overflow-x: hidden` on one axis computes
                  the other to `auto`, which made this wrapper a scroll
                  container that never scrolls — and `position: sticky` resolves
                  against the *nearest* scrolling ancestor, so every sticky
                  header in the app was pinned to a box that never moves. The
                  <main> above already clips the x axis. */}
              <div className="pb-[var(--mobile-content-bottom)] lg:pb-0">
                {children}
              </div>
            </main>
            {detailPanelOpen && <DetailPanel />}
          </div>
        </div>
      </div>

      <MobileNav />
      {commandBarOpen && <CommandBar />}

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
