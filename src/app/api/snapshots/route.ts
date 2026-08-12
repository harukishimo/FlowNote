import { GET as getSnapshots, POST as postSnapshots } from '../diagram-snapshots/route'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET(request: NextRequest): Promise<NextResponse> { return getSnapshots(request) }
export function POST(request: NextRequest): Promise<NextResponse> { return postSnapshots(request) }
