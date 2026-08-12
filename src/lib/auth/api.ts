import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuthenticatedUser } from './session'

export async function requireApiUser(): Promise<{ userId: string } | NextResponse> {
  const user = await requireAuthenticatedUser()
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です。' } }, { status: 401 })
  return { userId: user.id }
}

/** Same-origin check for cookie-authenticated mutating requests. */
export function ensureSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: { code: 'CSRF', message: 'リクエストを確認してください。' } }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: { code: 'CSRF', message: 'リクエストを確認してください。' } }, { status: 403 })
  }
  return null
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof Error && error.name === 'RepositoryConfigurationError') return NextResponse.json({ error: { code: 'CONFIGURATION', message: '保存機能が設定されていません。' } }, { status: 503 })
  if (error instanceof Error && error.name === 'SheetsConfigurationError') return NextResponse.json({ error: { code: 'CONFIGURATION', message: '保存機能が設定されていません。' } }, { status: 503 })
  if (error instanceof Error && error.name === 'VersionConflictError') return NextResponse.json({ error: { code: 'CONFLICT', message: '内容が更新されています。再読み込みしてください。' } }, { status: 409 })
  if (error instanceof Error && error.name === 'NotFoundError') return NextResponse.json({ error: { code: 'NOT_FOUND', message: '対象が見つかりません。' } }, { status: 404 })
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: 'INVALID_JSON', message: '入力を確認してください。' } }, { status: 400 })
  return NextResponse.json({ error: { code: 'INTERNAL', message: '処理に失敗しました。' } }, { status: 502 })
}
