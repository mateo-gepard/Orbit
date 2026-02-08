'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  Trash2,
  Archive,
  RotateCcw,
  Link2,
  Check,
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  CheckSquare,
  Target,
  LayoutList,
  CalendarClock,
  Sparkles,
  FileText,
  MoreVertical,
  Network,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem, deleteItem } from '@/lib/firestore';
import { syncEventToGoogle, requestCalendarPermission, hasCalendarPermission } from '@/lib/google-calendar';
import { LinkManager } from '@/components/items/link-manager';
import { LinkGraph } from '@/components/items/link-graph';
import { ProjectDashboard } from './project-dashboard';
import type { OrbitItem, ItemType, ItemStatus, Priority, ChecklistItem, GoalTimeframe, HabitFrequency, NoteSubtype } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { calculateStreak } from '@/lib/habits';
import { cn, formatTimestamp } from '@/lib/utils';
import { format } from 'date-fns';

const STATUS_OPTIONS: ItemStatus[] = ['active', 'waiting', 'done', 'archived'];
const STATUS_DESCRIPTIONS: Record<ItemStatus, string> = {
  active: 'Currently working on this',
  waiting: 'Blocked or waiting for someone',
  done: 'Completed',
  archived: 'No longer relevant',
};
const TYPE_OPTIONS: ItemType[] = ['task', 'project', 'habit', 'event', 'goal', 'note'];
const PRIORITY_OPTIONS: Priority[] = ['low', 'medium', 'high'];
const TIMEFRAME_OPTIONS: GoalTimeframe[] = ['quarterly', 'yearly', 'longterm'];
const FREQUENCY_OPTIONS: HabitFrequency[] = ['daily', 'weekly', 'custom'];
const NOTE_SUBTYPE_OPTIONS: NoteSubtype[] = ['general', 'idea', 'principle', 'plan', 'journal'];

// Icon mapping for each item type
const TYPE_ICONS: Record<ItemType, typeof CheckCircle2> = {
  task: CheckCircle2,
  project: LayoutList,
  habit: Target,
  event: CalendarIcon,
  goal: Target,
  note: FileText,
};
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
      {children}
    </span>
  );
}

export function DetailPanel() {
  const { selectedItemId, setSelectedItemId, detailPanelOpen, setDetailPanelOpen, items, getAllTags, removeCustomTag, setCompletionAnimation } = useOrbitStore();
  const item = selectedItemId ? items.find(i => i.id === selectedItemId) : undefined;
  const [title, setTitle] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Swipe-to-close
  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({
    onClose: () => setDetailPanelOpen(false),
  });

  // Link graph state
  const [showLinkGraph, setShowLinkGraph] = useState(false);

  const allTags = getAllTags();

  useEffect(() => {
    if (item) {
      setTitle(item.title);
    }
  }, [item?.id]);

  const handleUpdate = useCallback(
    async (updates: Partial<OrbitItem>) => {
      if (!item) return;
      try {
        await updateItem(item.id, updates);
        
        // Auto-sync event changes to Google Calendar
        if (item.type === 'event' && item.googleCalendarId && hasCalendarPermission()) {
          try {
            const updatedItem = { ...item, ...updates };
            await syncEventToGoogle(updatedItem as OrbitItem);
          } catch {
            // Auto-sync is non-blocking — swallow errors
          }
        }
      } catch {
        // Update failed — optimistic update already in place
      }
    },
    [item]
  );

  const handleSyncToGoogleCalendar = async () => {
    if (!item || item.type !== 'event') return;
    setSyncingCalendar(true);
    try {
      // Check if user has granted permission
      if (!hasCalendarPermission()) {
        await requestCalendarPermission();
      }
      // Sync event
      const googleCalendarId = await syncEventToGoogle(item);
      await handleUpdate({ 
        googleCalendarId, 
        calendarSynced: true 
      });
    } catch {
      alert('Failed to sync with Google Calendar.');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      await deleteItem(item.id);
      setSelectedItemId(null);
    } catch {
      // Delete failed — item may already be gone
    }
  };

  const handleArchive = () => handleUpdate({ status: 'archived' });
  const handleRestore = () => handleUpdate({ status: 'active' });

  const handleComplete = () => {
    const newStatus = item?.status === 'done' ? 'active' : 'done';
    
    // Show completion animation when marking as done
    if (newStatus === 'done' && item) {
      if (item.type === 'habit') {
        const streak = calculateStreak(item) + 1; // +1 for the completion about to happen
        setCompletionAnimation({ type: 'habit', streak });
      } else if (item.type === 'task') {
        setCompletionAnimation({ type: 'task' });
      }
    }
    
    handleUpdate({
      status: newStatus,
      completedAt: newStatus === 'done' ? Date.now() : undefined,
    });
  };

  const handleAddToToday = () => {
    const today = new Date().toISOString().split('T')[0];
    const isDueToday = item?.dueDate === today;
    
    // If already due today, remove the due date, otherwise set it to today
    if (isDueToday) {
      handleUpdate({ dueDate: undefined });
    } else {
      handleUpdate({ dueDate: today });
    }
  };

  const addChecklistItem = () => {
    if (!newChecklistText.trim() || !item) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newChecklistText.trim(),
      done: false,
    };
    handleUpdate({ checklist: [...(item.checklist || []), newItem] });
    setNewChecklistText('');
  };

  const toggleChecklistItem = (checkId: string) => {
    if (!item) return;
    const updated = (item.checklist || []).map((c) =>
      c.id === checkId ? { ...c, done: !c.done } : c
    );
    handleUpdate({ checklist: updated });
  };

  const toggleTag = (tag: string) => {
    if (!item) return;
    const tags = item.tags || [];
    const updated = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    handleUpdate({ tags: updated });
  };

  // Filter item tags to only show valid tags (remove deleted custom tags)
  const validItemTags = (item?.tags || []).filter(tag => allTags.includes(tag));

  if (!item) return null;

  // Project Dashboard View — extracted to dedicated component
  if (item.type === 'project') {
    return <ProjectDashboard />;
  }

  // Regular detail panel for non-project items
  const parentItem = item.parentId ? items.find(i => i.id === item.parentId) : undefined;
  const childItems = items.filter((i) => i.parentId === item.id);
  const linkedItems = (item.linkedIds || [])
    .map(id => items.find(i => i.id === id))
    .filter((i): i is OrbitItem => i !== undefined);

  const content = (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          {(item.type === 'task' || item.type === 'habit') && (
            <button
              onClick={handleComplete}
              className={cn(
                'relative flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                'before:absolute before:inset-[-6px]',
                item.status === 'done'
                  ? 'border-green-600 bg-green-600'
                  : 'border-foreground/30 hover:border-foreground/50'
              )}
            >
              {item.status === 'done' && <Check className="h-3 w-3 text-white" />}
            </button>
          )}
          <span className="text-[11px] text-muted-foreground/50 capitalize">{item.type}</span>
          {item.status === 'done' && (
            <>
              <span className="text-[11px] text-muted-foreground/30">·</span>
              <span className="text-[11px] text-green-600/80">Done</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Link Graph Button */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowLinkGraph(true);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowLinkGraph(true);
            }}
            className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors active:scale-95"
            title="View link graph"
            type="button"
          >
            <Network className="h-4 w-4" />
          </button>
          
          {/* Three-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Change Type */}
              <div className="px-2 py-2">
                <FieldLabel>Change Type</FieldLabel>
                <Select value={item.type} onValueChange={(v) => handleUpdate({ type: v as ItemType })}>
                  <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize text-[12px]">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DropdownMenuSeparator />

              {/* Change Status */}
              <div className="px-2 py-2">
                <FieldLabel>Change Status</FieldLabel>
                <Select value={item.status} onValueChange={(v) => handleUpdate({ status: v as ItemStatus, completedAt: v === 'done' ? Date.now() : undefined })}>
                  <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize text-[12px]">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DropdownMenuSeparator />

              {/* Links & Relations */}
              <div className="px-2 py-2">
                <FieldLabel>Links & Relations</FieldLabel>
                <div className="mt-2">
                  <LinkManager
                    item={item}
                    allItems={items}
                    onUpdate={handleUpdate}
                  />
                </div>
              </div>

              {/* Habit Settings */}
              {item.type === 'habit' && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <FieldLabel>Frequency</FieldLabel>
                    <Select value={item.frequency || 'daily'} onValueChange={(v) => handleUpdate({ frequency: v as HabitFrequency })}>
                      <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f} className="capitalize text-[12px]">{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {(item.frequency === 'custom' || !item.frequency) && (
                      <div className="mt-2">
                        <div className="flex gap-1">
                          {DAY_LABELS.map((label, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                const days = new Set(item.customDays || []);
                                days.has(idx) ? days.delete(idx) : days.add(idx);
                                handleUpdate({ customDays: Array.from(days) });
                              }}
                              className={cn(
                                'flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium',
                                (item.customDays || []).includes(idx)
                                  ? 'bg-foreground text-background'
                                  : 'bg-foreground/[0.05] text-muted-foreground'
                              )}
                            >
                              {label.charAt(0)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-2">
                      <Input type="time" value={item.habitTime || ''} onChange={(e) => handleUpdate({ habitTime: e.target.value || undefined })} className="h-7 text-[11px]" placeholder="Time" />
                    </div>
                  </div>
                </>
              )}

              {/* Goal Settings */}
              {item.type === 'goal' && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <FieldLabel>Timeframe</FieldLabel>
                    <Select value={item.timeframe || 'quarterly'} onValueChange={(v) => handleUpdate({ timeframe: v as GoalTimeframe })}>
                      <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEFRAME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize text-[12px]">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Note Category */}
              {item.type === 'note' && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <FieldLabel>Category</FieldLabel>
                    <Select value={item.noteSubtype || 'general'} onValueChange={(v) => handleUpdate({ noteSubtype: v as NoteSubtype })}>
                      <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NOTE_SUBTYPE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize text-[12px]">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Event Calendar Sync */}
              {item.type === 'event' && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <button
                      onClick={handleSyncToGoogleCalendar}
                      disabled={syncingCalendar}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-colors w-full',
                        item.calendarSynced
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-foreground/[0.05] text-foreground',
                        syncingCalendar && 'opacity-50'
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {syncingCalendar ? 'Syncing...' : item.calendarSynced ? 'Synced to Calendar ✓' : 'Sync to Google Calendar'}
                    </button>
                  </div>
                </>
              )}

              <DropdownMenuSeparator />

              {/* Archive/Restore */}
              {item.status === 'archived' ? (
                <DropdownMenuItem onClick={handleRestore}>
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleArchive}>
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}

              {/* Delete */}
              <DropdownMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Close button - Desktop only */}
          <button onClick={() => setDetailPanelOpen(false)} className="hidden lg:flex rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
            <X className="h-4 w-4" />
          </button>
          
          {/* Close button - Mobile only */}
          <button onClick={() => setDetailPanelOpen(false)} className="lg:hidden rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        {/* Title - Large and prominent */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => handleUpdate({ title })}
          onKeyDown={(e) => e.key === 'Enter' && handleUpdate({ title })}
          className="w-full bg-transparent text-lg font-semibold leading-snug outline-none placeholder:text-muted-foreground/30"
          placeholder="Title…"
        />

        {/* Quick Actions Bar - Most important stuff first */}
        <div className="flex flex-wrap gap-2">
          {/* Priority (Task) */}
          {item.type === 'task' && (
            <Select value={item.priority || 'none'} onValueChange={(v) => handleUpdate({ priority: v === 'none' ? undefined : v as Priority })}>
              <SelectTrigger className="h-9 text-[13px] w-auto min-w-[100px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-[12px]">No Priority</SelectItem>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize text-[12px]">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Due Date (Task) */}
          {item.type === 'task' && (
            <div className="relative">
              <Input
                type="date"
                value={item.dueDate || ''}
                onChange={(e) => handleUpdate({ dueDate: e.target.value || undefined })}
                className="h-9 text-[13px] w-auto min-w-[140px]"
              />
              {item.dueDate && (
                <button
                  onClick={() => handleUpdate({ dueDate: undefined })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-foreground/[0.05]"
                >
                  <X className="h-3 w-3 text-muted-foreground/50" />
                </button>
              )}
            </div>
          )}

          {/* Add to Today (Task) */}
          {item.type === 'task' && item.status !== 'done' && item.dueDate !== new Date().toISOString().split('T')[0] && (
            <button
              onClick={handleAddToToday}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 h-9 text-[13px] font-medium hover:bg-foreground/[0.02] hover:border-border transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Add to Today
            </button>
          )}
        </div>

        {/* Event Date & Time Fields */}
        {item.type === 'event' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <Input type="date" value={item.startDate || ''} onChange={(e) => handleUpdate({ startDate: e.target.value || undefined })} className="mt-1 h-9 text-[13px]" />
              </div>
              <div>
                <FieldLabel>Start Time</FieldLabel>
                <Input type="time" value={item.startTime || ''} onChange={(e) => handleUpdate({ startTime: e.target.value || undefined })} className="mt-1 h-9 text-[13px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>End Date</FieldLabel>
                <Input type="date" value={item.endDate || ''} onChange={(e) => handleUpdate({ endDate: e.target.value || undefined })} className="mt-1 h-9 text-[13px]" />
              </div>
              <div>
                <FieldLabel>End Time</FieldLabel>
                <Input type="time" value={item.endTime || ''} onChange={(e) => handleUpdate({ endTime: e.target.value || undefined })} className="mt-1 h-9 text-[13px]" />
              </div>
            </div>
          </div>
        )}

        {/* Goal Success Metric */}
        {item.type === 'goal' && (
          <div>
            <FieldLabel>Success Metric</FieldLabel>
            <Textarea
              value={item.metric || ''}
              onChange={(e) => handleUpdate({ metric: e.target.value })}
              className="mt-1.5 text-[13px] min-h-20 resize-none"
              placeholder="How will you measure success?"
            />
          </div>
        )}

        {/* Checklist (Task) - Prominent position */}
        {item.type === 'task' && (item.checklist && item.checklist.length > 0 || newChecklistText) && (
          <div>
            <FieldLabel>Checklist</FieldLabel>
            <div className="mt-2 space-y-1">
              {(item.checklist || []).map((check) => (
                <div key={check.id} className="flex items-center gap-2.5 group">
                  <Checkbox
                    checked={check.done}
                    onCheckedChange={() => toggleChecklistItem(check.id)}
                    className="h-4 w-4"
                  />
                  <span className={cn('text-[14px] flex-1', check.done && 'text-muted-foreground/40 line-through')}>
                    {check.text}
                  </span>
                  <button
                    onClick={() => {
                      const updated = (item.checklist || []).filter(c => c.id !== check.id);
                      handleUpdate({ checklist: updated });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-foreground/[0.05] transition-opacity"
                  >
                    <X className="h-3 w-3 text-muted-foreground/50" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                  placeholder="Add checklist item…"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/30 py-1.5 border-b border-border/30 focus:border-border transition-colors"
                />
                <button onClick={addChecklistItem} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors shrink-0" aria-label="Add checklist item">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes/Content - Larger text area */}
        <div>
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            value={item.content || ''}
            onChange={(e) => handleUpdate({ content: e.target.value })}
            className="mt-1.5 text-[14px] min-h-32 resize-none leading-relaxed"
            placeholder="Write your thoughts…"
          />
        </div>

        {/* Tags */}
        <div>
          <FieldLabel>Tags</FieldLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[12px] font-medium transition-all',
                  validItemTags.includes(tag)
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.06] text-muted-foreground/70 hover:bg-foreground/[0.1]'
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* ── Relations ── */}
        {(parentItem || linkedItems.length > 0 || childItems.length > 0) && (
          <div className="space-y-3">
            {/* Parent */}
            {parentItem && (
              <div>
                <FieldLabel>Parent</FieldLabel>
                <div className="mt-2">
                  <button
                    onClick={() => setSelectedItemId(parentItem.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors text-left group"
                  >
                    {(() => {
                      const Icon = TYPE_ICONS[parentItem.type];
                      return <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" />;
                    })()}
                    <span className="text-[13px] flex-1 text-foreground/90 group-hover:text-foreground">
                      {parentItem.emoji && `${parentItem.emoji} `}{parentItem.title}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Linked Items */}
            {linkedItems.length > 0 && (
              <div>
                <FieldLabel>Linked Items ({linkedItems.length})</FieldLabel>
                <div className="mt-2 space-y-1">
                  {linkedItems.map((linked) => {
                    const Icon = TYPE_ICONS[linked.type];
                    const isDone = linked.status === 'done';
                    
                    return (
                      <button
                        key={linked.id}
                        onClick={() => setSelectedItemId(linked.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors text-left group"
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isDone ? 'text-muted-foreground/30' : 'text-muted-foreground/50')} />
                        <span className={cn("text-[13px] flex-1", isDone ? 'line-through text-muted-foreground/40' : 'text-foreground/90 group-hover:text-foreground')}>
                          {linked.emoji && `${linked.emoji} `}{linked.title}
                        </span>
                        {isDone && <Check className="h-3.5 w-3.5 text-green-600/50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Child Items */}
            {childItems.length > 0 && (
              <div>
                <FieldLabel>Contains ({childItems.length})</FieldLabel>
                <div className="mt-2 space-y-1">
                  {childItems.map((child) => {
                    const Icon = TYPE_ICONS[child.type];
                    const isDone = child.status === 'done';
                    
                    return (
                      <button
                        key={child.id}
                        onClick={() => setSelectedItemId(child.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors text-left group"
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isDone ? 'text-muted-foreground/30' : 'text-muted-foreground/50')} />
                        <span className={cn("text-[13px] flex-1", isDone ? 'line-through text-muted-foreground/40' : 'text-foreground/90 group-hover:text-foreground')}>
                          {child.emoji && `${child.emoji} `}{child.title}
                        </span>
                        {isDone && <Check className="h-3.5 w-3.5 text-green-600/50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Parent/Linked Item */}
        {parentItem && (
          <div>
            <FieldLabel>Part of</FieldLabel>
            <button
              onClick={() => setSelectedItemId(parentItem.id)}
              className="mt-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left"
            >
              <Link2 className="h-4 w-4 text-blue-600/60" />
              <span className="text-[13px] text-foreground/90 flex-1">
                {parentItem.title}
              </span>
              <span className="text-[10px] text-muted-foreground/40 uppercase">{parentItem.type}</span>
            </button>
          </div>
        )}

        {/* Metadata - Collapsed at bottom */}
        <div className="pt-2 pb-4">
          <div className="h-px bg-border/30 mb-3" />
          <div className="space-y-0.5 text-[11px] text-muted-foreground/40">
            <p>Created {formatTimestamp(item.createdAt)}</p>
            <p>Modified {formatTimestamp(item.updatedAt)}</p>
            {item.completedAt && <p>Completed {formatTimestamp(item.completedAt)}</p>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className={cn(
        'hidden lg:block border-l border-border/60 bg-background transition-all duration-200',
        detailPanelOpen ? 'w-96' : 'w-0 overflow-hidden'
      )}>
        {content}
      </div>

      {/* Mobile — full-screen sheet */}
      <div className="lg:hidden">
        <Sheet open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
          <SheetContent
            side="bottom"
            className="h-[92dvh] rounded-t-2xl p-0 border-0"
            showCloseButton={false}
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={swipeStyles}
          >
          <SheetHeader className="sr-only">
            <SheetTitle>Item Details</SheetTitle>
          </SheetHeader>
          {/* Swipe Handle */}
          <div
            className="absolute top-0 left-0 right-0 flex justify-center pt-4 pb-8 cursor-grab active:cursor-grabbing z-10"
            {...swipeHandlers}
          >
            <div className={cn(
              "w-10 h-1 rounded-full bg-muted-foreground/20 transition-all",
              isDragging && "bg-muted-foreground/40 w-12"
            )} />
          </div>
          <div className="h-[calc(92dvh-24px)] overflow-hidden pt-14">
            {content}
          </div>
        </SheetContent>
      </Sheet>
      </div>
      
      {/* Link Graph */}
      {item && (
        <LinkGraph
          open={showLinkGraph}
          onClose={() => setShowLinkGraph(false)}
          currentItem={item}
          allItems={items}
          onNavigate={(itemId) => {
            setSelectedItemId(itemId);
            setShowLinkGraph(false);
          }}
        />
      )}
    </>
  );
}
