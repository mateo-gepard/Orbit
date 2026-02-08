'use client';

import { useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  ArrowUpDown,
  Inbox,
  FolderKanban,
  Target,
  Tag,
  CalendarDays,
  X,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { ItemRow } from '@/components/items/item-row';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, parseISO } from 'date-fns';
import type { OrbitItem, Priority } from '@/lib/types';
import { LIFE_AREA_TAGS } from '@/lib/types';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

type SortKey = 'dueDate' | 'priority' | 'createdAt' | 'title';
type FilterStatus = 'all' | 'active' | 'done';
type GroupBy = 'none' | 'project' | 'goal' | 'priority' | 'dueDate' | 'tag';

interface TaskGroup {
  key: string;
  label: string;
  emoji?: string;
  items: OrbitItem[];
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortTasks(tasks: OrbitItem[], sortKey: SortKey, ascending: boolean): OrbitItem[] {
  const sorted = [...tasks].sort((a, b) => {
    switch (sortKey) {
      case 'dueDate': {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      case 'priority': {
        const pa = PRIORITY_ORDER[a.priority || ''] ?? 3;
        const pb = PRIORITY_ORDER[b.priority || ''] ?? 3;
        return pa - pb;
      }
      case 'createdAt':
        return (b.createdAt || 0) - (a.createdAt || 0);
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
  return ascending ? sorted : sorted.reverse();
}

function groupTasks(
  tasks: OrbitItem[],
  groupBy: GroupBy,
  allItems: OrbitItem[]
): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All Tasks', items: tasks }];
  }

  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    let key: string;
    let label: string;
    let emoji: string | undefined;

    switch (groupBy) {
      case 'project': {
        const parent = task.parentId
          ? allItems.find((i) => i.id === task.parentId && i.type === 'project')
          : undefined;
        key = parent ? parent.id : '__no_project';
        label = parent ? parent.title : 'No Project';
        emoji = parent?.emoji || (parent ? '📁' : undefined);
        break;
      }
      case 'goal': {
        const goalParent = task.parentId
          ? allItems.find((i) => i.id === task.parentId && i.type === 'goal')
          : undefined;
        // Also check linked goals
        const linkedGoal = !goalParent && task.linkedIds?.length
          ? allItems.find((i) => task.linkedIds!.includes(i.id) && i.type === 'goal')
          : undefined;
        const goal = goalParent || linkedGoal;
        key = goal ? goal.id : '__no_goal';
        label = goal ? goal.title : 'No Goal';
        emoji = goal ? '🎯' : undefined;
        break;
      }
      case 'priority': {
        key = task.priority || 'none';
        label = task.priority
          ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) + ' Priority'
          : 'No Priority';
        break;
      }
      case 'dueDate': {
        if (!task.dueDate) {
          key = '__no_date';
          label = 'No Due Date';
        } else {
          const d = parseISO(task.dueDate);
          if (isPast(d) && !isToday(d)) {
            key = '__overdue';
            label = 'Overdue';
          } else if (isToday(d)) {
            key = '__today';
            label = 'Today';
          } else {
            // Group by week
            const weekStart = format(d, 'yyyy-ww');
            key = weekStart;
            label = format(d, "'Week of' MMM d");
          }
        }
        break;
      }
      case 'tag': {
        const tags = task.tags?.length ? task.tags : ['__untagged'];
        for (const t of tags) {
          const tagKey = t;
          const tagLabel = t === '__untagged' ? 'Untagged' : t;
          if (!groups.has(tagKey)) {
            groups.set(tagKey, { key: tagKey, label: tagLabel, items: [] });
          }
          groups.get(tagKey)!.items.push(task);
        }
        continue; // Skip the default set below since we handle multiple tags
      }
      default:
        key = 'all';
        label = 'All Tasks';
    }

    if (!groups.has(key)) {
      groups.set(key, { key, label, emoji, items: [] });
    }
    groups.get(key)!.items.push(task);
  }

  // Sort groups: pinned groups first, then alphabetical
  const pinOrder: Record<string, number> = {
    __overdue: 0,
    __today: 1,
    high: 0,
    medium: 1,
    low: 2,
    none: 3,
  };

  return Array.from(groups.values()).sort((a, b) => {
    const oa = pinOrder[a.key] ?? 50;
    const ob = pinOrder[b.key] ?? 50;
    if (oa !== ob) return oa - ob;
    // Move "no X" groups to the end
    if (a.key.startsWith('__no_')) return 1;
    if (b.key.startsWith('__no_')) return -1;
    return a.label.localeCompare(b.label);
  });
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'dueDate', label: 'Due Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'createdAt', label: 'Newest' },
  { key: 'title', label: 'Title' },
];

const GROUP_OPTIONS: { key: GroupBy; label: string; icon: typeof FolderKanban }[] = [
  { key: 'none', label: 'No Grouping', icon: CheckSquare },
  { key: 'project', label: 'By Project', icon: FolderKanban },
  { key: 'goal', label: 'By Goal', icon: Target },
  { key: 'priority', label: 'By Priority', icon: SlidersHorizontal },
  { key: 'dueDate', label: 'By Due Date', icon: CalendarDays },
  { key: 'tag', label: 'By Tag', icon: Tag },
];

export default function TasksPage() {
  const { items, setSelectedItemId, getAllTags, removeCustomTag } = useOrbitStore();

  // Filters
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('active');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Sort & group
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortAsc, setSortAsc] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // Expanded groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Toolbar open states (mobile)
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  // Tag delete confirmation
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [tagLongPressTimer, setTagLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const allTags = getAllTags();

  const handleDeleteTag = (tag: string) => {
    if (LIFE_AREA_TAGS.includes(tag as any)) {
      return; // Don't allow deleting default tags
    }
    removeCustomTag(tag);
    if (tagFilter === tag) {
      setTagFilter(null);
    }
    setTagToDelete(null);
  };

  const handleTagLongPressStart = (tag: string) => {
    if (LIFE_AREA_TAGS.includes(tag as any)) {
      return; // Don't show delete for default tags
    }
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

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let tasks = items.filter((i) => i.type === 'task');

    // Status
    if (statusFilter === 'active') {
      tasks = tasks.filter((i) => i.status !== 'done' && i.status !== 'archived');
    } else if (statusFilter === 'done') {
      tasks = tasks.filter((i) => i.status === 'done');
    } else {
      tasks = tasks.filter((i) => i.status !== 'archived');
    }

    // Tag
    if (tagFilter) {
      tasks = tasks.filter((i) => i.tags?.includes(tagFilter));
    }

    // Priority
    if (priorityFilter) {
      tasks = tasks.filter((i) => i.priority === priorityFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tasks = tasks.filter((i) => i.title.toLowerCase().includes(q));
    }

    // Sort
    tasks = sortTasks(tasks, sortKey, sortAsc);

    return tasks;
  }, [items, statusFilter, tagFilter, priorityFilter, searchQuery, sortKey, sortAsc]);

  // Group
  const groups = useMemo(
    () => groupTasks(filteredTasks, groupBy, items),
    [filteredTasks, groupBy, items]
  );

  const totalCount = filteredTasks.length;
  const activeFilters = [tagFilter, priorityFilter].filter(Boolean).length;

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
          <span className="text-[12px] text-muted-foreground/40 tabular-nums">{totalCount}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-border/60 bg-card px-4 py-2.5 lg:py-2 text-[14px] lg:text-[13px]',
            'placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/10',
            'transition-shadow'
          )}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter bar — horizontally scrollable on mobile */}
      <div className="space-y-2.5">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
          {(['active', 'done', 'all'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'shrink-0 rounded-xl lg:rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95',
                statusFilter === s
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
              )}
            >
              {s === 'active' ? 'Active' : s === 'done' ? 'Completed' : 'All'}
            </button>
          ))}

          <div className="h-4 w-px bg-border/40 mx-1 shrink-0" />

          {/* Priority filter chips */}
          {(['high', 'medium', 'low'] as Priority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
              className={cn(
                'shrink-0 rounded-xl lg:rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95 flex items-center gap-1',
                priorityFilter === p
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-amber-500' : 'bg-foreground/30',
                  priorityFilter === p && 'bg-background/60'
                )}
              />
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Tag filters */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
          <Tag className="h-3 w-3 text-muted-foreground/30 shrink-0 mr-0.5" />
          {allTags.map((tag) => (
            <div key={tag} className="relative group">
              <button
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                onTouchStart={() => handleTagLongPressStart(tag)}
                onTouchEnd={handleTagLongPressEnd}
                onTouchCancel={handleTagLongPressEnd}
                onMouseEnter={() => !LIFE_AREA_TAGS.includes(tag as any) && setTagToDelete(tag)}
                onMouseLeave={() => setTagToDelete(null)}
                className={cn(
                  'shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium transition-all active:scale-95',
                  tagFilter === tag
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground/50 hover:bg-foreground/[0.05] hover:text-muted-foreground'
                )}
              >
                {tag}
              </button>
              {tagToDelete === tag && !LIFE_AREA_TAGS.includes(tag as any) && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border/60 rounded-lg shadow-lg p-2 min-w-[180px]">
                  <p className="text-[11px] text-muted-foreground/80 mb-2">Delete tag "{tag}"?</p>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
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
                      className="flex-1 rounded-md bg-foreground/[0.05] hover:bg-foreground/[0.1] text-foreground px-2 py-1 text-[11px] font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="shrink-0 text-[10px] text-muted-foreground/40 hover:text-foreground ml-1"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Sort & Group controls */}
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowGroupMenu(false);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-xl lg:rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95',
                'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
              )}
            >
              <ArrowUpDown className="h-3 w-3" />
              <span className="hidden sm:inline">Sort:</span>
              {SORT_OPTIONS.find((o) => o.key === sortKey)?.label}
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 rounded-xl border border-border/60 bg-card shadow-lg py-1 min-w-[160px] animate-scale-in">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (sortKey === opt.key) {
                          setSortAsc(!sortAsc);
                        } else {
                          setSortKey(opt.key);
                          setSortAsc(true);
                        }
                        setShowSortMenu(false);
                      }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 text-[12px] transition-colors',
                        'hover:bg-foreground/[0.04] active:bg-foreground/[0.06]',
                        sortKey === opt.key && 'text-foreground font-medium'
                      )}
                    >
                      {opt.label}
                      {sortKey === opt.key && (
                        <span className="text-[10px] text-muted-foreground/50">
                          {sortAsc ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Group dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowGroupMenu(!showGroupMenu);
                setShowSortMenu(false);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-xl lg:rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95',
                groupBy !== 'none'
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
              )}
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span className="hidden sm:inline">Group:</span>
              {GROUP_OPTIONS.find((o) => o.key === groupBy)?.label}
            </button>
            {showGroupMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowGroupMenu(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 rounded-xl border border-border/60 bg-card shadow-lg py-1 min-w-[170px] animate-scale-in">
                  {GROUP_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setGroupBy(opt.key);
                          setShowGroupMenu(false);
                          setCollapsedGroups(new Set());
                        }}
                        className={cn(
                          'flex items-center gap-2 w-full px-3 py-2 text-[12px] transition-colors',
                          'hover:bg-foreground/[0.04] active:bg-foreground/[0.06]',
                          groupBy === opt.key && 'text-foreground font-medium'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Clear all filters */}
          {(activeFilters > 0 || searchQuery) && (
            <button
              onClick={() => {
                setTagFilter(null);
                setPriorityFilter(null);
                setSearchQuery('');
              }}
              className="ml-auto text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          const isUngrouped = groupBy === 'none';

          return (
            <div key={group.key}>
              {/* Group header — only show when grouping is active */}
              {!isUngrouped && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center gap-2 w-full px-1 py-2 text-left transition-colors',
                    'hover:bg-foreground/[0.02] rounded-lg active:scale-[0.99]'
                  )}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                  {group.emoji && <span className="text-sm">{group.emoji}</span>}
                  <span className="text-[12px] font-semibold text-foreground/80 flex-1 truncate">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
                    {group.items.length}
                  </span>
                </button>
              )}

              {/* Items */}
              {(!isCollapsed || isUngrouped) && (
                <div className="rounded-xl border border-border/60 bg-card py-1">
                  {group.items.length > 0 ? (
                    group.items.map((item) => (
                      <ItemRow key={item.id} item={item} showProject={groupBy !== 'project'} compact />
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-[12px] text-muted-foreground/40">
                      No tasks
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredTasks.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card py-12 text-center">
            <CheckSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/20" strokeWidth={1} />
            <p className="text-[13px] text-muted-foreground/40">
              {searchQuery
                ? 'No tasks match your search'
                : statusFilter === 'done'
                ? 'No completed tasks'
                : 'No active tasks — use ⌘K to create one'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
