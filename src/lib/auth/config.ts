import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { getAuthConfig } from '../env'
import { checkLoginRateLimit, recordLoginFailure, recordLoginSuccess } from './rate-limit'
import { verifySharedPassword } from './password'
import { SHARED_USER_ID } from './constants'

function requestIdentifier(request: { headers?: Record<string, string | string[] | undefined> | Headers }): string {
  const headers = request.headers
  if (headers && 'get' in headers && typeof headers.get === 'function') {
    return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
  }
  const record = (headers ?? {}) as Record<string, string | string[] | undefined>
  const forwarded = record['x-forwarded-for']
  if (Array.isArray(forwarded)) return forwarded[0] || 'unknown'
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || 'unknown'
  const real = record['x-real-ip']
  return typeof real === 'string' && real ? real : 'unknown'
}

/** A stable generic error prevents configuration details leaking to clients. */
const invalidCredentials = 'パスワードを確認してください'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Shared password',
      credentials: { password: { label: 'Password', type: 'password' } },
      async authorize(credentials, request) {
        const identifier = requestIdentifier(request)
        const rate = checkLoginRateLimit(identifier)
        if (!rate.allowed) return null
        const check = await verifySharedPassword(credentials?.password)
        if (check === 'ok') {
          recordLoginSuccess(identifier)
          return { id: SHARED_USER_ID, name: 'FlowNote user' }
        }
        // Do not log password, hash, or request body. Rate-limit every failed
        // attempt, including a malformed configuration, without disclosing why.
        recordLoginFailure(identifier)
        return null
      },
    }),
  ],
  secret: authSecret(),
  session: { strategy: 'jwt', maxAge: authMaxAge() },
  jwt: { maxAge: authMaxAge() },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = SHARED_USER_ID
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub === SHARED_USER_ID) session.user.id = SHARED_USER_ID
      else if (session.user) session.user.id = ''
      return session
    },
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: authMaxAge() },
    },
  },
  pages: { signIn: '/login' },
  debug: false,
}

function authMaxAge(): number {
  const config = getAuthConfig()
  return config.ok ? config.maxAge : 43200
}

function authSecret(): string | undefined {
  const config = getAuthConfig()
  return config.ok ? config.secret : undefined
}

export { invalidCredentials }
