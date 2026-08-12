import { describe, expect, it } from "vitest";
import { validateActivityGraph } from "./validate";

const graph = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  title: "Checkout",
  nodes: [
    { id: "start", type: "start", label: "Start", actor: null, sourceRange: null, confidence: 1 },
    { id: "decision", type: "decision", label: "Paid?", actor: null, sourceRange: null, confidence: 1 },
    { id: "yes", type: "step", label: "Ship", actor: "Ops", sourceRange: null, confidence: 0.9 },
    { id: "no", type: "step", label: "Ask payment", actor: null, sourceRange: null, confidence: 0.9 },
    { id: "end", type: "end", label: "Done", actor: null, sourceRange: null, confidence: 1 },
  ],
  edges: [
    { id: "e1", from: "start", to: "decision", label: null, kind: "normal" },
    { id: "e2", from: "decision", to: "yes", label: "yes", kind: "branch" },
    { id: "e3", from: "decision", to: "no", label: "no", kind: "branch" },
    { id: "e4", from: "yes", to: "end", label: null, kind: "normal" },
    { id: "e5", from: "no", to: "end", label: null, kind: "normal" },
  ],
  warnings: [],
  ...overrides,
});

describe("validateActivityGraph", () => {
  it("returns a normalized graph with no warnings for a complete flow", () => {
    const result = validateActivityGraph(graph());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.nodes.find((node) => node.id === "yes")?.type).toBe("step");
      expect(result.warnings).toHaveLength(0);
    }
  });

  it("rejects dangling references instead of rendering a broken edge", () => {
    const result = validateActivityGraph(graph({
      nodes: [
        ...(graph().nodes as unknown[]),
        { id: "orphan", type: "step", label: "Orphan", actor: null, sourceRange: null, confidence: 1 },
      ],
      edges: [
        ...(graph().edges as unknown[]).slice(0, 1),
        { id: "branch", from: "decision", to: "yes", label: null, kind: "branch" },
        { id: "dangling", from: "decision", to: "missing", label: "no", kind: "branch" },
      ],
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues.some((issue) => issue.message.includes("missing target"))).toBe(true);
  });

  it("reports unreachable and missing branch labels as warnings", () => {
    const result = validateActivityGraph(graph({
      nodes: [
        ...(graph().nodes as unknown[]),
        { id: "orphan", type: "step", label: "Orphan", actor: null, sourceRange: null, confidence: 1 },
      ],
      edges: [
        ...(graph().edges as unknown[]).slice(0, 1),
        { id: "branch", from: "decision", to: "yes", label: null, kind: "branch" },
      ],
    }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(["unreachable-node", "termination", "missing-branch-label"]));
  });

  it("retains a loop while warning when it has no exit", () => {
    const result = validateActivityGraph({
      schemaVersion: 1,
      title: "Loop",
      nodes: [
        { id: "start", type: "start", label: "Start" },
        { id: "loop", type: "loop", label: "Retry" },
        { id: "end", type: "end", label: "Done" },
      ],
      edges: [{ id: "back", from: "loop", to: "loop", kind: "loop" }],
      warnings: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(["loop-without-exit", "self-loop"]));
    }
  });

  it("does not warn when a retry cycle has a visible exit", () => {
    const result = validateActivityGraph({
      schemaVersion: 1,
      title: "Retry with exit",
      nodes: [
        { id: "start", type: "start", label: "Start" },
        { id: "decision", type: "decision", label: "Valid?" },
        { id: "retry", type: "step", label: "Fix input" },
        { id: "end", type: "end", label: "Done" },
      ],
      edges: [
        { id: "e1", from: "start", to: "decision" },
        { id: "e2", from: "decision", to: "retry", label: "no", kind: "branch" },
        { id: "e3", from: "retry", to: "decision", kind: "loop" },
        { id: "e4", from: "decision", to: "end", label: "yes", kind: "branch" },
      ],
      warnings: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.map((item) => item.code)).not.toContain("loop-without-exit");
    }
  });

  it("warns when a sourceRange falls outside the original memo", () => {
    const result = validateActivityGraph({
      schemaVersion: 1,
      title: "Range",
      nodes: [
        { id: "start", type: "start", label: "Start", sourceRange: { start: 99, end: 100 } },
        { id: "end", type: "end", label: "End" },
      ],
      edges: [{ id: "e", from: "start", to: "end" }],
      warnings: [],
    }, "short");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings.map((item) => item.code)).toContain("source-range-out-of-bounds");
  });
});
