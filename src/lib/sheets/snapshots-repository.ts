import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { GoogleSheetsClient, SNAPSHOT_HEADERS, getSheetsClient } from './client'
import { DiagramSnapshot, SnapshotCreateInputSchema, snapshotFromRow, snapshotToRow } from '@/domain/snapshot'

export class SnapshotRepository {
  private static readonly inFlight = new Map<string, Promise<DiagramSnapshot>>()
  constructor(private readonly client: GoogleSheetsClient = getSheetsClient()) {}

  async list(noteId?: string): Promise<DiagramSnapshot[]> {
    const rows = await this.client.getRows('snapshots')
    return rows.map((row) => snapshotFromRow(row.values)).filter((snapshot): snapshot is DiagramSnapshot => Boolean(snapshot && (!noteId || snapshot.noteId === noteId)))
  }

  async create(input: unknown): Promise<DiagramSnapshot> {
    const value = SnapshotCreateInputSchema.parse(input)
    const ongoing = SnapshotRepository.inFlight.get(value.requestId)
    if (ongoing) return ongoing
    const operation = this.createIdempotent(value)
    SnapshotRepository.inFlight.set(value.requestId, operation)
    try { return await operation } finally { SnapshotRepository.inFlight.delete(value.requestId) }
  }

  private async createIdempotent(value: z.infer<typeof SnapshotCreateInputSchema>): Promise<DiagramSnapshot> {
    // request_id is the idempotency key. Replaying a request returns the first
    // row rather than appending duplicate data.
    const previous = await this.list(value.noteId)
    const existing = previous.find((snapshot) => snapshot.requestId === value.requestId)
    if (existing) return existing
    const snapshot: DiagramSnapshot = {
      id: randomUUID(), noteId: value.noteId, graph: value.graph, warnings: value.warnings,
      summary: value.summary, layoutConfig: value.layoutConfig, savedAt: new Date().toISOString(),
      version: previous.reduce((highest, item) => Math.max(highest, item.version), 0) + 1,
      requestId: value.requestId,
    }
    await this.client.appendRow('snapshots', snapshotToRow(snapshot))
    return snapshot
  }
}

export const SNAPSHOT_COLUMNS = SNAPSHOT_HEADERS
