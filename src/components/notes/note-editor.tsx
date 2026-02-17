'use client';

import { useState, useRef, useEffect } from 'react';
import { X, MoreVertical, Archive, Trash2 } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem, deleteItem } from '@/lib/firestore';
import type { OrbitItem, NoteSubtype } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLinks } from '@/lib/hooks/use-links';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NoteEditorProps {
  note: OrbitItem;
  onClose: () => void;
}

const NOTE_SUBTYPE_OPTIONS: NoteSubtype[] = ['general', 'idea', 'principle', 'plan', 'journal'];

export function NoteEditor({ note, onClose }: NoteEditorProps) {
  const { getAllTags, items } = useOrbitStore();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || '');
  const [showSettings, setShowSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const allTags = getAllTags();
  
  // Use unified linking system
  const links = useLinks({
    item: note,
    allItems: items,
    onUpdate: async (updates) => await updateItem(note.id, updates)
  });

  // Auto-save on content/title change (debounced)
  useEffect(() => {
    if (title === note.title && content === note.content) return;
    
    setIsSaving(true);
    const timer = setTimeout(async () => {
      await updateItem(note.id, { title, content });
      setIsSaving(false);
    }, 800);
    
    return () => {
      clearTimeout(timer);
      setIsSaving(false);
    };
  }, [title, content, note.id, note.title, note.content]);

  const handleClose = async () => {
    // Save any pending changes before closing
    if (title !== note.title || content !== note.content) {
      await updateItem(note.id, { title, content });
    }
    onClose();
  };

  const handleArchive = async () => {
    await updateItem(note.id, { status: 'archived' });
    onClose();
  };

  const handleDelete = async () => {
    if (confirm('Delete this note permanently?')) {
      await deleteItem(note.id);
      onClose();
    }
  };

  const toggleTag = async (tag: string) => {
    const tags = note.tags || [];
    const updated = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    await updateItem(note.id, { tags: updated });
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.currentTarget.blur();
      return;
    }

    // Smart list continuation
    if (e.key === 'Enter') {
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = content.substring(0, cursorPos);
      const textAfterCursor = content.substring(cursorPos);
      const currentLine = textBeforeCursor.split('\n').pop() || '';

      // Check for numbered list
      const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
      if (numberedMatch) {
        e.preventDefault();
        const indent = numberedMatch[1];
        const currentNumber = parseInt(numberedMatch[2]);
        const nextNumber = currentNumber + 1;
        const insertion = `\n${indent}${nextNumber}. `;
        setContent(textBeforeCursor + insertion + textAfterCursor);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = cursorPos + insertion.length;
        }, 0);
        return;
      }

      // Check for bullet list
      const bulletMatch = currentLine.match(/^(\s*)([-•*])\s/);
      if (bulletMatch) {
        e.preventDefault();
        const indent = bulletMatch[1];
        const bullet = bulletMatch[2];
        const insertion = `\n${indent}${bullet} `;
        setContent(textBeforeCursor + insertion + textAfterCursor);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = cursorPos + insertion.length;
        }, 0);
        return;
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <div 
        className="flex items-center justify-between border-b border-border/40 px-4 lg:px-6 h-14"
      >
        <button
          onClick={handleClose}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Close</span>
        </button>

        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-[11px] text-muted-foreground/50">Saving...</span>
          )}
          <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-foreground/5 transition-colors">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <div className="px-2 py-1.5">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Category
                </p>
                <Select 
                  value={note.noteSubtype || 'general'} 
                  onValueChange={(v) => updateItem(note.id, { noteSubtype: v as NoteSubtype })}
                >
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_SUBTYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize text-[12px]">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <DropdownMenuSeparator />
              
              <div className="px-2 py-1.5">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[10px] font-medium transition-all',
                        (note.tags || []).includes(tag)
                          ? 'bg-foreground text-background'
                          : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              
              <DropdownMenuSeparator />
              
              <div className="px-2 py-1.5">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Linked Items ({links.relationships.linked.length})
                </p>
                <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                  {links.linkableItems.map((item: OrbitItem) => (
                    <button
                      key={item.id}
                      onClick={() => links.isLinked(item.id) ? links.handleRemoveLink(item.id) : links.handleAddLink(item.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-all text-left',
                        links.isLinked(item.id)
                          ? 'bg-foreground/10 text-foreground font-medium'
                          : 'text-muted-foreground/60 hover:bg-foreground/[0.04]'
                      )}
                    >
                      <span className="text-[10px]">{item.emoji || (item.type === 'project' ? '📁' : '🎯')}</span>
                      <span className="flex-1 truncate">{item.title}</span>
                      {links.isLinked(item.id) && (
                        <span className="text-[10px]">✓</span>
                      )}
                    </button>
                  ))}
                  {links.linkableItems.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/40 py-2 text-center">
                      No items available to link
                    </p>
                  )}
                </div>
              </div>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="h-3.5 w-3.5 mr-2" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="h-[calc(100vh-3.5rem-env(safe-area-inset-top,0px))] overflow-y-auto overscroll-contain px-4 lg:px-8 py-6 lg:py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full bg-transparent text-2xl lg:text-3xl font-bold outline-none placeholder:text-muted-foreground/30"
          />

          {/* Content */}
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleContentKeyDown}
            placeholder="Start writing... (use - or • for bullets, 1. 2. 3. for numbered lists)"
            className="w-full bg-transparent text-base lg:text-lg outline-none placeholder:text-muted-foreground/30 resize-none min-h-[60vh] leading-relaxed"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
