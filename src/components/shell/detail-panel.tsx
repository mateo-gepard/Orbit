'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  Trash2,
  Archive,
  RotateCcw,
  Link2,
  Check,
  Plus,
  Calendar as CalendarIcon,
  Circle,
  Clock,
  CheckCircle2,
  Target,
  LayoutList,
  CalendarClock,
  Sparkles,
  FileText,
  MoreVertical,
  Files,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem, deleteItem, createItem } from '@/lib/firestore';
import { useAuth } from '@/components/providers/auth-provider';
import { syncEventToGoogle, requestCalendarPermission, hasCalendarPermission } from '@/lib/google-calendar';
import type { OrbitItem, ItemType, ItemStatus, Priority, ChecklistItem, GoalTimeframe, HabitFrequency, NoteSubtype } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileUpload } from '@/components/files/file-upload';
import { calculateStreak } from '@/lib/habits';
import { cn } from '@/lib/utils';
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
  const { selectedItemId, setSelectedItemId, detailPanelOpen, setDetailPanelOpen, items, getItemById, getAllTags, removeCustomTag, setCompletionAnimation } = useOrbitStore();
  const { user } = useAuth();
  const item = selectedItemId ? getItemById(selectedItemId) : undefined;
  const [title, setTitle] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [tagLongPressTimer, setTagLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
            console.log('[ORBIT] Event changes auto-synced to Google Calendar');
          } catch (syncErr) {
            console.warn('[ORBIT] Auto-sync failed (non-blocking):', syncErr);
          }
        }
      } catch (err) {
        console.error('[ORBIT] Update failed:', err);
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
      console.log('[ORBIT] Event synced to Google Calendar');
    } catch (err) {
      console.error('[ORBIT] Calendar sync failed:', err);
      alert('Failed to sync with Google Calendar. Check console for details.');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      await deleteItem(item.id);
      setSelectedItemId(null);
    } catch (err) {
      console.error('[ORBIT] Delete failed:', err);
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

  const handleTagLongPressStart = (tag: string) => {
    // Allow deletion of ALL tags (including life area tags)
    const timer = setTimeout(() => {
      setTagToDelete(tag);
    }, 500); // 500ms long press
    setTagLongPressTimer(timer);
  };

  const handleTagLongPressEnd = () => {
    if (tagLongPressTimer) {
      clearTimeout(tagLongPressTimer);
      setTagLongPressTimer(null);
    }
  };

  const handleDeleteTag = (tag: string) => {
    removeCustomTag(tag);
    setTagToDelete(null);
  };

  // Filter item tags to only show valid tags (remove deleted custom tags)
  const validItemTags = (item?.tags || []).filter(tag => allTags.includes(tag));

  const handleNewTask = async (projectId: string, status: ItemStatus = 'active') => {
    if (!user) return;
    const id = await createItem({
      type: 'task',
      status,
      title: 'New Task',
      parentId: projectId,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

  const handleNewMilestone = async (projectId: string) => {
    if (!user) return;
    const id = await createItem({
      type: 'goal',
      status: 'active',
      title: 'New Milestone',
      parentId: projectId,
      tags: [],
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedItemId(id);
  };

  if (!item) return null;

  // Project Dashboard View
  if (item.type === 'project') {
    const projectTasks = items.filter((i) => i.parentId === item.id && i.type === 'task');
    const projectMilestones = items.filter((i) => i.parentId === item.id && i.type === 'goal');
    const projectNotes = items.filter((i) => i.parentId === item.id && i.type === 'note');
    
    const stats = {
      total: projectTasks.length,
      done: projectTasks.filter((t) => t.status === 'done').length,
      active: projectTasks.filter((t) => t.status === 'active').length,
      waiting: projectTasks.filter((t) => t.status === 'waiting').length,
      progress: 0,
    };
    stats.progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

    const tasksByStatus = {
      active: projectTasks.filter((t) => t.status === 'active'),
      waiting: projectTasks.filter((t) => t.status === 'waiting'),
      done: projectTasks.filter((t) => t.status === 'done'),
    };

    const content = (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="text-xl">{item.emoji || '📁'}</span>
            <span className="text-[13px] font-semibold">{title || 'Project'}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <DropdownMenu open={showProjectSettings} onOpenChange={setShowProjectSettings}>
              <DropdownMenuTrigger asChild>
                <button className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <div className="px-2 py-2">
                  <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                    Project Settings
                  </p>
                  
                  {/* Emoji & Color */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground/50 block mb-1">Emoji</label>
                      <Input 
                        value={item.emoji || ''} 
                        onChange={(e) => handleUpdate({ emoji: e.target.value })} 
                        className="h-7 text-[12px]" 
                        placeholder="📁" 
                        maxLength={2} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground/50 block mb-1">Color</label>
                      <Input 
                        type="color" 
                        value={item.color || '#6366f1'} 
                        onChange={(e) => handleUpdate({ color: e.target.value })} 
                        className="h-7" 
                      />
                    </div>
                  </div>

                  {/* Status */}
                  <div className="mb-3">
                    <label className="text-[10px] text-muted-foreground/50 block mb-1">Status</label>
                    <Select value={item.status} onValueChange={(v) => handleUpdate({ status: v as ItemStatus })}>
                      <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize text-[11px]">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="text-[10px] text-muted-foreground/50 block mb-1">Tags</label>
                    <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all',
                            validItemTags.includes(tag)
                              ? 'bg-foreground text-background'
                              : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <DropdownMenuSeparator />
                
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
                <DropdownMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button onClick={() => setDetailPanelOpen(false)} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
          {/* Project Name - Editable */}
          <div className="px-4 pt-4 pb-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleUpdate({ title })}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdate({ title })}
              className="w-full bg-transparent text-[20px] font-bold leading-tight outline-none placeholder:text-muted-foreground/30"
              placeholder="Project name…"
            />
          </div>

          {/* Stats Cards */}
          <div className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/40 bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-3">
                <div className="text-[10px] font-medium text-blue-600/70 dark:text-blue-400/70 uppercase tracking-wider mb-0.5">Progress</div>
                <div className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{stats.progress}%</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-gradient-to-br from-green-500/5 to-green-500/10 p-3">
                <div className="text-[10px] font-medium text-green-600/70 dark:text-green-400/70 uppercase tracking-wider mb-0.5">Done</div>
                <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{stats.done}</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-gradient-to-br from-orange-500/5 to-orange-500/10 p-3">
                <div className="text-[10px] font-medium text-orange-600/70 dark:text-orange-400/70 uppercase tracking-wider mb-0.5">Active</div>
                <div className="text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{stats.active}</div>
              </div>
            </div>
          </div>

          {/* Description */}
          {item.content && (
            <div className="px-4 pb-4">
              <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{item.content}</p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="px-4 pb-4">
            <div className="flex gap-2">
              <button
                onClick={() => handleNewTask(item.id, 'active')}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[12px] font-medium hover:bg-foreground/[0.02] hover:border-border transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>
              <button
                onClick={() => handleNewMilestone(item.id)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[12px] font-medium hover:bg-foreground/[0.02] hover:border-border transition-colors"
              >
                <Target className="h-4 w-4" />
                Milestone
              </button>
            </div>
          </div>

          {/* Milestones */}
          {projectMilestones.length > 0 && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Target className="h-3.5 w-3.5 text-muted-foreground/50" />
                <FieldLabel>Milestones · {projectMilestones.length}</FieldLabel>
              </div>
              <div className="space-y-1.5">
                {projectMilestones.map((milestone) => (
                  <button
                    key={milestone.id}
                    onClick={() => setSelectedItemId(milestone.id)}
                    className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                  >
                    <CheckCircle2 className={cn(
                      "h-4 w-4 shrink-0",
                      milestone.status === 'done' ? 'text-green-500' : 'text-muted-foreground/30'
                    )} />
                    <span className={cn(
                      "text-[13px] font-medium flex-1",
                      milestone.status === 'done' ? 'text-muted-foreground/60 line-through' : 'text-foreground/90 group-hover:text-foreground'
                    )}>
                      {milestone.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Kanban Board */}
          <div className="px-4">
            <div className="flex items-center gap-1.5 mb-3">
              <LayoutList className="h-3.5 w-3.5 text-muted-foreground/50" />
              <FieldLabel>Tasks · {stats.total}</FieldLabel>
            </div>
            <div className="space-y-4">
              {/* Active */}
              {(tasksByStatus.active.length > 0 || stats.total === 0) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">In Progress</h4>
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">{tasksByStatus.active.length}</span>
                  </div>
                  <div className="space-y-1">
                    {tasksByStatus.active.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedItemId(task.id)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Circle className="h-2 w-2 text-blue-500 fill-blue-500" />
                          <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground flex-1">
                            {task.title}
                          </p>
                        </div>
                        {task.dueDate && (
                          <p className="text-[11px] text-muted-foreground/40 mt-0.5 ml-4">Due {task.dueDate}</p>
                        )}
                      </button>
                    ))}
                    {tasksByStatus.active.length === 0 && (
                      <button
                        onClick={() => handleNewTask(item.id, 'active')}
                        className="w-full px-3 py-2 rounded-lg border border-dashed border-border/40 hover:border-border hover:bg-foreground/[0.02] transition-colors text-[12px] text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1.5"
                      >
                        <Plus className="h-3 w-3" />
                        Add task
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Waiting */}
              {tasksByStatus.waiting.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Waiting</h4>
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">{tasksByStatus.waiting.length}</span>
                  </div>
                  <div className="space-y-1">
                    {tasksByStatus.waiting.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedItemId(task.id)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-amber-500" />
                          <p className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground flex-1">
                            {task.title}
                          </p>
                        </div>
                        {task.dueDate && (
                          <p className="text-[11px] text-muted-foreground/40 mt-0.5 ml-5">Due {task.dueDate}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Done */}
              {tasksByStatus.done.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Done</h4>
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">{tasksByStatus.done.length}</span>
                  </div>
                  <div className="space-y-1">
                    {tasksByStatus.done.slice(0, 5).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedItemId(task.id)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-foreground/30" />
                          <p className="text-[13px] font-medium text-muted-foreground/40 line-through flex-1">
                            {task.title}
                          </p>
                        </div>
                      </button>
                    ))}
                    {tasksByStatus.done.length > 5 && (
                      <p className="text-[11px] text-muted-foreground/30 text-center py-1">
                        +{tasksByStatus.done.length - 5} more completed
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {projectNotes.length > 0 && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-1.5 mb-2.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                <FieldLabel>Notes · {projectNotes.length}</FieldLabel>
              </div>
              <div className="space-y-1.5">
                {projectNotes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => setSelectedItemId(note.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-border/30 bg-background hover:bg-foreground/[0.02] hover:border-border transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-foreground/90 group-hover:text-foreground flex-1">
                        {note.title}
                      </p>
                      {note.noteSubtype && note.noteSubtype !== 'general' && (
                        <span className="text-[10px] text-muted-foreground/40 capitalize shrink-0">
                          {note.noteSubtype}
                        </span>
                      )}
                    </div>
                    {note.content && (
                      <p className="text-[11px] text-muted-foreground/50 mt-1 line-clamp-2">
                        {note.content.replace(/<[^>]*>/g, '')}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Files className="h-3.5 w-3.5 text-muted-foreground/50" />
              <FieldLabel>Files</FieldLabel>
            </div>
            <FileUpload project={item} onFilesChange={() => { /* The component updates via Firestore subscription */ }} />
          </div>

          {/* Meta */}
          <div className="h-px bg-border/40 mx-4 mt-2" />
          <div className="px-4 py-4 space-y-0.5 text-[11px] text-muted-foreground/40">
            <p>Created {format(new Date(item.createdAt), 'dd MMM yyyy · HH:mm')}</p>
            <p>Updated {format(new Date(item.updatedAt), 'dd MMM yyyy · HH:mm')}</p>
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

        {/* Mobile */}
        <Sheet open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
          <SheetContent
            side="bottom"
            className="h-[92dvh] rounded-t-2xl p-0 border-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Project Dashboard</SheetTitle>
            </SheetHeader>
            <div className="flex justify-center pt-2 pb-1 sticky top-0 z-10 bg-background rounded-t-2xl">
              <div className="h-1 w-10 rounded-full bg-foreground/10" />
            </div>
            <div className="h-[calc(92dvh-24px)] overflow-hidden">
              {content}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Regular detail panel for non-project items
  const parentItem = item.parentId ? getItemById(item.parentId) : undefined;
  const childItems = items.filter((i) => i.parentId === item.id);

  const content = (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          {(item.type === 'task' || item.type === 'habit') && (
            <button
              onClick={handleComplete}
              className={cn(
                'relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] transition-all',
                'before:absolute before:inset-[-6px]',
                item.status === 'done'
                  ? 'border-foreground/30 bg-foreground/10'
                  : 'border-foreground/20 hover:border-foreground/40'
              )}
            >
              {item.status === 'done' && <Check className="h-2.5 w-2.5 text-foreground/50" />}
            </button>
          )}
          <span className="text-[11px] text-muted-foreground/50 capitalize">{item.type}</span>
          <span className="text-[11px] text-muted-foreground/30">·</span>
          <span className={cn(
            'text-[11px] capitalize',
            item.status === 'done' ? 'text-muted-foreground/40' : 'text-muted-foreground/50'
          )}>
            {item.status}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {item.status === 'archived' ? (
            <button onClick={handleRestore} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors" title="Restore">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={handleArchive} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors" title="Archive">
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={handleDelete} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/[0.05] transition-colors" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setDetailPanelOpen(false)} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors ml-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => handleUpdate({ title })}
          onKeyDown={(e) => e.key === 'Enter' && handleUpdate({ title })}
          className="w-full bg-transparent text-[15px] font-semibold leading-snug outline-none placeholder:text-muted-foreground/30"
          placeholder="Title…"
        />

        {/* Add to Today - Quick Action */}
        {item.type === 'task' && item.status !== 'done' && (
          <div>
            {/* Add to Today button */}
            {item.dueDate === new Date().toISOString().split('T')[0] ? (
              <button
                onClick={handleAddToToday}
                className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 hover:bg-blue-500/15 transition-colors w-full active:scale-[0.98]"
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-[12px] font-medium text-blue-600 dark:text-blue-400 flex-1 text-left">
                  Scheduled for today
                </span>
                <X className="h-3 w-3 text-blue-600/60 dark:text-blue-400/60" />
              </button>
            ) : (
              <button
                onClick={handleAddToToday}
                className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-[12px] font-medium hover:bg-foreground/[0.02] hover:border-border transition-colors w-full active:scale-[0.98]"
              >
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span>Add to Today</span>
              </button>
            )}
          </div>
        )}

        {/* ── Fields ── */}
        <div className="space-y-3">
          {/* Type & Status row */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <FieldLabel>Type</FieldLabel>
              <Select value={item.type} onValueChange={(v) => handleUpdate({ type: v as ItemType })}>
                <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize text-[12px]">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <Select value={item.status} onValueChange={(v) => handleUpdate({ status: v as ItemStatus, completedAt: v === 'done' ? Date.now() : undefined })}>
                <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-[12px]">
                      <div className="flex flex-col">
                        <span className="capitalize font-medium">{s}</span>
                        <span className="text-[10px] text-muted-foreground/60">{STATUS_DESCRIPTIONS[s]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority */}
          {item.type === 'task' && (
            <div>
              <FieldLabel>Priority</FieldLabel>
              <Select value={item.priority || ''} onValueChange={(v) => handleUpdate({ priority: v as Priority })}>
                <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize text-[12px]">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Due Date */}
          {item.type === 'task' && (
            <div>
              <FieldLabel>Due date</FieldLabel>
              <Input
                type="date"
                value={item.dueDate || ''}
                onChange={(e) => handleUpdate({ dueDate: e.target.value || undefined })}
                className="mt-1 h-8 text-[12px] border-border/50"
              />
            </div>
          )}

          {/* Event dates & times */}
          {item.type === 'event' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <FieldLabel>Start</FieldLabel>
                  <Input type="date" value={item.startDate || ''} onChange={(e) => handleUpdate({ startDate: e.target.value || undefined })} className="mt-1 h-8 text-[12px] border-border/50" />
                </div>
                <div>
                  <FieldLabel>End</FieldLabel>
                  <Input type="date" value={item.endDate || ''} onChange={(e) => handleUpdate({ endDate: e.target.value || undefined })} className="mt-1 h-8 text-[12px] border-border/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <FieldLabel>Time from</FieldLabel>
                  <Input type="time" value={item.startTime || ''} onChange={(e) => handleUpdate({ startTime: e.target.value || undefined })} className="mt-1 h-8 text-[12px] border-border/50" />
                </div>
                <div>
                  <FieldLabel>Time to</FieldLabel>
                  <Input type="time" value={item.endTime || ''} onChange={(e) => handleUpdate({ endTime: e.target.value || undefined })} className="mt-1 h-8 text-[12px] border-border/50" />
                </div>
              </div>
              
              {/* Google Calendar Sync */}
              <div>
                <FieldLabel>Google Calendar</FieldLabel>
                <button
                  onClick={handleSyncToGoogleCalendar}
                  disabled={syncingCalendar}
                  className={cn(
                    'mt-1.5 flex items-center gap-2 rounded-md px-3 py-2 text-[12px] font-medium transition-colors w-full',
                    item.calendarSynced
                      ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                      : 'bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.1]',
                    syncingCalendar && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {syncingCalendar
                    ? 'Syncing...'
                    : item.calendarSynced
                    ? 'Synced ✓'
                    : 'Sync to Google Calendar'}
                </button>
                {item.googleCalendarId && (
                  <p className="mt-1 text-[10px] text-muted-foreground/50">
                    ID: {item.googleCalendarId.substring(0, 20)}...
                  </p>
                )}
              </div>
            </>
          )}

          {/* Habit fields */}
          {item.type === 'habit' && (
            <>
              <div>
                <FieldLabel>Frequency</FieldLabel>
                <Select value={item.frequency || 'daily'} onValueChange={(v) => handleUpdate({ frequency: v as HabitFrequency })}>
                  <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f} className="capitalize text-[12px]">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(item.frequency === 'custom' || !item.frequency) && (
                <div>
                  <FieldLabel>Days</FieldLabel>
                  <div className="mt-1.5 flex gap-1">
                    {DAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const days = new Set(item.customDays || []);
                          days.has(idx) ? days.delete(idx) : days.add(idx);
                          handleUpdate({ customDays: Array.from(days) });
                        }}
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium transition-all',
                          (item.customDays || []).includes(idx)
                            ? 'bg-foreground text-background'
                            : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.1]'
                        )}
                      >
                        {label.charAt(0)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <FieldLabel>Time</FieldLabel>
                <Input type="time" value={item.habitTime || ''} onChange={(e) => handleUpdate({ habitTime: e.target.value || undefined })} className="mt-1 h-8 text-[12px] border-border/50" />
              </div>
            </>
          )}

          {/* Goal fields */}
          {item.type === 'goal' && (
            <>
              <div>
                <FieldLabel>Timeframe</FieldLabel>
                <Select value={item.timeframe || 'quarterly'} onValueChange={(v) => handleUpdate({ timeframe: v as GoalTimeframe })}>
                  <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEFRAME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize text-[12px]">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Success metric</FieldLabel>
                <Textarea
                  value={item.metric || ''}
                  onChange={(e) => handleUpdate({ metric: e.target.value })}
                  className="mt-1 text-[12px] min-h-16 border-border/50"
                  placeholder="How will you measure this?"
                />
              </div>
            </>
          )}

          {/* Note subtype */}
          {item.type === 'note' && (
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={item.noteSubtype || 'general'} onValueChange={(v) => handleUpdate({ noteSubtype: v as NoteSubtype })}>
                <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_SUBTYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize text-[12px]">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Parent item (link) */}
          <div>
            <FieldLabel>Linked to</FieldLabel>
            <Select value={item.parentId || 'none'} onValueChange={(v) => handleUpdate({ parentId: v === 'none' ? undefined : v })}>
              <SelectTrigger className="mt-1 h-8 text-[12px] border-border/50"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-[12px]">None</SelectItem>
                {items.filter(i => i.id !== item.id && i.status !== 'archived').map((linkableItem) => {
                  const Icon = TYPE_ICONS[linkableItem.type];
                  return (
                    <SelectItem key={linkableItem.id} value={linkableItem.id} className="text-[12px] flex items-center gap-2">
                      <span className="flex items-center gap-2">
                        {linkableItem.emoji || ''} {linkableItem.title}
                        <span className="text-[9px] text-muted-foreground/40 uppercase ml-1">({linkableItem.type})</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-border/40" />

        {/* ── Tags ── */}
        <div>
          <FieldLabel>Tags</FieldLabel>
          <div className="mt-2 flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <div key={tag} className="relative">
                <button
                  onClick={() => toggleTag(tag)}
                  onTouchStart={(e) => {
                    handleTagLongPressStart(tag);
                  }}
                  onTouchEnd={(e) => {
                    handleTagLongPressEnd();
                  }}
                  onTouchCancel={(e) => {
                    handleTagLongPressEnd();
                  }}
                  onMouseEnter={() => {
                    // Allow deletion of ALL tags
                    setTagToDelete(tag);
                  }}
                  onMouseLeave={() => {
                    setTagToDelete(null);
                  }}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                    validItemTags.includes(tag)
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08] hover:text-muted-foreground'
                  )}
                >
                  {tag}
                </button>
                {tagToDelete === tag && (
                  <div 
                    className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border/60 rounded-lg shadow-lg p-2 min-w-[180px]"
                    onMouseEnter={() => setTagToDelete(tag)}
                    onMouseLeave={() => setTagToDelete(null)}
                  >
                    <p className="text-[11px] text-muted-foreground/80 mb-2">Delete tag "{tag}"?</p>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(tag);
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(tag);
                        }}
                        className="flex-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 px-2 py-1 text-[11px] font-medium transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagToDelete(null);
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          setTagToDelete(null);
                        }}
                        className="flex-1 rounded-md bg-foreground/[0.05] hover:bg-foreground/[0.1] text-foreground px-2 py-1 text-[11px] font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/40">
            Tip: Use <kbd className="font-mono text-[10px]">#tagname</kbd> in the command bar to add new tags
          </p>
        </div>

        {/* ── Notes ── */}
        <div>
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            value={item.content || ''}
            onChange={(e) => handleUpdate({ content: e.target.value })}
            className="mt-1.5 text-[13px] min-h-24 border-border/50 leading-relaxed"
            placeholder="Write something…"
          />
        </div>

        {/* ── Checklist ── */}
        {item.type === 'task' && (
          <div>
            <FieldLabel>Checklist</FieldLabel>
            <div className="mt-2 space-y-0.5">
              {(item.checklist || []).map((check) => (
                <div key={check.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    checked={check.done}
                    onCheckedChange={() => toggleChecklistItem(check.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className={cn('text-[13px]', check.done && 'text-muted-foreground/40 line-through')}>
                    {check.text}
                  </span>
                </div>
              ))}
              <div className="flex gap-1.5 mt-1">
                <input
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                  placeholder="Add item…"
                  className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/30 py-1"
                />
                <button onClick={addChecklistItem} className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Child items ── */}
        {childItems.length > 0 && (
          <div>
            <FieldLabel>Sub-items · {childItems.length}</FieldLabel>
            <div className="mt-1.5 space-y-0.5">
              {childItems.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setSelectedItemId(child.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-foreground/[0.03] transition-colors text-left"
                >
                  <span className={cn(child.status === 'done' && 'line-through text-muted-foreground/40')}>
                    {child.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Meta ── */}
        <div className="h-px bg-border/40" />
        <div className="space-y-0.5 text-[11px] text-muted-foreground/40 pb-4">
          <p>Created {format(new Date(item.createdAt), 'dd MMM yyyy · HH:mm')}</p>
          <p>Updated {format(new Date(item.updatedAt), 'dd MMM yyyy · HH:mm')}</p>
          {item.completedAt && <p>Completed {format(new Date(item.completedAt), 'dd MMM yyyy · HH:mm')}</p>}
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

      {/* Mobile — full-screen sheet with drag handle */}
      <Sheet open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
        <SheetContent
          side="bottom"
          className="h-[92dvh] rounded-t-2xl p-0 border-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Item Details</SheetTitle>
          </SheetHeader>
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1 sticky top-0 z-10 bg-background rounded-t-2xl">
            <div className="h-1 w-10 rounded-full bg-foreground/10" />
          </div>
          <div className="h-[calc(92dvh-24px)] overflow-hidden">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
