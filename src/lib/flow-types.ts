export type SourceRange = { start: number; end: number } | null;

export type ActivityNode = {
  id: string;
  type: 'start' | 'step' | 'action' | 'decision' | 'merge' | 'parallel' | 'loop' | 'end';
  label: string;
  actor?: string | null;
  sourceRange?: SourceRange;
  confidence?: number;
};

export type ActivityEdge = {
  id: string;
  from: string;
  to: string;
  label?: string | null;
  kind?: 'normal' | 'branch' | 'loop';
};

export type ActivityGraph = {
  schemaVersion?: number;
  title?: string;
  nodes: ActivityNode[];
  edges: ActivityEdge[];
    warnings?: Array<{ code?: string; message: string; sourceRange?: SourceRange }>;
};

export type NoteRecord = {
  id: string;
  title: string;
  contentMarkdown: string;
  contentJson?: unknown;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  deletedAt?: string | null;
};

export type SnapshotConfig = {
  title: string;
  summary: string;
  accent: string;
  layout: 'wide' | 'compact';
  showCards: boolean;
};

export type DiagramSnapshot = {
  id?: string;
  graph: ActivityGraph;
  warnings?: ActivityGraph['warnings'];
  summary: string;
  config: SnapshotConfig;
  savedAt?: string;
};

export const EMPTY_GRAPH: ActivityGraph = { nodes: [], edges: [], warnings: [] };

export function normalizeNote(value: unknown, fallbackId = 'new'): NoteRecord {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const note = (raw.note && typeof raw.note === 'object' ? raw.note : raw) as Record<string, unknown>;
  return {
    id: String(note.id ?? fallbackId),
    title: String(note.title ?? '無題のメモ'),
    contentMarkdown: String(note.contentMarkdown ?? note.content_markdown ?? note.content ?? ''),
    contentJson: note.contentJson ?? note.content_json,
    createdAt: typeof note.createdAt === 'string' ? note.createdAt : typeof note.created_at === 'string' ? note.created_at : undefined,
    updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : typeof note.updated_at === 'string' ? note.updated_at : undefined,
    version: typeof note.version === 'number' ? note.version : undefined,
    deletedAt: (note.deletedAt ?? note.deleted_at) as string | null | undefined,
  };
}

export function normalizeGraph(value: unknown): ActivityGraph {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const graph = (raw.graph ?? raw.activityGraph ?? raw.diagram ?? raw) as Record<string, unknown>;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  return {
    schemaVersion: typeof graph.schemaVersion === 'number' ? graph.schemaVersion : 1,
    title: typeof graph.title === 'string' ? graph.title : undefined,
    nodes: nodes.map((item, index) => {
      const n = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const type = ['start', 'step', 'action', 'decision', 'merge', 'parallel', 'loop', 'end'].includes(String(n.type)) ? String(n.type) as ActivityNode['type'] : 'action';
      return { id: String(n.id ?? `node-${index + 1}`), type, label: String(n.label ?? n.name ?? ''), actor: n.actor == null ? null : String(n.actor), sourceRange: (n.sourceRange ?? null) as SourceRange, confidence: typeof n.confidence === 'number' ? n.confidence : undefined };
    }),
    edges: edges.map((item, index) => {
      const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { id: String(e.id ?? `edge-${index + 1}`), from: String(e.from ?? ''), to: String(e.to ?? ''), label: e.label == null ? null : String(e.label), kind: ['normal', 'branch', 'loop'].includes(String(e.kind)) ? String(e.kind) as ActivityEdge['kind'] : 'normal' };
    }),
    warnings: Array.isArray(graph.warnings) ? graph.warnings.map((item) => {
      const w = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { code: w.code == null ? undefined : String(w.code), message: String(w.message ?? '確認が必要な箇所があります'), sourceRange: (w.sourceRange ?? null) as SourceRange };
    }) : [],
  };
}

export function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
