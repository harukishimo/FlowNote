import { z } from "zod";
import type { ActivityGraph, ActivityNode, ActivityWarning } from "@/domain/activity-graph";
import {
  ActivityGraphSchema,
  normalizeActivityGraph,
} from "./schema";

export type GraphValidationError = {
  code: "INVALID_GRAPH";
  message: string;
  issues: z.ZodIssue[];
};

export type GraphValidationResult =
  | { ok: true; graph: ActivityGraph; warnings: ActivityWarning[] }
  | { ok: false; error: GraphValidationError };

const warning = (
  code: string,
  message: string,
  node?: ActivityNode,
): ActivityWarning => ({
  code,
  message,
  sourceRange: node?.sourceRange ?? null,
});

function warningKey(item: ActivityWarning): string {
  const range = item.sourceRange ? `${item.sourceRange.start}:${item.sourceRange.end}` : "";
  return `${item.code}|${item.message}|${range}`;
}

function appendWarnings(graph: ActivityGraph, generated: ActivityWarning[]): ActivityWarning[] {
  const all = [...graph.warnings, ...generated];
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = warningKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Return strongly connected components that actually form a cycle. */
function findCycleComponents(graph: ActivityGraph, outgoing: Map<string, string[]>): string[][] {
  let nextIndex = 0;
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (id: string): void => {
    indexById.set(id, nextIndex);
    lowLinkById.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const target of outgoing.get(id) ?? []) {
      if (!indexById.has(target)) {
        connect(target);
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, lowLinkById.get(target)!));
      } else if (onStack.has(target)) {
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, indexById.get(target)!));
      }
    }

    if (lowLinkById.get(id) !== indexById.get(id)) return;
    const component: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== id);

    const isSelfLoop = component.length === 1 && (outgoing.get(component[0]) ?? []).includes(component[0]);
    if (component.length > 1 || isSelfLoop) components.push(component);
  };

  for (const node of graph.nodes) {
    if (!indexById.has(node.id)) connect(node.id);
  }
  return components;
}

/**
 * Validate semantic graph invariants after Gemini's Zod shape validation.
 * Semantic problems deliberately become warnings: an ambiguous memo should
 * still be displayable and editable rather than being silently discarded.
 */
export function validateActivityGraph(input: unknown, sourceText?: string): GraphValidationResult {
  const parsed = ActivityGraphSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_GRAPH",
        message: "ActivityGraph did not match the required schema",
        issues: parsed.error.issues,
      },
    };
  }

  const graph = normalizeActivityGraph(parsed.data);
  const generated: ActivityWarning[] = [];
  const structuralIssues: z.ZodIssue[] = [];
  const nodeById = new Map<string, ActivityNode>();
  for (const node of graph.nodes) {
    if (nodeById.has(node.id)) {
      structuralIssues.push({
        code: z.ZodIssueCode.custom,
        path: ["nodes", node.id, "id"],
        message: `Node id '${node.id}' is duplicated`,
      });
    } else {
      nodeById.set(node.id, node);
    }
  }

  const edgeIds = new Set<string>();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const validEdges = graph.edges.filter((edge) => {
    let valid = true;
    if (edgeIds.has(edge.id)) {
      structuralIssues.push({
        code: z.ZodIssueCode.custom,
        path: ["edges", edge.id, "id"],
        message: `Edge id '${edge.id}' is duplicated`,
      });
    }
    edgeIds.add(edge.id);
    if (!nodeById.has(edge.from)) {
      structuralIssues.push({
        code: z.ZodIssueCode.custom,
        path: ["edges", edge.id, "from"],
        message: `Edge '${edge.id}' refers to missing source '${edge.from}'`,
      });
      valid = false;
    }
    if (!nodeById.has(edge.to)) {
      structuralIssues.push({
        code: z.ZodIssueCode.custom,
        path: ["edges", edge.id, "to"],
        message: `Edge '${edge.id}' refers to missing target '${edge.to}'`,
      });
      valid = false;
    }
    if (valid) {
      const targets = outgoing.get(edge.from) ?? [];
      targets.push(edge.to);
      outgoing.set(edge.from, targets);
      const sources = incoming.get(edge.to) ?? [];
      sources.push(edge.from);
      incoming.set(edge.to, sources);
    }
    return valid;
  });

  // Cross-reference failures are structural and cannot be safely repaired by
  // the renderer. Keep semantic ambiguity as warnings, but reject bad refs.
  if (structuralIssues.length > 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_GRAPH",
        message: "ActivityGraph contains invalid node or edge references",
        issues: structuralIssues,
      },
    };
  }

  const starts = graph.nodes.filter((node) => node.type === "start");
  const ends = graph.nodes.filter((node) => node.type === "end");
  if (starts.length === 0) generated.push(warning("missing-start", "Graph has no start node"));
  if (starts.length > 1) generated.push(warning("multiple-start", "Graph has multiple start nodes"));
  if (ends.length === 0) generated.push(warning("missing-end", "Graph has no end node"));
  if (ends.length > 1) generated.push(warning("multiple-end", "Graph has multiple end nodes"));

  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const target of outgoing.get(id) ?? []) visit(target);
  };
  starts.forEach((node) => visit(node.id));
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      generated.push(warning("unreachable-node", `Node '${node.id}' cannot be reached from a start node`, node));
    }
    if (sourceText !== undefined && node.sourceRange && (node.sourceRange.start > sourceText.length || node.sourceRange.end > sourceText.length)) {
      generated.push(warning("source-range-out-of-bounds", `Node '${node.id}' sourceRange falls outside the memo`, node));
    }
  }

  const canTerminate = new Set<string>();
  const reverseVisit = (id: string): void => {
    if (canTerminate.has(id)) return;
    canTerminate.add(id);
    for (const source of incoming.get(id) ?? []) reverseVisit(source);
  };
  ends.forEach((node) => reverseVisit(node.id));
  for (const node of graph.nodes) {
    if (!canTerminate.has(node.id)) {
      generated.push(warning("termination", `Node '${node.id}' cannot reach an end node`, node));
    }
  }

  const outgoingEdges = new Map<string, typeof validEdges>();
  for (const edge of validEdges) {
    const list = outgoingEdges.get(edge.from) ?? [];
    list.push(edge);
    outgoingEdges.set(edge.from, list);
  }
  for (const node of graph.nodes) {
    if (node.type !== "decision") continue;
    const branches = outgoingEdges.get(node.id) ?? [];
    if (branches.length < 2) {
      generated.push(warning("decision-without-branches", `Decision '${node.id}' has fewer than two outgoing branches`, node));
    }
    for (const edge of branches) {
      if (!edge.label?.trim()) {
        generated.push(warning("missing-branch-label", `Decision edge '${edge.id}' is missing a branch label`, node));
      }
    }
  }

  for (const node of graph.nodes) {
    const outgoingForNode = outgoingEdges.get(node.id) ?? [];
    const incomingForNode = incoming.get(node.id) ?? [];
    if (node.type === "parallel" && outgoingForNode.length < 2) {
      generated.push(warning("parallel-without-branches", `Parallel node '${node.id}' has fewer than two outgoing branches`, node));
    }
    if (node.type === "merge" && incomingForNode.length < 2) {
      generated.push(warning("merge-without-branches", `Merge node '${node.id}' has fewer than two incoming branches`, node));
    }
    if (node.type === "loop" && !outgoingForNode.some((edge) => edge.kind === "loop")) {
      generated.push(warning("loop-without-back-edge", `Loop node '${node.id}' has no loop-back edge`, node));
    }
  }

  // Evaluate a retry cycle as one unit. An exit from any node in the cycle is
  // sufficient; evaluating each node independently produced false warnings on
  // ordinary "fix -> recheck -> no -> end" flows.
  for (const component of findCycleComponents(graph, outgoing)) {
    const componentIds = new Set(component);
    const hasExit = component.some((id) =>
      (outgoingEdges.get(id) ?? []).some(
        (edge) => edge.kind !== "loop" && !componentIds.has(edge.to),
      ),
    );
    if (!hasExit) {
      const node = nodeById.get(component[0]);
      generated.push(warning("loop-without-exit", `Loop '${component[0]}' has no visible exit path`, node));
    }
    for (const id of component) {
      const loopEdges = (outgoingEdges.get(id) ?? []).filter((edge) => edge.kind === "loop");
      if (loopEdges.some((edge) => edge.to === id)) {
        generated.push(warning("self-loop", `Loop '${id}' points to itself`, nodeById.get(id)));
      }
    }
  }

  const warnings = appendWarnings(graph, generated);
  return { ok: true, graph: { ...graph, warnings }, warnings };
}

export function assertValidActivityGraph(input: unknown): ActivityGraph {
  const result = validateActivityGraph(input);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.graph;
}
