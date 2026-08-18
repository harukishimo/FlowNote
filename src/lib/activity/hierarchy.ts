import type { ActivityEdge, ActivityGraph, ActivityNode, SourceRange } from './schema';

type MarkdownListItem = {
  lineIndex: number;
  indent: number;
  label: string;
  lineStart: number;
  contentStart: number;
  lineEnd: number;
  parentLineIndex: number | null;
};

type NodeMatch = {
  item: MarkdownListItem;
  node: ActivityNode;
  score: number;
};

function parseListLine(raw: string, lineIndex: number, lineStart: number): Omit<MarkdownListItem, 'parentLineIndex'> | null {
  const match = raw.match(/^(\s*)(?:(?:[-*+]\s+)|(?:\d+\.\s+))(.*)$/);
  if (!match || !match[2].trim()) return null;
  const indent = [...match[1]].reduce((width, character) => width + (character === '\t' ? 2 : 1), 0);
  const contentStart = lineStart + match[1].length + match[0].length - match[2].length;
  return {
    lineIndex,
    indent,
    label: match[2].trim(),
    lineStart,
    contentStart,
    lineEnd: lineStart + raw.length,
  };
}

function parseMarkdownLists(sourceText: string): MarkdownListItem[] {
  const lines = sourceText.replace(/\r\n?/g, '\n').split('\n');
  const items: MarkdownListItem[] = [];
  const stack: MarkdownListItem[] = [];
  let offset = 0;

  lines.forEach((raw, lineIndex) => {
    const parsed = parseListLine(raw, lineIndex, offset);
    offset += raw.length + 1;
    if (!parsed) {
      // A non-empty paragraph starts a new list context. Blank lines are
      // tolerated because Markdown permits them inside nested lists.
      if (raw.trim()) stack.length = 0;
      return;
    }
    while (stack.length && stack[stack.length - 1].indent >= parsed.indent) stack.pop();
    const item: MarkdownListItem = { ...parsed, parentLineIndex: stack[stack.length - 1]?.lineIndex ?? null };
    items.push(item);
    stack.push(item);
  });
  return items;
}

function normalizedText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[\\`*_~]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLocaleLowerCase('ja-JP');
}

function bigrams(value: string): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
  return result;
}

function textSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.size || !rightPairs.size) return 0;
  let common = 0;
  for (const pair of leftPairs) if (rightPairs.has(pair)) common += 1;
  return (2 * common) / (leftPairs.size + rightPairs.size);
}

function sourceOverlap(range: SourceRange | null | undefined, item: MarkdownListItem): number {
  if (!range) return 0;
  const overlap = Math.max(0, Math.min(range.end, item.lineEnd) - Math.max(range.start, item.contentStart));
  if (!overlap) return 0;
  return overlap / Math.max(1, item.lineEnd - item.contentStart);
}

function matchScore(node: ActivityNode, item: MarkdownListItem): number {
  const labelScore = textSimilarity(normalizedText(node.label), normalizedText(item.label));
  const rangeScore = sourceOverlap(node.sourceRange, item);
  // An exact/fuzzy label is stronger than a range because the model may use
  // ranges for the surrounding list marker instead of the item text.
  return labelScore * 10_000 + rangeScore * 1_500;
}

function matchNodes(items: MarkdownListItem[], nodes: ActivityNode[]): NodeMatch[] {
  const available = new Set(nodes.filter((node) => node.type !== 'start' && node.type !== 'end').map((node) => node.id));
  const matches: NodeMatch[] = [];

  for (const item of items) {
    let best: NodeMatch | null = null;
    for (const node of nodes) {
      if (!available.has(node.id)) continue;
      const score = matchScore(node, item);
      if (!best || score > best.score) best = { item, node, score };
    }
    // Do not make a speculative match from an unrelated AI node. Missing
    // list items are added as deterministic step nodes below instead.
    if (best && (best.score >= 4_500 || sourceOverlap(best.node.sourceRange, item) >= 0.2)) {
      matches.push(best);
      available.delete(best.node.id);
    }
  }
  return matches;
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function uniqueEdgeId(edges: ActivityEdge[], preferred: string): string {
  const used = new Set(edges.map((edge) => edge.id));
  if (!used.has(preferred)) return preferred.slice(0, 128);
  let suffix = 2;
  while (used.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`.slice(0, 128);
}

function addOrUpdateEdge(edges: ActivityEdge[], from: string, to: string, kind: ActivityEdge['kind'], label: string | null = null): void {
  const existing = edges.find((edge) => edge.from === from && edge.to === to && edge.kind !== 'loop');
  if (existing) {
    existing.kind = kind;
    if (!existing.label && label) existing.label = label;
    return;
  }
  edges.push({ id: uniqueEdgeId(edges, `hierarchy-${from}-${to}`), from, to, label, kind });
}

/**
 * Make Markdown list hierarchy authoritative after Gemini generation.
 *
 * Gemini is good at naming activities but can still serialize a nested list
 * as a single chain. This pass uses the source ranges/labels to restore the
 * deterministic tree relationship: siblings get branch edges from their
 * parent, so the layout engine places them on one horizontal rank. It also
 * adds missing list items as plain steps instead of silently dropping memo
 * content.
 */
export function applyMarkdownHierarchy(graph: ActivityGraph, sourceText: string): ActivityGraph {
  const items = parseMarkdownLists(sourceText);
  if (items.length < 3) return graph;

  const matches = matchNodes(items, graph.nodes);
  if (matches.length < 2) return graph;

  const matchByLine = new Map(matches.map((match) => [match.item.lineIndex, match.node]));
  const hasFanOut = items.some((item) => items.filter((candidate) => candidate.parentLineIndex === item.lineIndex).length > 1)
    || items.filter((item) => item.parentLineIndex === null).length > 1;
  if (!hasFanOut) return graph;

  const nodes = graph.nodes.map((node) => ({ ...node }));
  const usedIds = new Set(nodes.map((node) => node.id));
  for (const item of items) {
    if (matchByLine.has(item.lineIndex)) continue;
    let id = `memo-line-${item.lineIndex + 1}`;
    let suffix = 2;
    while (usedIds.has(id)) id = `memo-line-${item.lineIndex + 1}-${suffix++}`;
    const node: ActivityNode = {
      id,
      type: 'step',
      label: item.label,
      actor: null,
      sourceRange: { start: item.contentStart, end: item.lineEnd },
      confidence: 0.65,
    };
    nodes.push(node);
    usedIds.add(id);
    matchByLine.set(item.lineIndex, node);
  }

  const structuralIds = new Set([...matchByLine.values()].map((node) => node.id));
  const expectedPairs = new Map<string, { kind: ActivityEdge['kind']; label: string | null }>();
  const childrenByParent = new Map<number | null, MarkdownListItem[]>();
  for (const item of items) {
    const children = childrenByParent.get(item.parentLineIndex) ?? [];
    children.push(item);
    childrenByParent.set(item.parentLineIndex, children);
  }

  for (const item of items) {
    const node = matchByLine.get(item.lineIndex);
    if (!node) continue;
    const children = childrenByParent.get(item.lineIndex) ?? [];
    for (const child of children) {
      const childNode = matchByLine.get(child.lineIndex);
      if (!childNode) continue;
      const kind: ActivityEdge['kind'] = children.length > 1 ? 'branch' : 'normal';
      expectedPairs.set(edgeKey(node.id, childNode.id), { kind, label: null });
    }
  }

  const start = nodes.find((node) => node.type === 'start');
  const end = nodes.find((node) => node.type === 'end');
  const roots = childrenByParent.get(null) ?? [];
  if (start) {
    const kind: ActivityEdge['kind'] = roots.length > 1 ? 'branch' : 'normal';
    for (const root of roots) {
      const rootNode = matchByLine.get(root.lineIndex);
      if (rootNode) expectedPairs.set(edgeKey(start.id, rootNode.id), { kind, label: null });
    }
  }

  // Remove only non-loop edges between list activities that contradict the
  // Markdown tree. Edges to AI-created merge/parallel nodes remain intact.
  const edges = graph.edges
    .filter((edge) => edge.kind === 'loop' || !structuralIds.has(edge.from) || !structuralIds.has(edge.to) || expectedPairs.has(edgeKey(edge.from, edge.to)))
    .map((edge) => ({ ...edge }));
  for (const [key, expected] of expectedPairs) {
    const separator = key.indexOf('\u0000');
    const from = key.slice(0, separator);
    const to = key.slice(separator + 1);
    addOrUpdateEdge(edges, from, to, expected.kind, expected.label);
  }

  if (end) {
    const hasOutgoing = (nodeId: string) => edges.some((edge) => edge.from === nodeId && edge.kind !== 'loop');
    for (const item of items) {
      const node = matchByLine.get(item.lineIndex);
      if (!node || (childrenByParent.get(item.lineIndex) ?? []).length > 0 || hasOutgoing(node.id)) continue;
      addOrUpdateEdge(edges, node.id, end.id, 'normal');
    }
  }

  return { ...graph, nodes, edges };
}

