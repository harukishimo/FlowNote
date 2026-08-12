/** Gemini-facing schema exports are kept separate from the client adapter so
 * route handlers and tests can inspect the contract without initializing an
 * SDK client or reading environment secrets. */
export {
  ActivityGraphSchema,
  ActivityEdgeSchema,
  ActivityNodeSchema,
  ActivityWarningSchema,
  SourceRangeSchema,
  GEMINI_ACTIVITY_GRAPH_JSON_SCHEMA,
  type ActivityGraph,
  type ActivityEdge,
  type ActivityNode,
  type ActivityWarning,
  type SourceRange,
} from "@/lib/activity/schema";

export { ActivityGraphSchema as activityGraphSchema, GEMINI_ACTIVITY_GRAPH_JSON_SCHEMA as geminiResponseSchema } from "@/lib/activity/schema";
