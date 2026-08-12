import { z } from 'zod'
import { ActivityGraphSchema, type ActivityGraph } from '../lib/activity/schema'

export { ActivityGraphSchema }
export type { ActivityGraph }

export const SnapshotLayoutSchema = z.record(z.string().max(100), z.unknown()).default({})

export const DiagramSnapshotSchema = z.object({
  id: z.string().uuid(),
  noteId: z.string().uuid(),
  graph: ActivityGraphSchema,
  warnings: z.array(z.unknown()).default([]),
  summary: z.string().max(5000),
  layoutConfig: SnapshotLayoutSchema,
  savedAt: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
  requestId: z.string().uuid().nullable().optional(),
})

export type DiagramSnapshot = z.infer<typeof DiagramSnapshotSchema>

export const SnapshotCreateInputSchema = z.object({
  noteId: z.string().uuid(),
  graph: ActivityGraphSchema,
  warnings: z.array(z.unknown()).max(500).default([]),
  summary: z.string().max(5000).default(''),
  layoutConfig: SnapshotLayoutSchema,
  requestId: z.string().uuid(),
})

export function snapshotToRow(snapshot: DiagramSnapshot): (string | number)[] {
  return [
    snapshot.id,
    snapshot.noteId,
    JSON.stringify(snapshot.graph),
    JSON.stringify(snapshot.warnings),
    snapshot.summary,
    JSON.stringify(snapshot.layoutConfig),
    snapshot.savedAt,
    snapshot.version,
    snapshot.requestId ?? '',
  ]
}

export function snapshotFromRow(row: Record<string, string>): DiagramSnapshot | null {
  try {
    const parsed = DiagramSnapshotSchema.safeParse({
      id: row.id,
      noteId: row.note_id,
      graph: JSON.parse(row.graph_json || '{}'),
      warnings: JSON.parse(row.warnings_json || '[]'),
      summary: row.summary || '',
      layoutConfig: JSON.parse(row.layout_config_json || '{}'),
      savedAt: row.saved_at,
      version: Number(row.version),
      requestId: row.request_id || null,
    })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
