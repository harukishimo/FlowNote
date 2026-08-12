import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureSameOrigin, jsonError, requireApiUser } from '@/lib/auth/api'
import { createNotesRepository } from '@/lib/sheets/notes-repository'
import { SnapshotRepository } from '@/lib/sheets/snapshots-repository'
import { SnapshotCreateInputSchema } from '@/domain/snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  const noteId = request.nextUrl.searchParams.get('noteId')
  if (noteId && !z.string().uuid().safeParse(noteId).success) return NextResponse.json({ error: { code: 'INVALID_ID', message: 'IDを確認してください。' } }, { status: 400 })
  try {
    // Ownership check prevents one shared account's future partitioning from
    // accidentally exposing another owner's snapshots.
    if (noteId) {
      const note = await createNotesRepository().get(auth.userId, noteId)
      if (!note) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '対象が見つかりません。' } }, { status: 404 })
    }
    const snapshots = await new SnapshotRepository().list(noteId ?? undefined)
    return NextResponse.json({ snapshots }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) { return jsonError(error) }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = ensureSameOrigin(request)
  if (csrf) return csrf
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const value = SnapshotCreateInputSchema.parse(body)
    const note = await createNotesRepository().get(auth.userId, value.noteId)
    if (!note) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '対象が見つかりません。' } }, { status: 404 })
    const snapshot = await new SnapshotRepository().create(value)
    return NextResponse.json({ snapshot }, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '入力を確認してください。' } }, { status: 422 })
    return jsonError(error)
  }
}
