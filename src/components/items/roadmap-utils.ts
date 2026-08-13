import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { ThreadmapItem } from '@/lib/types';

// ─── Layout constants ────────────────────────────────────
const NODE_W = 200;
const NODE_H = 72;
const MS_NODE_W = 220;
const MS_NODE_H = 90;
const PROJECT_NODE_W = 260;
const PROJECT_NODE_H = 90;
const H_GAP = 40; // horizontal gap between sibling nodes
const V_GAP = 80; // vertical gap between tiers

// ─── Edge styles ─────────────────────────────────────────
const EDGE_PARENT_CHILD = {
  strokeWidth: 2,
  stroke: 'var(--color-muted-foreground)',
};

const EDGE_DEPENDENCY = {
  strokeWidth: 1.5,
  stroke: '#3b82f6',
  strokeDasharray: '6,4',
};

// ─── Build full roadmap graph ────────────────────────────
export function buildRoadmapGraph(
  project: ThreadmapItem,
  allItems: ThreadmapItem[],
  options: { dependencyLabel?: string } = {},
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const projectColor = project.color || '#6366f1';

  // ── Collect milestones (goals parented to project) ──
  const milestones = allItems
    .filter(i => i.parentId === project.id && i.type === 'goal' && i.status !== 'archived')
    .sort((a, b) => {
      // Sort by due date, then creation date
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.createdAt - b.createdAt;
    });

  // ── Collect tasks per milestone ──
  const tasksByMilestone = new Map<string, ThreadmapItem[]>();

  for (const ms of milestones) {
    const tasks = allItems
      .filter(i => i.parentId === ms.id && i.type === 'task' && i.status !== 'archived')
      .sort((a, b) => {
        // Done tasks last, then by priority, then by due date
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (b.status === 'done' && a.status !== 'done') return -1;
        const prioOrder = { high: 0, medium: 1, low: 2 };
        const ap = prioOrder[a.priority as keyof typeof prioOrder] ?? 3;
        const bp = prioOrder[b.priority as keyof typeof prioOrder] ?? 3;
        if (ap !== bp) return ap - bp;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.createdAt - b.createdAt;
      });
    tasksByMilestone.set(ms.id, tasks);
  }

  // ── Ungrouped tasks (direct children of project that are tasks) ──
  const ungroupedTasks = allItems
    .filter(i => i.parentId === project.id && i.type === 'task' && i.status !== 'archived')
    .sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;
      return a.createdAt - b.createdAt;
    });

  // ── Compute all tasks for project stats ──
  const allTasks = [
    ...ungroupedTasks,
    ...[...tasksByMilestone.values()].flat(),
  ];
  const totalTasks = allTasks.length;
  const totalDone = allTasks.filter(t => t.status === 'done').length;
  const projectProgress = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  // ── IDs of all items in this roadmap (for filtering dependency edges) ──
  const roadmapItemIds = new Set<string>([
    project.id,
    ...milestones.map(m => m.id),
    ...allTasks.map(t => t.id),
    ...ungroupedTasks.map(t => t.id),
  ]);

  // ── Layout calculation ──
  // We need to know how wide each milestone column is to center everything

  // Create "columns": one per milestone + one for ungrouped if exists
  interface Column {
    milestoneId: string | null;
    milestone: ThreadmapItem | null;
    tasks: ThreadmapItem[];
  }

  const columns: Column[] = milestones.map(ms => ({
    milestoneId: ms.id,
    milestone: ms,
    tasks: tasksByMilestone.get(ms.id) || [],
  }));

  if (ungroupedTasks.length > 0) {
    columns.push({
      milestoneId: null,
      milestone: null,
      tasks: ungroupedTasks,
    });
  }

  // Max tasks per column determines layout
  const COL_MAX_TASKS = 8; // Show at most this many tasks per column visually
  const TASK_COLS_PER_MS = 2; // Tasks laid out in 2 columns under each milestone

  // Calculate column widths
  const colWidths = columns.map(() => {
    const taskGridWidth = TASK_COLS_PER_MS * (NODE_W + H_GAP) - H_GAP;
    return Math.max(MS_NODE_W, taskGridWidth);
  });

  const totalWidth = colWidths.reduce((s, w) => s + w, 0) + (colWidths.length - 1) * H_GAP * 2;

  // ── Place Project node (top center) ──
  const projectX = -PROJECT_NODE_W / 2;
  const projectY = 0;

  nodes.push({
    id: project.id,
    type: 'projectRoadmapNode',
    position: { x: projectX, y: projectY },
    data: {
      item: project,
      progress: projectProgress,
      taskCount: totalTasks,
      doneCount: totalDone,
    },
  });

  // ── Place milestone nodes (tier 2) ──
  const milestoneY = projectY + PROJECT_NODE_H + V_GAP;
  let colX = -totalWidth / 2;

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const colW = colWidths[ci];
    const centerX = colX + colW / 2;

    if (col.milestone) {
      const msTasks = col.tasks;
      const msDone = msTasks.filter(t => t.status === 'done').length;
      const msProgress = msTasks.length > 0 ? Math.round((msDone / msTasks.length) * 100) : 0;

      const msX = centerX - MS_NODE_W / 2;

      nodes.push({
        id: col.milestone.id,
        type: 'milestoneRoadmapNode',
        position: { x: msX, y: milestoneY },
        data: {
          item: col.milestone,
          progress: msProgress,
          taskCount: msTasks.length,
          doneCount: msDone,
          projectColor,
        },
      });

      // Edge: project → milestone
      edges.push({
        id: `e-pm-${project.id}-${col.milestone.id}`,
        source: project.id,
        target: col.milestone.id,
        type: 'smoothstep',
        animated: col.milestone.status !== 'done',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: 'var(--color-muted-foreground)',
        },
        style: EDGE_PARENT_CHILD,
      });
    }

    // ── Place task nodes (tier 3) ──
    const taskY = milestoneY + MS_NODE_H + V_GAP;
    const tasks = col.tasks.slice(0, COL_MAX_TASKS);
    const gridStartX = centerX - ((TASK_COLS_PER_MS * (NODE_W + H_GAP) - H_GAP) / 2);

    for (let ti = 0; ti < tasks.length; ti++) {
      const task = tasks[ti];
      const tCol = ti % TASK_COLS_PER_MS;
      const tRow = Math.floor(ti / TASK_COLS_PER_MS);

      const taskNodeX = gridStartX + tCol * (NODE_W + H_GAP);
      const taskNodeY = taskY + tRow * (NODE_H + H_GAP / 2);

      nodes.push({
        id: task.id,
        type: 'taskRoadmapNode',
        position: { x: taskNodeX, y: taskNodeY },
        data: {
          item: task,
          projectColor,
        },
      });

      // Edge: milestone → task (or project → task for ungrouped)
      const parentId = col.milestoneId || project.id;
      edges.push({
        id: `e-mt-${parentId}-${task.id}`,
        source: parentId,
        target: task.id,
        type: 'smoothstep',
        animated: task.status === 'active',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: 'var(--color-muted-foreground)',
        },
        style: {
          ...EDGE_PARENT_CHILD,
          strokeWidth: 1.5,
          opacity: task.status === 'done' ? 0.3 : 0.7,
        },
      });
    }

    // ── Dependency edges from linkedIds ──
    for (const task of tasks) {
      if (!task.linkedIds) continue;
      for (const linkedId of task.linkedIds) {
        if (!roadmapItemIds.has(linkedId)) continue;
        if (linkedId === task.id) continue;

        edges.push({
          id: `e-dep-${task.id}-${linkedId}`,
          source: task.id,
          target: linkedId,
          type: 'smoothstep',
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: '#3b82f6',
          },
          style: EDGE_DEPENDENCY,
          label: options.dependencyLabel,
          labelStyle: { fontSize: 9, fill: '#3b82f6' },
          labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
          labelBgPadding: [4, 2] as [number, number],
        });
      }
    }

    colX += colW + H_GAP * 2;
  }

  const renderedNodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: edges.filter((edge) => renderedNodeIds.has(edge.source) && renderedNodeIds.has(edge.target)),
  };
}
