'use client';

import { Menu, Search } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Sidebar } from './sidebar';
import { DetailPanel } from './detail-panel';
import { CommandBar } from './command-bar';
import { MobileNav } from './mobile-nav';
import { CompletionAnimation } from '@/components/ui/completion-animation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { setSidebarOpen, setCommandBarOpen, completionAnimation, setCompletionAnimation } = useOrbitStore();

  return (
    <>
      {/* App shell fills viewport height */}
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar />

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Mobile header */}
          <header 
            className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 backdrop-blur-xl px-4 lg:hidden"
            style={{ 
              minHeight: '48px',
              paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background font-semibold text-[10px]">
              O
            </div>
            <span className="text-sm font-semibold tracking-tight">ORBIT</span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setCommandBarOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </header>

          {/* Desktop header */}
          <header className="hidden shrink-0 items-center border-b border-border px-6 py-2 lg:flex">
            <div className="flex-1" />
            <button
              onClick={() => setCommandBarOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-[13px] text-muted-foreground/70 transition-all hover:border-border hover:bg-muted/60 hover:text-muted-foreground"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search or create...</span>
              <kbd className="ml-4 rounded border border-border bg-background px-1 py-0.5 text-[10px] font-mono leading-none">
                ⌘K
              </kbd>
            </button>
            <div className="flex-1" />
          </header>

          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Main content */}
            <main 
              className="flex-1 overflow-y-auto overscroll-contain pb-0 lg:pb-0"
            >
              {/* Mobile: bottom padding so content isn't hidden behind fixed nav */}
              <div className="pb-[calc(48px+env(safe-area-inset-bottom,0px)+16px)] lg:pb-0">
                {children}
              </div>
            </main>
            <DetailPanel />
          </div>
        </div>
      </div>

      {/* These MUST be outside the overflow-hidden container 
          so position:fixed works relative to the viewport */}
      <MobileNav />
      <CommandBar />
      
      {/* Completion Animation - render at app level for proper z-index */}
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
