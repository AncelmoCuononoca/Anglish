// Edge Function port of backend/src/routes/family.ts (Express → Hono).
// Deployed with verify_jwt: false. All routes behind requireAuth (app-wide,
// mirroring index.ts); each call re-verifies family ownership via ensureOwner.
//
// A "family owner" (parent) manages up to FAMILY_MAX accounts (themselves +
// children): create members, see their progress, set level / access window —
// ONLY client-level data, ONLY for their own family. Writes go through the
// service key but are guarded by an ownership check first.
import { Hono } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, type AuthEnv } from '../_shared/auth.ts'

const app = new Hono<AuthEnv>().basePath('/family')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})
app.use('*', requireAuth)

const FAMILY_MAX = 5 // total accounts in one family (owner counts as one)

function isFamilyPlan(plan: string | null | undefined): boolean {
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

type OwnerResult =
  | { ok: true; familyId: string; caller: Caller }
  | { ok: false; status: number; error: string }

// Confirm the caller may manage a family, bootstrapping them as owner of their
// own family on first use.
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

async function body(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try { return await c.req.json() } catch { return {} }
}

// ── GET /family/members ───────────────────────────────────────
app.get('/members', async (c) => {
  const db = getAdminClient()
  const owner = await ensureOwner(db, c.get('userId'))
  if (!owner.ok) return c.json({ error: owner.error }, owner.status as 403 | 404)

  const { data, error } = await db.from('profiles')
    .select(MEMBER_COLS)
    .eq('family_id', owner.familyId)
    .order('family_owner', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ familyId: owner.familyId, max: FAMILY_MAX, members: data ?? [] })
})

// ── POST /family/members ──────────────────────────────────────
// Parent creates a child account. The child inherits the parent's plan and paid
// window so the whole family shares one subscription.
app.post('/members', async (c) => {
  const db = getAdminClient()
  const owner = await ensureOwner(db, c.get('userId'))
  if (!owner.ok) return c.json({ error: owner.error }, owner.status as 403 | 404)

  const parsed = z.object({
    name:     z.string().min(1).max(80),
    email:    z.string().email(),
    password: z.string().min(6).max(100),
    level:    z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid fields', issues: parsed.error.issues }, 400)
  const { name, email, password, level } = parsed.data

  // Enforce the 5-account cap.
  const { count } = await db.from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', owner.familyId)
  if ((count ?? 0) >= FAMILY_MAX) {
    return c.json({ error: `Your family is full (${FAMILY_MAX} accounts).`, code: 'family_full' }, 403)
  }

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  })
  if (createErr || !created.user) {
    return c.json({ error: createErr?.message ?? 'Could not create account' }, 400)
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
  return c.json(data, 201)
})

// ── PATCH /family/members/:id ─────────────────────────────────
// Parent adjusts a member's level or access window (client-level only).
app.patch('/members/:id', async (c) => {
  const db = getAdminClient()
  const owner = await ensureOwner(db, c.get('userId'))
  if (!owner.ok) return c.json({ error: owner.error }, owner.status as 403 | 404)

  const parsed = z.object({
    level:      z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
    access_end: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid fields' }, 400)
  const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  if (Object.keys(updates).length === 0) return c.json({ error: 'Nothing to update' }, 400)

  // The target MUST belong to this family.
  const id = c.req.param('id')
  const { data: target } = await db.from('profiles').select('id, family_id').eq('id', id).maybeSingle()
  if (!target || (target.family_id as string) !== owner.familyId) {
    return c.json({ error: 'Member not in your family' }, 404)
  }

  const { data, error } = await db.from('profiles').update(updates).eq('id', id).select(MEMBER_COLS).single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// ── DELETE /family/members/:id ────────────────────────────────
// Parent removes a member (deletes the account). The owner cannot delete self.
app.delete('/members/:id', async (c) => {
  const db = getAdminClient()
  const owner = await ensureOwner(db, c.get('userId'))
  if (!owner.ok) return c.json({ error: owner.error }, owner.status as 403 | 404)

  const id = c.req.param('id')
  if (id === owner.familyId) {
    return c.json({ error: 'You cannot remove the family owner.' }, 400)
  }
  const { data: target } = await db.from('profiles').select('id, family_id').eq('id', id).maybeSingle()
  if (!target || (target.family_id as string) !== owner.familyId) {
    return c.json({ error: 'Member not in your family' }, 404)
  }

  const { error } = await db.auth.admin.deleteUser(id)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

Deno.serve(app.fetch)
