import { describe, expect, it } from "vitest";
import type { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_GEMINI_MODEL, generateActivityGraph, GeminiGenerationError } from "./client";

const validModelResponse = JSON.stringify({
  schemaVersion: 1,
  title: "Simple flow",
  nodes: [
    { id: "start", type: "start", label: "Start", actor: null, sourceRange: null, confidence: 1 },
    { id: "step-1", type: "step", label: "Do it", actor: null, sourceRange: { start: 0, end: 5 }, confidence: 0.8 },
    { id: "end", type: "end", label: "End", actor: null, sourceRange: null, confidence: 1 },
  ],
  edges: [
    { id: "e1", from: "start", to: "step-1", label: null, kind: "normal" },
    { id: "e2", from: "step-1", to: "end", label: null, kind: "normal" },
  ],
  warnings: [],
});

describe("generateActivityGraph", () => {
  it("fails closed with a 503 configuration error when the key is absent", async () => {
    try {
      await generateActivityGraph("hello", { apiKey: "" });
      throw new Error("expected generation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiGenerationError);
      expect((error as GeminiGenerationError).code).toBe("CONFIGURATION_ERROR");
      expect((error as GeminiGenerationError).status).toBe(503);
    }
  });

  it("uses Structured Output and validates the model response", async () => {
    let generationConfig: Record<string, unknown> | undefined;
    const fakeClient = {
      getGenerativeModel: ({ generationConfig: config }: { generationConfig: Record<string, unknown> }) => {
        generationConfig = config;
        return { generateContent: async () => ({ response: { text: () => validModelResponse } }) };
      },
    } as unknown as GoogleGenerativeAI;
    const result = await generateActivityGraph("Do it", { client: fakeClient });
    expect(result.graph.nodes).toHaveLength(3);
    expect(result.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(generationConfig?.responseMimeType).toBe("application/json");
    expect(generationConfig?.responseSchema).toBeDefined();
    expect(generationConfig).not.toHaveProperty("temperature");
    expect(generationConfig?.responseSchema).toMatchObject({
      properties: {
        schemaVersion: { type: "integer", minimum: 1, maximum: 1 },
      },
    });
  });

  it("runs one repair pass when a decision is missing a branch", async () => {
    const incomplete = JSON.stringify({
      schemaVersion: 1,
      title: "Approval",
      nodes: [
        { id: "start", type: "start", label: "Start", actor: null, sourceRange: null, confidence: 1 },
        { id: "decision", type: "decision", label: "Approved?", actor: null, sourceRange: null, confidence: 0.9 },
        { id: "approved", type: "step", label: "Continue", actor: null, sourceRange: null, confidence: 0.9 },
        { id: "end", type: "end", label: "End", actor: null, sourceRange: null, confidence: 1 },
      ],
      edges: [
        { id: "e1", from: "start", to: "decision", label: null, kind: "normal" },
        { id: "e2", from: "decision", to: "approved", label: "yes", kind: "branch" },
        { id: "e3", from: "approved", to: "end", label: null, kind: "normal" },
      ],
      warnings: [],
    });
    const repaired = JSON.stringify({
      schemaVersion: 1,
      title: "Approval",
      nodes: [
        { id: "start", type: "start", label: "Start", actor: null, sourceRange: null, confidence: 1 },
        { id: "decision", type: "decision", label: "Approved?", actor: null, sourceRange: null, confidence: 0.9 },
        { id: "approved", type: "step", label: "Continue", actor: null, sourceRange: null, confidence: 0.9 },
        { id: "rejected", type: "step", label: "Return", actor: null, sourceRange: null, confidence: 0.9 },
        { id: "end", type: "end", label: "End", actor: null, sourceRange: null, confidence: 1 },
      ],
      edges: [
        { id: "e1", from: "start", to: "decision", label: null, kind: "normal" },
        { id: "e2", from: "decision", to: "approved", label: "yes", kind: "branch" },
        { id: "e3", from: "decision", to: "rejected", label: "no", kind: "branch" },
        { id: "e4", from: "approved", to: "end", label: null, kind: "normal" },
        { id: "e5", from: "rejected", to: "end", label: null, kind: "normal" },
      ],
      warnings: [],
    });
    let calls = 0;
    const fakeClient = {
      getGenerativeModel: () => ({
        generateContent: async () => {
          const text = calls === 0 ? incomplete : repaired;
          calls += 1;
          return { response: { text: () => text } };
        },
      }),
    } as unknown as GoogleGenerativeAI;

    const result = await generateActivityGraph("Approval flow", { client: fakeClient });
    expect(calls).toBe(2);
    expect(result.graph.edges.filter((edge) => edge.from === "decision")).toHaveLength(2);
    expect(result.graph.warnings.map((item) => item.code)).not.toContain("decision-without-branches");
  });

  it("rejects empty and overlong input before calling Gemini", async () => {
    await expect(generateActivityGraph("   ", { apiKey: "test-key" })).rejects.toMatchObject({ code: "INPUT_ERROR", status: 422 });
    await expect(generateActivityGraph("x".repeat(20_001), { apiKey: "test-key" })).rejects.toMatchObject({ code: "INPUT_ERROR", status: 422 });
  });
});
