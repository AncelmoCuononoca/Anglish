// Edge Function port of backend/src/routes/admin.ts (Express → Hono).
// Deployed with verify_jwt: false. Every route is behind requireAuth +
// requireAdmin (app-wide, mirroring index.ts) and uses the service client so an
// admin reads/writes every student's row regardless of RLS.
import { Hono } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, requireAdmin, type AuthEnv } from '../_shared/auth.ts'

const app = new Hono<AuthEnv>().basePath('/admin')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})
app.use('*', requireAuth)
app.use('*', requireAdmin)

const STUDENT_COLS =
  'id, email, name, role, plan, level, xp, streak, longest_streak, lessons_completed, ' +
  'speaking_minutes, last_active_date, suspended, access_start, access_end, ' +
  'unlock_override_month, goal, goal_detail, created_at'

// Monday (UTC) of the current week - matches the speaking route's weekly key.
function weekStartStr(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const shift = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + shift)
  return d.toISOString().slice(0, 10)
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try { return await c.req.json() } catch { return {} }
}

// ── GET /admin/students ───────────────────────────────────────
app.get('/students', async (c) => {
  const { data, error } = await getAdminClient()
    .from('profiles')
    .select(STUDENT_COLS)
    .order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// ── GET /admin/stats ──────────────────────────────────────────
app.get('/stats', async (c) => {
  try {
    const db = getAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const [{ count: total }, { count: paid }, { count: suspended }, { count: schedulings }] = await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }),
      db.from('profiles').select('*', { count: 'exact', head: true }).neq('plan', 'free'),
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('suspended', true),
      db.from('scheduled_lessons').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const { count: expiringSoon } = await db
      .from('profiles').select('*', { count: 'exact', head: true })
      .gte('access_end', today).lte('access_end', in7)
    return c.json({
      totalStudents: total ?? 0,
      paidStudents: paid ?? 0,
      suspended: suspended ?? 0,
      pendingSchedulings: schedulings ?? 0,
      expiringSoon: expiringSoon ?? 0,
    })
  } catch (_err) {
    return c.json({ error: 'Failed to load stats' }, 500)
  }
})

// ── PATCH /admin/students/:id ─────────────────────────────────
const dateOrNull = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional()
app.patch('/students/:id', async (c) => {
  const parsed = z.object({
    plan:                  z.enum(['free','monthly','annual','power_all_access','family','doctor_english']).optional(),
    role:                  z.enum(['student','admin']).optional(),
    level:                 z.enum(['A1','A2','B1','B2','C1','C2']).optional(),
    suspended:             z.boolean().optional(),
    access_start:          dateOrNull,
    access_end:            dateOrNull,
    unlock_override_month: z.union([z.number().int().min(1).max(12), z.null()]).optional(),
    goal:                  z.union([z.enum(['work','travel','daily','school','exam','other']), z.null()]).optional(),
    goal_detail:           z.union([z.string().max(500), z.null()]).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid fields', issues: parsed.error.issues }, 400)

  const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  if (Object.keys(updates).length === 0) return c.json({ error: 'Nothing to update' }, 400)

  const { data, error } = await getAdminClient()
    .from('profiles')
    .update(updates)
    .eq('id', c.req.param('id'))
    .select(STUDENT_COLS)
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// ── POST /admin/grant-doctor ──────────────────────────────────
app.post('/grant-doctor', async (c) => {
  try {
    const parsed = z.object({ email: z.string().email() }).safeParse(await body(c))
    if (!parsed.success) return c.json({ error: 'Invalid email' }, 400)
    const { data, error } = await getAdminClient()
      .from('profiles')
      .update({ plan: 'doctor_english' })
      .eq('email', parsed.data.email)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) return c.json({ error: 'No student with that email' }, 404)
    return c.json({ success: true })
  } catch (_err) {
    return c.json({ error: 'Failed to grant plan' }, 500)
  }
})

// ── POST /admin/students ──────────────────────────────────────
// Create a student account directly (no email confirmation needed). The
// on_auth_user_created trigger creates the profile row; we then set plan/level/
// access if provided. The admin shares the email + temporary password.
app.post('/students', async (c) => {
  const parsed = z.object({
    email:    z.string().email(),
    password: z.string().min(6),
    name:     z.string().min(1).max(80),
    plan:     z.enum(['free','monthly','annual','power_all_access','family','doctor_english']).optional(),
    level:    z.enum(['A1','A2','B1','B2','C1','C2']).optional(),
    access_end: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid fields', issues: parsed.error.issues }, 400)
  const { email, password, name, plan, level, access_end } = parsed.data

  const db = getAdminClient()
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,                 // skip the confirmation email - admin vouches for it
    user_metadata: { name },
  })
  if (createErr || !created.user) {
    return c.json({ error: createErr?.message ?? 'Could not create account' }, 400)
  }

  const updates = Object.fromEntries(
    Object.entries({ plan, level, access_end, access_start: access_end ? new Date().toISOString().slice(0,10) : undefined })
      .filter(([, v]) => v !== undefined),
  )
  if (Object.keys(updates).length > 0) {
    await db.from('profiles').update(updates).eq('id', created.user.id)
  }

  const { data } = await db.from('profiles').select(STUDENT_COLS).eq('id', created.user.id).single()
  return c.json(data, 201)
})

// ── POST /admin/students/:id/reset-phonecall ──────────────────
app.post('/students/:id/reset-phonecall', async (c) => {
  const { error } = await getAdminClient()
    .from('speaking_weekly_usage')
    .delete()
    .eq('user_id', c.req.param('id'))
    .eq('week_start', weekStartStr())
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

// ── POST /admin/students/:id/topup ────────────────────────────
// Manually credit a speaking-time top-up (default 30 min) after a student pays
// by IBAN over WhatsApp (Kwanza equivalent of the €10 Stripe top-up). Mirrors
// applyTopup() in payments: extend if still valid, otherwise reset; +1 month.
app.post('/students/:id/topup', async (c) => {
  const parsed = z.object({ seconds: z.number().int().positive().max(24 * 60 * 60).optional() }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid seconds' }, 400)
  const addSeconds = parsed.data.seconds ?? 30 * 60

  const db = getAdminClient()
  const id = c.req.param('id')
  const { data: profile, error: readErr } = await db
    .from('profiles')
    .select('topup_seconds, topup_expires')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return c.json({ error: readErr.message }, 500)
  if (!profile) return c.json({ error: 'Student not found' }, 404)

  const now = new Date()
  const expires = new Date(now)
  expires.setUTCMonth(expires.getUTCMonth() + 1)

  const existing = (profile.topup_seconds as number) ?? 0
  const existingExpires = profile.topup_expires ? new Date(profile.topup_expires as string) : null
  const stillValid = existingExpires && existingExpires > now ? existing : 0

  const { error } = await db.from('profiles').update({
    topup_seconds: stillValid + addSeconds,
    topup_expires: expires.toISOString().slice(0, 10),
  }).eq('id', id)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true, topup_seconds: stillValid + addSeconds, topup_expires: expires.toISOString().slice(0, 10) })
})

// ── GET /admin/students/:id/phonecalls ────────────────────────
app.get('/students/:id/phonecalls', async (c) => {
  const { data } = await getAdminClient()
    .from('speaking_weekly_usage')
    .select('phonecall_count')
    .eq('user_id', c.req.param('id'))
    .eq('week_start', weekStartStr())
    .maybeSingle()
  return c.json({ used: data?.phonecall_count ?? 0, weekStart: weekStartStr() })
})

// ── GET /admin/students/:id/activity ──────────────────────────
// Per-day study activity for the last N days (exercise days from
// lesson_progress.updated_at + speaking days from speaking_daily_usage).
app.get('/students/:id/activity', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 7), 90)
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  const db = getAdminClient()
  const id = c.req.param('id')

  const [{ data: lessons, error: lErr }, { data: speaking, error: sErr }] = await Promise.all([
    db.from('lesson_progress').select('updated_at').eq('user_id', id).gte('updated_at', since),
    db.from('speaking_daily_usage')
      .select('usage_date, realtime_seconds, pushtotalk_seconds, group_seconds')
      .eq('user_id', id).gte('usage_date', since),
  ])
  if (lErr || sErr) return c.json({ error: (lErr ?? sErr)!.message }, 500)

  const map = new Map<string, { lessons: number; speakingSeconds: number }>()
  const bump = (d: string, f: (e: { lessons: number; speakingSeconds: number }) => void) => {
    const e = map.get(d) ?? { lessons: 0, speakingSeconds: 0 }
    f(e); map.set(d, e)
  }
  for (const r of lessons ?? []) bump((r.updated_at as string).slice(0, 10), (e) => { e.lessons += 1 })
  for (const r of speaking ?? []) bump(r.usage_date as string, (e) => {
    e.speakingSeconds += ((r.realtime_seconds as number) ?? 0) + ((r.pushtotalk_seconds as number) ?? 0) + ((r.group_seconds as number) ?? 0)
  })

  const activity = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
    const e = map.get(date) ?? { lessons: 0, speakingSeconds: 0 }
    return { date, lessons: e.lessons, speakingSeconds: e.speakingSeconds, active: e.lessons > 0 || e.speakingSeconds > 0 }
  })

  return c.json({ days, today: new Date().toISOString().slice(0, 10), activity })
})

// ── GET /admin/costs ──────────────────────────────────────────
// Estimated AI spend per student, from usage we ALREADY store. Rates are
// per-unit estimates, tunable via COST_* env vars (defaults below).
const num = (env: string, fallback: number): number => {
  const v = Number(Deno.env.get(env))
  return Number.isFinite(v) && v >= 0 ? v : fallback
}
const RATES = {
  realtimeUsdPerMin: num('COST_REALTIME_USD_PER_MIN', 0.30),
  speakingUsdPerMin: num('COST_SPEAKING_USD_PER_MIN', 0.05),
  chatUsdPerMsg:     num('COST_CHAT_USD_PER_MSG', 0.0005),
}
app.get('/costs', async (c) => {
  try {
    const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 365)
    const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
    const db = getAdminClient()

    const [{ data: profiles }, { data: speaking }, { data: chat }] = await Promise.all([
      db.from('profiles').select('id, name, email, plan'),
      db.from('speaking_daily_usage')
        .select('user_id, realtime_seconds, pushtotalk_seconds, group_seconds')
        .gte('usage_date', since),
      db.from('chat_daily_usage').select('user_id, message_count').gte('usage_date', since),
    ])

    type Agg = { realtimeSec: number; speakingSec: number; chatMsgs: number }
    const agg = new Map<string, Agg>()
    const get = (id: string) => {
      let a = agg.get(id); if (!a) { a = { realtimeSec: 0, speakingSec: 0, chatMsgs: 0 }; agg.set(id, a) } return a
    }
    for (const r of speaking ?? []) {
      const a = get(r.user_id as string)
      a.realtimeSec += (r.realtime_seconds as number) ?? 0
      a.speakingSec += ((r.pushtotalk_seconds as number) ?? 0) + ((r.group_seconds as number) ?? 0)
    }
    for (const r of chat ?? []) get(r.user_id as string).chatMsgs += (r.message_count as number) ?? 0

    const costOf = (a: Agg) =>
      (a.realtimeSec / 60) * RATES.realtimeUsdPerMin +
      (a.speakingSec / 60) * RATES.speakingUsdPerMin +
      a.chatMsgs * RATES.chatUsdPerMsg

    const users = (profiles ?? []).map((p) => {
      const a = agg.get(p.id as string) ?? { realtimeSec: 0, speakingSec: 0, chatMsgs: 0 }
      return {
        id: p.id, name: p.name, email: p.email, plan: p.plan,
        realtimeSeconds: a.realtimeSec, speakingSeconds: a.speakingSec, chatMessages: a.chatMsgs,
        costUsd: Math.round(costOf(a) * 100) / 100,
      }
    }).filter((u) => u.costUsd > 0 || u.realtimeSeconds > 0 || u.chatMessages > 0)
      .sort((x, y) => y.costUsd - x.costUsd)

    const totalUsd = Math.round(users.reduce((s, u) => s + u.costUsd, 0) * 100) / 100
    return c.json({ days, since, rates: RATES, totalUsd, users })
  } catch (_err) {
    return c.json({ error: 'Failed to load costs' }, 500)
  }
})

// ── Access codes ──────────────────────────────────────────────
// A short, unambiguous code (no 0/O/1/I) like "ANG-7K9P-4M2X".
function genCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const block = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `ANG-${block()}-${block()}`
}

// GET /admin/codes — list codes (newest first) with usage.
app.get('/codes', async (c) => {
  const { data, error } = await getAdminClient()
    .from('access_codes')
    .select('id, code, grant_days, grant_plan, discount_pct, max_uses, uses, active, expires_at, note, created_at')
    .order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// POST /admin/codes — create a code. Omit `code` to auto-generate one.
app.post('/codes', async (c) => {
  const parsed = z.object({
    code:         z.string().min(3).max(64).optional(),
    grant_days:   z.number().int().min(1).max(3650),
    grant_plan:   z.enum(['free','monthly','annual','power_all_access','family','doctor_english']).nullish(),
    discount_pct: z.number().int().min(0).max(100).optional(),
    max_uses:     z.union([z.number().int().min(1).max(100000), z.null()]).optional(),
    expires_at:   z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    note:         z.union([z.string().max(300), z.null()]).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid fields', issues: parsed.error.issues }, 400)

  const code = (parsed.data.code ?? genCode()).trim().toUpperCase()
  const insert = {
    code,
    grant_days:   parsed.data.grant_days,
    grant_plan:   parsed.data.grant_plan ?? null,
    discount_pct: parsed.data.discount_pct ?? 0,
    max_uses:     parsed.data.max_uses ?? null,
    expires_at:   parsed.data.expires_at ?? null,
    note:         parsed.data.note ?? null,
  }
  const { data, error } = await getAdminClient()
    .from('access_codes').insert(insert).select().single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return c.json({ error: 'Esse código já existe.' }, 409)
    return c.json({ error: error.message }, 500)
  }
  return c.json(data, 201)
})

// PATCH /admin/codes/:id — toggle active / edit a code.
app.patch('/codes/:id', async (c) => {
  const parsed = z.object({
    active:       z.boolean().optional(),
    grant_days:   z.number().int().min(1).max(3650).optional(),
    discount_pct: z.number().int().min(0).max(100).optional(),
    max_uses:     z.union([z.number().int().min(1).max(100000), z.null()]).optional(),
    expires_at:   z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    note:         z.union([z.string().max(300), z.null()]).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid fields', issues: parsed.error.issues }, 400)
  const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  if (Object.keys(updates).length === 0) return c.json({ error: 'Nothing to update' }, 400)

  const { data, error } = await getAdminClient()
    .from('access_codes').update(updates).eq('id', c.req.param('id')).select().single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// ── PATCH /admin/schedulings/:id ──────────────────────────────
app.patch('/schedulings/:id', async (c) => {
  try {
    const parsed = z.object({ status: z.enum(['confirmed', 'cancelled']) }).safeParse(await body(c))
    if (!parsed.success) return c.json({ error: 'Invalid status' }, 400)
    const { error } = await getAdminClient()
      .from('scheduled_lessons')
      .update({ status: parsed.data.status })
      .eq('id', c.req.param('id'))
    if (error) throw error
    return c.json({ success: true })
  } catch (_err) {
    return c.json({ error: 'Update failed' }, 500)
  }
})

Deno.serve(app.fetch)
