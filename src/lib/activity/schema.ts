import { z } from "zod";

/**
 * A character range in the source memo. Both ends are inclusive and are
 * measured in JavaScript string code units. Keeping this deliberately small
 * makes the schema useful for Gemini responseSchema as well as for local
 * validation.
 */
export const SourceRangeSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })
  .refine((range) => range.end >= range.start, {
    message: "sourceRange.end must be greater than or equal to start",
    path: ["end"],
  });

export const ActivityNodeTypeSchema = z.enum([
  "start",
  "step",
  // "action" was used by the first version of the technical specification.
  // It remains accepted at the boundary so old drafts can be rendered.
  "action",
  "decision",
  "merge",
  "parallel",
  "loop",
  "end",
]);

export const ActivityEdgeKindSchema = z.enum(["normal", "branch", "loop"]);

export const ActivityNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    type: ActivityNodeTypeSchema,
    label: z.string().max(2_000),
    actor: z.string().max(256).nullable().optional().default(null),
    sourceRange: SourceRangeSchema.nullable().optional().default(null),
    confidence: z.number().min(0).max(1).optional().default(1),
  })
  .strict();

export const ActivityEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    from: z.string().trim().min(1).max(128),
    to: z.string().trim().min(1).max(128),
    label: z.string().max(512).nullable().optional().default(null),
    kind: ActivityEdgeKindSchema.optional().default("normal"),
  })
  .strict();

export const ActivityWarningSchema = z
  .object({
    code: z.string().trim().min(1).max(128),
    message: z.string().max(2_000),
    sourceRange: SourceRangeSchema.nullable().optional().default(null),
  })
  .strict();

export const ActivityGraphSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    title: z.string().max(512).optional().default("Activity diagram"),
    nodes: z.array(ActivityNodeSchema).max(500),
    edges: z.array(ActivityEdgeSchema).max(1_000).default([]),
    warnings: z.array(ActivityWarningSchema).max(500).default([]),
  })
  .strict();

export type SourceRange = z.infer<typeof SourceRangeSchema>;
export type ActivityNode = z.infer<typeof ActivityNodeSchema>;
export type ActivityEdge = z.infer<typeof ActivityEdgeSchema>;
export type ActivityWarning = z.infer<typeof ActivityWarningSchema>;
export type ActivityGraph = z.infer<typeof ActivityGraphSchema>;

/** JSON Schema accepted by Gemini's responseSchema Structured Output option. */
export const GEMINI_ACTIVITY_GRAPH_JSON_SCHEMA = {
  type: "object",
  properties: {
    // Gemini Structured Output accepts string enums, but rejects numeric enum
    // values on Gemini 3.6 Flash. min/max preserves the exact value constraint.
    schemaVersion: { type: "integer", minimum: 1, maximum: 1 },
    title: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: ["start", "step", "decision", "merge", "parallel", "loop", "end"],
          },
          label: { type: "string" },
          actor: { type: "string", nullable: true },
          sourceRange: {
            type: "object",
            nullable: true,
            properties: {
              start: { type: "integer", minimum: 0 },
              end: { type: "integer", minimum: 0 },
            },
            required: ["start", "end"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["id", "type", "label", "actor", "sourceRange", "confidence"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          label: { type: "string", nullable: true },
          kind: { type: "string", enum: ["normal", "branch", "loop"] },
        },
        required: ["id", "from", "to", "label", "kind"],
      },
    },
    warnings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          sourceRange: {
            type: "object",
            nullable: true,
            properties: {
              start: { type: "integer", minimum: 0 },
              end: { type: "integer", minimum: 0 },
            },
            required: ["start", "end"],
          },
        },
        required: ["code", "message", "sourceRange"],
      },
    },
  },
  required: ["schemaVersion", "title", "nodes", "edges", "warnings"],
} as const;

/**
 * Keep the output contract deterministic. Gemini occasionally emits the old
 * `action` spelling; it is normalized to the current `step` spelling here.
 */
export function normalizeActivityGraph(graph: ActivityGraph): ActivityGraph {
  return {
    ...graph,
    schemaVersion: 1,
    title: graph.title.trim() || "Activity diagram",
    nodes: graph.nodes.map((node) => ({
      ...node,
      type: node.type === "action" ? "step" : node.type,
      label: node.label.trim(),
      actor: node.actor?.trim() || null,
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      label: edge.label?.trim() || null,
    })),
    warnings: graph.warnings.map((warning) => ({
      ...warning,
      code: warning.code.trim(),
      message: warning.message.trim(),
    })),
  };
}
