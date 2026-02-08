import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { OrbitItem } from '@/lib/types';
import type { ItemRelationships } from '@/lib/links';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const NODE_SEP = 60;
const RANK_SEP = 80;

// Lazy-load dagre to avoid SSR issues with dynamic require()
let dagreInstance: typeof import('@dagrejs/dagre') | null = null;
async function getDagre() {
  if (!dagreInstance) {
    dagreInstance = await import('@dagrejs/dagre');
  }
  return dagreInstance;
}

export async function buildGraphData(
  currentItem: OrbitItem,
  relationships: ItemRelationships,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const nodeMap = new Map<string, OrbitItem>();
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();

  // Helper to avoid duplicate edges
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
    // Build chain: root -> ... -> parent -> current
    for (let i = 0; i < chain.length - 1; i++) {
      addEdge({
        id: `e-ancestor-${chain[i].id}-${chain[i + 1].id}`,
        source: chain[i].id,
        target: chain[i + 1].id,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 2, stroke: 'var(--color-muted-foreground)' },
        label: 'parent',
        labelStyle: { fontSize: 9, fill: 'var(--color-muted-foreground)' },
        labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
      });
    }
    // Last ancestor -> current
    const directParent = chain[chain.length - 1];
    addEdge({
      id: `e-parent-${directParent.id}-${currentItem.id}`,
      source: directParent.id,
      target: currentItem.id,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 2, stroke: 'var(--color-muted-foreground)' },
      label: 'parent',
      labelStyle: { fontSize: 9, fill: 'var(--color-muted-foreground)' },
      labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
    });
  }

  // Add children + edges from current to each child
  for (const child of relationships.children) {
    nodeMap.set(child.id, child);
    addEdge({
      id: `e-child-${currentItem.id}-${child.id}`,
      source: currentItem.id,
      target: child.id,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 2, stroke: 'var(--color-muted-foreground)' },
      label: 'child',
      labelStyle: { fontSize: 9, fill: 'var(--color-muted-foreground)' },
      labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
    });
  }

  // Add grandchildren (descendants not in direct children)
  for (const desc of relationships.descendants) {
    if (!nodeMap.has(desc.id)) {
      nodeMap.set(desc.id, desc);
      // Find its parent among existing nodes
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

  // Add peer links (dashed, bidirectional)
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
      label: 'linked',
      labelStyle: { fontSize: 9, fill: '#3b82f6' },
      labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
    });
  }

  // Add reverse links (dotted)
  for (const rev of relationships.reverseLinked) {
    // Skip if already added as a regular link
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
      label: 'refers to',
      labelStyle: { fontSize: 9, fill: '#a855f7' },
      labelBgStyle: { fill: 'var(--color-background)', fillOpacity: 0.8 },
    });
  }

  // Create nodes array
  const nodes: Node[] = Array.from(nodeMap.values()).map((item) => ({
    id: item.id,
    type: 'orbitNode',
    data: { item, isCurrent: item.id === currentItem.id },
    position: { x: 0, y: 0 },
  }));

  return layoutWithDagre(nodes, edges);
}

async function layoutWithDagre(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const dagreLib = await getDagre();
  const g = new dagreLib.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 20,
    marginy: 20,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagreLib.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
