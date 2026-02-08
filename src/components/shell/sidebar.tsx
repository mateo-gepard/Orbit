'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Repeat,
  Target,
  FileText,
  Calendar,
  Archive,
  Sun,
  X,
  LogOut,
  Plus,
  CheckSquare,
  Files,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
// LIFE_AREA_TAGS now managed via store.getAllTags()
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const NAV_SECTIONS = [
  {
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/today', label: 'Today', icon: Sun },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'Organize',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/habits', label: 'Habits', icon: Repeat },
      { href: '/goals', label: 'Goals', icon: Target },
    ],
  },
  {
    label: 'Capture',
    items: [
      { href: '/notes', label: 'Notes', icon: FileText },
      { href: '/calendar', label: 'Calendar', icon: Calendar },
      { href: '/files', label: 'Files', icon: Files },
      { href: '/archive', label: 'Archive', icon: Archive },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut, isDemo } = useAuth();
  const {
    sidebarOpen, setSidebarOpen, activeTag, setActiveTag, setCommandBarOpen,
    addCustomTag, removeTag, renameTag, getAllTags,
  } = useOrbitStore();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const allTags = getAllTags();

  useEffect(() => {
    if (isAddingTag) addInputRef.current?.focus();
  }, [isAddingTag]);

  useEffect(() => {
    if (editingTag) editInputRef.current?.focus();
  }, [editingTag]);

  const handleAddTag = () => {
    const trimmed = newTagValue.trim().toLowerCase();
    if (trimmed) {
      addCustomTag(trimmed);
    }
    setNewTagValue('');
    setIsAddingTag(false);
  };

  const handleRenameTag = (oldTag: string) => {
    const trimmed = editValue.trim().toLowerCase();
    if (trimmed && trimmed !== oldTag) {
      renameTag(oldTag, trimmed);
    }
    setEditingTag(null);
    setEditValue('');
  };

  const handleDeleteTag = (tag: string) => {
    removeTag(tag);
    if (activeTag === tag) setActiveTag(null);
    setDeletingTag(null);
  };

  return (
    <TooltipProvider delayDuration={400}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px] lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col bg-sidebar transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:relative lg:w-[260px] lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background font-semibold text-xs tracking-tight">
              O
            </div>
            <span className="text-[15px] font-semibold tracking-tight">ORBIT</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Quick Add */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setCommandBarOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-[13px] text-muted-foreground transition-all hover:border-border hover:bg-background hover:shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Quick add...</span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono leading-none">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {NAV_SECTIONS.map((section, sIdx) => (
            <div key={sIdx} className={cn(sIdx > 0 && 'mt-5')}>
              {section.label && (
                <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                  {section.label}
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
                      className={cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all',
                        isActive
                          ? 'bg-foreground/[0.06] text-foreground'
                          : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-[15px] w-[15px] shrink-0 transition-colors',
                          isActive ? 'text-foreground' : 'text-muted-foreground/70'
                        )}
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Tags / Areas */}
          <div className="mt-5">
            <div className="mb-1 px-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                Areas
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setIsManaging(!isManaging)}
                  className={cn(
                    'rounded p-0.5 transition-colors',
                    isManaging
                      ? 'text-foreground bg-foreground/10'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                  )}
                  title={isManaging ? 'Done managing' : 'Manage tags'}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => { setIsAddingTag(true); setIsManaging(true); }}
                  className="rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
                  title="Add tag"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 px-1 py-1">
              {allTags.map((tag) => {
                const isEditing = editingTag === tag;
                const isDeleting = deletingTag === tag;

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
                        onKeyDown={(e) => { if (e.key === 'Escape') { setEditingTag(null); setEditValue(''); } }}
                        className="w-16 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium outline-none focus:ring-1 focus:ring-primary"
                      />
                    </form>
                  );
                }

                if (isDeleting) {
                  return (
                    <div key={tag} className="flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5">
                      <span className="text-[10px] text-destructive font-medium">Delete &quot;{tag}&quot;?</span>
                      <button
                        onClick={() => handleDeleteTag(tag)}
                        className="rounded p-0.5 text-destructive hover:bg-destructive/20"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeletingTag(null)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={tag} className="group relative flex items-center">
                    <button
                      onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                        activeTag === tag
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-muted-foreground'
                      )}
                    >
                      {tag}
                    </button>
                    {isManaging && (
                      <div className="flex items-center gap-0.5 ml-0.5">
                        <button
                          onClick={() => { setEditingTag(tag); setEditValue(tag); }}
                          className="rounded p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                          title="Rename"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => setDeletingTag(tag)}
                          className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
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
                    onKeyDown={(e) => { if (e.key === 'Escape') { setIsAddingTag(false); setNewTagValue(''); } }}
                    placeholder="new tag..."
                    className="w-20 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
                  />
                </form>
              )}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {user && (
              <>
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback className="text-[10px] bg-foreground/10">
                      {user.displayName?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[12px] font-medium leading-tight">
                      {user.displayName || user.email}
                    </span>
                    {isDemo && (
                      <span className="text-[10px] leading-tight text-muted-foreground/70">Local mode</span>
                    )}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={signOut}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign out</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
