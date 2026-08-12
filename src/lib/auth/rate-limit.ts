import { createHmac } from 'node:crypto'
import { getAuthConfig } from '../env'

type Bucket = { failures: number[]; blockedUntil: number }
const buckets = new Map<string, Bucket>()

function keyFor(identifier: string): string {
  const config = getAuthConfig()
  // The identifier never appears in logs and is HMAC'd before it is retained
  // in memory, limiting accidental disclosure from diagnostics.
  return createHmac('sha256', config.ok ? config.secret : 'flownote-rate-limit-unconfigured').update(identifier || 'unknown').digest('hex')
}

function prune(now: number, windowMs: number): void {
  for (const [key, bucket] of buckets) {
    bucket.failures = bucket.failures.filter((timestamp) => timestamp > now - windowMs)
    if (bucket.blockedUntil <= now && bucket.failures.length === 0) buckets.delete(key)
  }
  // Avoid an unbounded in-memory store on long-lived development processes.
  if (buckets.size > 10_000) {
    const first = buckets.keys().next().value
    if (first) buckets.delete(first)
  }
}

export function checkLoginRateLimit(identifier: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const config = getAuthConfig()
  if (!config.ok) return { allowed: false, retryAfterSeconds: 0 }
  const windowMs = config.windowSeconds * 1000
  prune(now, windowMs)
  const bucket = buckets.get(keyFor(identifier))
  if (!bucket) return { allowed: true, retryAfterSeconds: 0 }
  if (bucket.blockedUntil > now) return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) }
  return { allowed: bucket.failures.length < config.maxAttempts, retryAfterSeconds: 0 }
}

export function recordLoginFailure(identifier: string, now = Date.now()): void {
  const config = getAuthConfig()
  if (!config.ok) return
  const key = keyFor(identifier)
  const windowMs = config.windowSeconds * 1000
  const bucket = buckets.get(key) ?? { failures: [], blockedUntil: 0 }
  bucket.failures = bucket.failures.filter((timestamp) => timestamp > now - windowMs)
  bucket.failures.push(now)
  if (bucket.failures.length >= config.maxAttempts) bucket.blockedUntil = now + windowMs
  buckets.set(key, bucket)
}

export function recordLoginSuccess(identifier: string): void {
  buckets.delete(keyFor(identifier))
}

/** Test isolation only; not exported from any route. */
export function resetLoginRateLimits(): void {
  buckets.clear()
}
