// Hono middleware mirroring backend/src/middleware/auth.ts 1:1. Each Edge
// Function bundles both public and protected sub-routes in one Hono app, so
// auth is enforced here (app code) rather than via the platform's verify_jwt
// gate - that gate would 401 anonymous requests (login/signup) before our
// code even runs. Deployed with verify_jwt: false for every function; this
// file is the single source of truth for who's allowed to call what.
import type { Context, Next } from 'jsr:@hono/hono@4'
import { getUserClient, getAdminClient } from './supabaseClients.ts'

export type AuthEnv = {
  Variables: {
    userId: string
    userRole: string
    token: string
  }
}

export async function requireAuth(c: Context<AuthEnv>, next: Next) {
  const token = (c.req.header('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return c.json({ error: 'No token provided' }, 401)

  const client = getUserClient(token)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return c.json({ error: 'Invalid or expired token' }, 401)

  c.set('userId', data.user.id)
  c.set('userRole', (data.user.app_metadata?.role as string) ?? 'student')
  c.set('token', token)
  await next()
}

// profiles.role is the single source of truth for admin rights (looked up
// with the service client, bypassing RLS) - matches the Express version.
export async function requireAdmin(c: Context<AuthEnv>, next: Next) {
  const userId = c.get('userId')
  if (!userId) return c.json({ error: 'Not authenticated' }, 401)

  const db = getAdminClient()
  const { data, error } = await db.from('profiles').select('role').eq('id', userId).single()
  if (error || data?.role !== 'admin') return c.json({ error: 'Admin access required' }, 403)

  c.set('userRole', 'admin')
  await next()
}

// Blocks paid features when a student's access has lapsed. Reads the
// caller's OWN profile with their JWT (not the service client) - RLS lets a
// user read their own row, and column GRANTs forbid them from writing
// role/suspended/access_end, so these gate fields stay tamper-proof.
export async function requireActiveAccess(c: Context<AuthEnv>, next: Next) {
  const userId = c.get('userId')
  const token = c.get('token')
  if (!userId) return c.json({ error: 'Not authenticated' }, 401)

  const db = getUserClient(token)
  const { data, error } = await db.from('profiles').select('role, suspended, access_end').eq('id', userId).single()
  if (error || !data) return c.json({ error: 'Access check failed' }, 403)

  if (data.role === 'admin') return next() // admins bypass access limits

  if (data.suspended) {
    return c.json({ error: 'Your account is suspended. Please contact your coach.', code: 'suspended' }, 403)
  }
  const today = new Date().toISOString().slice(0, 10)
  if (data.access_end && data.access_end < today) {
    return c.json({
      error: 'Your access period has ended. Renew your plan to continue.',
      code: 'access_expired',
      access_end: data.access_end,
    }, 403)
  }
  await next()
}
