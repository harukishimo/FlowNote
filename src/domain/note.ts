import { z } from 'zod'

export const NOTE_OWNER_ID = 'shared-password-user'

export const NoteSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().min(1),
  title: z.string(),
  contentMarkdown: z.string(),
  /** Editor JSON is a cache; Markdown remains the canonical representation. */
  contentJson: z.unknown().nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
})

export type Note = z.infer<typeof NoteSchema>

export const NoteCreateInputSchema = z.object({
  title: z.string().trim().max(500).default('無題のメモ'),
  contentMarkdown: z.string(),
  contentJson: z.unknown().nullable().optional(),
  requestId: z.string().uuid().optional(),
})

export const NoteUpdateInputSchema = z.object({
  title: z.string().trim().max(500).optional(),
  contentMarkdown: z.string().optional(),
  contentJson: z.unknown().nullable().optional(),
  version: z.number().int().positive(),
  requestId: z.string().uuid().optional(),
})

export function noteToRow(note: Note): (string | number)[] {
  return [
    note.id,
    note.ownerId,
    note.title,
    note.contentMarkdown,
    JSON.stringify(note.contentJson ?? null),
    note.createdAt,
    note.updatedAt,
    note.version,
    note.deletedAt ?? '',
  ]
}

export function noteFromRow(row: Record<string, string>): Note | null {
  try {
    const parsed = NoteSchema.safeParse({
      id: row.id,
      ownerId: row.owner_id,
      title: row.title ?? '',
      contentMarkdown: row.content_markdown ?? '',
      contentJson: row.content_json ? JSON.parse(row.content_json) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: Number(row.version),
      deletedAt: row.deleted_at || null,
    })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
