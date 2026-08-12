import { describe, expect, it } from "vitest";
import { buildStandaloneHtml, escapeHtml } from "./build-html";

const graph = {
  schemaVersion: 1 as const,
  title: "<unsafe title>",
  nodes: [
    { id: "start", type: "start" as const, label: "<Start>" },
    { id: "end", type: "end" as const, label: "Done" },
  ],
  edges: [{ id: "e", from: "start", to: "end", label: "<go>", kind: "normal" as const }],
  warnings: [{ code: "memo", message: "<check>", sourceRange: null }],
};

describe("buildStandaloneHtml", () => {
  it("escapes graph text and emits a standalone document", () => {
    const html = buildStandaloneHtml(graph, { summary: "</p><script>alert(1)</script>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("&lt;unsafe title&gt;");
    expect(html).toContain("&lt;Start&gt;");
    expect(html).toContain("&lt;go&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).toContain("default-src 'none'");
  });

  it("is deterministic for the same graph and layout", () => {
    const first = buildStandaloneHtml(graph, { orientation: "horizontal", showWarnings: false });
    const second = buildStandaloneHtml(graph, { orientation: "horizontal", showWarnings: false });
    expect(first).toBe(second);
    expect(first).not.toContain("Warnings");
  });

  it("accepts a DiagramSnapshot-like wrapper without persisting it", () => {
    const html = buildStandaloneHtml({ graph, config: { title: "Wrapper", summary: "Brief", layout: "wide", accent: "#123456" } });
    expect(html).toContain("Wrapper");
    expect(html).toContain("Brief");
    expect(html).toContain("#123456");
  });

  it("renders an empty draft graph with semantic warnings", () => {
    const html = buildStandaloneHtml({ nodes: [], edges: [], warnings: [] });
    expect(html).toContain("Activity diagram");
    expect(html).toContain("missing-start");
  });

  it("places decision branches at different horizontal coordinates", () => {
    const branching = {
      schemaVersion: 1 as const,
      title: "Branch",
      nodes: [
        { id: "start", type: "start" as const, label: "Start" },
        { id: "decision", type: "decision" as const, label: "OK?" },
        { id: "yes", type: "step" as const, label: "Continue" },
        { id: "no", type: "step" as const, label: "Return" },
        { id: "end", type: "end" as const, label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "decision" },
        { id: "e2", from: "decision", to: "yes", label: "yes", kind: "branch" as const },
        { id: "e3", from: "decision", to: "no", label: "no", kind: "branch" as const },
        { id: "e4", from: "yes", to: "end" },
        { id: "e5", from: "no", to: "end" },
      ],
      warnings: [],
    };
    const html = buildStandaloneHtml(branching);
    const yesRect = html.match(/data-node-id="yes"><rect x="([\d.]+)"/);
    const noRect = html.match(/data-node-id="no"><rect x="([\d.]+)"/);
    expect(yesRect?.[1]).toBeDefined();
    expect(noRect?.[1]).toBeDefined();
    expect(yesRect?.[1]).not.toBe(noRect?.[1]);
    expect(html).toContain("yes");
    expect(html).toContain("no");
  });
});

describe("escapeHtml", () => {
  it("escapes all HTML metacharacters", () => {
    expect(escapeHtml(`& < > \" '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });
});
