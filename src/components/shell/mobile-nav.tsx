'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  Repeat,
  Plus,
  FileText,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';

const TABS = [
  { href: '/', icon: LayoutDashboard, label: 'Home' },
  { href: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { href: '/habits', icon: Repeat, label: 'Habits' },
  { href: '/notes', icon: FileText, label: 'Notes' },
  { href: '/toolbox', icon: Wrench, label: 'Toolbox' },
];

function DebugOverlay() {
  const [info, setInfo] = useState('');

  useEffect(() => {
    const update = () => {
      const ih = window.innerHeight;
      const oh = document.documentElement.offsetHeight;
      const ch = document.documentElement.clientHeight;
      const sh = screen.height;
      const sah = screen.availHeight;
      const vvh = window.visualViewport?.height ?? 0;
      const vvo = window.visualViewport?.offsetTop ?? 0;
      const nav = document.getElementById('mobile-nav');
      const navRect = nav?.getBoundingClientRect();
      const navBottom = navRect ? Math.round(navRect.bottom) : '?';
      const navTop = navRect ? Math.round(navRect.top) : '?';
      const gap = navRect ? Math.round(ih - navRect.bottom) : '?';
      const bodyH = document.body.offsetHeight;
      const cs = getComputedStyle(document.documentElement);
      const safeBottom = cs.getPropertyValue('--safe-bottom') || 'n/a';

      setInfo(
        `ih:${ih} oh:${oh} ch:${ch} vvh:${Math.round(vvh)} bodyH:${bodyH}\n` +
        `scrH:${sh} availH:${sah} vvOff:${Math.round(vvo)}\n` +
        `navTop:${navTop} navBot:${navBottom} gap:${gap}\n` +
        `safeBot:${safeBottom} dpr:${window.devicePixelRatio}`
      );
    };
    update();
    const t = setInterval(update, 1000);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(t);
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      className="lg:hidden"
      style={{
        position: 'fixed',
        top: '50px',
        left: '8px',
        right: '8px',
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        fontSize: '10px',
        fontFamily: 'monospace',
        padding: '6px 8px',
        borderRadius: '8px',
        whiteSpace: 'pre',
        lineHeight: '1.4',
        pointerEvents: 'none',
      }}
    >
      {info}
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { setCommandBarOpen } = useOrbitStore();

  return (
    <>
      <DebugOverlay />
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
          bottom: '60px',
          zIndex: 50,
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
          bottom: '0',
          left: '0',
          right: '0',
          height: '44px',
          zIndex: 40,
        }}
      >
        <div className="flex items-center justify-around h-full">
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
