import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { NOTE_HEADERS, GoogleSheetsClient, getSheetsClient } from './client'
import { Note, NoteCreateInputSchema, NoteUpdateInputSchema, NOTE_OWNER_ID, noteFromRow, noteToRow } from '@/domain/note'

export class RepositoryConfigurationError extends Error { constructor() { super('Persistence is not configured'); this.name = 'RepositoryConfigurationError' } }
export class NotFoundError extends Error { constructor() { super('Not found'); this.name = 'NotFoundError' } }
export class VersionConflictError extends Error { constructor() { super('Version conflict'); this.name = 'VersionConflictError' } }

export interface NotesStore {
  list(ownerId: string): Promise<Note[]>
  get(ownerId: string, id: string): Promise<Note | null>
  create(ownerId: string, input: unknown): Promise<Note>
  update(ownerId: string, id: string, input: unknown): Promise<Note>
  remove(ownerId: string, id: string): Promise<void>
}

export class NotesRepository implements NotesStore {
  private static readonly inFlight = new Map<string, Promise<Note>>()
  constructor(private readonly client: GoogleSheetsClient = getSheetsClient()) {}

  async list(ownerId = NOTE_OWNER_ID): Promise<Note[]> {
    const rows = await this.client.getRows('notes')
    return rows.map((row) => noteFromRow(row.values)).filter((note): note is Note => Boolean(note && note.ownerId === ownerId && !note.deletedAt))
  }

  async get(ownerId: string, id: string): Promise<Note | null> {
    const row = (await this.client.getRows('notes')).find((candidate) => candidate.values.id === id)
    const note = row ? noteFromRow(row.values) : null
    return note && note.ownerId === ownerId && !note.deletedAt ? note : null
  }

  async create(ownerId: string, input: unknown): Promise<Note> {
    const value = NoteCreateInputSchema.parse(input)
    if (value.requestId) {
      const ongoing = NotesRepository.inFlight.get(value.requestId)
      if (ongoing) return ongoing
      const operation = this.createIdempotent(ownerId, value)
      NotesRepository.inFlight.set(value.requestId, operation)
      try { return await operation } finally { NotesRepository.inFlight.delete(value.requestId) }
    }
    return this.createNew(ownerId, value)
  }

  private async createIdempotent(ownerId: string, value: z.infer<typeof NoteCreateInputSchema>): Promise<Note> {
    // A request UUID is itself a valid stable record UUID. Looking it up before
    // append makes retries idempotent without an extra transaction table.
    const existingRow = (await this.client.getRows('notes')).find((row) => row.values.id === value.requestId)
    const existing = existingRow ? noteFromRow(existingRow.values) : null
    if (existing && existing.ownerId === ownerId) return existing
    return this.createNew(ownerId, value)
  }

  private async createNew(ownerId: string, value: z.infer<typeof NoteCreateInputSchema>): Promise<Note> {
    const now = new Date().toISOString()
    const note: Note = {
      id: value.requestId ?? randomUUID(), ownerId, title: value.title, contentMarkdown: value.contentMarkdown,
      contentJson: value.contentJson ?? null, createdAt: now, updatedAt: now, version: 1, deletedAt: null,
    }
    await this.client.appendRow('notes', noteToRow(note))
    return note
  }

  async update(ownerId: string, id: string, input: unknown): Promise<Note> {
    const value = NoteUpdateInputSchema.parse(input)
    const rows = await this.client.getRows('notes')
    const target = rows.find((row) => row.values.id === id)
    const current = target ? noteFromRow(target.values) : null
    if (!target || !current || current.ownerId !== ownerId || current.deletedAt) throw new NotFoundError()
    if (current.version !== value.version) throw new VersionConflictError()
    const next: Note = {
      ...current,
      title: value.title ?? current.title,
      contentMarkdown: value.contentMarkdown ?? current.contentMarkdown,
      contentJson: value.contentJson === undefined ? current.contentJson : value.contentJson,
      updatedAt: new Date().toISOString(),
      version: current.version + 1,
    }
    await this.client.updateRow('notes', target.rowNumber, noteToRow(next))
    return next
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const rows = await this.client.getRows('notes')
    const target = rows.find((row) => row.values.id === id)
    const current = target ? noteFromRow(target.values) : null
    if (!target || !current || current.ownerId !== ownerId || current.deletedAt) throw new NotFoundError()
    const next: Note = { ...current, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: current.version + 1 }
    await this.client.updateRow('notes', target.rowNumber, noteToRow(next))
  }
}

export function createNotesRepository(): NotesRepository {
  return new NotesRepository()
}

/** Validate a row header contract in tests without making a network call. */
export const NOTES_COLUMNS = NOTE_HEADERS
