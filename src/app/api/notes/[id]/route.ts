import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureSameOrigin, jsonError, requireApiUser } from '@/lib/auth/api'
import { createNotesRepository } from '@/lib/sheets/notes-repository'
import { getMaxMemoLength } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }
const idSchema = z.string().uuid()

async function getId(context: Params): Promise<string | null> {
  const id = (await context.params).id
  return idSchema.safeParse(id).success ? id : null
}

export async function GET(_request: NextRequest, context: Params): Promise<NextResponse> {
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  const id = await getId(context)
  if (!id) return NextResponse.json({ error: { code: 'INVALID_ID', message: 'IDを確認してください。' } }, { status: 400 })
  try {
    const note = await createNotesRepository().get(auth.userId, id)
    return note ? NextResponse.json({ note }, { headers: { 'cache-control': 'no-store' } }) : NextResponse.json({ error: { code: 'NOT_FOUND', message: '対象が見つかりません。' } }, { status: 404 })
  } catch (error) { return jsonError(error) }
}

export async function PUT(request: NextRequest, context: Params): Promise<NextResponse> {
  const csrf = ensureSameOrigin(request)
  if (csrf) return csrf
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  const id = await getId(context)
  if (!id) return NextResponse.json({ error: { code: 'INVALID_ID', message: 'IDを確認してください。' } }, { status: 400 })
  try {
    const body = await request.json()
    const max = getMaxMemoLength()
    if (typeof body?.contentMarkdown === 'string' && body.contentMarkdown.length > max) return NextResponse.json({ error: { code: 'TOO_LARGE', message: `本文は${max}文字以内で入力してください。` } }, { status: 422 })
    const note = await createNotesRepository().update(auth.userId, id, body)
    return NextResponse.json({ note }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '入力を確認してください。' } }, { status: 422 })
    return jsonError(error)
  }
}

export async function DELETE(request: NextRequest, context: Params): Promise<NextResponse> {
  const csrf = ensureSameOrigin(request)
  if (csrf) return csrf
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  const id = await getId(context)
  if (!id) return NextResponse.json({ error: { code: 'INVALID_ID', message: 'IDを確認してください。' } }, { status: 400 })
  try { await createNotesRepository().remove(auth.userId, id); return new NextResponse(null, { status: 204 }) } catch (error) { return jsonError(error) }
}
