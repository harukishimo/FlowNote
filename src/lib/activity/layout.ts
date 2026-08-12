export type LayoutNode = {
  id: string;
  type: string;
};

export type LayoutEdge = {
  from: string;
  to: string;
  kind?: string;
};

export type PositionedNode<TNode extends LayoutNode = LayoutNode> = {
  node: TNode;
  rank: number;
  x: number;
  y: number;
};

export type ActivityLayout<TNode extends LayoutNode = LayoutNode> = {
  nodes: PositionedNode<TNode>[];
  positions: Map<string, PositionedNode<TNode>>;
  width: number;
  height: number;
};

const MIN_WIDTH = 720;
const COLUMN_GAP = 360;
const ROW_GAP = 118;
const MARGIN_X = 180;
const MARGIN_Y = 58;

/**
 * Layer a directed ActivityGraph from top to bottom. Loop edges are excluded
 * from ranking so retry paths do not pull every node into a single cycle.
 * Nodes in the same rank are spread horizontally, which makes decision and
 * parallel branches visible without relying on the model's node order.
 */
export function layoutActivityGraph<TNode extends LayoutNode>(
  graph: { nodes: TNode[]; edges: LayoutEdge[] },
): ActivityLayout<TNode> {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const forwardEdges = graph.edges.filter(
    (edge) => edge.kind !== 'loop' && nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  const outgoing = new Map<string, LayoutEdge[]>();
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of forwardEdges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  for (const id of queue) rank.set(id, 0);

  let cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    const nextRank = (rank.get(id) ?? 0) + 1;
    for (const edge of outgoing.get(id) ?? []) {
      rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, nextRank));
      const remaining = (indegree.get(edge.to) ?? 1) - 1;
      indegree.set(edge.to, remaining);
      if (remaining === 0) queue.push(edge.to);
    }
  }

  // A malformed unmarked cycle should still render. Place unresolved nodes
  // after the resolved layers in their stable source order.
  let fallbackRank = Math.max(0, ...rank.values());
  for (const node of graph.nodes) {
    if (!rank.has(node.id)) rank.set(node.id, ++fallbackRank);
  }

  const layers = new Map<number, TNode[]>();
  for (const node of graph.nodes) {
    const nodeRank = rank.get(node.id) ?? 0;
    const layer = layers.get(nodeRank) ?? [];
    layer.push(node);
    layers.set(nodeRank, layer);
  }

  const maxLayerSize = Math.max(1, ...Array.from(layers.values(), (layer) => layer.length));
  const width = Math.max(MIN_WIDTH, (maxLayerSize - 1) * COLUMN_GAP + MARGIN_X * 2);
  const centerX = width / 2;
  const positioned: PositionedNode<TNode>[] = [];

  for (const [nodeRank, layer] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    layer.forEach((node, index) => {
      const offset = (index - (layer.length - 1) / 2) * COLUMN_GAP;
      positioned.push({ node, rank: nodeRank, x: centerX + offset, y: MARGIN_Y + nodeRank * ROW_GAP });
    });
  }

  const positions = new Map(positioned.map((item) => [item.node.id, item]));
  const maxRank = Math.max(0, ...positioned.map((item) => item.rank));
  return {
    nodes: positioned,
    positions,
    width,
    height: Math.max(260, MARGIN_Y * 2 + maxRank * ROW_GAP + 64),
  };
}
