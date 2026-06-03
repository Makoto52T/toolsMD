// Deterministic layered ("dagre-ish") layout computed in-process so we don't
// pull in @dagrejs/dagre. The graph is sparse and mostly hub-and-spoke, so a
// BFS layering by distance from the highest-degree root reads well and never
// jitters between renders (unlike a force simulation).

export interface LayoutInput {
  id: string;
  degree: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

const COL_GAP = 320; // horizontal distance between layers
const ROW_GAP = 130; // vertical distance between nodes in a layer
const SUBCOL_GAP = 230; // horizontal gap between wrapped sub-columns
const MAX_ROWS = 12; // wrap a layer into sub-columns past this many nodes

export function layeredLayout(
  nodes: LayoutInput[],
  edges: LayoutEdge[]
): Record<string, { x: number; y: number }> {
  if (nodes.length === 0) return {};

  // Undirected adjacency — backlinks are conceptually bidirectional for layout.
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  // Order seeds by degree desc so the densest hub anchors layer 0.
  const byDegree = [...nodes].sort((a, b) => b.degree - a.degree);

  const layer = new Map<string, number>();
  const visited = new Set<string>();

  // BFS from each unvisited hub; disconnected components get appended to the
  // right of whatever's been placed so nothing overlaps.
  let componentOffset = 0;
  for (const seed of byDegree) {
    if (visited.has(seed.id)) continue;
    const queue: string[] = [seed.id];
    layer.set(seed.id, componentOffset);
    visited.add(seed.id);
    let maxLayerThisComponent = componentOffset;

    while (queue.length) {
      const cur = queue.shift() as string;
      const curLayer = layer.get(cur) as number;
      const neighbors = [...(adj.get(cur) || [])].sort();
      for (const nb of neighbors) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        layer.set(nb, curLayer + 1);
        maxLayerThisComponent = Math.max(maxLayerThisComponent, curLayer + 1);
        queue.push(nb);
      }
    }
    componentOffset = maxLayerThisComponent + 2; // gap between components
  }

  // Group by layer, then assign rows within each layer.
  const layerBuckets = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!layerBuckets.has(l)) layerBuckets.set(l, []);
    (layerBuckets.get(l) as string[]).push(id);
  }

  // Layers are placed left-to-right. To avoid the hub-and-spoke case collapsing
  // a huge layer into one tall column, wrap any layer past MAX_ROWS nodes into
  // several sub-columns laid out as a centered grid. We track a running X offset
  // so wrapped layers don't overlap the next layer.
  const sortedLayers = [...layerBuckets.keys()].sort((a, b) => a - b);
  const positions: Record<string, { x: number; y: number }> = {};
  let xCursor = 0;
  for (const l of sortedLayers) {
    const ids = layerBuckets.get(l) as string[];
    ids.sort();
    const rows = Math.min(ids.length, MAX_ROWS);
    const cols = Math.ceil(ids.length / MAX_ROWS);
    const totalHeight = (rows - 1) * ROW_GAP;
    ids.forEach((id, i) => {
      const col = Math.floor(i / MAX_ROWS);
      const row = i % MAX_ROWS;
      positions[id] = {
        x: xCursor + col * SUBCOL_GAP,
        y: row * ROW_GAP - totalHeight / 2,
      };
    });
    // Advance past this layer's sub-columns, then leave a full COL_GAP before
    // the next layer.
    xCursor += (cols - 1) * SUBCOL_GAP + COL_GAP;
  }

  return positions;
}
