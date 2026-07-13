// Postgres-backed rate limiter, replacing the in-memory Maps from the
// Express backend (voiceHits in speaking.ts, express-rate-limit in index.ts
// and auth.ts) - those cannot survive across stateless Edge Function
// invocations. Atomic via the check_rate_limit() SQL function (fixed window,
// upsert with ON CONFLICT), locked to service_role only.
import type { Context, Next } from 'jsr:@hono/hono@4'
import { getAdminClient } from './supabaseClients.ts'
import type { AuthEnv } from './auth.ts'

export async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const db = getAdminClient()
  const { data, error } = await db.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('[rateLimit] check_rate_limit failed, failing open:', error)
    return true // fail open - never let a rate-limit outage take down the app
  }
  return data as boolean
}

// Hono middleware factory. keyFn builds the rate-limit key per-request
// (e.g. IP, IP+email, userId) - mirrors express-rate-limit's keyGenerator.
export function rateLimitMiddleware(opts: {
  max: number
  windowSeconds: number
  keyFn: (c: Context<AuthEnv>) => string
  message?: string
}) {
  return async (c: Context<AuthEnv>, next: Next) => {
    const key = opts.keyFn(c)
    const ok = await checkRateLimit(key, opts.max, opts.windowSeconds)
    if (!ok) {
      return c.json({ error: opts.message ?? 'Too many requests. Please wait and try again.' }, 429)
    }
    await next()
  }
}

// Best-effort request IP, mirroring Express's req.ip behind 'trust proxy'.
// Deno Deploy / Supabase Edge Functions sit behind their own edge proxy, so
// the real client IP arrives via x-forwarded-for.
export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return c.req.header('cf-connecting-ip') ?? 'unknown'
}
