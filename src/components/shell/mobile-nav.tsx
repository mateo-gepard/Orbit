'use client';

import { useEffect } from 'react';
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
import { useThreadmapStore } from '@/lib/store';
import { haptic } from '@/lib/mobile';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

const PRIMARY_TABS: { href: string; icon: typeof LayoutDashboard; labelKey: TranslationKey }[] = [
  { href: '/', icon: LayoutDashboard, labelKey: 'mobile.home' },
  { href: '/tasks', icon: CheckSquare, labelKey: 'mobile.tasks' },
];

const SECONDARY_TABS: { href: string; icon: typeof LayoutDashboard; labelKey: TranslationKey }[] = [
  { href: '/habits', icon: Repeat, labelKey: 'mobile.habits' },
  { href: '/notes', icon: FileText, labelKey: 'mobile.notes' },
];

export function MobileNav() {
  const pathname = usePathname();
  const setCommandBarOpen = useThreadmapStore((state) => state.setCommandBarOpen);
  const setSidebarOpen = useThreadmapStore((state) => state.setSidebarOpen);
  const sidebarOpen = useThreadmapStore((state) => state.sidebarOpen);
  const { t } = useTranslation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  const renderTab = (tab: (typeof PRIMARY_TABS)[number]) => {
    const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
    const Icon = tab.icon;

    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-label={t(tab.labelKey)}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => haptic('light')}
        className={cn(
          'orbit-pressable relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5',
          'active:scale-95 motion-reduce:active:scale-100',
          isActive ? 'text-foreground' : 'text-muted-foreground/60',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-2 inset-y-1 rounded-2xl transition-colors',
            isActive && 'bg-foreground/[0.065]',
          )}
        />
        <Icon
          aria-hidden="true"
          className="relative h-[21px] w-[21px]"
          strokeWidth={isActive ? 2.35 : 1.8}
        />
        <span className="relative text-[10px] font-semibold leading-none tracking-[-0.01em]">
          {t(tab.labelKey)}
        </span>
      </Link>
    );
  };

  return (
    <nav
      id="mobile-nav"
      inert={sidebarOpen ? true : undefined}
      aria-hidden={sidebarOpen ? true : undefined}
      aria-label="Primary mobile navigation"
      className={cn(
        'surface-float lg:hidden border-x-0 border-b-0 bg-background/92',
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
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center px-1.5" style={{ height: 'var(--bottom-nav-height)' }}>
        {PRIMARY_TABS.map(renderTab)}

        <button
          type="button"
          onClick={() => {
            haptic('medium');
            setCommandBarOpen(true);
          }}
          aria-label={t('common.create')}
          className="group relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-foreground active:scale-95 motion-reduce:active:scale-100"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-foreground text-background shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform group-active:scale-95 dark:shadow-[0_8px_28px_rgba(0,0,0,0.5)]">
            <Plus aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="sr-only">{t('common.create')}</span>
        </button>

        {SECONDARY_TABS.map(renderTab)}
      </div>
    </nav>
  );
}
