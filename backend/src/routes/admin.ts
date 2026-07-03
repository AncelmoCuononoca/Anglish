import { Router } from 'express'
import { getAdminClient } from '../lib/supabase'
import { z } from 'zod'

// All routes here are mounted behind requireAuth + requireAdmin (see index.ts),
// and use the service client so the admin can read/write every student's row
// regardless of RLS.
export const adminRouter = Router()

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

// ── GET /api/admin/students ───────────────────────────────────
adminRouter.get('/students', async (_req, res) => {
  const { data, error } = await getAdminClient()
    .from('profiles')
    .select(STUDENT_COLS)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── GET /api/admin/stats ──────────────────────────────────────
adminRouter.get('/stats', async (_req, res) => {
  try {
    const db = getAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const [{ count: total }, { count: paid }, { count: suspended }, { count: schedulings }] = await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }),
      db.from('profiles').select('*', { count: 'exact', head: true }).neq('plan', 'free'),
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('suspended', true),
      db.from('scheduled_lessons').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    // expiring within 7 days
    const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const { count: expiringSoon } = await db
      .from('profiles').select('*', { count: 'exact', head: true })
      .gte('access_end', today).lte('access_end', in7)
    res.json({
      totalStudents: total ?? 0,
      paidStudents: paid ?? 0,
      suspended: suspended ?? 0,
      pendingSchedulings: schedulings ?? 0,
      expiringSoon: expiringSoon ?? 0,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' })
  }
})

// ── PATCH /api/admin/students/:id ─────────────────────────────
// The single endpoint the admin uses to manage a student: plan, role, access
// window, how many months are open, suspension, level and learning goal.
const dateOrNull = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional()
adminRouter.patch('/students/:id', async (req, res) => {
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
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid fields', issues: parsed.error.issues })

  const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' })

  const { data, error } = await getAdminClient()
    .from('profiles')
    .update(updates)
    .eq('id', req.params.id)
    .select(STUDENT_COLS)
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── POST /api/admin/grant-doctor ──────────────────────────────
// Quick action: give a student the all-access Doctor English plan by email.
adminRouter.post('/grant-doctor', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const { data, error } = await getAdminClient()
      .from('profiles')
      .update({ plan: 'doctor_english' })
      .eq('email', email)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) return res.status(404).json({ error: 'No student with that email' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to grant plan' })
  }
})

// ── POST /api/admin/students ──────────────────────────────────
// Create a student account directly (no email confirmation needed). The
// on_auth_user_created trigger creates the profile row; we then set plan/level/
// access if provided. The admin shares the email + temporary password.
adminRouter.post('/students', async (req, res) => {
  const parsed = z.object({
    email:    z.string().email(),
    password: z.string().min(6),
    name:     z.string().min(1).max(80),
    plan:     z.enum(['free','monthly','annual','power_all_access','family','doctor_english']).optional(),
    level:    z.enum(['A1','A2','B1','B2','C1','C2']).optional(),
    access_end: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid fields', issues: parsed.error.issues })
  const { email, password, name, plan, level, access_end } = parsed.data

  const db = getAdminClient()
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,                 // skip the confirmation email - admin vouches for it
    user_metadata: { name },
  })
  if (createErr || !created.user) {
    return res.status(400).json({ error: createErr?.message ?? 'Could not create account' })
  }

  // Trigger has created the profile; apply any admin-set fields.
  const updates = Object.fromEntries(
    Object.entries({ plan, level, access_end, access_start: access_end ? new Date().toISOString().slice(0,10) : undefined })
      .filter(([, v]) => v !== undefined),
  )
  if (Object.keys(updates).length > 0) {
    await db.from('profiles').update(updates).eq('id', created.user.id)
  }

  const { data } = await db.from('profiles').select(STUDENT_COLS).eq('id', created.user.id).single()
  res.status(201).json(data)
})

// ── POST /api/admin/students/:id/reset-phonecall ──────────────
// Give a student a fresh Phone Call this week (clears the weekly count).
adminRouter.post('/students/:id/reset-phonecall', async (req, res) => {
  const { error } = await getAdminClient()
    .from('speaking_weekly_usage')
    .delete()
    .eq('user_id', req.params.id)
    .eq('week_start', weekStartStr())
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ── GET /api/admin/students/:id/phonecalls ────────────────────
// How many Phone Calls this student has used this week.
adminRouter.get('/students/:id/phonecalls', async (req, res) => {
  const { data } = await getAdminClient()
    .from('speaking_weekly_usage')
    .select('phonecall_count')
    .eq('user_id', req.params.id)
    .eq('week_start', weekStartStr())
    .maybeSingle()
  res.json({ used: data?.phonecall_count ?? 0, weekStart: weekStartStr() })
})

// ── GET /api/admin/students/:id/activity ──────────────────────
// Per-day study activity for the last N days, so the coach can see exactly
// which days a student did exercises / spoke and which they skipped.
// Sources: lesson_progress.updated_at (exercise days) + speaking_daily_usage
// (speaking days). NOTE: lesson_progress holds one row per lesson, so a day's
// "lessons" count reflects lessons whose LAST activity fell on that day - a good
// "was active" signal, though it can undercount same-lesson revisits.
adminRouter.get('/students/:id/activity', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90)
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  const db = getAdminClient()

  const [{ data: lessons, error: lErr }, { data: speaking, error: sErr }] = await Promise.all([
    db.from('lesson_progress').select('updated_at').eq('user_id', req.params.id).gte('updated_at', since),
    db.from('speaking_daily_usage')
      .select('usage_date, realtime_seconds, pushtotalk_seconds, group_seconds')
      .eq('user_id', req.params.id).gte('usage_date', since),
  ])
  if (lErr || sErr) return res.status(500).json({ error: (lErr ?? sErr)!.message })

  const map = new Map<string, { lessons: number; speakingSeconds: number }>()
  const bump = (d: string, f: (e: { lessons: number; speakingSeconds: number }) => void) => {
    const e = map.get(d) ?? { lessons: 0, speakingSeconds: 0 }
    f(e); map.set(d, e)
  }
  for (const r of lessons ?? []) bump((r.updated_at as string).slice(0, 10), e => { e.lessons += 1 })
  for (const r of speaking ?? []) bump(r.usage_date as string, e => {
    e.speakingSeconds += (r.realtime_seconds ?? 0) + (r.pushtotalk_seconds ?? 0) + (r.group_seconds ?? 0)
  })

  const activity = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
    const e = map.get(date) ?? { lessons: 0, speakingSeconds: 0 }
    return { date, lessons: e.lessons, speakingSeconds: e.speakingSeconds, active: e.lessons > 0 || e.speakingSeconds > 0 }
  })

  res.json({ days, today: new Date().toISOString().slice(0, 10), activity })
})

// ── GET /api/admin/costs ──────────────────────────────────────
// Estimated AI spend per student over the last N days, built entirely from
// usage we ALREADY store (no extra API calls, no per-request logging). Rates are
// rough per-unit ESTIMATES and easy to tune here as real invoices come in.
//   - realtime (voice phone call) is the dominant cost
//   - push-to-talk + group involve Whisper + TTS + a cheap gpt-4o-mini turn
//   - chat is a single cheap gpt-4o-mini message
const RATES = {
  realtimeUsdPerMin: 0.30,  // OpenAI Realtime voice (estimate)
  speakingUsdPerMin: 0.05,  // whisper + tts + mini per minute (estimate)
  chatUsdPerMsg: 0.0005,    // one gpt-4o-mini chat message (estimate)
}
adminRouter.get('/costs', async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
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
    }).filter(u => u.costUsd > 0 || u.realtimeSeconds > 0 || u.chatMessages > 0)
      .sort((x, y) => y.costUsd - x.costUsd)

    const totalUsd = Math.round(users.reduce((s, u) => s + u.costUsd, 0) * 100) / 100
    res.json({ days, since, rates: RATES, totalUsd, users })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load costs' })
  }
})

// ── PATCH /api/admin/schedulings/:id ──────────────────────────
adminRouter.patch('/schedulings/:id', async (req, res) => {
  try {
    const { status } = z.object({ status: z.enum(['confirmed', 'cancelled']) }).parse(req.body)
    const { error } = await getAdminClient()
      .from('scheduled_lessons')
      .update({ status })
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Update failed' })
  }
})
