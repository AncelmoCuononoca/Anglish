import { Router, Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../lib/supabase'
import { AuthRequest } from '../middleware/auth'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Family plan: a "family owner" (parent) manages up to FAMILY_MAX accounts
// (themselves + children). The parent can create members, see their progress,
// and set their level / access window - but ONLY client-level data, and ONLY
// for their own family. They never see the admin's cost/role data. Every write
// goes through the service key but is guarded by an ownership check first.
// ─────────────────────────────────────────────────────────────────────────────
export const familyRouter = Router()

const FAMILY_MAX = 5 // total accounts in one family (owner counts as one)

function isFamilyPlan(plan: string | null | undefined): boolean {
  // PlanType currently stores 'family' for the Family plan. Family+Tutor has no
  // stored value yet (comes with Stripe); add it here when it does.
  return plan === 'family' || plan === 'family_tutor'
}

// Client-level fields a parent may see. Deliberately EXCLUDES admin-only data
// (role, suspended, plan internals, goal_detail, unlock overrides, cost).
const MEMBER_COLS =
  'id, name, email, level, xp, streak, longest_streak, lessons_completed, ' +
  'speaking_minutes, last_active_date, access_end, family_owner, created_at'

type Caller = { id: string; plan: string; family_id: string | null; family_owner: boolean; access_end: string | null }

async function getCaller(db: SupabaseClient, userId: string): Promise<Caller | null> {
  const { data } = await db.from('profiles')
    .select('id, plan, family_id, family_owner, access_end')
    .eq('id', userId).maybeSingle()
  return (data as Caller) ?? null
}

// Confirm the caller may manage a family, bootstrapping them as owner of their
// own family on first use. Returns the familyId or an error to send back.
type OwnerResult =
  | { ok: true; familyId: string; caller: Caller }
  | { ok: false; status: number; error: string }

async function ensureOwner(db: SupabaseClient, userId: string): Promise<OwnerResult> {
  const me = await getCaller(db, userId)
  if (!me) return { ok: false, status: 404, error: 'Profile not found' }
  if (!isFamilyPlan(me.plan)) return { ok: false, status: 403, error: 'Family management needs a Family plan.' }
  if (me.family_owner && me.family_id) return { ok: true, familyId: me.family_id, caller: me }
  // Already a member of someone else's family → cannot manage.
  if (me.family_id && me.family_id !== userId) {
    return { ok: false, status: 403, error: 'Only the family owner can manage members.' }
  }
  // Bootstrap: this family-plan user becomes the owner of their own family.
  await db.from('profiles').update({ family_id: userId, family_owner: true }).eq('id', userId)
  return { ok: true, familyId: userId, caller: { ...me, family_id: userId, family_owner: true } }
}

function adminClientOr503(res: Response): SupabaseClient | null {
  try {
    return getAdminClient()
  } catch {
    res.status(503).json({
      error: 'Family features are not configured: SUPABASE_SERVICE_KEY is missing in the backend .env.',
      code: 'service_key_missing',
    })
    return null
  }
}

// ── GET /api/family/members ───────────────────────────────────────────────────
familyRouter.get('/members', async (req: Request, res: Response) => {
  const db = adminClientOr503(res); if (!db) return
  const userId = (req as AuthRequest).userId
  const owner = await ensureOwner(db, userId)
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error })

  const { data, error } = await db.from('profiles')
    .select(MEMBER_COLS)
    .eq('family_id', owner.familyId)
    .order('family_owner', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ familyId: owner.familyId, max: FAMILY_MAX, members: data ?? [] })
})

// ── POST /api/family/members ──────────────────────────────────────────────────
// Parent creates a child account (email + password). The child inherits the
// parent's plan and paid window so the whole family shares one subscription.
familyRouter.post('/members', async (req: Request, res: Response) => {
  const db = adminClientOr503(res); if (!db) return
  const userId = (req as AuthRequest).userId
  const owner = await ensureOwner(db, userId)
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error })

  const parsed = z.object({
    name:     z.string().min(1).max(80),
    email:    z.string().email(),
    password: z.string().min(6).max(100),
    level:    z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid fields', issues: parsed.error.issues })
  const { name, email, password, level } = parsed.data

  // Enforce the 5-account cap.
  const { count } = await db.from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', owner.familyId)
  if ((count ?? 0) >= FAMILY_MAX) {
    return res.status(403).json({ error: `Your family is full (${FAMILY_MAX} accounts).`, code: 'family_full' })
  }

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  })
  if (createErr || !created.user) {
    return res.status(400).json({ error: createErr?.message ?? 'Could not create account' })
  }

  // The trigger created the profile; link it to the family and inherit the
  // parent's plan + paid window. family_id/family_owner are service-key only.
  const updates: Record<string, unknown> = {
    family_id: owner.familyId,
    family_owner: false,
    plan: owner.caller.plan,
    access_end: owner.caller.access_end,
    access_start: owner.caller.access_end ? new Date().toISOString().slice(0, 10) : null,
  }
  if (level) updates.level = level
  await db.from('profiles').update(updates).eq('id', created.user.id)

  const { data } = await db.from('profiles').select(MEMBER_COLS).eq('id', created.user.id).single()
  res.status(201).json(data)
})

// ── PATCH /api/family/members/:id ─────────────────────────────────────────────
// Parent adjusts a member's level or access window (client-level only).
familyRouter.patch('/members/:id', async (req: Request, res: Response) => {
  const db = adminClientOr503(res); if (!db) return
  const userId = (req as AuthRequest).userId
  const owner = await ensureOwner(db, userId)
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error })

  const parsed = z.object({
    level:      z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
    access_end: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid fields' })
  const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' })

  // The target MUST belong to this family.
  const { data: target } = await db.from('profiles').select('id, family_id').eq('id', req.params.id).maybeSingle()
  if (!target || (target.family_id as string) !== owner.familyId) {
    return res.status(404).json({ error: 'Member not in your family' })
  }

  const { data, error } = await db.from('profiles').update(updates).eq('id', req.params.id).select(MEMBER_COLS).single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── DELETE /api/family/members/:id ────────────────────────────────────────────
// Parent removes a member (deletes the account). The owner cannot delete self.
familyRouter.delete('/members/:id', async (req: Request, res: Response) => {
  const db = adminClientOr503(res); if (!db) return
  const userId = (req as AuthRequest).userId
  const owner = await ensureOwner(db, userId)
  if (!owner.ok) return res.status(owner.status).json({ error: owner.error })

  if (req.params.id === owner.familyId) {
    return res.status(400).json({ error: 'You cannot remove the family owner.' })
  }
  const { data: target } = await db.from('profiles').select('id, family_id').eq('id', req.params.id).maybeSingle()
  if (!target || (target.family_id as string) !== owner.familyId) {
    return res.status(404).json({ error: 'Member not in your family' })
  }

  const { error } = await db.auth.admin.deleteUser(req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})
