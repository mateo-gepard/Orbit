'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckSquare,
  FolderKanban,
  Repeat,
  CalendarDays,
  Target,
  FileText,
  Search,
  CornerDownLeft,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { parseCommand } from '@/lib/command-parser';
import { createItem } from '@/lib/firestore';
import { syncEventToGoogle, hasCalendarPermission, requestCalendarPermission } from '@/lib/google-calendar';
import type { ItemType, NoteSubtype, OrbitItem } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<ItemType, typeof CheckSquare> = {
  task: CheckSquare,
  project: FolderKanban,
  habit: Repeat,
  event: CalendarDays,
  goal: Target,
  note: FileText,
};

const TYPE_LABELS: Record<ItemType, string> = {
  task: 'Task',
  project: 'Project',
  habit: 'Habit',
  event: 'Event',
  goal: 'Goal',
  note: 'Note',
};

export function CommandBar() {
  const { user } = useAuth();
  const { commandBarOpen, setCommandBarOpen, items, getAllTags, addCustomTag } = useOrbitStore();
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const allTags = getAllTags();

  // Autocomplete state
  // Tags (#)
  const lastHashIndex = input.lastIndexOf('#');
  const isTypingTag = lastHashIndex !== -1 && 
    (lastHashIndex === input.length - 1 || /^[a-zA-Z0-9]*$/.test(input.slice(lastHashIndex + 1)));
  const tagQuery = isTypingTag ? input.slice(lastHashIndex + 1).toLowerCase() : '';
  const suggestedTags = isTypingTag && (tagQuery || lastHashIndex === input.length - 1)
    ? allTags.filter(tag => tag.toLowerCase().startsWith(tagQuery)).slice(0, 5)
    : [];

  // Priorities (!)
  const lastExclamationIndex = input.lastIndexOf('!');
  const isTypingPriority = lastExclamationIndex !== -1 && 
    (lastExclamationIndex === input.length - 1 || /^[a-zA-Z]*$/.test(input.slice(lastExclamationIndex + 1)));
  const priorityQuery = isTypingPriority ? input.slice(lastExclamationIndex + 1).toLowerCase() : '';
  const priorities = ['high', 'medium', 'low'];
  const suggestedPriorities = isTypingPriority && (priorityQuery || lastExclamationIndex === input.length - 1)
    ? priorities.filter(p => p.toLowerCase().startsWith(priorityQuery))
    : [];

  // Linking (@)
  const lastAtIndex = input.lastIndexOf('@');
  const isTypingLink = lastAtIndex !== -1 && 
    (lastAtIndex === input.length - 1 || /^[a-zA-Z0-9 ]*$/.test(input.slice(lastAtIndex + 1)));
  const linkQuery = isTypingLink ? input.slice(lastAtIndex + 1).toLowerCase() : '';
  const linkableItems = items.filter(i => 
    i.type === 'project' || i.type === 'goal' || i.type === 'note'
  );
  const suggestedLinks = isTypingLink && (linkQuery || lastAtIndex === input.length - 1)
    ? linkableItems.filter(item => 
        item.title.toLowerCase().includes(linkQuery)
      ).slice(0, 5)
    : [];

  // Determine which autocomplete to show
  const showingAutocomplete = suggestedTags.length > 0 || suggestedPriorities.length > 0 || suggestedLinks.length > 0;

  // Prevent background scroll when command bar is open
  useEffect(() => {
    if (!commandBarOpen) return;

    // Prevent touch scrolling on the backdrop
    const preventScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      // Allow scrolling inside the results container
      if (target.closest('[data-command-scroll]')) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [commandBarOpen]);

  // ⌘K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandBarOpen(!commandBarOpen);
      }
      if (e.key === 'Escape' && commandBarOpen) {
        setCommandBarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandBarOpen, setCommandBarOpen]);

  useEffect(() => {
    if (commandBarOpen) {
      setInput('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandBarOpen]);

  const parsed = parseCommand(input);

  const searchQuery = input.toLowerCase().replace(/^\/\w+\s*/, '');
  const filteredItems = searchQuery
    ? items
        .filter(
          (item) =>
            item.title.toLowerCase().includes(searchQuery) ||
            item.tags?.some((t) => t.includes(searchQuery))
        )
        .slice(0, 6)
    : [];

  const handleSubmit = async () => {
    if (!input.trim() || !user) return;

    const parsed = parseCommand(input);

    // If only tags were typed (no actual title), don't create an item
    if (!parsed.title.trim() && parsed.tags.length > 0) {
      // Just auto-create the tags and close
      parsed.tags.forEach(tag => {
        if (!allTags.includes(tag)) {
          addCustomTag(tag);
        }
      });
      setInput('');
      setCommandBarOpen(false);
      return;
    }

    // If there's no title at all, don't create anything
    if (!parsed.title.trim()) {
      setInput('');
      setCommandBarOpen(false);
      return;
    }

    // Auto-create custom tags that don't exist yet
    parsed.tags.forEach(tag => {
      if (!allTags.includes(tag)) {
        addCustomTag(tag);
      }
    });

    // Find linked items by title
    const linkedIds: string[] = [];
    if (parsed.linkedItemTitles && parsed.linkedItemTitles.length > 0) {
      parsed.linkedItemTitles.forEach(title => {
        const matchedItem = items.find(item => 
          item.title.toLowerCase() === title.toLowerCase()
        );
        if (matchedItem) {
          linkedIds.push(matchedItem.id);
        }
      });
    }

    let noteSubtype: NoteSubtype | undefined;
    if (parsed.type === 'note') {
      if (parsed.tags.includes('idea')) noteSubtype = 'idea';
      else if (parsed.tags.includes('principle')) noteSubtype = 'principle';
      else if (parsed.tags.includes('plan')) noteSubtype = 'plan';
      else if (parsed.tags.includes('journal')) noteSubtype = 'journal';
    }

    const newItem: Omit<OrbitItem, 'id'> = {
      type: parsed.type,
      status: 'active',
      title: parsed.title || 'Untitled',
      tags: parsed.tags,
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Only include optional fields if they have values
      ...(parsed.priority && { priority: parsed.priority }),
      ...(parsed.dueDate && { dueDate: parsed.dueDate }),
      ...(parsed.startDate && { startDate: parsed.startDate }),
      ...(noteSubtype && { noteSubtype }),
      ...(linkedIds.length > 0 && { linkedIds }),
    };

    // Auto-add defaults for events
    if (parsed.type === 'event') {
      const startDate = parsed.startDate || new Date().toISOString().split('T')[0];
      Object.assign(newItem, {
        startDate,
        endDate: startDate, // Default: same day
        startTime: '09:00', // Default start time
        endTime: '10:00',   // Default end time (1 hour duration)
      });
    }

    try {
      const itemId = await createItem(newItem);
      
      // Auto-sync events to Google Calendar
      if (parsed.type === 'event' && itemId) {
        try {
          if (!hasCalendarPermission()) {
            await requestCalendarPermission();
          }
          // Build full item for sync
          const fullItem: OrbitItem = { ...newItem, id: itemId } as OrbitItem;
          const googleCalendarId = await syncEventToGoogle(fullItem);
          // Update item with Google Calendar ID (silent update)
          await import('@/lib/firestore').then(m => 
            m.updateItem(itemId, { 
              googleCalendarId, 
              calendarSynced: true 
            })
          );
          console.log('[ORBIT] Event auto-synced to Google Calendar');
        } catch (syncErr) {
          console.warn('[ORBIT] Auto-sync failed (non-blocking):', syncErr);
          // Don't block item creation if sync fails
        }
      }
      
      setInput('');
      setCommandBarOpen(false);
    } catch (err) {
      console.error('[ORBIT] Failed to create item:', err);
      // Item still appears via optimistic update — only log error
    }
  };

  const handleSelectItem = (itemId: string) => {
    useOrbitStore.getState().setSelectedItemId(itemId);
    setCommandBarOpen(false);
  };

  const handleSelectTag = (tag: string) => {
    const beforeHash = input.slice(0, lastHashIndex);
    setInput(`${beforeHash}#${tag} `);
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelectPriority = (priority: string) => {
    const beforeExclamation = input.slice(0, lastExclamationIndex);
    setInput(`${beforeExclamation}!${priority} `);
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelectLink = (item: OrbitItem) => {
    const beforeAt = input.slice(0, lastAtIndex);
    setInput(`${beforeAt}@${item.title} `);
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  if (!commandBarOpen) return null;

  const TypeIcon = TYPE_ICONS[parsed.type] || CheckSquare;
  const isCreateMode = input.startsWith('/') || (input.trim() && filteredItems.length === 0);

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setCommandBarOpen(false)}
      />

      {/* Dialog — top-aligned on mobile (stays above keyboard), centered on desktop */}
      <div 
        ref={dialogRef}
        className={cn(
          'relative z-10 w-full',
          // Mobile: top-aligned card with safe area
          'pt-[max(env(safe-area-inset-top,0px),8px)] px-3',
          // Desktop: centered
          'lg:absolute lg:top-[18vh] lg:left-1/2 lg:-translate-x-1/2 lg:pt-0 lg:px-0',
          'lg:max-w-[520px]',
          'animate-slide-down-spring lg:animate-scale-in'
        )}
      >
        <div className={cn(
          'overflow-hidden bg-popover',
          'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)] lg:shadow-[0_16px_70px_-12px_rgba(0,0,0,0.25)]',
          'rounded-2xl lg:rounded-xl',
          'border border-border/60'
        )}>
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 lg:py-3">
            <Search className="h-5 w-5 lg:h-4 lg:w-4 shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setSelectedIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestedTags.length > 0) {
                    handleSelectTag(suggestedTags[Math.min(selectedIndex, suggestedTags.length - 1)]);
                  } else if (suggestedPriorities.length > 0) {
                    handleSelectPriority(suggestedPriorities[Math.min(selectedIndex, suggestedPriorities.length - 1)]);
                  } else if (suggestedLinks.length > 0) {
                    handleSelectLink(suggestedLinks[Math.min(selectedIndex, suggestedLinks.length - 1)]);
                  } else if (filteredItems.length > 0 && !input.startsWith('/')) {
                    handleSelectItem(filteredItems[selectedIndex]?.id || filteredItems[0].id);
                  } else {
                    handleSubmit();
                  }
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const maxIndex = suggestedTags.length > 0 
                    ? suggestedTags.length - 1 
                    : suggestedPriorities.length > 0
                    ? suggestedPriorities.length - 1
                    : suggestedLinks.length > 0
                    ? suggestedLinks.length - 1
                    : filteredItems.length - 1;
                  setSelectedIndex((i) => Math.min(i + 1, maxIndex));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.max(i - 1, 0));
                }
              }}
              placeholder="What do you need?"
              className="flex-1 bg-transparent text-base lg:text-sm outline-none placeholder:text-muted-foreground/40"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="done"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCommandBarOpen(false)}
                className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground/50 hover:text-muted-foreground lg:hidden"
              >
                Cancel
              </button>
              <kbd className="hidden lg:inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/60">
                esc
              </kbd>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Results */}
          <div 
            data-command-scroll
            className="overflow-y-auto overscroll-contain py-1.5 max-h-[40vh] lg:max-h-[300px]"
          >
            {/* Tag suggestions */}
            {suggestedTags.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Tags
                </div>
                {suggestedTags.map((tag, idx) => (
                  <button
                    key={tag}
                    onClick={() => handleSelectTag(tag)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-3 lg:py-2 text-[14px] lg:text-[13px] text-left transition-colors',
                      idx === selectedIndex ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                    )}
                  >
                    <span className="text-muted-foreground/50">#</span>
                    <span className="flex-1">{tag}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Priority suggestions */}
            {suggestedPriorities.length > 0 && !suggestedTags.length && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Priority
                </div>
                {suggestedPriorities.map((priority, idx) => (
                  <button
                    key={priority}
                    onClick={() => handleSelectPriority(priority)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-3 lg:py-2 text-[14px] lg:text-[13px] text-left transition-colors',
                      idx === selectedIndex ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                    )}
                  >
                    <span className="text-muted-foreground/50">!</span>
                    <span className="flex-1 capitalize">{priority}</span>
                    <span className={cn(
                      'h-2 w-2 rounded-full',
                      priority === 'high' ? 'bg-red-500' : priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    )} />
                  </button>
                ))}
              </div>
            )}

            {/* Link suggestions */}
            {suggestedLinks.length > 0 && !suggestedTags.length && !suggestedPriorities.length && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Link to
                </div>
                {suggestedLinks.map((item, idx) => {
                  const Icon = TYPE_ICONS[item.type];
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectLink(item)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-3 lg:py-2 text-[14px] lg:text-[13px] text-left transition-colors',
                        idx === selectedIndex ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                      )}
                    >
                      <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">
                        {item.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search results */}
            {filteredItems.length > 0 && !input.startsWith('/') && !showingAutocomplete && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Results
                </div>
                {filteredItems.map((item, idx) => {
                  const Icon = TYPE_ICONS[item.type];
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-3 lg:py-2 text-[14px] lg:text-[13px] text-left transition-colors',
                        idx === selectedIndex ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                      )}
                    >
                      <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">
                        {item.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Create preview */}
            {input.trim() && isCreateMode && !suggestedTags.length && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Create new {TYPE_LABELS[parsed.type].toLowerCase()}
                </div>
                <button
                  onClick={handleSubmit}
                  className="flex w-full items-center gap-3 px-3 py-3.5 lg:py-2.5 text-left transition-colors hover:bg-foreground/[0.03] active:bg-foreground/[0.06]"
                >
                  <TypeIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] lg:text-[13px] font-medium truncate">{parsed.title || 'Untitled'}</div>
                    {(parsed.tags.length > 0 || parsed.priority || parsed.dueDate) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {parsed.tags.map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground/50">#{tag}</span>
                        ))}
                        {parsed.priority && (
                          <span className="text-[10px] text-muted-foreground/50">!{parsed.priority}</span>
                        )}
                        {parsed.dueDate && (
                          <span className="text-[10px] text-muted-foreground/50">{parsed.dueDate}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/30" />
                </button>
              </div>
            )}

            {/* Empty state — hints */}
            {!input.trim() && (
              <div className="px-4 py-3 space-y-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Commands
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5">
                  {Object.entries(TYPE_ICONS).map(([type, Icon]) => (
                    <button
                      key={type}
                      onPointerDown={(e) => {
                        e.preventDefault(); // Prevent keyboard from closing
                        setInput(`/${type} `);
                        // Refocus input after state update
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="flex flex-col lg:flex-row items-center gap-1.5 lg:gap-2 rounded-xl lg:rounded-md px-2.5 py-3 lg:py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors active:bg-foreground/[0.06]"
                    >
                      <Icon className="h-5 w-5 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="capitalize text-[11px] lg:text-[12px]">{type}</span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-muted-foreground/40">
                    <span className="font-semibold text-muted-foreground/60">💡 Inbox: </span>
                    Your capture zone. Items start here before you organize them.
                  </p>
                  <p className="text-[11px] text-muted-foreground/40">
                    <span className="font-semibold text-muted-foreground/60">Tip: </span>
                    Use <kbd className="font-mono text-[10px]">#tag</kbd>{' '}
                    <kbd className="font-mono text-[10px]">!high</kbd>{' '}
                    <kbd className="font-mono text-[10px]">@project</kbd>{' '}
                    and dates like <kbd className="font-mono text-[10px]">morgen</kbd> or{' '}
                    <kbd className="font-mono text-[10px]">15.03</kbd>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
