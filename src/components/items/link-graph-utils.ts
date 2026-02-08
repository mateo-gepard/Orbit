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

// ─── Layout algorithm ──────────────────────────────────────
/**
 * Multi-ring radial-ish layout:
 * - Center: current item
 * - Ring 1: ancestors above, children below, peers left/right
 * - Ring 2+: deeper connections further out
 */
function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  currentItem: OrbitItem,
  visited: Map<string, GraphItem>,
): { nodes: Node[]; edges: Edge[] } {
  const positionMap = new Map<string, { x: number; y: number }>();

  // Categorize nodes by their relationship role
  const ancestors: GraphItem[] = [];
  const children: GraphItem[] = [];
  const peers: GraphItem[] = []; // linked + reverseLinked at depth 1
  const siblings: GraphItem[] = [];
  const deepItems: GraphItem[] = []; // depth >= 2
  const grandchildren = new Map<string, GraphItem[]>(); // parent -> items

  for (const [id, gi] of visited) {
    if (id === currentItem.id) continue;

    if (gi.edgeType === 'parent') {
      ancestors.push(gi);
    } else if (gi.edgeType === 'child' && gi.depth === 1) {
      children.push(gi);
    } else if (gi.edgeType === 'child' && gi.depth > 1) {
      // Grandchild — group under their parent
      const parentId = gi.item.parentId || '';
      if (!grandchildren.has(parentId)) grandchildren.set(parentId, []);
      grandchildren.get(parentId)!.push(gi);
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
      // Fallback for unexpected — treat as peer
      peers.push(gi);
    }
  }

  // Also collect ancestor chain upward (walk parentId)
  const ancestorChain: GraphItem[] = [];
  let walkId = currentItem.parentId;
  const usedAncestors = new Set<string>();
  while (walkId && visited.has(walkId) && !usedAncestors.has(walkId)) {
    const gi = visited.get(walkId)!;
    ancestorChain.push(gi);
    usedAncestors.add(walkId);
    walkId = gi.item.parentId;
  }
  ancestorChain.reverse(); // root first

  let currentY = 0;

  // 1. Place ancestor chain above (root first, top to bottom)
  for (const gi of ancestorChain) {
    positionMap.set(gi.item.id, { x: 0, y: currentY });
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 2. Place current item
  const currentRow = currentY;
  positionMap.set(currentItem.id, { x: 0, y: currentRow });
  currentY += NODE_HEIGHT + RANK_SEP;

  // 3. Place direct children fanned out below
  if (children.length > 0) {
    const totalWidth = children.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = -totalWidth / 2;
    for (const gi of children) {
      positionMap.set(gi.item.id, { x: startX, y: currentY });
      startX += NODE_WIDTH + NODE_SEP;
    }
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 4. Place grandchildren below their parent
  for (const [parentId, gcs] of grandchildren) {
    const parentPos = positionMap.get(parentId);
    if (!parentPos) continue;
    const totalWidth = gcs.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = parentPos.x - totalWidth / 2 + NODE_WIDTH / 2;
    for (const gc of gcs) {
      if (!positionMap.has(gc.item.id)) {
        positionMap.set(gc.item.id, { x: startX, y: currentY });
        startX += NODE_WIDTH + NODE_SEP;
      }
    }
  }
  if (grandchildren.size > 0) {
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 5. Place siblings alongside children (or in their own row below)
  if (siblings.length > 0) {
    // Put siblings in a row just below children, slightly offset
    const sibY = children.length > 0 ? currentY : currentRow + NODE_HEIGHT + RANK_SEP;
    const totalWidth = siblings.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = -totalWidth / 2;
    for (const gi of siblings) {
      if (!positionMap.has(gi.item.id)) {
        positionMap.set(gi.item.id, { x: startX, y: sibY });
        startX += NODE_WIDTH + NODE_SEP;
      }
    }
    if (sibY >= currentY) {
      currentY = sibY + NODE_HEIGHT + RANK_SEP;
    }
  }

  // 6. Place peers (linked + reverseLinked) to the sides of current
  if (peers.length > 0) {
    const halfPeers = Math.ceil(peers.length / 2);
    for (let i = 0; i < peers.length; i++) {
      const gi = peers[i];
      if (positionMap.has(gi.item.id)) continue;
      if (i < halfPeers) {
        // Left side
        const x =
          -(NODE_WIDTH + NODE_SEP * 2) - i * (NODE_WIDTH + NODE_SEP);
        positionMap.set(gi.item.id, { x, y: currentRow });
      } else {
        // Right side
        const j = i - halfPeers;
        const x =
          NODE_WIDTH + NODE_SEP * 2 + j * (NODE_WIDTH + NODE_SEP);
        positionMap.set(gi.item.id, { x, y: currentRow });
      }
    }
  }

  // 7. Place deep items (2nd/3rd degree) around their discoverer
  for (const gi of deepItems) {
    if (positionMap.has(gi.item.id)) continue;

    const fromPos = gi.discoveredFrom
      ? positionMap.get(gi.discoveredFrom)
      : undefined;
    if (fromPos) {
      // Place slightly below and offset from discoverer
      const existingAtLevel = [...positionMap.values()].filter(
        (p) => Math.abs(p.y - (fromPos.y + NODE_HEIGHT + RANK_SEP)) < 20
      ).length;
      const offsetX = (existingAtLevel - 1) * (NODE_WIDTH + NODE_SEP);
      positionMap.set(gi.item.id, {
        x: fromPos.x + offsetX,
        y: fromPos.y + NODE_HEIGHT + RANK_SEP,
      });
    } else {
      // Fallback: place at bottom
      positionMap.set(gi.item.id, { x: 0, y: currentY });
      currentY += NODE_HEIGHT + RANK_SEP;
    }
  }

  // Apply positions, center all nodes
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
