import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureSameOrigin, jsonError, requireApiUser } from '@/lib/auth/api'
import { createNotesRepository } from '@/lib/sheets/notes-repository'
import { getMaxMemoLength } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  try {
    const notes = await createNotesRepository().list(auth.userId)
    return NextResponse.json({ notes }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) { return jsonError(error) }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = ensureSameOrigin(request)
  if (csrf) return csrf
  const auth = await requireApiUser()
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const max = getMaxMemoLength()
    if (typeof body?.contentMarkdown === 'string' && body.contentMarkdown.length > max) return NextResponse.json({ error: { code: 'TOO_LARGE', message: `本文は${max}文字以内で入力してください。` } }, { status: 422 })
    const note = await createNotesRepository().create(auth.userId, body)
    return NextResponse.json({ note }, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '入力を確認してください。' } }, { status: 422 })
    return jsonError(error)
  }
}
