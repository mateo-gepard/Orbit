'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  FolderKanban,
  Repeat,
  CalendarDays,
  Target,
  FileText,
  Search,
  CornerDownLeft,
  Hash,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { parseCommand } from '@/lib/command-parser';
import { createItem, linkItems } from '@/lib/firestore';
import { syncEventToGoogle, hasCalendarPermission, requestCalendarPermission } from '@/lib/google-calendar';
import type { ItemType, NoteSubtype, OrbitItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { getAllowedParentTypes } from '@/lib/links';
import { toast } from 'sonner';

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

const COMMAND_SECTION_LABEL =
  'px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground/50';
const COMMAND_ROW =
  'mx-1.5 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] outline-none transition-colors lg:py-2 lg:text-[13px] focus-visible:ring-2 focus-visible:ring-ring/25';
const COMMAND_ROW_ACTIVE = 'bg-foreground/[0.055] shadow-[var(--shadow-hairline)]';
const COMMAND_ROW_IDLE = 'hover:bg-foreground/[0.035] active:bg-foreground/[0.055]';

export function CommandBar() {
  const { user } = useAuth();
  const { commandBarOpen, setCommandBarOpen, items, getAllTags, addCustomTag } = useOrbitStore();
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resolvedLink, setResolvedLink] = useState<OrbitItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  // Linking (@) — check that everything after last @ is a valid query (no special command chars like # or !)
  const lastAtIndex = input.lastIndexOf('@');
  const afterAt = lastAtIndex !== -1 ? input.slice(lastAtIndex + 1) : '';
  const isTypingLink = lastAtIndex !== -1 && 
    (lastAtIndex === input.length - 1 || !/[#!]/.test(afterAt));
  const linkQuery = isTypingLink ? afterAt.toLowerCase().trim() : '';
  
  // Exclude only archived items to keep autocomplete clean
  const linkableItems = items.filter(i => i.status !== 'archived');

  // Don't show suggestions if we already resolved a link (user selected from autocomplete)
  const suggestedLinks = isTypingLink && !resolvedLink && (linkQuery || lastAtIndex === input.length - 1)
    ? linkableItems.filter(item => 
        item.title.toLowerCase().includes(linkQuery)
      ).slice(0, 10)
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
      setResolvedLink(null);
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

    // Find a related item by @title. Projects/goals become hierarchy parents when valid;
    // all other targets become peer links after creation.
    let relationshipTarget: OrbitItem | undefined;
    
    // If a resolved link item was stored from autocomplete, use it
    if (resolvedLink) {
      relationshipTarget = resolvedLink;
    } else if (parsed.linkedItemTitles && parsed.linkedItemTitles.length > 0) {
      const firstLinkTitle = parsed.linkedItemTitles[0];
      const linkTitleLower = firstLinkTitle.toLowerCase();
      
      // First try exact match
      let matchedItem = items.find(item => 
        item.title.toLowerCase() === linkTitleLower
      );
      // If no exact match, try fuzzy match (contains)
      if (!matchedItem) {
        matchedItem = items.find(item => 
          item.title.toLowerCase().includes(linkTitleLower) ||
          linkTitleLower.includes(item.title.toLowerCase())
        );
      }
      
      if (matchedItem) {
        relationshipTarget = matchedItem;
      }
    }

    // Strip any leftover @... text from the title
    if (parsed.title.includes('@')) {
      parsed.title = parsed.title.replace(/@[^#!]*/g, '').trim();
    }

    let noteSubtype: NoteSubtype | undefined;
    if (parsed.type === 'note') {
      if (parsed.tags.includes('idea')) noteSubtype = 'idea';
      else if (parsed.tags.includes('principle')) noteSubtype = 'principle';
      else if (parsed.tags.includes('plan')) noteSubtype = 'plan';
      else if (parsed.tags.includes('journal')) noteSubtype = 'journal';
    }

    const parentItemId =
      relationshipTarget && getAllowedParentTypes(parsed.type).includes(relationshipTarget.type)
        ? relationshipTarget.id
        : undefined;

    const startsInInbox =
      parsed.type === 'task' &&
      !parsed.dueDate &&
      !parsed.startDate &&
      !parentItemId &&
      !relationshipTarget;

    const newItem: Omit<OrbitItem, 'id'> = {
      type: parsed.type,
      status: startsInInbox ? 'inbox' : 'active',
      title: parsed.title, // Early returns ensure this is never empty
      tags: parsed.tags,
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Only include optional fields if they have values
      ...(parsed.priority && { priority: parsed.priority }),
      ...(parsed.dueDate && { dueDate: parsed.dueDate }),
      ...(parsed.startDate && { startDate: parsed.startDate }),
      ...(noteSubtype && { noteSubtype }),
      ...(parentItemId && { parentId: parentItemId }),
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

      if (relationshipTarget && !parentItemId) {
        await linkItems(itemId, relationshipTarget.id);
      }
      
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
          // Auto-synced to Google Calendar
        } catch {
          // Don't block item creation if sync fails
        }
      }
      
      setInput('');
      setResolvedLink(null);
      setCommandBarOpen(false);
    } catch {
      toast.error('Failed to create item');
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
    const atIndex = input.lastIndexOf('@');
    if (atIndex === -1) return;
    const beforeAt = input.slice(0, atIndex);
    const newInput = `${beforeAt}@${item.title} `;
    setInput(newInput);
    setResolvedLink(item);
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  if (!commandBarOpen) return null;

  const TypeIcon = TYPE_ICONS[parsed.type] || CheckSquare;
  const isCreateMode = input.startsWith('/') || (input.trim() && filteredItems.length === 0);
  // Clean @ text from preview title
  const previewTitle = parsed.title.includes('@') ? parsed.title.replace(/@[^#!]*/g, '').trim() : parsed.title;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-md"
        onClick={() => setCommandBarOpen(false)}
      />

      {/* Dialog — top-aligned on mobile (stays above keyboard), centered on desktop */}
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search or create"
        className={cn(
          'relative z-10 w-full',
          // Mobile: top-aligned card with safe area
          'pt-[max(env(safe-area-inset-top,0px),8px)] px-3',
          // Desktop: centered
          'lg:absolute lg:top-[18vh] lg:left-1/2 lg:-translate-x-1/2 lg:pt-0 lg:px-0',
          'lg:max-w-[520px]',
          'animate-slide-down-spring lg:animate-scale-in'
        )}
        style={{
          paddingLeft: 'max(0.75rem, var(--safe-left))',
          paddingRight: 'max(0.75rem, var(--safe-right))',
        }}
      >
        <div className="surface-float overflow-hidden rounded-2xl">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 lg:py-3">
            <Search className="h-5 w-5 lg:h-4 lg:w-4 shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setSelectedIndex(0); setResolvedLink(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestedTags.length > 0) {
                    handleSelectTag(suggestedTags[Math.min(selectedIndex, suggestedTags.length - 1)]);
                  } else if (suggestedPriorities.length > 0) {
                    handleSelectPriority(suggestedPriorities[Math.min(selectedIndex, suggestedPriorities.length - 1)]);
                  } else if (suggestedLinks.length > 0) {
                    // Always select the link first (fill in title), user presses Enter again to submit
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
              placeholder={t('commandBar.placeholder')}
              aria-label="Search or create"
              inputMode="text"
              className="flex-1 bg-transparent text-base lg:text-sm outline-none placeholder:text-muted-foreground/40"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCommandBarOpen(false)}
                className="mobile-touch-target rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-muted-foreground lg:hidden"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border/40" />

          {/* Results */}
          <div 
            data-command-scroll
            className="overflow-y-auto overscroll-contain py-2 lg:max-h-[300px]"
            style={{
              maxHeight: 'min(56dvh, calc(var(--app-height) - max(var(--safe-top), 8px) - 88px))',
            }}
          >
            {/* Tag suggestions */}
            {suggestedTags.length > 0 && (
              <div>
                <div className={COMMAND_SECTION_LABEL}>
                  {t('commandBar.tags')}
                </div>
                {suggestedTags.map((tag, idx) => (
                  <button
                    key={tag}
                    onClick={() => handleSelectTag(tag)}
                    className={cn(
                      COMMAND_ROW,
                      idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
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
                <div className={COMMAND_SECTION_LABEL}>
                  {t('commandBar.priority')}
                </div>
                {suggestedPriorities.map((priority, idx) => (
                  <button
                    key={priority}
                    onClick={() => handleSelectPriority(priority)}
                    className={cn(
                      COMMAND_ROW,
                      idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
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
                <div className={COMMAND_SECTION_LABEL}>
                  {t('commandBar.linkTo')}
                </div>
                {suggestedLinks.map((item, idx) => {
                  const Icon = TYPE_ICONS[item.type];
                  const isProject = item.type === 'project';
                  const isDone = item.status === 'done';
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectLink(item)}
                      className={cn(
                        COMMAND_ROW,
                        idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
                      )}
                    >
                      <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className={cn(
                        'flex-1 truncate',
                        isDone && 'line-through opacity-60'
                      )}>
                        {item.title}
                      </span>
                      <span className={cn(
                        'text-[10px] uppercase tracking-wider',
                        isProject ? 'text-blue-500/60' : 'text-muted-foreground/40'
                      )}>
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
                <div className={COMMAND_SECTION_LABEL}>
                  {t('commandBar.results')}
                </div>
                {filteredItems.map((item, idx) => {
                  const Icon = TYPE_ICONS[item.type];
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item.id)}
                      className={cn(
                        COMMAND_ROW,
                        idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
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

            {/* Create preview for items with titles */}
            {input.trim() && isCreateMode && !suggestedTags.length && (previewTitle || resolvedLink) && (
              <div>
                <div className={COMMAND_SECTION_LABEL}>
                  Create new {TYPE_LABELS[parsed.type].toLowerCase()}
                </div>
                <button
                  onClick={() => handleSubmit()}
                  className={cn(COMMAND_ROW, 'py-3.5 lg:py-2.5', COMMAND_ROW_IDLE)}
                >
                  <TypeIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] lg:text-[13px] font-medium truncate">{previewTitle || parsed.title}</div>
                    {(parsed.tags.length > 0 || parsed.priority || parsed.dueDate || resolvedLink) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {resolvedLink && (
                          <span className="text-[10px] text-blue-500/60">@{resolvedLink.title}</span>
                        )}
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

            {/* Tag creation preview (when only tags, no title) */}
            {input.trim() && isCreateMode && !suggestedTags.length && !parsed.title.trim() && parsed.tags.length > 0 && (
              <div>
                <div className={COMMAND_SECTION_LABEL}>
                  {parsed.tags.length === 1 ? t('commandBar.createTag') : t('commandBar.createTags')}
                </div>
                <button
                  onClick={() => handleSubmit()}
                  className={cn(COMMAND_ROW, 'py-3.5 lg:py-2.5', COMMAND_ROW_IDLE)}
                >
                  <Hash className="h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {parsed.tags.map((tag) => (
                        <span key={tag} className="text-[13px] font-medium">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/30" />
                </button>
              </div>
            )}

            {/* Empty state — hints */}
            {!input.trim() && (
              <div className="space-y-3 px-4 py-3.5">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground/50">
                  {t('commandBar.commands')}
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5">
                  {Object.entries(TYPE_ICONS).map(([type, Icon]) => (
                    <button
                      key={type}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input from losing focus
                      }}
                      onClick={() => {
                        setInput(`/${type} `);
                        // Keep input focused
                        requestAnimationFrame(() => {
                          inputRef.current?.focus();
                        });
                      }}
                      className="orbit-pressable flex flex-col items-center gap-1.5 rounded-xl border border-transparent bg-foreground/[0.025] px-2.5 py-3 text-[12px] text-muted-foreground outline-none hover:border-border/50 hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 lg:flex-row lg:gap-2 lg:py-1.5"
                    >
                      <Icon className="h-5 w-5 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="capitalize text-[11px] lg:text-[12px]">{type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
