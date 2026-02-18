'use client';

import { useState, useRef } from 'react';
import { useSwipeToClose } from '@/lib/hooks/use-swipe-to-close';
import {
  X,
  Trash2,
  Archive,
  RotateCcw,
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  Target,
  LayoutList,
  FileText,
  MoreVertical,
  Files,
  Network,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { updateItem, deleteItem, createItem } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';
import { useAuth } from '@/components/providers/auth-provider';
import { LinkGraph } from '@/components/items/link-graph';
import type { OrbitItem, ItemStatus } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileUpload } from '@/components/files/file-upload';
import { cn, formatTimestamp } from '@/lib/utils';

const STATUS_OPTIONS: ItemStatus[] = ['active', 'waiting', 'done', 'archived'];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
      {children}
    </span>
  );
}

export function ProjectDashboard() {
  const { selectedItemId, setSelectedItemId, detailPanelOpen, setDetailPanelOpen, items, getAllTags } = useOrbitStore();
  const { user } = useAuth();
  const item = selectedItemId ? items.find(i => i.id === selectedItemId) : undefined;
  const [title, setTitle] = useState(item?.title || '');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLinkGraph, setShowLinkGraph] = useState(false);

  const { isDragging, swipeStyles, handlers: swipeHandlers } = useSwipeToClose({
    onClose: () => setDetailPanelOpen(false),
  });

  const allTags = getAllTags();

  // Sync title when item changes
  if (item && title !== item.title && !document.activeElement?.closest('input')) {
    setTitle(item.title);
  }

  if (!item || item.type !== 'project') return null;

  const handleUpdate = async (updates: Partial<OrbitItem>) => {
    try {
      await updateItem(item.id, updates);
    } catch {
      // Update failed — optimistic update already in place
    }
  };

  const handleDelete = async () => {
    const { confirmBeforeDelete, archiveInsteadOfDelete } = useSettingsStore.getState().settings;
    if (confirmBeforeDelete && !confirm('Delete this item?')) return;
    try {
      if (archiveInsteadOfDelete) {
        await updateItem(item.id, { status: 'archived' });
      } else {
        await deleteItem(item.id);
      }
      setSelectedItemId(null);
    } catch {
      // Delete failed
    }
  };

  const handleArchive = () => handleUpdate({ status: 'archived' });
  const handleRestore = () => handleUpdate({ status: 'active' });

  const validItemTags = (item.tags || []).filter(tag => allTags.includes(tag));

  const toggleTag = (tag: string) => {
    const tags = item.tags || [];
    const updated = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    handleUpdate({ tags: updated });
  };

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
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowLinkGraph(true); }}
            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); setShowLinkGraph(true); }}
            className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors active:scale-95"
            title="View link graph"
            aria-label="View link graph"
            type="button"
          >
            <Network className="h-4 w-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors" aria-label="More options">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px]">
              <div className="px-2 py-2">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Project Settings
                </p>

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

          <button onClick={() => setDetailPanelOpen(false)} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors" aria-label="Close panel">
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
          <FileUpload project={item} onFilesChange={() => {}} />
        </div>

        {/* Meta */}
        <div className="h-px bg-border/40 mx-4 mt-2" />
        <div className="px-4 py-4 space-y-0.5 text-[11px] text-muted-foreground/40">
          <p>Created {formatTimestamp(item.createdAt)}</p>
          <p>Updated {formatTimestamp(item.updatedAt)}</p>
        </div>
      </div>

      {/* Link Graph */}
      {showLinkGraph && (
        <LinkGraph
          open={showLinkGraph}
          onClose={() => setShowLinkGraph(false)}
          currentItem={item}
          allItems={items}
          onNavigate={(id) => setSelectedItemId(id)}
        />
      )}
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
              <SheetTitle>Project Dashboard</SheetTitle>
            </SheetHeader>
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
    </>
  );
}
