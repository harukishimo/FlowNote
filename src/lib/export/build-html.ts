import {
  ActivityGraphSchema,
  normalizeActivityGraph,
} from "@/lib/activity/schema";
import type { ActivityGraph, ActivityNode } from "@/domain/activity-graph";
import { validateActivityGraph } from "@/lib/activity/validate";
import { layoutActivityGraph } from "@/lib/activity/layout";

export type PonchiLayoutConfig = {
  orientation?: "vertical" | "horizontal";
  showWarnings?: boolean;
  showSources?: boolean;
  accentColor?: string;
};

export type BuildHtmlOptions = PonchiLayoutConfig & {
  title?: string;
  summary?: string;
};

const DEFAULT_LAYOUT: Required<PonchiLayoutConfig> = {
  orientation: "vertical",
  showWarnings: true,
  showSources: false,
  accentColor: "#2563eb",
};

export class HtmlExportValidationError extends Error {
  readonly code = "INVALID_GRAPH" as const;

  constructor(message = "ActivityGraph could not be exported") {
    super(message);
    this.name = "HtmlExportValidationError";
  }
}

/** Escape text in both HTML text nodes and quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeAccentColor(color: string | undefined): string {
  // Only permit simple CSS hex colors. The builder never interpolates a user
  // supplied url(), expression, or arbitrary style text into the document.
  return color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : DEFAULT_LAYOUT.accentColor;
}

function text(value: string, max = 280): string {
  const compact = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return escapeHtml(compact.length > max ? `${compact.slice(0, max - 1)}…` : compact);
}

function nodeShape(node: ActivityNode, x: number, y: number, width: number, height: number, accent: string, showSources = false): string {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const fill = node.type === "start" || node.type === "end" ? accent : "#ffffff";
  const stroke = node.type === "start" || node.type === "end" ? accent : "#334155";
  const label = text(node.label || node.type, 110);
  const labelColor = node.type === "start" || node.type === "end" ? "#ffffff" : "#0f172a";

  if (node.type === "start" || node.type === "end") {
    return `<circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="node-label" fill="${labelColor}">${label}</text>`;
  }
  if (node.type === "decision") {
    const points = `${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="node-label" fill="${labelColor}">${label}</text>`;
  }
  const dash = node.type === "parallel" ? ` stroke-dasharray="7 4"` : "";
  const strokeWidth = node.type === "loop" ? 3 : 2;
  const actor = node.actor ? `<text x="${cx}" y="${cy + 21}" text-anchor="middle" class="node-actor" fill="#64748b">${text(node.actor, 90)}</text>` : "";
  const source = showSources && node.sourceRange ? `<text x="${x + width - 10}" y="${y + 15}" text-anchor="end" class="node-source" fill="#64748b">${node.sourceRange.start}–${node.sourceRange.end}</text>` : "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/><text x="${cx}" y="${node.actor ? cy - 3 : cy + 4}" text-anchor="middle" class="node-label" fill="${labelColor}">${label}</text>${actor}${source}`;
}

function nodeWidth(node: ActivityNode): number {
  if (node.type === "start" || node.type === "end") return 52;
  if (node.type === "decision") return 152;
  return 288;
}

function nodeHeight(node: ActivityNode): number {
  return node.type === "start" || node.type === "end" ? 52 : 62;
}

/** Render the same topology-aware, top-to-bottom layout used in the editor. */
function buildActivitySvg(graph: ActivityGraph, config: Required<PonchiLayoutConfig>): string {
  const activityLayout = layoutActivityGraph(graph);
  const hasLoopLane = graph.edges.some((edge) => edge.kind === "loop" || (activityLayout.positions.get(edge.to)?.rank ?? 0) <= (activityLayout.positions.get(edge.from)?.rank ?? 0));
  const width = activityLayout.width + (hasLoopLane ? 180 : 0);
  const loopLaneX = activityLayout.width + 80;
  const edges = graph.edges.map((edge, index) => {
    const from = activityLayout.positions.get(edge.from);
    const to = activityLayout.positions.get(edge.to);
    if (!from || !to) return "";
    const isLoop = edge.kind === "loop" || to.rank <= from.rank;
    let path: string;
    let labelX: number;
    let labelY: number;
    if (isLoop) {
      const laneX = loopLaneX + (index % 4) * 18;
      const fromX = from.x + nodeWidth(from.node) / 2;
      const toX = to.x + nodeWidth(to.node) / 2;
      path = `M ${fromX} ${from.y} C ${laneX} ${from.y}, ${laneX} ${to.y}, ${toX} ${to.y}`;
      labelX = laneX - 8;
      labelY = (from.y + to.y) / 2 - 7;
    } else {
      const fromY = from.y + nodeHeight(from.node) / 2;
      const toY = to.y - nodeHeight(to.node) / 2;
      const middleY = (fromY + toY) / 2;
      path = `M ${from.x} ${fromY} C ${from.x} ${middleY}, ${to.x} ${middleY}, ${to.x} ${toY}`;
      labelX = (from.x + to.x) / 2;
      labelY = middleY - 7;
    }
    const labelWidth = Math.max(34, (edge.label?.length ?? 0) * 12 + 12);
    const label = edge.label ? `<g><rect x="${labelX - labelWidth / 2}" y="${labelY - 12}" width="${labelWidth}" height="19" rx="9" class="edge-label-bg"/><text x="${labelX}" y="${labelY + 2}" text-anchor="middle" class="edge-label">${text(edge.label, 100)}</text></g>` : "";
    return `<path d="${path}" fill="none" stroke="#64748b" stroke-width="2"${isLoop ? ` stroke-dasharray="6 4" class="loop-edge"` : ""} marker-end="url(#arrow)"/>${label}`;
  }).join("");

  const nodes = activityLayout.nodes.map(({ node, x, y }) => {
    const widthForNode = nodeWidth(node);
    const heightForNode = nodeHeight(node);
    return `<g data-node-id="${escapeHtml(node.id)}">${nodeShape(node, x - widthForNode / 2, y - heightForNode / 2, widthForNode, heightForNode, config.accentColor, config.showSources)}</g>`;
  }).join("");
  return `<svg class="activity-svg" viewBox="0 0 ${width} ${activityLayout.height}" role="img" aria-label="Activity diagram"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>${edges}${nodes}</svg>`;
}

function normalizeLayout(options: BuildHtmlOptions): Required<PonchiLayoutConfig> {
  return {
    orientation: options.orientation === "horizontal" ? "horizontal" : "vertical",
    showWarnings: options.showWarnings !== false,
    showSources: options.showSources === true,
    accentColor: safeAccentColor(options.accentColor),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Accept a graph directly or the DiagramSnapshot shape used by the UI. */
function unwrapInput(input: unknown, options: BuildHtmlOptions): { graph: unknown; options: BuildHtmlOptions } {
  if (!isRecord(input) || !isRecord(input.graph)) return { graph: input, options };
  const config = isRecord(input.config) ? input.config : {};
  const derived: BuildHtmlOptions = {
    title: options.title ?? (typeof config.title === "string" ? config.title : typeof input.title === "string" ? input.title : undefined),
    summary: options.summary ?? (typeof config.summary === "string" ? config.summary : typeof input.summary === "string" ? input.summary : undefined),
    accentColor: options.accentColor ?? (typeof config.accent === "string" ? config.accent : undefined),
    orientation: options.orientation ?? (config.layout === "wide" ? "horizontal" : "vertical"),
    showWarnings: options.showWarnings ?? true,
    showSources: options.showSources ?? false,
  };
  return { graph: input.graph, options: derived };
}

/** Build a standalone HTML document. It does not write files or call a store. */
export function buildStandaloneHtml(input: unknown, options: BuildHtmlOptions = {}): string {
  const unwrapped = unwrapInput(input, options);
  const parsed = ActivityGraphSchema.safeParse(unwrapped.graph);
  if (!parsed.success) throw new HtmlExportValidationError("Invalid ActivityGraph");
  const validation = validateActivityGraph(normalizeActivityGraph(parsed.data));
  if (!validation.ok) throw new HtmlExportValidationError("Invalid ActivityGraph");
  const graph = validation.graph;
  const layout = normalizeLayout(unwrapped.options);
  const title = text(unwrapped.options.title ?? graph.title ?? "Activity diagram", 180);
  const summary = text(unwrapped.options.summary ?? "", 2_000);
  const svg = buildActivitySvg(graph, layout);
  const warningSection = layout.showWarnings && graph.warnings.length > 0
    ? `<section class="warnings" aria-label="Warnings"><h2>Warnings</h2><ul>${graph.warnings.map((item) => `<li><strong>${text(item.code, 100)}</strong> ${text(item.message, 600)}</li>`).join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<title>${title}</title>
<style>
:root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; background: #f8fafc; color: #0f172a; }
main { max-width: 1200px; margin: 0 auto; padding: 32px 24px 56px; }
h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
.summary { margin: 0 0 20px; color: #475569; white-space: pre-wrap; }
.diagram { overflow: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 8px 30px rgb(15 23 42 / 8%); }
.activity-svg { width: 100%; min-width: 720px; min-height: 240px; display: block; }
.node-label { font-size: 14px; font-weight: 600; pointer-events: none; }
.node-actor { font-size: 11px; pointer-events: none; }
.node-source { font-size: 10px; pointer-events: none; }
.node-detail { text-align: center; font-size: 13px; line-height: 1.35; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actor { display: block; color: #64748b; font-size: 11px; }
.source { color: #64748b; font-size: 10px; }
.edge-label { font-size: 12px; fill: #475569; paint-order: stroke; stroke: #f8fafc; stroke-width: 4px; stroke-linejoin: round; }
.edge-label-bg { fill: #fff; stroke: #d7ddd4; stroke-width: 1px; }
.loop-edge { stroke: #b07b49; }
.warnings { margin-top: 20px; padding: 14px 18px; border: 1px solid #fdba74; border-radius: 12px; background: #fff7ed; }
.warnings h2 { margin: 0 0 8px; font-size: 16px; }
.warnings ul { margin: 0; padding-left: 20px; }
.warnings li { margin: 4px 0; }
footer { margin-top: 20px; color: #64748b; font-size: 12px; }
</style>
</head>
<body><main><h1>${title}</h1>${summary ? `<p class="summary">${summary}</p>` : ""}<section class="diagram" aria-label="Activity diagram">${svg}</section>${warningSection}<footer>Generated by FlowNote. This file is standalone and contains no saved data.</footer></main></body>
</html>`;
}

/** Backwards-compatible descriptive alias used by route handlers and clients. */
export const buildHtmlDocument = buildStandaloneHtml;
export const buildPonchiHtml = buildStandaloneHtml;
export const buildHtml = buildStandaloneHtml;
