import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { OrbitItem } from '@/lib/types';
import type { ItemRelationships } from '@/lib/links';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const NODE_SEP = 60;
const RANK_SEP = 80;

export function buildGraphData(
  currentItem: OrbitItem,
  relationships: ItemRelationships,
): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, OrbitItem>();
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();

  const addEdge = (edge: Edge) => {
    const key = `${edge.source}->${edge.target}`;
    if (!addedEdges.has(key)) {
      addedEdges.add(key);
      edges.push(edge);
    }
  };

  // Add current item
  nodeMap.set(currentItem.id, currentItem);

  // Add ancestors and build the ancestor chain edges
  if (relationships.ancestors.length > 0) {
    const chain = [...relationships.ancestors].reverse(); // root first
    for (const ancestor of chain) {
      nodeMap.set(ancestor.id, ancestor);
    }
    for (let i = 0; i < chain.length - 1; i++) {
      addEdge({
        id: `e-ancestor-${chain[i].id}-${chain[i + 1].id}`,
        source: chain[i].id,
        target: chain[i + 1].id,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 2, stroke: 'var(--color-muted-foreground)' },
      });
    }
    const directParent = chain[chain.length - 1];
    addEdge({
      id: `e-parent-${directParent.id}-${currentItem.id}`,
      source: directParent.id,
      target: currentItem.id,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 2, stroke: 'var(--color-muted-foreground)' },
    });
  }

  // Add children
  for (const child of relationships.children) {
    nodeMap.set(child.id, child);
    addEdge({
      id: `e-child-${currentItem.id}-${child.id}`,
      source: currentItem.id,
      target: child.id,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 2, stroke: 'var(--color-muted-foreground)' },
    });
  }

  // Add grandchildren (descendants not direct children)
  for (const desc of relationships.descendants) {
    if (!nodeMap.has(desc.id)) {
      nodeMap.set(desc.id, desc);
      const parentId = desc.parentId;
      if (parentId && nodeMap.has(parentId)) {
        addEdge({
          id: `e-desc-${parentId}-${desc.id}`,
          source: parentId,
          target: desc.id,
          type: 'default',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { strokeWidth: 1.5, stroke: 'var(--color-muted-foreground)', opacity: 0.6 },
        });
      }
    }
  }

  // Add peer links (dashed blue, bidirectional)
  for (const linked of relationships.linked) {
    nodeMap.set(linked.id, linked);
    addEdge({
      id: `e-link-${currentItem.id}-${linked.id}`,
      source: currentItem.id,
      target: linked.id,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      markerStart: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { strokeWidth: 1.5, strokeDasharray: '6,4', stroke: '#3b82f6' },
    });
  }

  // Add reverse links (dotted purple)
  for (const rev of relationships.reverseLinked) {
    const alreadyLinked = (currentItem.linkedIds || []).includes(rev.id);
    if (alreadyLinked) continue;
    nodeMap.set(rev.id, rev);
    addEdge({
      id: `e-rev-${rev.id}-${currentItem.id}`,
      source: rev.id,
      target: currentItem.id,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { strokeWidth: 1.5, strokeDasharray: '3,3', stroke: '#a855f7' },
    });
  }

  // Create nodes
  const nodes: Node[] = Array.from(nodeMap.values()).map((item) => ({
    id: item.id,
    type: 'orbitNode',
    data: { item, isCurrent: item.id === currentItem.id },
    position: { x: 0, y: 0 },
  }));

  return layoutHierarchical(nodes, edges, currentItem, relationships);
}

/**
 * Custom hierarchical layout — no dagre dependency.
 *
 * Layout strategy:
 * - Ancestors: vertical chain above current item (centered)
 * - Current item: center
 * - Children/descendants: fanned out below
 * - Peer links + reverse links: placed to the sides
 */
function layoutHierarchical(
  nodes: Node[],
  edges: Edge[],
  currentItem: OrbitItem,
  relationships: ItemRelationships,
): { nodes: Node[]; edges: Edge[] } {
  const positionMap = new Map<string, { x: number; y: number }>();

  // Ancestor chain (root first)
  const ancestorChain = [...relationships.ancestors].reverse();

  // Children that need layout below current
  const childIds = new Set(relationships.children.map(c => c.id));
  const descendantIds = new Set(relationships.descendants.map(d => d.id));

  // Peer links (not ancestors, not descendants)
  const peerIds = new Set([
    ...relationships.linked.map(l => l.id),
    ...relationships.reverseLinked
      .filter(r => !(currentItem.linkedIds || []).includes(r.id))
      .map(r => r.id),
  ]);
  // Remove any that are also in ancestor/descendant
  for (const id of ancestorChain.map(a => a.id)) peerIds.delete(id);
  for (const id of descendantIds) peerIds.delete(id);
  peerIds.delete(currentItem.id);

  let currentY = 0;

  // 1. Place ancestors vertically, centered
  for (const ancestor of ancestorChain) {
    positionMap.set(ancestor.id, { x: 0, y: currentY });
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 2. Place current item
  positionMap.set(currentItem.id, { x: 0, y: currentY });
  const currentRow = currentY;
  currentY += NODE_HEIGHT + RANK_SEP;

  // 3. Place direct children fanned out below
  const directChildren = relationships.children;
  if (directChildren.length > 0) {
    const totalWidth = directChildren.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = -totalWidth / 2;
    for (const child of directChildren) {
      positionMap.set(child.id, { x: startX, y: currentY });
      startX += NODE_WIDTH + NODE_SEP;
    }
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 4. Place grandchildren below their parents
  const grandchildren = relationships.descendants.filter(d => !childIds.has(d.id));
  // Group by parent
  const grandchildrenByParent = new Map<string, OrbitItem[]>();
  for (const gc of grandchildren) {
    if (gc.parentId) {
      const group = grandchildrenByParent.get(gc.parentId) || [];
      group.push(gc);
      grandchildrenByParent.set(gc.parentId, group);
    }
  }

  for (const [parentId, children] of grandchildrenByParent) {
    const parentPos = positionMap.get(parentId);
    if (!parentPos) continue;
    const totalWidth = children.length * (NODE_WIDTH + NODE_SEP) - NODE_SEP;
    let startX = parentPos.x - totalWidth / 2 + NODE_WIDTH / 2;
    for (const child of children) {
      if (!positionMap.has(child.id)) {
        positionMap.set(child.id, { x: startX, y: currentY });
        startX += NODE_WIDTH + NODE_SEP;
      }
    }
  }
  if (grandchildrenByParent.size > 0) {
    currentY += NODE_HEIGHT + RANK_SEP;
  }

  // 5. Place peer links to the sides of the current item
  const peerItems = nodes.filter(n => peerIds.has(n.id));
  if (peerItems.length > 0) {
    // Split peers: left side and right side
    const halfPeers = Math.ceil(peerItems.length / 2);
    for (let i = 0; i < peerItems.length; i++) {
      const peer = peerItems[i];
      if (i < halfPeers) {
        // Left side
        const x = -(NODE_WIDTH + NODE_SEP * 2) - (i * (NODE_WIDTH + NODE_SEP));
        positionMap.set(peer.id, { x, y: currentRow });
      } else {
        // Right side
        const j = i - halfPeers;
        const x = (NODE_WIDTH + NODE_SEP * 2) + (j * (NODE_WIDTH + NODE_SEP));
        positionMap.set(peer.id, { x, y: currentRow });
      }
    }
  }

  // Apply positions to nodes, center everything
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
