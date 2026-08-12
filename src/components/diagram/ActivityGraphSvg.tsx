'use client';

import { useId, useMemo } from 'react';
import type { ActivityEdge, ActivityGraph, ActivityNode } from '@/lib/flow-types';
import { layoutActivityGraph, type PositionedNode } from '@/lib/activity/layout';

type Props = {
  graph: ActivityGraph;
  zoom?: number;
  accent?: string;
  className?: string;
  onSelectSource?: (start: number, end: number) => void;
};

export function activityGraphCanvasWidth(graph: ActivityGraph): number {
  const layout = layoutActivityGraph(graph);
  const hasLoopLane = graph.edges.some((edge) => edge.kind === 'loop' || (layout.positions.get(edge.to)?.rank ?? 0) <= (layout.positions.get(edge.from)?.rank ?? 0));
  return layout.width + (hasLoopLane ? 180 : 0);
}

export function ActivityGraphSvg({ graph, zoom = 1, accent = '#425c4a', className = '', onSelectSource }: Props) {
  const layout = useMemo(() => layoutActivityGraph(graph), [graph]);
  const hasLoopLane = graph.edges.some((edge) => edge.kind === 'loop' || (layout.positions.get(edge.to)?.rank ?? 0) <= (layout.positions.get(edge.from)?.rank ?? 0));
  const canvasWidth = layout.width + (hasLoopLane ? 180 : 0);
  const markerId = `arrow-${useId().replace(/[^a-z0-9_-]/gi, '')}`;

  return <svg className={`activity-svg ${className}`.trim()} viewBox={`0 0 ${canvasWidth} ${layout.height}`} style={{ width: `${canvasWidth * zoom}px`, minWidth: `${canvasWidth * zoom}px` }} role="img" aria-label="メモから生成されたアクティビティ図">
    <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#7b8578" /></marker></defs>
    {graph.edges.map((edge, index) => <DiagramEdge key={edge.id} edge={edge} index={index} positions={layout.positions} loopLaneX={layout.width + 80} markerId={markerId} />)}
    {layout.nodes.map(({ node, x, y }) => <DiagramNode key={node.id} node={node} x={x} y={y} accent={accent} onSelectSource={onSelectSource} />)}
  </svg>;
}

function nodeHalfWidth(node: ActivityNode): number {
  if (node.type === 'start' || node.type === 'end') return 26;
  if (node.type === 'decision') return 76;
  return 144;
}

function nodeHalfHeight(node: ActivityNode): number {
  return node.type === 'start' || node.type === 'end' ? 26 : 31;
}

function DiagramEdge({ edge, index, positions, loopLaneX, markerId }: {
  edge: ActivityEdge;
  index: number;
  positions: Map<string, PositionedNode<ActivityNode>>;
  loopLaneX: number;
  markerId: string;
}) {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return null;
  const isLoop = edge.kind === 'loop' || to.rank <= from.rank;
  let path: string;
  let labelX: number;
  let labelY: number;

  if (isLoop) {
    const laneX = loopLaneX + (index % 4) * 18;
    const fromX = from.x + nodeHalfWidth(from.node);
    const toX = to.x + nodeHalfWidth(to.node);
    path = `M ${fromX} ${from.y} C ${laneX} ${from.y}, ${laneX} ${to.y}, ${toX} ${to.y}`;
    labelX = laneX - 8;
    labelY = (from.y + to.y) / 2 - 7;
  } else {
    const fromY = from.y + nodeHalfHeight(from.node);
    const toY = to.y - nodeHalfHeight(to.node);
    const middleY = (fromY + toY) / 2;
    path = `M ${from.x} ${fromY} C ${from.x} ${middleY}, ${to.x} ${middleY}, ${to.x} ${toY}`;
    labelX = (from.x + to.x) / 2;
    labelY = middleY - 7;
  }

  const labelWidth = Math.max(34, (edge.label?.length ?? 0) * 12 + 12);
  return <g className={`diagram-edge-path ${isLoop ? 'loop' : edge.kind ?? 'normal'}`}>
    <path d={path} fill="none" stroke="#9ca79b" strokeWidth="1.8" markerEnd={`url(#${markerId})`} strokeDasharray={isLoop ? '6 4' : undefined} />
    {edge.label && <g><rect x={labelX - labelWidth / 2} y={labelY - 12} width={labelWidth} height="19" rx="9" className="edge-label-bg" /><text x={labelX} y={labelY + 2} textAnchor="middle" className="edge-label">{edge.label}</text></g>}
  </g>;
}

function DiagramNode({ node, x, y, accent, onSelectSource }: { node: ActivityNode; x: number; y: number; accent: string; onSelectSource?: Props['onSelectSource'] }) {
  const label = node.label.length > 38 ? `${node.label.slice(0, 37)}…` : node.label;
  const onClick = () => node.sourceRange && onSelectSource?.(node.sourceRange.start, node.sourceRange.end);
  const keyboardActivate = (event: React.KeyboardEvent<SVGGElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } };
  const groupProps = { className: 'diagram-node', onClick, onKeyDown: keyboardActivate, role: 'button' as const, tabIndex: 0 };
  if (node.type === 'start' || node.type === 'end') return <g {...groupProps}><circle cx={x} cy={y} r="26" fill={accent} /><text x={x} y={y + 4} textAnchor="middle" className="node-inverse">{label || (node.type === 'start' ? '開始' : '終了')}</text></g>;
  if (node.type === 'decision') return <g {...groupProps}><polygon points={`${x},${y - 31} ${x + 76},${y} ${x},${y + 31} ${x - 76},${y}`} fill="#f5efe3" stroke="#b29a72" strokeWidth="1.5" /><text x={x} y={y + 4} textAnchor="middle" className="node-label">{label}</text></g>;
  const fill = node.type === 'parallel' ? '#eef4ff' : node.type === 'loop' ? '#fff3e7' : node.type === 'merge' ? '#e7ede6' : '#ffffff';
  return <g {...groupProps}><rect x={x - 144} y={y - 30} width="288" height="60" rx="12" fill={fill} stroke="#cad2c8" strokeWidth="1.5" /><text x={x} y={y + (node.actor ? -2 : 5)} textAnchor="middle" className="node-label">{label}</text>{node.actor && <text x={x} y={y + 18} textAnchor="middle" className="node-actor">担当：{node.actor}</text>}</g>;
}
