import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { OrbitItem } from '@/lib/types';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const NODE_SEP = 60;
const RANK_SEP = 100;
const MAX_DEPTH = 3; // Traverse up to 3 degrees of separation

// ─── Edge style presets ────────────────────────────────────
const EDGE_STYLES = {
  parentChild: {
    strokeWidth: 2,
    stroke: 'var(--color-muted-foreground)',
  },
  peerLink: {
    strokeWidth: 1.5,
    strokeDasharray: '6,4',
    stroke: '#3b82f6',
  },
  reverseLink: {
    strokeWidth: 1.5,
    strokeDasharray: '3,3',
    stroke: '#a855f7',
  },
  sibling: {
    strokeWidth: 1,
    strokeDasharray: '4,6',
    stroke: '#22c55e',
    opacity: 0.5,
  },
  deepLink: {
    strokeWidth: 1,
    strokeDasharray: '2,4',
    stroke: '#f59e0b',
    opacity: 0.7,
  },
} as const;

// ─── Types ─────────────────────────────────────────────────
interface GraphItem {
  item: OrbitItem;
  depth: number;
  /** How this item connects to its "discoverer" */
  edgeType: 'root' | 'parent' | 'child' | 'linked' | 'reverseLinked' | 'sibling' | 'deepLinked';
  /** The item that led us to discover this one */
  discoveredFrom?: string;
}

// ─── BFS graph builder ─────────────────────────────────────
/**
 * Build the full graph by doing a BFS from the current item,
 * following ALL connection types up to MAX_DEPTH hops.
 */
export function buildGraphData(
  currentItem: OrbitItem,
  allItems: OrbitItem[],
): { nodes: Node[]; edges: Edge[] } {
  const itemMap = new Map<string, OrbitItem>();
  for (const item of allItems) {
    if (item.status !== 'archived') {
      itemMap.set(item.id, item);
    }
  }

  const visited = new Map<string, GraphItem>(); // id -> GraphItem
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();

  const addEdge = (edge: Edge) => {
    // Deduplicate by source+target (either direction)
    const key1 = `${edge.source}->${edge.target}`;
    const key2 = `${edge.target}->${edge.source}`;
    if (!addedEdges.has(key1) && !addedEdges.has(key2)) {
      addedEdges.add(key1);
      edges.push(edge);
    }
  };

  // Seed BFS with current item
  visited.set(currentItem.id, {
    item: currentItem,
    depth: 0,
    edgeType: 'root',
  });

  const queue: Array<{ item: OrbitItem; depth: number }> = [
    { item: currentItem, depth: 0 },
  ];

  while (queue.length > 0) {
    const { item, depth } = queue.shift()!;
    if (depth >= MAX_DEPTH) continue;

    const nextDepth = depth + 1;

    // 1. Parent
    if (item.parentId) {
      const parent = itemMap.get(item.parentId);
      if (parent && !visited.has(parent.id)) {
        visited.set(parent.id, {
          item: parent,
          depth: nextDepth,
          edgeType: 'parent',
          discoveredFrom: item.id,
        });
        queue.push({ item: parent, depth: nextDepth });
      }
      if (parent) {
        addEdge({
          id: `e-pc-${parent.id}-${item.id}`,
          source: parent.id,
          target: item.id,
          type: 'default',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: EDGE_STYLES.parentChild,
        });
      }
    }

    // 2. Children
    const children = allItems.filter(
      (i) => i.parentId === item.id && i.status !== 'archived'
    );
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.set(child.id, {
          item: child,
          depth: nextDepth,
          edgeType: 'child',
          discoveredFrom: item.id,
        });
        queue.push({ item: child, depth: nextDepth });
      }
      addEdge({
        id: `e-pc-${item.id}-${child.id}`,
        source: item.id,
        target: child.id,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: EDGE_STYLES.parentChild,
      });
    }

    // 3. Peer links (linkedIds)
    for (const linkedId of item.linkedIds || []) {
      const linked = itemMap.get(linkedId);
      if (!linked) continue;
      if (!visited.has(linked.id)) {
        visited.set(linked.id, {
          item: linked,
          depth: nextDepth,
          edgeType: depth === 0 ? 'linked' : 'deepLinked',
          discoveredFrom: item.id,
        });
        queue.push({ item: linked, depth: nextDepth });
      }
      addEdge({
        id: `e-link-${item.id}-${linked.id}`,
        source: item.id,
        target: linked.id,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        markerStart: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: depth === 0 ? EDGE_STYLES.peerLink : EDGE_STYLES.deepLink,
      });
    }

    // 4. Reverse links (items that link TO this item)
    const reverseLinkers = allItems.filter(
      (i) =>
        i.linkedIds?.includes(item.id) &&
        i.id !== item.id &&
        i.status !== 'archived'
    );
    for (const rev of reverseLinkers) {
      if (!visited.has(rev.id)) {
        visited.set(rev.id, {
          item: rev,
          depth: nextDepth,
          edgeType: depth === 0 ? 'reverseLinked' : 'deepLinked',
          discoveredFrom: item.id,
        });
        queue.push({ item: rev, depth: nextDepth });
      }
      // Only add edge if we haven't added the forward link already
      addEdge({
        id: `e-rev-${rev.id}-${item.id}`,
        source: rev.id,
        target: item.id,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: depth === 0 ? EDGE_STYLES.reverseLink : EDGE_STYLES.deepLink,
      });
    }

    // 5. Siblings (same parent, only from current item or depth 0/1)
    if (item.parentId && depth <= 1) {
      const siblings = allItems.filter(
        (i) =>
          i.parentId === item.parentId &&
          i.id !== item.id &&
          i.status !== 'archived'
      );
      for (const sib of siblings) {
        if (!visited.has(sib.id)) {
          visited.set(sib.id, {
            item: sib,
            depth: nextDepth,
            edgeType: 'sibling',
            discoveredFrom: item.id,
          });
          queue.push({ item: sib, depth: nextDepth });
        }
        // Sibling edges go from parent to sibling (parent->child)
        addEdge({
          id: `e-pc-${item.parentId}-${sib.id}`,
          source: item.parentId,
          target: sib.id,
          type: 'default',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { ...EDGE_STYLES.parentChild, opacity: 0.4 },
        });
      }
    }
  }

  // Create React Flow nodes
  const nodes: Node[] = Array.from(visited.values()).map((gi) => ({
    id: gi.item.id,
    type: 'orbitNode',
    data: {
      item: gi.item,
      isCurrent: gi.item.id === currentItem.id,
      depth: gi.depth,
    },
    position: { x: 0, y: 0 },
  }));

  return layoutGraph(nodes, edges, currentItem, visited);
}

// ─── Occupied-rect collision tracker ───────────────────────
interface Rect { x: number; y: number; w: number; h: number }

class OccupiedGrid {
  private rects: Rect[] = [];
  private readonly pad = 20; // extra margin around each node

  /** Register a placed node */
  place(x: number, y: number) {
    this.rects.push({
      x: x - this.pad,
      y: y - this.pad,
      w: NODE_WIDTH + this.pad * 2,
      h: NODE_HEIGHT + this.pad * 2,
    });
  }

  /** Check if a rect at (x,y) would overlap any existing node */
  overlaps(x: number, y: number): boolean {
    const r: Rect = { x, y, w: NODE_WIDTH, h: NODE_HEIGHT };
    return this.rects.some(
      (o) =>
        r.x < o.x + o.w &&
        r.x + r.w > o.x &&
        r.y < o.y + o.h &&
        r.y + r.h > o.y
    );
  }

  /** Find the nearest non-overlapping x at a given y, starting from idealX */
  findFreeX(idealX: number, y: number): number {
    if (!this.overlaps(idealX, y)) return idealX;
    // Search outward in both directions
    for (let offset = NODE_WIDTH + NODE_SEP; offset < 5000; offset += NODE_WIDTH + NODE_SEP) {
      if (!this.overlaps(idealX + offset, y)) return idealX + offset;
      if (!this.overlaps(idealX - offset, y)) return idealX - offset;
    }
    return idealX; // fallback (shouldn't happen)
  }
}

// ─── Layout algorithm ──────────────────────────────────────
function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  currentItem: OrbitItem,
  visited: Map<string, GraphItem>,
): { nodes: Node[]; edges: Edge[] } {
  const positionMap = new Map<string, { x: number; y: number }>();
  const grid = new OccupiedGrid();

  const placeNode = (id: string, x: number, y: number) => {
    const freeX = grid.findFreeX(x, y);
    positionMap.set(id, { x: freeX, y });
    grid.place(freeX, y);
  };

  // Categorize nodes
  const children: GraphItem[] = [];
  const peers: GraphItem[] = [];
  const siblings: GraphItem[] = [];
  const deepItems: GraphItem[] = [];
  const grandchildrenByParent = new Map<string, GraphItem[]>();

  for (const [id, gi] of visited) {
    if (id === currentItem.id) continue;

    if (gi.edgeType === 'parent') {
      // handled via ancestor chain walk
    } else if (gi.edgeType === 'child' && gi.depth === 1) {
      children.push(gi);
    } else if (gi.edgeType === 'child' && gi.depth > 1) {
      const pid = gi.item.parentId || '';
      if (!grandchildrenByParent.has(pid)) grandchildrenByParent.set(pid, []);
      grandchildrenByParent.get(pid)!.push(gi);
    } else if (
      (gi.edgeType === 'linked' || gi.edgeType === 'reverseLinked') &&
      gi.depth === 1
    ) {
      peers.push(gi);
    } else if (gi.edgeType === 'sibling') {
      siblings.push(gi);
    } else if (gi.depth >= 2) {
      deepItems.push(gi);
    } else {
      peers.push(gi);
    }
  }

  // Build ancestor chain (root first)
  const ancestorChain: GraphItem[] = [];
  let walkId = currentItem.parentId;
  const usedAncestors = new Set<string>();
  while (walkId && visited.has(walkId) && !usedAncestors.has(walkId)) {
    ancestorChain.push(visited.get(walkId)!);
    usedAncestors.add(walkId);
    walkId = visited.get(walkId)!.item.parentId;
  }
  ancestorChain.reverse();

  let currentY = 0;

  // 1. Ancestors (vertical chain, centered)
  for (const gi of ancestorChain) {
    placeNode(gi.item.id, 0, currentY);
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 2. Current item
  const currentRow = currentY;
  placeNode(currentItem.id, 0, currentRow);
  currentY += NODE_HEIGHT + RANK_SEP;

  // 3. Direct children — fan out below, centered
  if (children.length > 0) {
    const totalWidth = children.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = -totalWidth / 2;
    for (const gi of children) {
      placeNode(gi.item.id, startX, currentY);
      startX += NODE_WIDTH + NODE_SEP;
    }
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 4. Grandchildren — below their parent, collision-checked
  let hadGrandchildren = false;
  for (const [parentId, gcs] of grandchildrenByParent) {
    const parentPos = positionMap.get(parentId);
    if (!parentPos) continue;
    hadGrandchildren = true;
    const totalWidth = gcs.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = parentPos.x - totalWidth / 2 + NODE_WIDTH / 2;
    for (const gc of gcs) {
      if (!positionMap.has(gc.item.id)) {
        placeNode(gc.item.id, startX, currentY);
        startX += NODE_WIDTH + NODE_SEP;
      }
    }
  }
  if (hadGrandchildren) {
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 5. Siblings — row below children (or next to current row)
  if (siblings.length > 0) {
    const sibY = children.length > 0 ? currentY : currentRow + NODE_HEIGHT + RANK_SEP;
    const totalWidth = siblings.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = -totalWidth / 2;
    for (const gi of siblings) {
      if (!positionMap.has(gi.item.id)) {
        placeNode(gi.item.id, startX, sibY);
        startX += NODE_WIDTH + NODE_SEP;
      }
    }
    if (sibY >= currentY) {
      currentY = sibY + NODE_HEIGHT + RANK_SEP;
    }
  }

  // 6. Peers — to the left and right of current item
  if (peers.length > 0) {
    const halfPeers = Math.ceil(peers.length / 2);
    for (let i = 0; i < peers.length; i++) {
      const gi = peers[i];
      if (positionMap.has(gi.item.id)) continue;
      if (i < halfPeers) {
        const idealX = -(NODE_WIDTH + NODE_SEP * 2) - i * (NODE_WIDTH + NODE_SEP);
        placeNode(gi.item.id, idealX, currentRow);
      } else {
        const j = i - halfPeers;
        const idealX = (NODE_WIDTH + NODE_SEP * 2) + j * (NODE_WIDTH + NODE_SEP);
        placeNode(gi.item.id, idealX, currentRow);
      }
    }
  }

  // 7. Deep items — below their discoverer, collision-checked
  for (const gi of deepItems) {
    if (positionMap.has(gi.item.id)) continue;

    const fromPos = gi.discoveredFrom
      ? positionMap.get(gi.discoveredFrom)
      : undefined;

    if (fromPos) {
      const targetY = fromPos.y + NODE_HEIGHT + RANK_SEP;
      placeNode(gi.item.id, fromPos.x, targetY);
    } else {
      placeNode(gi.item.id, 0, currentY);
      currentY += NODE_HEIGHT + RANK_SEP;
    }
  }

  // Apply positions (shift by half node width so center aligns)
  const layoutedNodes = nodes.map((node) => {
    const pos = positionMap.get(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
