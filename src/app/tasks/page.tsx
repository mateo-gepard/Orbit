'use client';

import { useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  ArrowUpDown,
  FolderKanban,
  Target,
  Tag,
  CalendarDays,
  X,
  Plus,
  Archive,
  Trash2,
  ListChecks,
  Check,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem, deleteItem, updateItem } from '@/lib/firestore';
import { searchItems } from '@/lib/item-search';
import { useBulkSelection } from '@/lib/hooks/use-bulk-selection';
import { BulkActionBar, type BulkAction } from '@/components/items/bulk-action-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from 'sonner';
import { ItemRow } from '@/components/items/item-row';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, isValid, parseISO, startOfWeek } from 'date-fns';
import type { Locale } from 'date-fns';
import type { OrbitItem, Priority } from '@/lib/types';
import { useTranslation, type Translate, type TranslationKey } from '@/lib/i18n';
import { useSettingsStore } from '@/lib/settings-store';
import { getLocale } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

import { defaultAscending, sortTasks, type SortKey } from '@/lib/task-sort';
import { useTaskView } from '@/lib/hooks/use-task-view';
import { isDefaultTaskView, type FilterStatus, type GroupBy } from '@/lib/task-view';

function getTimestamp() {
  return Date.now();
}

interface TaskGroup {
  key: string;
  label: string;
  emoji?: string;
  items: OrbitItem[];
  sortValue?: number;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function getTaskGoal(task: OrbitItem, allItems: OrbitItem[]): OrbitItem | undefined {
  const parentGoal = task.parentId
    ? allItems.find((i) => i.id === task.parentId && i.type === 'goal' && i.status !== 'archived')
    : undefined;
  if (parentGoal) return parentGoal;

  return allItems.find((i) =>
    i.type === 'goal' &&
    i.status !== 'archived' &&
    ((task.linkedIds || []).includes(i.id) || Boolean(i.linkedIds?.includes(task.id)))
  );
}

function getTaskProject(task: OrbitItem, allItems: OrbitItem[]): OrbitItem | undefined {
  const parent = task.parentId
    ? allItems.find((i) => i.id === task.parentId && i.status !== 'archived')
    : undefined;

  if (parent?.type === 'project') return parent;
  if (parent?.type === 'goal' && parent.parentId) {
    return allItems.find((i) => i.id === parent.parentId && i.type === 'project' && i.status !== 'archived');
  }

  const goal = getTaskGoal(task, allItems);
  if (goal?.parentId) {
    return allItems.find((i) => i.id === goal.parentId && i.type === 'project' && i.status !== 'archived');
  }

  return undefined;
}

function groupTasks(
  tasks: OrbitItem[],
  groupBy: GroupBy,
  allItems: OrbitItem[],
  weekStartsOn: 0 | 1,
  translate: Translate,
  locale: Locale,
  language: string
): TaskGroup[] {
  if (tasks.length === 0) return [];

  if (groupBy === 'none') {
    return [{ key: 'all', label: translate('group.allTasks'), items: tasks }];
  }

  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    let key: string;
    let label: string;
    let emoji: string | undefined;

    switch (groupBy) {
      case 'project': {
        const project = getTaskProject(task, allItems);
        key = project ? project.id : '__no_project';
        label = project ? project.title : translate('group.noProject');
        emoji = project?.emoji;
        break;
      }
      case 'goal': {
        const goal = getTaskGoal(task, allItems);
        key = goal ? goal.id : '__no_goal';
        label = goal ? goal.title : translate('group.noGoal');
        emoji = undefined;
        break;
      }
      case 'priority': {
        key = task.priority || 'none';
        label = task.priority
          ? translate(`group.${task.priority}Priority`)
          : translate('group.noPriority');
        break;
      }
      case 'dueDate': {
        if (!task.dueDate) {
          key = '__no_date';
          label = translate('group.noDueDate');
        } else {
          const d = parseISO(task.dueDate);
          if (!isValid(d)) {
            key = '__invalid_date';
            label = translate('common.dateUnavailable');
          } else if (isPast(d) && !isToday(d)) {
            key = '__overdue';
            label = translate('common.overdue');
          } else if (isToday(d)) {
            key = '__today';
            label = translate('common.today');
          } else {
            // Group by week
            const weekStart = startOfWeek(d, { weekStartsOn });
            key = format(weekStart, 'yyyy-MM-dd');
            label = translate('tasks.weekOf', { date: format(weekStart, 'PP', { locale }) });
          }
        }
        break;
      }
      case 'tag': {
        const tags = task.tags?.length ? task.tags : ['__untagged'];
        for (const t of tags) {
          const tagKey = t;
          const tagLabel = t === '__untagged' ? translate('group.untagged') : t;
          if (!groups.has(tagKey)) {
            groups.set(tagKey, { key: tagKey, label: tagLabel, items: [] });
          }
          groups.get(tagKey)!.items.push(task);
        }
        continue; // Skip the default set below since we handle multiple tags
      }
      default:
        key = 'all';
        label = translate('group.allTasks');
    }

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        emoji,
        items: [],
        sortValue: groupBy === 'dueDate' && /^\d{4}-\d{2}-\d{2}$/.test(key)
          ? parseISO(key).getTime()
          : undefined,
      });
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
    if (a.sortValue !== undefined && b.sortValue !== undefined) return a.sortValue - b.sortValue;
    // Move "no X" groups to the end
    const aHasNoDate = a.key.startsWith('__no_') || a.key === '__invalid_date';
    const bHasNoDate = b.key.startsWith('__no_') || b.key === '__invalid_date';
    if (aHasNoDate && !bHasNoDate) return 1;
    if (bHasNoDate && !aHasNoDate) return -1;
    return a.label.localeCompare(b.label, language);
  });
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

const SORT_OPTIONS: { key: SortKey; labelKey: TranslationKey }[] = [
  { key: 'dueDate', labelKey: 'sort.dueDate' },
  { key: 'priority', labelKey: 'sort.priority' },
  { key: 'createdAt', labelKey: 'sort.newest' },
  { key: 'title', labelKey: 'sort.title' },
];

const GROUP_OPTIONS: { key: GroupBy; labelKey: TranslationKey; icon: typeof FolderKanban }[] = [
  { key: 'none', labelKey: 'group.none', icon: CheckSquare },
  { key: 'project', labelKey: 'group.byProject', icon: FolderKanban },
  { key: 'goal', labelKey: 'group.byGoal', icon: Target },
  { key: 'priority', labelKey: 'group.byPriority', icon: SlidersHorizontal },
  { key: 'dueDate', labelKey: 'group.byDueDate', icon: CalendarDays },
  { key: 'tag', labelKey: 'group.byTag', icon: Tag },
];

export default function TasksPage() {
  const { items, getAllTags } = useOrbitStore();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const locale = getLocale(lang);
  const configuredWeekStart = useSettingsStore((state) => state.settings.weekStart);

  // Filters, sort and grouping live in the URL so a view can be bookmarked
  // and shared rather than resetting the moment you navigate away.
  const [view, updateView, resetView] = useTaskView();
  const { status: statusFilter, tag: tagFilter, priority: priorityFilter, search: searchQuery, sort: sortKey, ascending: sortAsc, group: groupBy } = view;
  const setStatusFilter = (status: FilterStatus) => updateView({ status });
  const setTagFilter = (tag: string | null) => updateView({ tag });
  const setPriorityFilter = (priority: Priority | null) => updateView({ priority });
  const setSearchQuery = (search: string) => updateView({ search });
  const setSortKey = (sort: SortKey) => updateView({ sort });
  const setSortAsc = (ascending: boolean) => updateView({ ascending });
  const setGroupBy = (group: GroupBy) => updateView({ group });

  // Expanded groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Inline creation
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const createInFlightRef = useRef(false);

  // Toolbar open states (mobile)
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  const allTags = getAllTags();

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
    } else if (statusFilter === 'waiting') {
      // `waiting` is a first-class status with a badge in every row, and there
      // was no way to list what you are blocked on — the exact question the
      // status exists to answer.
      tasks = tasks.filter((i) => i.status === 'waiting');
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

    // Search — the shared definition, so a task's notes are findable here too.
    if (searchQuery.trim()) {
      tasks = searchItems(tasks, searchQuery, lang, { includeArchived: true });
    }

    // Sort
    tasks = sortTasks(tasks, sortKey, sortAsc);

    return tasks;
  }, [items, statusFilter, tagFilter, priorityFilter, searchQuery, sortKey, sortAsc, lang]);

  // Group
  const groups = useMemo(
    () => groupTasks(
      filteredTasks,
      groupBy,
      items,
      configuredWeekStart === 'sunday' ? 0 : 1,
      t,
      locale,
      lang
    ),
    [configuredWeekStart, filteredTasks, groupBy, items, lang, locale, t]
  );

  // Multi-select — bulk complete, archive and delete.
  const filteredTaskIds = useMemo(() => filteredTasks.map((task) => task.id), [filteredTasks]);
  const selection = useBulkSelection(filteredTaskIds);

  const runBulk = async (
    ids: string[],
    apply: (id: string) => Promise<unknown>,
  ) => {
    const results = await Promise.allSettled(ids.map(apply));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) toast.error(t('bulk.failed', { count: failed }));
    else toast.success(t('bulk.done', { count: ids.length }));
  };

  const bulkActions: BulkAction[] = [
    {
      key: 'complete',
      label: t('bulk.complete'),
      icon: CheckSquare,
      run: (ids) => runBulk(ids, (id) => updateItem(id, { status: 'done', completedAt: getTimestamp() })),
    },
    {
      key: 'archive',
      label: t('bulk.archive'),
      icon: Archive,
      run: (ids) => runBulk(ids, (id) => updateItem(id, { status: 'archived' })),
    },
    {
      key: 'delete',
      label: t('bulk.delete'),
      icon: Trash2,
      confirm: t('bulk.deleteConfirm'),
      destructive: true,
      run: (ids) => runBulk(ids, (id) => deleteItem(id)),
    },
  ];


  const totalCount = filteredTasks.length;
  const hasCustomView = !isDefaultTaskView(view);

  const handleInlineCreate = async () => {
    const title = newTaskTitle.trim();
    if (!title || createInFlightRef.current) return;
    if (!user) {
      toast.error(t('tasks.addSignedOut'));
      return;
    }

    createInFlightRef.current = true;
    setCreatingTask(true);
    try {
      await createItem({
        type: 'task',
        status: 'active',
        title,
        // Whatever the list is filtered to is what the user is looking at, so
        // it is the sensible home for the thing they just typed.
        tags: tagFilter ? [tagFilter] : [],
        userId: user.uid,
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
      });
      setNewTaskTitle('');
    } catch {
      toast.error(t('tasks.addError'));
    } finally {
      createInFlightRef.current = false;
      setCreatingTask(false);
    }
  };

  const clearView = () => {
    resetView();
    setCollapsedGroups(new Set());
    setShowSortMenu(false);
    setShowGroupMenu(false);
  };

  return (
    <div className="mobile-page-gutter mx-auto max-w-3xl space-y-4 py-4 lg:space-y-5 lg:p-8" data-slot="page-content">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">{t('nav.tasks')}</h1>
          <span className="text-[12px] text-muted-foreground/40 tabular-nums">{totalCount}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <label htmlFor="task-search" className="sr-only">
          {t('tasks.searchLabel')}
        </label>
        <input
          id="task-search"
          type="text"
          placeholder={t('tasks.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            'min-h-11 w-full rounded-xl border border-border/60 bg-card px-4 py-2.5 pr-12 text-[14px] lg:min-h-0 lg:py-2 lg:pr-4 lg:text-[13px]',
            'placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/10',
            'transition-shadow'
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label={t('tasks.clearSearch')}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground lg:right-1 lg:h-8 lg:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter bar — horizontally scrollable on mobile */}
      <div className="space-y-2.5">
        {/* Status tabs */}
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <SegmentedControl
            variant="pill"
            label={t('tasks.statusFilterLabel')}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'active' as FilterStatus, label: t('filter.active') },
              { value: 'waiting' as FilterStatus, label: t('status.waiting') },
              { value: 'done' as FilterStatus, label: t('filter.completed') },
              { value: 'all' as FilterStatus, label: t('filter.all') },
            ]}
          />

          <div className="h-4 w-px bg-border/40 mx-1 shrink-0" />

          {/* Priority filter chips */}
          {(['high', 'medium', 'low'] as Priority[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
              aria-pressed={priorityFilter === p}
              className={cn(
                'mobile-touch-target flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95 lg:min-h-0 lg:rounded-lg',
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
              {t(`priority.${p}`)}
            </button>
          ))}
        </div>

        {/* Tag filters */}
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <Tag className="h-3 w-3 text-muted-foreground/30 shrink-0 mr-0.5" />
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              aria-pressed={tagFilter === tag}
              className={cn(
                'mobile-touch-target shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium transition-all active:scale-95 lg:min-h-0',
                tagFilter === tag
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground/50 hover:bg-foreground/[0.05] hover:text-muted-foreground'
              )}
            >
              {tag}
            </button>
          ))}
          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              aria-label={t('tasks.clearTagFilter', { tag: tagFilter })}
              className="mobile-touch-target ml-1 shrink-0 text-[10px] text-muted-foreground/40 hover:text-foreground lg:min-h-0"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Sort & Group controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort dropdown */}
          <DropdownMenu
            open={showSortMenu}
            onOpenChange={(open) => {
              setShowSortMenu(open);
              if (open) setShowGroupMenu(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'mobile-touch-target flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95 lg:min-h-0 lg:rounded-lg',
                  'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                )}
              >
                <ArrowUpDown className="h-3 w-3" />
                <span className="hidden sm:inline">{t('tasks.sort')}:</span>
                {t(SORT_OPTIONS.find((o) => o.key === sortKey)?.labelKey ?? 'sort.dueDate')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              aria-label={t('tasks.sortMenuLabel')}
              className="min-w-[160px]"
            >
              <DropdownMenuRadioGroup value={sortKey}>
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem
                    key={opt.key}
                    value={opt.key}
                    onSelect={() => {
                      if (sortKey === opt.key) {
                        setSortAsc(!sortAsc);
                      } else {
                        setSortKey(opt.key);
                        setSortAsc(defaultAscending(opt.key));
                      }
                    }}
                    className="min-h-11 justify-between text-[12px] lg:min-h-10"
                  >
                    <span>{t(opt.labelKey)}</span>
                    {sortKey === opt.key && (
                      <span aria-hidden="true" className="text-[10px] text-muted-foreground/50">
                        {sortAsc ? '↑' : '↓'}
                      </span>
                    )}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Group dropdown */}
          <DropdownMenu
            open={showGroupMenu}
            onOpenChange={(open) => {
              setShowGroupMenu(open);
              if (open) setShowSortMenu(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'mobile-touch-target flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95 lg:min-h-0 lg:rounded-lg',
                  groupBy !== 'none'
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/[0.04] text-muted-foreground/60 hover:bg-foreground/[0.08]'
                )}
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span className="hidden sm:inline">{t('tasks.group')}:</span>
                {t(GROUP_OPTIONS.find((o) => o.key === groupBy)?.labelKey ?? 'group.none')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              aria-label={t('tasks.groupMenuLabel')}
              className="min-w-[170px]"
            >
              <DropdownMenuRadioGroup
                value={groupBy}
                onValueChange={(value) => {
                  setGroupBy(value as GroupBy);
                  setCollapsedGroups(new Set());
                }}
              >
                {GROUP_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <DropdownMenuRadioItem
                      key={opt.key}
                      value={opt.key}
                      className="min-h-11 text-[12px] lg:min-h-10"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                      {t(opt.labelKey)}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Multi-select */}
          {!selection.selecting && filteredTasks.length > 0 && (
            <button
              type="button"
              onClick={selection.startSelecting}
              className="mobile-touch-target flex items-center gap-1.5 rounded-xl bg-foreground/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition-all hover:bg-foreground/[0.08] active:scale-95 lg:min-h-0 lg:rounded-lg"
            >
              <ListChecks className="h-3 w-3" />
              {t('bulk.select')}
            </button>
          )}

          {/* Clear all filters */}
          {hasCustomView && (
            <button
              type="button"
              onClick={clearView}
              className="mobile-touch-target ml-auto text-[11px] text-muted-foreground/40 transition-colors hover:text-foreground lg:min-h-0"
            >
              {t('tasks.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {/* Inline add — a path to a new task that cannot mangle its own text.
          Every new task used to route through the command bar, which meant
          every new task also routed through the mention, keyword and date
          parsing that this row simply does not apply. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleInlineCreate();
        }}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-card px-3 lg:py-2"
      >
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
        <input
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          placeholder={t('tasks.addPlaceholder')}
          aria-label={t('tasks.addLabel')}
          disabled={creatingTask}
          className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40 lg:h-auto"
        />
        <button
          type="submit"
          disabled={creatingTask || !newTaskTitle.trim()}
          className="min-h-11 shrink-0 rounded-lg bg-foreground px-3 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40 lg:min-h-0 lg:px-2.5"
        >
          {creatingTask ? t('tasks.adding') : t('common.add')}
        </button>
      </form>

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
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!isCollapsed}
                  className={cn(
                    'flex min-h-11 items-center gap-2 w-full px-1 py-2 text-left transition-colors lg:min-h-0',
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
                      selection.selecting ? (
                        <div key={item.id} className="flex items-center gap-2 pl-3">
                          <label className="relative -ml-3 -mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
                            <input
                              type="checkbox"
                              checked={selection.isSelected(item.id)}
                              onChange={() => selection.toggle(item.id)}
                              aria-label={t('bulk.selectItem', { title: item.title })}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                                selection.isSelected(item.id)
                                  ? 'border-foreground bg-foreground text-background'
                                  : 'border-[var(--copy-tertiary)] bg-background text-transparent',
                              )}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </span>
                          </label>
                          <div className="min-w-0 flex-1">
                            <ItemRow item={item} showProject={groupBy !== 'project'} compact enableSwipe={false} showCompletion={false} />
                          </div>
                        </div>
                      ) : (
                        <ItemRow key={item.id} item={item} showProject={groupBy !== 'project'} compact />
                      )
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-[12px] text-muted-foreground/40">
                      {t('tasks.noTasks')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {selection.selecting && (
          <BulkActionBar
            count={selection.count}
            allSelected={selection.allSelected}
            selectedIds={selection.selectedIds}
            actions={bulkActions}
            onSelectAll={selection.selectAll}
            onClear={selection.clear}
            onDone={selection.stopSelecting}
          />
        )}

        {filteredTasks.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card py-12 text-center">
            <CheckSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/20" strokeWidth={1} />
            <p className="text-[13px] text-muted-foreground/40">
              {searchQuery
                ? t('tasks.noMatchSearch')
                : statusFilter === 'done'
                ? t('tasks.noCompleted')
                : t('tasks.noActiveHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
