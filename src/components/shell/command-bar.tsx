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
import type { ItemType, NoteSubtype, OrbitItem } from '@/lib/types';
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
  const { commandBarOpen, setCommandBarOpen, items } = useOrbitStore();
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

    let noteSubtype: NoteSubtype | undefined;
    if (parsed.type === 'note') {
      if (parsed.tags.includes('idea')) noteSubtype = 'idea';
      else if (parsed.tags.includes('principle')) noteSubtype = 'principle';
      else if (parsed.tags.includes('plan')) noteSubtype = 'plan';
      else if (parsed.tags.includes('journal')) noteSubtype = 'journal';
    }

    const newItem: Omit<OrbitItem, 'id'> = {
      type: parsed.type,
      status: 'inbox',
      title: parsed.title,
      tags: parsed.tags,
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Only include optional fields if they have values
      ...(parsed.priority && { priority: parsed.priority }),
      ...(parsed.dueDate && { dueDate: parsed.dueDate }),
      ...(parsed.startDate && { startDate: parsed.startDate }),
      ...(noteSubtype && { noteSubtype }),
    };

    try {
      await createItem(newItem);
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

  if (!commandBarOpen) return null;

  const TypeIcon = TYPE_ICONS[parsed.type] || CheckSquare;
  const isCreateMode = input.startsWith('/') || (input.trim() && filteredItems.length === 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setCommandBarOpen(false)}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-[520px] mx-4">
        <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-[0_16px_70px_-12px_rgba(0,0,0,0.25)]">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setSelectedIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredItems.length > 0 && !input.startsWith('/')) {
                    handleSelectItem(filteredItems[selectedIndex]?.id || filteredItems[0].id);
                  } else {
                    handleSubmit();
                  }
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.max(i - 1, 0));
                }
              }}
              placeholder="What do you need?"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            />
            <div className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/60">
                esc
              </kbd>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto py-1.5">
            {/* Search results */}
            {filteredItems.length > 0 && !input.startsWith('/') && (
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
                        'flex w-full items-center gap-3 px-3 py-2 text-[13px] text-left transition-colors',
                        idx === selectedIndex ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
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
            {input.trim() && isCreateMode && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  Create new {TYPE_LABELS[parsed.type].toLowerCase()}
                </div>
                <button
                  onClick={handleSubmit}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
                >
                  <TypeIcon className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{parsed.title || 'Untitled'}</div>
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
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(TYPE_ICONS).map(([type, Icon]) => (
                    <button
                      key={type}
                      onClick={() => setInput(`/${type} `)}
                      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="capitalize">{type}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground/30">/{type}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/40 pt-1">
                  Tip: use <kbd className="font-mono text-[10px]">#tag</kbd>{' '}
                  <kbd className="font-mono text-[10px]">!high</kbd>{' '}
                  and dates like <kbd className="font-mono text-[10px]">morgen</kbd> or{' '}
                  <kbd className="font-mono text-[10px]">15.03</kbd>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
