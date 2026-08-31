'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  LayoutDashboard,
  FolderKanban,
  Repeat,
  Target,
  FileText,
  Calendar,
  Archive,
  X,
  LogOut,
  Plus,
  CheckSquare,
  Files,
  Pencil,
  Trash2,
  Wrench,
  Plane,
  Route,
  FileBarChart,
  GraduationCap,
  Gem,
  Settings,
} from 'lucide-react';
import { useToolboxStore, TOOLS, type ToolId } from '@/lib/toolbox-store';
import { cn } from '@/lib/utils';
import { useThreadmapStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { useSettingsStore } from '@/lib/settings-store';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
// LIFE_AREA_TAGS now managed via store.getAllTags()
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ThreadmapMark } from '@/components/ui/threadmap-mark';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

const NAV_SECTIONS: { labelKey?: TranslationKey; items: { href: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] }[] = [
  {
    items: [
      { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
    ],
  },
  {
    labelKey: 'nav.organize',
    items: [
      { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban },
      { href: '/habits', labelKey: 'nav.habits', icon: Repeat },
      { href: '/goals', labelKey: 'nav.goals', icon: Target },
    ],
  },
  {
    labelKey: 'nav.capture',
    items: [
      { href: '/notes', labelKey: 'nav.notes', icon: FileText },
      { href: '/calendar', labelKey: 'nav.calendar', icon: Calendar },
      { href: '/files', labelKey: 'nav.files', icon: Files },
      { href: '/archive', labelKey: 'nav.archive', icon: Archive },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, isDemo } = useAuth();
  const {
    sidebarOpen, setSidebarOpen, activeTag, setActiveTag, setCommandBarOpen,
    addCustomTag, removeTag, renameTag, getAllTags,
  } = useThreadmapStore();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const addTagButtonRef = useRef<HTMLButtonElement>(null);
  const editTagButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const openCommandAfterCloseRef = useRef(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const allTags = getAllTags();
  const showBadges = useSettingsStore((s) => s.settings.showSidebarBadges);
  const settingsDisplayName = useSettingsStore((s) => s.settings.displayName);
  const settingsBio = useSettingsStore((s) => s.settings.bio);
  const showProfilePhoto = useSettingsStore((s) => s.settings.privacy.showProfilePhoto);
  const accentColor = useSettingsStore((s) => s.settings.accentColor);
  const { t, tp, lang } = useTranslation();
  const storeItems = useThreadmapStore((s) => s.items);
  const affectedTagItemCount = deletingTag
    ? storeItems.filter((item) => item.tags?.includes(deletingTag)).length
    : 0;

  // Compute badge counts per route
  const badgeCounts = useMemo(() => {
    if (!showBadges) return {} as Record<string, number>;
    const active = storeItems.filter((i) => i.status !== 'archived' && i.status !== 'done');
    return {
      '/tasks': active.filter((i) => i.type === 'task').length,
      '/projects': active.filter((i) => i.type === 'project').length,
      '/habits': active.filter((i) => i.type === 'habit').length,
      '/goals': active.filter((i) => i.type === 'goal').length,
    } as Record<string, number>;
  }, [showBadges, storeItems]);

  const TOOL_ICON_MAP: Record<ToolId, typeof Plane> = {
    flight: Plane,
    dispatch: Route,
    briefing: FileBarChart,
    abitur: GraduationCap,
    wishlist: Gem,
  };
  const enabledToolIds = useToolboxStore((s) => s.enabledTools);
  const enabledTools = useMemo(
    () => TOOLS.filter((t) => enabledToolIds.includes(t.id)),
    [enabledToolIds]
  );

  useEffect(() => {
    if (isAddingTag && (isDesktop || sidebarOpen)) addInputRef.current?.focus();
  }, [isAddingTag, isDesktop, sidebarOpen]);

  useEffect(() => {
    if (editingTag && (isDesktop || sidebarOpen)) editInputRef.current?.focus();
  }, [editingTag, isDesktop, sidebarOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncViewport = () => {
      setIsDesktop(media.matches);
      if (media.matches) setSidebarOpen(false);
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, [setSidebarOpen]);

  useEffect(() => {
    if (sidebarOpen || !openCommandAfterCloseRef.current) return;
    openCommandAfterCloseRef.current = false;
    const frame = requestAnimationFrame(() => setCommandBarOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [setCommandBarOpen, sidebarOpen]);

  const handleAddTag = () => {
    const trimmed = newTagValue.trim().toLowerCase();
    if (trimmed) {
      addCustomTag(trimmed);
    }
    setNewTagValue('');
    setIsAddingTag(false);
    requestAnimationFrame(() => addTagButtonRef.current?.focus());
  };

  const handleRenameTag = (oldTag: string) => {
    const trimmed = editValue.trim().toLowerCase();
    if (trimmed && trimmed !== oldTag) {
      renameTag(oldTag, trimmed);
    }
    setEditingTag(null);
    setEditValue('');
    requestAnimationFrame(() => editTagButtonRefs.current[oldTag]?.focus());
  };

  const handleDeleteTag = (tag: string) => {
    removeTag(tag);
    if (activeTag === tag) setActiveTag(null);
    if (pathname === `/areas/${encodeURIComponent(tag)}`) router.push('/');
    setDeletingTag(null);
  };

  const handleSecureSignOut = async (): Promise<boolean> => {
    try {
      const result = await signOut();
      if (!result.localCleanupComplete || !result.notificationCleanupComplete) {
        const warnings = lang === 'de' ? [
          ...(result.localCleanupComplete ? [] : ['Ein Teil der Browserdaten konnte nicht entfernt werden; dauerhaftes Caching bleibt deaktiviert. Schließe alle Threadmap-Tabs.']),
          ...(result.notificationCleanupComplete ? [] : ['Die Benachrichtigungsregistrierung konnte nicht vollständig deaktiviert werden. Deaktiviere Threadmap-Benachrichtigungen in den Browser-Einstellungen.']),
        ] : [
          ...(result.localCleanupComplete ? [] : ['Some browser data could not be removed; persistent caching remains disabled. Close every Threadmap tab.']),
          ...(result.notificationCleanupComplete ? [] : ['The notification registration could not be fully disabled. Turn off Threadmap notifications in your browser settings.']),
        ];
        toast.warning(warnings.join(' '));
      }
      return true;
    } catch {
      toast.error(lang === 'de'
        ? 'Die sichere Abmeldung konnte nicht abgeschlossen werden. Du bist weiterhin angemeldet; versuche es erneut.'
        : 'Secure sign-out could not finish. You are still signed in; try again.');
      return false;
    }
  };

  const sidebarPanel = (
      <aside
        aria-label={t('sidebar.primaryNav')}
        className={cn(
          'flex h-full flex-col border-r border-sidebar-border/60 bg-sidebar/95 backdrop-blur-xl outline-none',
          isDesktop
            ? 'relative w-[260px] shadow-none'
            : 'fixed left-0 top-0 z-50 h-dvh w-[min(280px,calc(100vw-2rem))] shadow-[var(--shadow-panel)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left data-[state=open]:duration-300 data-[state=closed]:duration-200 motion-reduce:animate-none'
        )}
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        }}
      >
        {!isDesktop && (
          <>
            <DialogPrimitive.Title className="sr-only">
              {t('sidebar.primaryNav')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {t('sidebar.primaryNavDesc')}
            </DialogPrimitive.Description>
          </>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            {(
              <ThreadmapMark className="h-8 w-8 shrink-0 text-foreground" />
            )}
            <span className="text-[15px] font-semibold tracking-tight">
              {'THREADMAP'}
            </span>
          </div>
          <Button
            aria-label={t('sidebar.closeNav')}
            variant="ghost"
            size="icon"
            className="h-11 w-11 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Quick Add */}
        <div className="px-3 pb-2">
          <button
            onClick={() => {
              if (isDesktop) {
                setCommandBarOpen(true);
                return;
              }
              openCommandAfterCloseRef.current = true;
              setSidebarOpen(false);
            }}
            className="surface-card orbit-pressable flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 lg:min-h-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">{t('sidebar.quickAdd')}</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {NAV_SECTIONS.map((section, sIdx) => (
            <div key={sIdx} className={cn(sIdx > 0 && 'mt-5')} data-slot="nav-section">
              {section.labelKey && (
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase text-muted-foreground/60">
                  {t(section.labelKey)}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      data-slot="nav-item"
                      data-active={isActive ? 'true' : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      style={isActive && accentColor ? { borderColor: accentColor } : undefined}
                      className={cn(
                        'group orbit-pressable flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/25 lg:min-h-0',
                        isActive
                          ? 'bg-foreground/[0.065] text-foreground shadow-[var(--shadow-hairline)]'
                          : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-[15px] w-[15px] shrink-0 transition-colors',
                          isActive ? 'text-foreground' : 'text-muted-foreground/70'
                        )}
                        style={isActive && accentColor ? { color: accentColor } : undefined}
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {showBadges && badgeCounts[item.href] > 0 && (
                        <span className="ml-auto rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/60">
                          {badgeCounts[item.href]}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Toolbox */}
          <div className="mt-5">
            <div className="mb-1 px-2 text-[11px] font-semibold uppercase text-muted-foreground/60">
              {t('nav.toolbox')}
            </div>
            <div className="space-y-0.5">
              <Link
                href="/toolbox"
                onClick={() => setSidebarOpen(false)}
                aria-current={pathname === '/toolbox' ? 'page' : undefined}
                className={cn(
                  'group orbit-pressable flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/25 lg:min-h-0',
                  pathname === '/toolbox'
                    ? 'bg-foreground/[0.065] text-foreground shadow-[var(--shadow-hairline)]'
                    : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
                )}
              >
                <Wrench
                  className={cn(
                    'h-[15px] w-[15px] shrink-0 transition-colors',
                    pathname === '/toolbox' ? 'text-foreground' : 'text-muted-foreground/70'
                  )}
                  strokeWidth={pathname === '/toolbox' ? 2 : 1.5}
                />
                <span className="flex-1">{t('nav.allTools')}</span>
              </Link>
              {enabledTools.map((tool) => {
                const Icon = TOOL_ICON_MAP[tool.id];
                const isActive = pathname === tool.href;
                return (
                  <Link
                    key={tool.id}
                    href={tool.href}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group orbit-pressable flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/25 lg:min-h-0',
                      isActive
                        ? 'bg-foreground/[0.065] text-foreground shadow-[var(--shadow-hairline)]'
                        : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[15px] w-[15px] shrink-0 transition-colors',
                        isActive ? 'text-foreground' : 'text-muted-foreground/70'
                      )}
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                    <span className="flex-1">{tool.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Tags / Areas */}
          <div className="mt-5">
            <div className="mb-1 px-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground/60">
                {t('nav.areas')}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  ref={addTagButtonRef}
                  type="button"
                  onClick={() => setIsManaging(!isManaging)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-6 lg:w-6',
                    isManaging
                      ? 'text-foreground bg-foreground/10'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                  )}
                  title={isManaging ? t('sidebar.doneTags') : t('sidebar.manageTags')}
                  aria-label={isManaging ? t('sidebar.doneTags') : t('sidebar.manageTags')}
                  aria-pressed={isManaging}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingTag(true); setIsManaging(true); }}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-6 lg:w-6"
                  title={t('sidebar.addTag')}
                  aria-label={t('sidebar.addTag')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 px-1 py-1">
              {allTags.map((tag) => {
                const isEditing = editingTag === tag;
                const areaHref = `/areas/${encodeURIComponent(tag)}`;

                if (isEditing) {
                  return (
                    <form
                      key={tag}
                      className="flex items-center gap-1"
                      onSubmit={(e) => { e.preventDefault(); handleRenameTag(tag); }}
                    >
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleRenameTag(tag)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingTag(null);
                            setEditValue('');
                            requestAnimationFrame(() => editTagButtonRefs.current[tag]?.focus());
                          }
                        }}
                        aria-label={`${t('common.rename')} ${tag}`}
                        className="w-16 rounded-lg border border-border/60 bg-background/70 px-1.5 py-0.5 text-[11px] font-medium outline-none focus:ring-2 focus:ring-ring/25"
                      />
                    </form>
                  );
                }

                return (
                  <div key={tag} className="group relative flex items-center">
                    <Link
                      href={areaHref}
                      onClick={() => {
                        setActiveTag(tag);
                        setSidebarOpen(false);
                      }}
                      aria-current={pathname === areaHref ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center rounded-lg px-2 py-1 text-[11px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/25 lg:min-h-0 lg:py-0.5',
                        pathname === areaHref
                          ? 'bg-foreground text-background shadow-[var(--shadow-soft)]'
                          : 'text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-muted-foreground'
                      )}
                    >
                      {tag}
                    </Link>
                    {isManaging && (
                      <div className="flex items-center gap-0.5 ml-0.5">
                        <button
                          ref={(element) => { editTagButtonRefs.current[tag] = element; }}
                          type="button"
                          onClick={() => { setEditingTag(tag); setEditValue(tag); }}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-6 lg:w-6"
                          title={t('common.rename')}
                          aria-label={`${t('common.rename')} ${tag}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTag(tag)}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-6 lg:w-6"
                          title={t('common.delete')}
                          aria-label={`${t('common.delete')} ${tag}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add new tag inline */}
              {isAddingTag && (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => { e.preventDefault(); handleAddTag(); }}
                >
                  <input
                    ref={addInputRef}
                    value={newTagValue}
                    onChange={(e) => setNewTagValue(e.target.value)}
                    onBlur={handleAddTag}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAddingTag(false);
                        setNewTagValue('');
                        requestAnimationFrame(() => addTagButtonRef.current?.focus());
                      }
                    }}
                    aria-label={t('sidebar.addTag')}
                    placeholder={t('sidebar.newTagPlaceholder')}
                    className="w-20 rounded-lg border border-border/60 bg-background/70 px-1.5 py-0.5 text-[11px] font-medium outline-none focus:ring-2 focus:ring-ring/25 placeholder:text-muted-foreground/40"
                  />
                </form>
              )}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border/60 bg-sidebar/70 px-3 py-3">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  aria-label={t('nav.settings')}
                  href="/settings"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'orbit-pressable flex h-11 w-11 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/25 lg:h-8 lg:w-8',
                    'hover:bg-foreground/[0.05]',
                    pathname === '/settings'
                      ? 'text-foreground'
                      : 'text-muted-foreground/60 hover:text-foreground'
                  )}
                >
                  <Settings className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top">{t('nav.settings')}</TooltipContent>
            </Tooltip>

            {user && (
              <>
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  {showProfilePhoto !== false && (
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback className="text-[10px] bg-foreground/10">
                        {(settingsDisplayName || user.displayName)?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[12px] font-medium leading-tight">
                      {settingsDisplayName || user.displayName || user.email}
                    </span>
                    {isDemo ? (
                      <span className="text-[10px] leading-tight text-muted-foreground/70">{t('sidebar.localMode')}</span>
                    ) : settingsBio ? (
                      // The bio was editable, normalised, cloud-synced and
                      // persisted — with no reader anywhere in the app.
                      <span className="block truncate text-[10px] leading-tight text-muted-foreground/70" title={settingsBio}>
                        {settingsBio}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={lang === 'de' ? 'Abmelden und Gerät vergessen' : 'Sign out and forget this device'}
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive lg:h-7 lg:w-7"
                      onClick={() => {
                        setSidebarOpen(false);
                        setShowSignOutConfirm(true);
                      }}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {lang === 'de' ? 'Abmelden und Gerät vergessen' : 'Sign out and forget device'}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </aside>
  );

  return (
    <TooltipProvider delayDuration={400}>
      {isDesktop ? sidebarPanel : (
        <DialogPrimitive.Root
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          modal
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
            <DialogPrimitive.Content asChild>
              {sidebarPanel}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}

      <DialogPrimitive.Root
        open={deletingTag !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
        modal
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content className="surface-float fixed left-1/2 top-1/2 z-[70] grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl p-6 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 motion-reduce:animate-none">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              {t('sidebar.deleteAreaTitle', { tag: deletingTag ?? '' })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground/75">
              {affectedTagItemCount === 0
                ? t('sidebar.deleteAreaNoItems')
                : tp('sidebar.deleteAreaItems.one', 'sidebar.deleteAreaItems.other', affectedTagItemCount)}
            </DialogPrimitive.Description>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" className="min-h-11">
                  {t('common.cancel')}
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                onClick={() => {
                  if (deletingTag) handleDeleteTag(deletingTag);
                }}
              >
                {t('sidebar.deleteAreaAction')}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <ConfirmDialog
        open={showSignOutConfirm}
        onOpenChange={setShowSignOutConfirm}
        title={isDemo
          ? (lang === 'de' ? 'Lokalen Modus verlassen und Daten löschen?' : 'Leave local mode and erase its data?')
          : (lang === 'de' ? 'Abmelden und dieses Gerät vergessen?' : 'Sign out and forget this device?')}
        description={isDemo
          ? (lang === 'de'
              ? 'Der lokale Modus hat keine Cloud-Sicherung. Beim Abmelden werden die lokalen Threadmap-Daten dieses Modus dauerhaft aus diesem Browser entfernt.'
              : 'Local mode has no cloud backup. Signing out permanently removes this mode’s local Threadmap data from this browser.')
          : (lang === 'de'
              ? 'Du wirst abgemeldet und die zwischengespeicherten lokalen sowie Offline-Wiederherstellungsdaten dieses Kontos werden aus diesem Browser entfernt. Änderungen, die noch nicht mit der Cloud synchronisiert wurden, gehen verloren. Dein Cloud-Konto und deine Cloud-Daten werden nicht gelöscht.'
              : 'You will be signed out and this account’s cached local and offline recovery data will be removed from this browser. Changes that have not synced to the cloud will be lost. Your cloud account and cloud data are not deleted.')}
        confirmLabel={isDemo
          ? (lang === 'de' ? 'Lokale Daten löschen und abmelden' : 'Erase local data and sign out')
          : (lang === 'de' ? 'Abmelden und Gerät vergessen' : 'Sign out and forget device')}
        onConfirm={handleSecureSignOut}
      />
    </TooltipProvider>
  );
}
