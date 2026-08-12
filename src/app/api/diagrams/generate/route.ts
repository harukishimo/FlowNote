import { generateActivityGraph, GeminiGenerationError } from "@/lib/gemini/client";
import { requireApiUser, ensureSameOrigin } from "@/lib/auth/api";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** POST /api/diagrams/generate — generation only; no repository writes. */
export async function POST(request: NextRequest): Promise<Response> {
  const csrf = ensureSameOrigin(request);
  if (csrf) return csrf;
  const auth = await requireApiUser();
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be JSON", 400);
  }
  if (!body || typeof body !== "object") {
    return errorResponse("INVALID_REQUEST", "Request body must be an object", 400);
  }
  const record = body as Record<string, unknown>;
  const sourceText = record.text ?? record.content ?? record.markdown ?? record.contentMarkdown ?? record.content_markdown ?? record.memo;
  if (typeof sourceText !== "string" || !sourceText.trim()) {
    return errorResponse("INVALID_INPUT", "Memo text is required", 422);
  }

  try {
    const result = await generateActivityGraph(sourceText);
    return Response.json(result.graph, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof GeminiGenerationError) {
      return errorResponse(error.code, error.message, error.status);
    }
    return errorResponse("UPSTREAM_ERROR", "Diagram generation failed", 502);
  }
}
