import { buildStandaloneHtml, HtmlExportValidationError, type BuildHtmlOptions } from "@/lib/export/build-html";
import { requireApiUser, ensureSameOrigin } from "@/lib/auth/api";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** POST /api/exports/html — deterministic, non-persistent HTML generation. */
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
  if (!record.graph || typeof record.graph !== "object") {
    return errorResponse("INVALID_INPUT", "ActivityGraph is required", 422);
  }

  const rawOptions = record.options && typeof record.options === "object"
    ? record.options as Record<string, unknown>
    : record.config && typeof record.config === "object"
      ? record.config as Record<string, unknown>
      : record;
  const options: BuildHtmlOptions = {
    title: typeof rawOptions.title === "string" ? rawOptions.title : undefined,
    summary: typeof rawOptions.summary === "string" ? rawOptions.summary : undefined,
    orientation: rawOptions.orientation === "horizontal" || rawOptions.layout === "wide" ? "horizontal" : "vertical",
    showWarnings: rawOptions.showWarnings !== false,
    showSources: rawOptions.showSources === true,
    accentColor: typeof rawOptions.accentColor === "string" ? rawOptions.accentColor : typeof rawOptions.accent === "string" ? rawOptions.accent : undefined,
  };

  try {
    const html = buildStandaloneHtml(record.graph, options);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": "inline; filename=flownote-activity.html",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof HtmlExportValidationError) {
      return errorResponse(error.code, error.message, 422);
    }
    return errorResponse("EXPORT_ERROR", "HTML export failed", 500);
  }
}
