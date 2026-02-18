'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Bug, RefreshCw } from 'lucide-react';

interface DebugEntry {
  time: string;
  category: 'sw' | 'cache' | 'auth' | 'data' | 'nav' | 'env' | 'error';
  message: string;
}

// Global log that persists across renders
const debugLog: DebugEntry[] = [];
let debugListeners: (() => void)[] = [];

function addDebug(category: DebugEntry['category'], message: string) {
  const now = new Date();
  const time = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  debugLog.push({ time, category, message });
  if (debugLog.length > 200) debugLog.shift();
  debugListeners.forEach(fn => fn());
}

// Expose globally so other modules can log
if (typeof window !== 'undefined') {
  (window as any).__orbitDebug = addDebug;
}

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [buildId, setBuildId] = useState('');

  // Subscribe to debug log updates
  useEffect(() => {
    const listener = () => setEntries([...debugLog]);
    debugListeners.push(listener);
    return () => { debugListeners = debugListeners.filter(l => l !== listener); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, open]);

  // Run diagnostics on mount
  useEffect(() => {
    runDiagnostics();
  }, []);

  async function runDiagnostics() {
    addDebug('env', `🔧 ORBIT Debug Panel initialized`);
    addDebug('env', `URL: ${window.location.href}`);
    addDebug('env', `UA: ${navigator.userAgent.slice(0, 80)}...`);
    addDebug('env', `Viewport: ${window.innerWidth}x${window.innerHeight}`);
    
    // PWA / Standalone detection
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = (navigator as any).standalone === true;
    addDebug('env', `Standalone (media query): ${isStandalone}`);
    addDebug('env', `Standalone (navigator): ${iosStandalone}`);
    addDebug('env', `Mode: ${isStandalone || iosStandalone ? '📱 PWA' : '🌐 Browser'}`);

    // Service Worker status
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      addDebug('sw', `Registered SWs: ${regs.length}`);
      for (const reg of regs) {
        const sw = reg.active || reg.waiting || reg.installing;
        addDebug('sw', `  SW: ${reg.scope} | state: ${sw?.state || 'none'} | scriptURL: ${sw?.scriptURL?.split('/').pop() || 'N/A'}`);
      }
      if (regs.length === 0) {
        addDebug('sw', `✅ No service workers registered (disabled mode)`);
      }
      
      // Check controller
      if (navigator.serviceWorker.controller) {
        addDebug('sw', `⚠️ SW CONTROLLER ACTIVE: ${navigator.serviceWorker.controller.scriptURL}`);
        addDebug('sw', `  state: ${navigator.serviceWorker.controller.state}`);
      } else {
        addDebug('sw', `✅ No SW controller (page loaded from network)`);
      }
    } else {
      addDebug('sw', `Service Worker API not available`);
    }

    // Cache Storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      addDebug('cache', `Cache Storage entries: ${cacheNames.length}`);
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        addDebug('cache', `  "${name}": ${keys.length} items`);
        // Show first few cached URLs
        for (const req of keys.slice(0, 5)) {
          addDebug('cache', `    → ${req.url.replace(window.location.origin, '')}`);
        }
        if (keys.length > 5) {
          addDebug('cache', `    ... and ${keys.length - 5} more`);
        }
      }
      if (cacheNames.length === 0) {
        addDebug('cache', `✅ Cache Storage is empty`);
      }
    }

    // Next.js build ID — check if we're running a stale build
    try {
      const res = await fetch('/_next/data/build-id.json', { cache: 'no-store' });
      if (res.ok) {
        addDebug('cache', `Build ID endpoint: ${res.status}`);
      }
    } catch {
      // Expected to fail, that's fine
    }

    // Try to detect the build ID from __NEXT_DATA__
    const nextData = (window as any).__NEXT_DATA__;
    if (nextData) {
      setBuildId(nextData.buildId || 'unknown');
      addDebug('cache', `Next.js buildId: ${nextData.buildId || 'unknown'}`);
      addDebug('cache', `Next.js page: ${nextData.page}`);
      addDebug('cache', `Next.js runtime: ${nextData.runtimeConfig ? 'custom' : 'default'}`);
    } else {
      addDebug('cache', `⚠️ __NEXT_DATA__ not found on window`);
    }

    // Check if page was loaded from cache (Performance API)
    if (performance?.getEntriesByType) {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        addDebug('nav', `Navigation type: ${nav.type}`); // navigate, reload, back_forward, prerender
        addDebug('nav', `Transfer size: ${nav.transferSize} bytes`);
        addDebug('nav', `Was served from cache: ${nav.transferSize === 0 ? '⚠️ YES (0 bytes transferred)' : '✅ NO (fetched from network)'}`);
        addDebug('nav', `Response time: ${Math.round(nav.responseEnd - nav.requestStart)}ms`);
        addDebug('nav', `DOM complete: ${Math.round(nav.domComplete)}ms`);
      }
    }

    // Check loaded scripts to see if they're stale
    const scripts = document.querySelectorAll('script[src*="/_next/"]');
    addDebug('cache', `Loaded _next/ scripts: ${scripts.length}`);
    for (const script of Array.from(scripts).slice(0, 8)) {
      const src = (script as HTMLScriptElement).src;
      const shortSrc = src.replace(window.location.origin, '').slice(0, 80);
      addDebug('cache', `  📜 ${shortSrc}`);
    }

    // Check HTTP cache headers of current page
    try {
      const pageRes = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
      const cc = pageRes.headers.get('cache-control');
      const etag = pageRes.headers.get('etag');
      const lastMod = pageRes.headers.get('last-modified');
      addDebug('cache', `Page cache-control: ${cc || '(none)'}`);
      addDebug('cache', `Page etag: ${etag || '(none)'}`);
      addDebug('cache', `Page last-modified: ${lastMod || '(none)'}`);
    } catch (err) {
      addDebug('cache', `Could not fetch page headers: ${err}`);
    }

    // LocalStorage / SessionStorage usage
    try {
      const lsKeys = Object.keys(localStorage);
      const relevantKeys = lsKeys.filter(k => k.includes('orbit') || k.includes('firebase') || k.includes('zustand'));
      addDebug('cache', `LocalStorage keys: ${lsKeys.length} total, ${relevantKeys.length} orbit-related`);
      for (const key of relevantKeys.slice(0, 10)) {
        const val = localStorage.getItem(key);
        addDebug('cache', `  LS "${key}": ${val ? `${val.length} chars` : 'empty'}`);
      }
    } catch {
      addDebug('cache', `LocalStorage not accessible`);
    }

    // Firebase auth state
    addDebug('auth', `Checking auth state...`);
    // This will be filled in by the auth listener below

    addDebug('env', `✅ Diagnostics complete`);
  }

  // Monitor auth state changes
  useEffect(() => {
    const interval = setInterval(() => {
      // Check if firebase auth is initialized
      try {
        const { auth } = require('@/lib/firebase');
        if (auth?.currentUser) {
          addDebug('auth', `🔑 User: ${auth.currentUser.email} (${auth.currentUser.uid.slice(0, 8)}...)`);
        } else {
          addDebug('auth', `👤 No user signed in`);
        }
      } catch {
        addDebug('auth', `Firebase auth not available`);
      }
    }, 5000); // Check every 5s

    return () => clearInterval(interval);
  }, []);

  // Monitor for page visibility changes (iOS PWA can freeze/unfreeze)
  useEffect(() => {
    const handleVisibility = () => {
      addDebug('nav', `Page visibility: ${document.visibilityState} at ${new Date().toISOString()}`);
      if (document.visibilityState === 'visible') {
        addDebug('nav', `🔄 Page became visible — checking if stale...`);
        // Re-check SW status
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            addDebug('sw', `After resume: ${regs.length} SWs, controller: ${!!navigator.serviceWorker.controller}`);
          });
        }
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      addDebug('nav', `pageshow event — persisted (from bfcache): ${e.persisted}`);
      if (e.persisted) {
        addDebug('nav', `⚠️ PAGE RESTORED FROM BFCACHE — this may show stale content!`);
      }
    };

    const handleFreeze = () => addDebug('nav', `🧊 Page FROZEN (iOS background)`);
    const handleResume = () => addDebug('nav', `🔥 Page RESUMED from freeze`);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleResume);
    };
  }, []);

  const filteredEntries = filter 
    ? entries.filter(e => e.category === filter) 
    : entries;

  const categoryColors: Record<string, string> = {
    sw: 'text-blue-400',
    cache: 'text-yellow-400',
    auth: 'text-green-400',
    data: 'text-purple-400',
    nav: 'text-cyan-400',
    env: 'text-gray-400',
    error: 'text-red-400',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-[9999] h-10 w-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <Bug className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-red-400" />
          <span className="text-[12px] font-bold tracking-wider">ORBIT DEBUG</span>
          {buildId && (
            <span className="text-[9px] text-white/30 font-mono">build: {buildId.slice(0, 12)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { debugLog.length = 0; runDiagnostics(); }}
            className="text-white/40 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-white/10 overflow-x-auto">
        {[null, 'sw', 'cache', 'auth', 'nav', 'env', 'error'].map(cat => (
          <button
            key={cat || 'all'}
            onClick={() => setFilter(cat)}
            className={`text-[9px] font-mono px-2 py-0.5 rounded-md transition-colors ${
              filter === cat 
                ? 'bg-white/20 text-white' 
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {cat ? cat.toUpperCase() : 'ALL'}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
        {filteredEntries.map((entry, i) => (
          <div key={i} className="flex gap-1.5 py-0.5">
            <span className="text-white/20 shrink-0">{entry.time}</span>
            <span className={`shrink-0 ${categoryColors[entry.category] || 'text-white/50'}`}>
              [{entry.category}]
            </span>
            <span className="text-white/80 break-all">{entry.message}</span>
          </div>
        ))}
        {filteredEntries.length === 0 && (
          <p className="text-white/20 text-center py-8">No entries{filter ? ` for "${filter}"` : ''}</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 px-3 py-2 border-t border-white/10">
        <button
          onClick={async () => {
            addDebug('cache', '🗑️ Clearing ALL caches...');
            const names = await caches.keys();
            for (const name of names) {
              await caches.delete(name);
              addDebug('cache', `  Deleted: ${name}`);
            }
            addDebug('cache', '✅ All caches cleared');
          }}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-yellow-600/30 text-yellow-400 active:scale-95 transition-transform"
        >
          Clear Caches
        </button>
        <button
          onClick={async () => {
            addDebug('sw', '🗑️ Unregistering all SWs...');
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) {
              await reg.unregister();
              addDebug('sw', `  Unregistered: ${reg.scope}`);
            }
            addDebug('sw', `✅ ${regs.length} SWs unregistered`);
          }}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-blue-600/30 text-blue-400 active:scale-95 transition-transform"
        >
          Kill SWs
        </button>
        <button
          onClick={() => {
            addDebug('nav', '🔄 Force reloading page...');
            window.location.reload();
          }}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-red-600/30 text-red-400 active:scale-95 transition-transform"
        >
          Hard Reload
        </button>
      </div>
    </div>
  );
}
