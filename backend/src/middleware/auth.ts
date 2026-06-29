import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../lib/supabase'

export interface AuthRequest extends Request {
  userId: string
  userRole: string
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Idempotent: if an outer mount already authenticated this request
  // (e.g. requireAuth → requireActiveAccess → router), skip the second
  // getUser round-trip so a voice session isn't double-validated per call.
  if ((req as AuthRequest).userId) return next()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    // Create a per-request client that uses the user's own JWT - this is the
    // correct pattern for Supabase server-side token validation
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    ;(req as AuthRequest).userId = data.user.id
    ;(req as AuthRequest).userRole = (data.user.app_metadata?.role as string) ?? 'student'
    next()
  } catch (err) {
    console.error('Auth error:', err)
    return res.status(500).json({ error: 'Auth service error' })
  }
}

// profiles.role is the single source of truth for admin rights. We look it up
// with the service client (bypasses RLS) rather than trusting the JWT claim,
// so promoting someone to admin in the DB takes effect immediately.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as AuthRequest).userId
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  // The admin panel needs the service-role key to bypass RLS. If it's missing,
  // say so explicitly instead of a generic 500 - this is the usual cause.
  let db
  try {
    db = getAdminClient()
  } catch {
    return res.status(503).json({
      error: 'Admin panel not configured: SUPABASE_SERVICE_KEY is missing in the backend .env. Add the service_role key and restart the backend.',
      code: 'service_key_missing',
    })
  }

  try {
    const { data, error } = await db
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (error || data?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }
    ;(req as AuthRequest).userRole = 'admin'
    next()
  } catch {
    return res.status(500).json({ error: 'Admin check failed' })
  }
}

// Blocks paid features when a student's access has lapsed. An admin sets the
// paid window (access_end) or suspends an account in the Admin Panel; this
// enforces it server-side so no AI cost is incurred after access ends.
// - suspended = true  → blocked (code 'suspended')
// - access_end < today → blocked (code 'access_expired')
// - access_end null    → no limit (free/lifetime), allowed
// Admins are never blocked. Must run AFTER requireAuth (needs userId).
export async function requireActiveAccess(req: Request, res: Response, next: NextFunction) {
  const userId = (req as AuthRequest).userId
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })
  try {
    // Read the caller's OWN profile with their JWT (not the service client).
    // RLS lets a user read their own row, and column GRANTs forbid them from
    // writing role/suspended/access_end, so these gate fields stay tamper-proof
    // while keeping the AI hot path independent of the service key.
    const token = (req.headers.authorization ?? '').replace('Bearer ', '')
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await db
      .from('profiles')
      .select('role, suspended, access_end')
      .eq('id', userId)
      .single()
    if (error || !data) return res.status(403).json({ error: 'Access check failed' })

    if (data.role === 'admin') return next() // admins bypass access limits

    if (data.suspended) {
      return res.status(403).json({
        error: 'Your account is suspended. Please contact your coach.',
        code: 'suspended',
      })
    }
    const today = new Date().toISOString().slice(0, 10)
    if (data.access_end && data.access_end < today) {
      return res.status(403).json({
        error: 'Your access period has ended. Renew your plan to continue.',
        code: 'access_expired',
        access_end: data.access_end,
      })
    }
    next()
  } catch {
    return res.status(500).json({ error: 'Access check failed' })
  }
}
