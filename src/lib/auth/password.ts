import argon2 from 'argon2'
import { ARGON2ID_PHC, getAuthConfig } from '../env'

export type PasswordCheck = 'ok' | 'invalid' | 'unavailable'

export function isArgon2idHash(value: string | undefined | null): boolean {
  return typeof value === 'string' && ARGON2ID_PHC.test(value)
}

/**
 * Verify only in a Node.js server context.  The return value deliberately
 * does not distinguish a malformed/missing secret from a bad password to the
 * browser, while callers can use `unavailable` to return a 503 internally.
 */
export async function verifySharedPassword(password: unknown): Promise<PasswordCheck> {
  if (typeof password !== 'string' || password.length === 0) return 'invalid'
  const config = getAuthConfig()
  if (!config.ok) return 'unavailable'
  try {
    return (await argon2.verify(config.passwordHash, password)) ? 'ok' : 'invalid'
  } catch {
    return 'unavailable'
  }
}
