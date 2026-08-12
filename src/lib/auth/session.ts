import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from './config'
import { getAuthConfig } from '../env'
import { SHARED_USER_ID } from './constants'

export type AuthenticatedUser = { id: typeof SHARED_USER_ID; session: Session }

export async function getCurrentSession(): Promise<Session | null> {
  if (!getAuthConfig().ok) return null
  try {
    return await getServerSession(authOptions)
  } catch {
    return null
  }
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getCurrentSession()
  if (session?.user?.id !== SHARED_USER_ID) return null
  return { id: SHARED_USER_ID, session }
}

export function authIsConfigured(): boolean {
  return getAuthConfig().ok
}

export { SHARED_USER_ID }
