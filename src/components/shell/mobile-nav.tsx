'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  CheckSquare,
  Repeat,
  Plus,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { haptic } from '@/lib/mobile';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

const TABS: { href: string; icon: typeof LayoutDashboard; labelKey: TranslationKey }[] = [
  { href: '/', icon: LayoutDashboard, labelKey: 'mobile.home' },
  { href: '/tasks', icon: CheckSquare, labelKey: 'mobile.tasks' },
  { href: '/habits', icon: Repeat, labelKey: 'mobile.habits' },
  { href: '/notes', icon: FileText, labelKey: 'mobile.notes' },
];

export function MobileNav() {
  const pathname = usePathname();
  const setCommandBarOpen = useOrbitStore((state) => state.setCommandBarOpen);
  const sidebarOpen = useOrbitStore((state) => state.sidebarOpen);
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        disabled={sidebarOpen}
        aria-hidden={sidebarOpen ? true : undefined}
        onClick={() => {
          if (sidebarOpen) return;
          haptic('medium');
          setCommandBarOpen(true);
        }}
        aria-label={t('common.create')}
        className={cn(
          'lg:hidden disabled:pointer-events-none disabled:invisible',
          pathname.startsWith('/settings') && 'hidden',
          'flex h-14 w-14 items-center justify-center',
          'rounded-full bg-foreground text-background',
          'shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
          'active:scale-95 transition-transform duration-150 motion-reduce:active:scale-100 motion-reduce:transition-none',
        )}
        style={{
          display: pathname.startsWith('/settings') ? 'none' : undefined,
          position: 'fixed',
          right: '16px',
          bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
          zIndex: 30,
        }}
      >
        <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <nav
        id="mobile-nav"
        inert={sidebarOpen ? true : undefined}
        aria-hidden={sidebarOpen ? true : undefined}
        className={cn(
          'lg:hidden border-t border-border/40 bg-background/80 backdrop-blur-xl backdrop-saturate-150',
          sidebarOpen && 'pointer-events-none invisible',
        )}
        style={{
          position: 'fixed',
          bottom: '0px',
          left: '0px',
          right: '0px',
          zIndex: 30,
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
                aria-label={t(tab.labelKey)}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => haptic('light')}
                className={cn(
                  'relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-all duration-200',
                  'active:scale-90 motion-reduce:active:scale-100 motion-reduce:transition-none',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground/50',
                )}
              >
                {isActive && (
                  <div className="absolute -top-1 h-1 w-1 rounded-full bg-foreground animate-scale-in motion-reduce:animate-none" />
                )}
                <div
                  className="relative"
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'h-5 w-5 transition-all duration-200',
                      isActive && 'scale-110',
                    )}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium leading-none transition-all duration-200',
                    isActive ? 'text-foreground' : 'text-muted-foreground/70',
                  )}
                >
                  {t(tab.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
