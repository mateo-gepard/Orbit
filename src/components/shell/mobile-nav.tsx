'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  CheckSquare,
  Inbox as InboxIcon,
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
  { href: '/inbox', icon: InboxIcon, labelKey: 'nav.inbox' },
  { href: '/tasks', icon: CheckSquare, labelKey: 'mobile.tasks' },
  { href: '/habits', icon: Repeat, labelKey: 'mobile.habits' },
  { href: '/notes', icon: FileText, labelKey: 'mobile.notes' },
];

export function MobileNav() {
  const pathname = usePathname();
  const { setCommandBarOpen } = useOrbitStore();
  const { t } = useTranslation();

  return (
    <>
      <button
        onClick={() => {
          haptic('medium');
          setCommandBarOpen(true);
        }}
        aria-label="Create new item"
        className={cn(
          'lg:hidden',
          'flex h-14 w-14 items-center justify-center',
          'rounded-full bg-foreground text-background',
          'shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
          'transition-transform duration-150 active:scale-95',
        )}
        style={{
          position: 'fixed',
          right: '16px',
          bottom: 'calc(44px + env(safe-area-inset-bottom, 0px) + 12px)',
          zIndex: 50,
        }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <nav
        id="mobile-nav"
        className="select-none border-t border-border/40 bg-background/80 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
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
          style={{
            height: 'var(--bottom-nav-height)',
            paddingLeft: 'max(4px, var(--safe-left))',
            paddingRight: 'max(4px, var(--safe-right))',
          }}
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
                  'relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0 py-1 transition-all duration-200',
                  'active:scale-95',
                  isActive ? 'text-foreground' : 'text-muted-foreground/55',
                )}
              >
                <div
                  className={cn(
                    'flex h-7 min-w-9 items-center justify-center rounded-xl px-2 transition-all duration-200',
                    isActive && 'bg-foreground/[0.07]',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-all duration-200',
                      isActive && 'scale-105',
                    )}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </div>
                <span
                  className={cn(
                    'max-w-full truncate text-[10px] font-medium leading-none transition-all duration-200',
                    isActive ? 'h-2.5 opacity-100' : 'h-0 opacity-0',
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
