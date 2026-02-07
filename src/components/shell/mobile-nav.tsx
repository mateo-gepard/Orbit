'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Sun,
  Inbox,
  CheckSquare,
  Repeat,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';

const TABS = [
  { href: '/', icon: LayoutDashboard, label: 'Home' },
  { href: '/today', icon: Sun, label: 'Today' },
  { href: '/inbox', icon: Inbox, label: 'Inbox', badge: true },
  { href: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { href: '/habits', icon: Repeat, label: 'Habits' },
];

export function MobileNav() {
  const pathname = usePathname();
  const { items, setCommandBarOpen } = useOrbitStore();
  const inboxCount = items.filter((i) => i.status === 'inbox').length;
  const [debug, setDebug] = useState('');

  useEffect(() => {
    const update = () => {
      const vh = window.innerHeight;
      const vvh = window.visualViewport?.height ?? 0;
      const dvh = document.documentElement.clientHeight;
      const bodyH = document.body.clientHeight;
      const rootDiv = document.body.firstElementChild;
      const rootH = rootDiv ? (rootDiv as HTMLElement).clientHeight : 0;
      const safeBottom = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom');
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone: boolean }).standalone === true;
      
      setDebug(`ih:${vh} vv:${Math.round(vvh)} dh:${dvh} bh:${bodyH} rh:${rootH} sb:${safeBottom.trim()} pwa:${isStandalone}`);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <>
      {/* DEBUG: Temporary overlay to diagnose positioning */}
      {debug && (
        <div className="fixed top-12 left-2 right-2 z-[9999] bg-red-500 text-white text-[10px] font-mono p-1 rounded lg:hidden">
          {debug}
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setCommandBarOpen(true)}
        className={cn(
          'fixed z-50 lg:hidden',
          'right-4 flex h-14 w-14 items-center justify-center',
          'rounded-full bg-foreground text-background',
          'shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
          'active:scale-95 transition-transform duration-150',
          'animate-scale-in'
        )}
        style={{
          bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
        }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {/* Bottom Tab Bar */}
      <nav
        className="fixed left-0 right-0 z-40 lg:hidden border-t border-border/40 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
        style={{
          bottom: 0,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* DEBUG: Red line = exact bottom edge of nav */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-500 z-50" />
        <div
          className="flex items-center justify-around"
          style={{ height: 'var(--bottom-nav-height)' }}
        >
          {TABS.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href !== '/' && pathname.startsWith(tab.href));
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200',
                  'active:scale-90',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground/50'
                )}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -top-1 h-1 w-1 rounded-full bg-foreground animate-scale-in" />
                )}
                <div className="relative">
                  <Icon
                    className={cn(
                      'h-[22px] w-[22px] transition-all duration-200',
                      isActive && 'scale-110'
                    )}
                    strokeWidth={isActive ? 2.2 : 1.5}
                  />
                  {/* Badge */}
                  {tab.badge && inboxCount > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold px-1 animate-scale-in">
                      {inboxCount > 99 ? '99+' : inboxCount}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium leading-none transition-all duration-200',
                    isActive ? 'opacity-100' : 'opacity-0 h-0'
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
