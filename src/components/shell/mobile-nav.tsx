'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  Repeat,
  Plus,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';

const TABS = [
  { href: '/', icon: LayoutDashboard, label: 'Home' },
  { href: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { href: '/habits', icon: Repeat, label: 'Habits' },
  { href: '/notes', icon: FileText, label: 'Notes' },
];

export function MobileNav() {
  const pathname = usePathname();
  const { setCommandBarOpen } = useOrbitStore();

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setCommandBarOpen(true)}
        className={cn(
          'lg:hidden',
          'flex h-14 w-14 items-center justify-center',
          'rounded-full bg-foreground text-background',
          'shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
          'active:scale-95 transition-transform duration-150',
        )}
        style={{
          position: 'fixed',
          right: '16px',
          zIndex: 50,
          bottom: 'calc(44px + env(safe-area-inset-bottom, 0px) + 12px)',
        }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {/* Bottom Tab Bar */}
      <nav
        id="mobile-nav"
        className="lg:hidden border-t border-border/40 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
        style={{
          position: 'fixed',
          bottom: '0px',
          left: '0px',
          right: '0px',
          zIndex: 40,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
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
                      'h-5 w-5 transition-all duration-200',
                      isActive && 'scale-110'
                    )}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
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
