// Edge Function port of backend/src/routes/speaking.ts (Express → Hono).
// Behind requireAuth + requireActiveAccess (as in index.ts). Per-user voice
// rate limit moves from an in-memory Map to the DB limiter (check_rate_limit).
// Audio upload uses native formData() instead of multer. OpenAI via fetch.
import { Hono } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getUserClient } from '../_shared/supabaseClients.ts'
import { requireAuth, requireActiveAccess, type AuthEnv } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import {
  openaiChat, openaiTranscribe, openaiTTS, openaiRealtimeSecret, SPEAKING_SYSTEM_PROMPT,
} from '../_shared/openai.ts'

const app = new Hono<AuthEnv>().basePath('/speaking')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})
app.use('*', requireAuth)
app.use('*', requireActiveAccess)

// Per-user voice rate limit: 60 requests / 15 min (was an in-memory Map).
async function voiceLimited(c: { get(k: 'userId'): string }): Promise<boolean> {
  return !(await checkRateLimit(`voice:${c.get('userId')}`, 60, 15 * 60))
}
const VOICE_BUSY = { error: 'Too many voice requests. Please wait a few minutes.' }

function db(c: { get(k: 'token'): string }): SupabaseClient {
  return getUserClient(c.get('token'))
}
async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try { return (await c.req.json()) as Record<string, unknown> } catch { return {} }
}

// ── Limits ─────────────────────────────────────────────────────
const SPEAKING_LIMITS = { realtime: 3 * 60, pushtotalk: 3 * 60, group: 2 * 60 }
type SpeakingMode = keyof typeof SPEAKING_LIMITS
const DAILY_SPEAKING_XP = 60
const PHONECALL_DURATION = 5 * 60
const FREE_TALK_TURNS = 2
const FREE_GROUP_TURNS = 3

interface PlanSpeakingLimits {
  realtime: number; pushtotalk: number; group: number
  phonecallPerWeek: number; phonecallDuration: number
}
function isPremiumPlan(plan?: string | null): boolean {
  return plan === 'monthly' || plan === 'annual' || plan === 'power_all_access'
    || plan === 'doctor_english' || plan === 'family_tutor'
}
function isFreePlan(plan?: string | null): boolean {
  return !plan || plan === 'free'
}
function isTurnCounted(plan: string | null | undefined, mode: SpeakingMode): boolean {
  return isFreePlan(plan) && (mode === 'pushtotalk' || mode === 'group')
}
function speakingLimitsFor(plan?: string | null): PlanSpeakingLimits {
  if (isPremiumPlan(plan)) {
    return { realtime: 3 * 60, pushtotalk: 36 * 60, group: 48 * 60, phonecallPerWeek: 7, phonecallDuration: PHONECALL_DURATION }
  }
  if (isFreePlan(plan)) {
    return { realtime: SPEAKING_LIMITS.realtime, pushtotalk: FREE_TALK_TURNS, group: FREE_GROUP_TURNS, phonecallPerWeek: 0, phonecallDuration: PHONECALL_DURATION }
  }
  return { realtime: SPEAKING_LIMITS.realtime, pushtotalk: SPEAKING_LIMITS.pushtotalk, group: SPEAKING_LIMITS.group, phonecallPerWeek: 1, phonecallDuration: PHONECALL_DURATION }
}

const TUTOR_PERSONAS: Record<string, string> = {
  emma: 'You are Emma, a friendly American English tutor. Natural American accent and vocabulary ("apartment", "elevator", "vacation"). Warm and encouraging.',
  justin: 'You are Justin, a British English tutor. Polished RP British accent. British vocabulary ("flat", "lift", "holiday"). Polite and precise.',
  adele: 'You are Adele, a British English tutor. Elegant British accent. Conversational, warm and graceful.',
  liam: 'You are Liam, an Australian English tutor. Relaxed Aussie accent. Friendly and casual; occasional Aussie expressions ("no worries", "mate").',
  thandi: 'You are Thandi, a South African English tutor. Clear South African accent. Confident and articulate.',
  aiko: 'You are Aiko, a Japanese English tutor. Speak clearly at a comfortable pace, polite and encouraging.',
  priya: 'You are Priya, an Indian English tutor. Natural Indian English accent. Lively and expressive.',
  anselmo: 'You are Anselmo, a bilingual English-Portuguese coach from Angola. Warm and motivating; may switch briefly to Portuguese for tricky explanations.',
}

// ── Time helpers ───────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)
function nextResetISO(): string { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.toISOString() }
function weekStartStr(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const shift = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + shift)
  return d.toISOString().slice(0, 10)
}
function nextWeekResetISO(): string {
  const d = new Date(weekStartStr() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString()
}

// ── Plan / topup / usage helpers ───────────────────────────────
async function getPlan(d: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await d.from('profiles').select('plan').eq('id', userId).maybeSingle()
  return (data?.plan as string) ?? null
}
interface TopupInfo { seconds: number; expires: string | null; accessEnd: string | null }
async function getTopup(d: SupabaseClient, userId: string): Promise<TopupInfo> {
  const { data } = await d.from('profiles').select('topup_seconds, topup_expires, access_end').eq('id', userId).maybeSingle()
  return {
    seconds: (data?.topup_seconds as number) ?? 0,
    expires: (data?.topup_expires as string) ?? null,
    accessEnd: (data?.access_end as string) ?? null,
  }
}
function topupAvailable(t: TopupInfo): number {
  if (t.seconds <= 0) return 0
  const today = todayStr()
  if (t.expires && t.expires < today) return 0
  if (t.accessEnd && t.accessEnd < today) return 0
  return t.seconds
}
async function deductTopup(d: SupabaseClient, userId: string, seconds: number): Promise<void> {
  const { data } = await d.from('profiles').select('topup_seconds').eq('id', userId).maybeSingle()
  const current = (data?.topup_seconds as number) ?? 0
  const next = Math.max(0, current - Math.max(0, Math.round(seconds)))
  await d.from('profiles').update({ topup_seconds: next }).eq('id', userId)
}

async function getWeeklyPhoneSeconds(d: SupabaseClient, userId: string): Promise<number> {
  const { data } = await d.from('speaking_weekly_usage').select('phonecall_seconds')
    .eq('user_id', userId).eq('week_start', weekStartStr()).maybeSingle()
  return (data?.phonecall_seconds as number) ?? 0
}
async function addWeeklyPhoneSeconds(d: SupabaseClient, userId: string, seconds: number, budget: number): Promise<number> {
  const week = weekStartStr()
  const current = await getWeeklyPhoneSeconds(d, userId)
  const next = Math.min(budget, current + Math.max(0, Math.round(seconds)))
  const { data: existing } = await d.from('speaking_weekly_usage').select('id')
    .eq('user_id', userId).eq('week_start', week).maybeSingle()
  if (!existing) {
    await d.from('speaking_weekly_usage').insert({ user_id: userId, week_start: week, phonecall_seconds: next })
  } else {
    await d.from('speaking_weekly_usage')
      .update({ phonecall_seconds: next, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('week_start', week)
  }
  return next
}

function computeStreak(p: { streak: number; longest_streak: number; last_active_date: string | null }, today: string): Record<string, number | string> {
  if (p.last_active_date === today) return {}
  const y = new Date(today + 'T00:00:00Z'); y.setUTCDate(y.getUTCDate() - 1)
  const yesterday = y.toISOString().slice(0, 10)
  const newStreak = p.last_active_date === yesterday ? (p.streak ?? 0) + 1 : 1
  return { streak: newStreak, longest_streak: Math.max(p.longest_streak ?? 0, newStreak), last_active_date: today }
}

interface UsageRow { realtime_seconds: number; pushtotalk_seconds: number; group_seconds: number; xp_awarded: boolean }
const USAGE_COLS = 'realtime_seconds, pushtotalk_seconds, group_seconds, xp_awarded'
async function getOrCreateUsage(d: SupabaseClient, userId: string): Promise<UsageRow> {
  const date = todayStr()
  const { data } = await d.from('speaking_daily_usage').select(USAGE_COLS).eq('user_id', userId).eq('usage_date', date).maybeSingle()
  if (data) return data as UsageRow
  const { data: created } = await d.from('speaking_daily_usage').insert({ user_id: userId, usage_date: date }).select(USAGE_COLS).single()
  return (created as UsageRow) ?? { realtime_seconds: 0, pushtotalk_seconds: 0, group_seconds: 0, xp_awarded: false }
}
const MODE_COL: Record<SpeakingMode, keyof UsageRow> = { realtime: 'realtime_seconds', pushtotalk: 'pushtotalk_seconds', group: 'group_seconds' }
function weeklyPhoneBudget(lim: PlanSpeakingLimits): number { return lim.phonecallPerWeek * lim.phonecallDuration }

function usagePayload(u: UsageRow, weeklySeconds: number, lim: PlanSpeakingLimits, topupSecs = 0) {
  const mode = (m: SpeakingMode) => ({ used: u[MODE_COL[m]] as number, limit: lim[m], locked: (u[MODE_COL[m]] as number) >= lim[m] })
  const budget = weeklyPhoneBudget(lim)
  const totalBudget = budget + topupSecs
  const remaining = Math.max(0, totalBudget - weeklySeconds)
  // Hard cap EVERY single call at phonecallDuration (5 min), regardless of how
  // much weekly balance is left. This stops one long call from burning the whole
  // (expensive) Realtime budget in a single sitting — even on premium/Doctor English.
  const callSeconds = Math.min(lim.phonecallDuration, remaining)
  return {
    date: todayStr(),
    resetAt: nextResetISO(),
    phonecall: { used: weeklySeconds, limit: totalBudget, locked: weeklySeconds >= totalBudget, callSeconds, resetAt: nextWeekResetISO() },
    realtime: mode('realtime'), pushtotalk: mode('pushtotalk'), group: mode('group'),
    xpAwarded: u.xp_awarded, topup: { seconds: topupSecs },
  }
}

async function buildReviewNote(d: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await d.from('speaking_mistakes').select('mistake, correction')
      .eq('user_id', userId).eq('resolved', false).order('created_at', { ascending: false }).limit(6)
    const list = (data ?? []) as { mistake: string; correction: string }[]
    if (list.length === 0) return ''
    const items = list.map((m) => `"${m.mistake}" → "${m.correction}"`).join('; ')
    return `The student recently made these mistakes: ${items}. At a natural moment, gently lead the conversation so they have to RE-USE one of these structures, and check if they got it right this time. If they fix it, praise them; if they repeat the error, correct it kindly.`
  } catch { return '' }
}

// ── POST /speaking/transcribe ─────────────────────────────────
app.post('/transcribe', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const form = await c.req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof File)) return c.json({ error: 'No audio file provided' }, 400)
  try {
    const t = await openaiTranscribe(audio, audio.name || 'audio.webm', true)
    return c.json({ text: t.text, duration: t.duration })
  } catch (err) {
    console.error('Transcribe error:', err)
    return c.json({ error: 'Transcription failed' }, 500)
  }
})

// ── POST /speaking/respond ────────────────────────────────────
app.post('/respond', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const parsed = z.object({
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(60),
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A1'),
    avatar: z.string().optional().default('emma'),
    topic: z.string().max(120).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { level, avatar, topic } = parsed.data
  const messages = parsed.data.messages.slice(-20)

  const accentNote = TUTOR_PERSONAS[avatar] ?? ''
  const topicNote = topic ? `Today's conversation topic is "${topic}". Steer the chat around it, but follow the student if they want to talk about something else.` : ''
  const reviewNote = await buildReviewNote(db(c), c.get('userId'))

  try {
    const completion = await openaiChat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${SPEAKING_SYSTEM_PROMPT}\n${accentNote}\n${topicNote}\n${reviewNote}\nStudent level: ${level}.` },
        ...messages,
      ],
      max_tokens: 150,
      temperature: 0.85,
    })
    return c.json({ text: completion.choices[0].message.content ?? '' })
  } catch (_err) {
    return c.json({ error: 'AI response failed' }, 500)
  }
})

// ── POST /speaking/tts ────────────────────────────────────────
app.post('/tts', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const parsed = z.object({
    text: z.string().min(1).max(8000),
    voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('alloy'),
    speed: z.number().min(0.25).max(4.0).default(1.0),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid TTS request' }, 400)
  const { voice, speed } = parsed.data
  const text = parsed.data.text.slice(0, 4096)

  try {
    const buf = await openaiTTS(text, voice, speed)
    return new Response(buf, {
      headers: { ...corsHeaders(), 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=3600' },
    })
  } catch (_err) {
    return c.json({ error: 'TTS failed' }, 500)
  }
})

// ── POST /speaking/realtime-session ───────────────────────────
app.post('/realtime-session', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const userId = c.get('userId')
  const parsed = z.object({
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A1'),
    avatar: z.string().optional().default('emma'),
    topic: z.string().max(120).optional(),
    focus: z.string().max(500).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { level, avatar, topic, focus } = parsed.data

  const d = db(c)
  const [plan, weeklySeconds, topup] = await Promise.all([getPlan(d, userId), getWeeklyPhoneSeconds(d, userId), getTopup(d, userId)])
  const lim = speakingLimitsFor(plan)
  const topupSecs = topupAvailable(topup)
  if (weeklySeconds >= weeklyPhoneBudget(lim) + topupSecs) {
    const usage = await getOrCreateUsage(d, userId)
    return c.json({
      error: 'You have used all your Phone Call time this week. It renews next week.',
      locked: true, resetAt: nextWeekResetISO(), usage: usagePayload(usage, weeklySeconds, lim, topupSecs),
    }, 403)
  }

  const voiceMap: Record<string, string> = {
    emma: 'coral', justin: 'ash', adele: 'shimmer', liam: 'echo',
    thandi: 'sage', aiko: 'marin', priya: 'ballad', anselmo: 'verse',
  }
  const topicNote = topic ? `Today's conversation topic is "${topic}". Steer the chat around it, but follow the student if they want something else.` : ''
  const reviewNote = await buildReviewNote(d, userId)
  const model = Deno.env.get('OPENAI_REALTIME_MODEL') ?? 'gpt-realtime'

  try {
    const response = await openaiRealtimeSecret({
      session: {
        type: 'realtime',
        model,
        instructions: `${SPEAKING_SYSTEM_PROMPT}\n${TUTOR_PERSONAS[avatar] ?? ''}\n${topicNote}\n${focus ?? ''}\n${reviewNote}\nStudent level: ${level}.`,
        audio: {
          input: {
            transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 800 },
          },
          output: { voice: voiceMap[avatar] ?? 'coral' },
        },
      },
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } }
      console.error('Realtime session error:', JSON.stringify(err))
      return c.json({ error: err?.error?.message ?? 'Failed to create realtime session' }, 500)
    }
    const sessionData = await response.json() as { value: string; expires_at?: string }
    return c.json({
      value: sessionData.value,
      model,
      expires_at: sessionData.expires_at,
      // Per-call limit = min(5 min hard cap, remaining weekly balance).
      callSeconds: Math.min(lim.phonecallDuration, Math.max(0, weeklyPhoneBudget(lim) + topupSecs - weeklySeconds)),
    })
  } catch (err) {
    console.error('Realtime session error:', err)
    return c.json({ error: 'Realtime service unavailable' }, 500)
  }
})

// ── POST /speaking/pronunciation-score ────────────────────────
app.post('/pronunciation-score', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const form = await c.req.formData().catch(() => null)
  const audio = form?.get('audio')
  const expected_text = String(form?.get('expected_text') ?? '')
  if (!(audio instanceof File)) return c.json({ error: 'No audio file' }, 400)
  if (!expected_text) return c.json({ error: 'Invalid request' }, 400)

  try {
    const t = await openaiTranscribe(audio, audio.name || 'audio.webm', false)
    const said = (t.text as string).toLowerCase().trim()
    const expected = expected_text.toLowerCase().trim()
    const expectedWords = expected.split(/\s+/)
    const saidWords = said.split(/\s+/)
    const matches = expectedWords.filter((w) => saidWords.includes(w)).length
    const score = Math.round((matches / expectedWords.length) * 100)

    const feedback = await openaiChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `The student was supposed to say: "${expected_text}"\nThey said: "${t.text}"\nGive brief pronunciation feedback in 1-2 sentences. Be encouraging.` }],
      max_tokens: 100,
    })
    return c.json({ said: t.text, expected: expected_text, score, feedback: feedback.choices[0].message.content })
  } catch (_err) {
    return c.json({ error: 'Pronunciation scoring failed' }, 500)
  }
})

// ── GET /speaking/usage ───────────────────────────────────────
app.get('/usage', async (c) => {
  try {
    const d = db(c)
    const userId = c.get('userId')
    const [usage, weeklySeconds, plan, topup] = await Promise.all([
      getOrCreateUsage(d, userId), getWeeklyPhoneSeconds(d, userId), getPlan(d, userId), getTopup(d, userId),
    ])
    return c.json(usagePayload(usage, weeklySeconds, speakingLimitsFor(plan), topupAvailable(topup)))
  } catch (err) {
    console.error('Usage fetch error:', err)
    return c.json({ error: 'Could not load usage' }, 500)
  }
})

// ── POST /speaking/usage/increment ────────────────────────────
app.post('/usage/increment', async (c) => {
  const userId = c.get('userId')
  const parsed = z.object({
    mode: z.enum(['realtime', 'pushtotalk', 'group']),
    seconds: z.number().int().min(1).max(3600),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { mode, seconds } = parsed.data

  try {
    const d = db(c)
    const date = todayStr()
    const [cur, plan, topup] = await Promise.all([getOrCreateUsage(d, userId), getPlan(d, userId), getTopup(d, userId)])
    const lim = speakingLimitsFor(plan)
    const topupSecs = topupAvailable(topup)

    const col = MODE_COL[mode]
    const add = isTurnCounted(plan, mode) ? 1 : seconds
    const newVal = Math.min(lim[mode], (cur[col] as number) + add)

    const updatedRow: UsageRow = { ...cur, [col]: newVal }
    const reachedTarget =
      updatedRow.realtime_seconds >= lim.realtime ||
      updatedRow.pushtotalk_seconds >= lim.pushtotalk ||
      updatedRow.group_seconds >= lim.group
    const awardXp = reachedTarget && !cur.xp_awarded
    updatedRow.xp_awarded = cur.xp_awarded || awardXp

    await d.from('speaking_daily_usage')
      .update({ [col]: newVal, xp_awarded: updatedRow.xp_awarded, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('usage_date', date)

    const { data: profile } = await d.from('profiles')
      .select('xp, speaking_minutes, streak, longest_streak, last_active_date').eq('id', userId).single()
    if (profile) {
      const p = profile as { xp: number; speaking_minutes: number; streak: number; longest_streak: number; last_active_date: string | null }
      const updates: Record<string, number | string> = {
        speaking_minutes: (p.speaking_minutes ?? 0) + Math.round(seconds / 60),
        ...computeStreak(p, date),
      }
      if (awardXp) updates.xp = (p.xp ?? 0) + DAILY_SPEAKING_XP
      await d.from('profiles').update(updates).eq('id', userId)
    }

    const weeklySeconds = await getWeeklyPhoneSeconds(d, userId)
    return c.json({ ...usagePayload(updatedRow, weeklySeconds, lim, topupSecs), xpEarned: awardXp ? DAILY_SPEAKING_XP : 0 })
  } catch (err) {
    console.error('Usage increment error:', err)
    return c.json({ error: 'Could not record usage' }, 500)
  }
})

// ── POST /speaking/phonecall/report ───────────────────────────
app.post('/phonecall/report', async (c) => {
  const userId = c.get('userId')
  const parsed = z.object({ seconds: z.number().min(0).max(3600) }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { seconds } = parsed.data

  try {
    const d = db(c)
    const [plan, usage, topup] = await Promise.all([getPlan(d, userId), getOrCreateUsage(d, userId), getTopup(d, userId)])
    const lim = speakingLimitsFor(plan)
    const topupSecs = topupAvailable(topup)
    const baseBudget = weeklyPhoneBudget(lim)
    const weeklySeconds = await addWeeklyPhoneSeconds(d, userId, seconds, baseBudget + topupSecs)

    if (topupSecs > 0 && weeklySeconds > baseBudget) {
      const overBase = Math.min(topupSecs, weeklySeconds - baseBudget)
      await deductTopup(d, userId, overBase)
    }
    const freshTopup = topupSecs > 0 ? topupAvailable(await getTopup(d, userId)) : 0
    return c.json(usagePayload(usage, weeklySeconds, lim, freshTopup))
  } catch (err) {
    console.error('Phone call report error:', err)
    return c.json({ error: 'Could not record call time' }, 500)
  }
})

// ── POST /speaking/analyze ────────────────────────────────────
app.post('/analyze', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const userId = c.get('userId')
  const parsed = z.object({
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(120),
    tutor: z.string().optional(), mode: z.string().optional(), topic: z.string().max(120).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { tutor, mode, topic } = parsed.data
  const messages = parsed.data.messages.slice(-40)

  const studentTurns = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n')
  if (!studentTurns.trim()) return c.json({ mistakes: [] })

  try {
    const transcript = messages.map((m) => `${m.role === 'user' ? 'STUDENT' : 'TUTOR'}: ${m.content}`).join('\n')
    const completion = await openaiChat({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You are an English teacher reviewing a conversation transcript. Find real English mistakes the STUDENT made (grammar, vocabulary, word order, verb tense, articles, prepositions). Ignore the TUTOR's lines. Ignore minor transcription artifacts and punctuation. Only list genuine language errors worth studying.
Return STRICT JSON: {"mistakes":[{"mistake":"<what the student said, wrong>","correction":"<the correct form>","explanation":"<short why, may use Portuguese>","category":"grammar|vocabulary|pronunciation|word_order|other"}]}.
If there are no real mistakes, return {"mistakes":[]}. Max 8 items.`,
      }, { role: 'user', content: transcript }],
      max_tokens: 700,
      temperature: 0.2,
    })

    const raw = completion.choices[0].message.content ?? '{"mistakes":[]}'
    let out: { mistakes?: Array<{ mistake?: string; correction?: string; explanation?: string; category?: string }> }
    try { out = JSON.parse(raw) } catch { out = { mistakes: [] } }
    const list = (out.mistakes ?? []).filter((m) => m.mistake && m.correction)
    if (list.length === 0) return c.json({ mistakes: [] })

    const d = db(c)
    const { data: existing } = await d.from('speaking_mistakes').select('mistake')
      .eq('user_id', userId).eq('resolved', false).limit(300)
    const seen = new Set((existing ?? []).map((m: { mistake: string }) => m.mistake.trim().toLowerCase()))

    const rows = list.filter((m) => {
      const key = m.mistake!.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map((m) => ({
      user_id: userId, tutor: tutor ?? null, mode: mode ?? null, topic: topic ?? null,
      mistake: m.mistake, correction: m.correction, explanation: m.explanation ?? null, category: m.category ?? 'other',
    }))

    if (rows.length === 0) return c.json({ mistakes: [] })
    const { data } = await d.from('speaking_mistakes').insert(rows).select()
    return c.json({ mistakes: data ?? [] })
  } catch (err) {
    console.error('Analyze error:', err)
    return c.json({ error: 'Analysis failed' }, 500)
  }
})

// ── GET /speaking/mistakes ────────────────────────────────────
app.get('/mistakes', async (c) => {
  try {
    const { data } = await db(c).from('speaking_mistakes').select('*')
      .eq('user_id', c.get('userId')).order('created_at', { ascending: false }).limit(300)
    return c.json({ mistakes: data ?? [] })
  } catch (err) {
    console.error('Mistakes fetch error:', err)
    return c.json({ error: 'Could not load mistakes' }, 500)
  }
})

// ── POST /speaking/practice-generate ──────────────────────────
app.post('/practice-generate', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const parsed = z.object({
    level: z.string().default('A1'), seed: z.number().optional(), focus: z.string().max(500).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
  const { level, seed, focus } = parsed.data
  try {
    const completion = await openaiChat({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `Generate a pronunciation/translation practice set for an English learner.
Level: ${level}. Variation seed: ${seed ?? Date.now()} (use it to vary themes).
Return STRICT JSON: {"items":[{"kind":"repeat"|"translate","say":"<text>","sayLang":"en"|"pt","answers":["<acceptable english answer>", "..."],"hard":boolean}]}.

Rules:
- Exactly 15 items: first 10 at the student's level (hard:false), last 5 noticeably harder (hard:true).
- Mix kinds: ~60% "repeat" (English sentence, sayLang "en") and ~40% "translate" (Portuguese sentence, sayLang "pt", answers in English).
- Vary topics: greetings, food, work, travel, family, hobbies, weather, daily routine, feelings, shopping, technology, learning.
- For "repeat" items: "say" is the English phrase; answers must include the same phrase normalised (lowercase, no punctuation).
- For "translate" items: "say" is natural Portuguese; answers must contain 1-3 plausible English translations.
- Keep each phrase under 12 words. Use modern, useful, real-life vocabulary. No duplicate phrases.
${focus ? `- ${focus} Weave several items around that field's everyday situations and vocabulary.` : ''}`,
      }],
      temperature: 0.9,
    })
    const raw = completion.choices[0].message.content ?? '{"items":[]}'
    let out: { items?: Array<{ kind?: string; say?: string; sayLang?: string; answers?: string[]; hard?: boolean }> } = { items: [] }
    try { out = JSON.parse(raw) } catch { /* keep empty */ }
    const items = (out.items ?? []).filter((it) =>
      it.say && Array.isArray(it.answers) && it.answers.length > 0 &&
      (it.kind === 'repeat' || it.kind === 'translate') &&
      (it.sayLang === 'en' || it.sayLang === 'pt')).slice(0, 15)
    if (items.length < 5) return c.json({ error: 'Generation produced too few items' }, 500)
    return c.json({ items })
  } catch (err) {
    console.error('Practice generate error:', err)
    return c.json({ error: 'Generation failed' }, 500)
  }
})

// ── POST /speaking/practice-mistake ───────────────────────────
app.post('/practice-mistake', async (c) => {
  const userId = c.get('userId')
  const parsed = z.object({
    said: z.string(), answer: z.string(), prompt: z.string(), tutor: z.string().optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
  const { said, answer, prompt, tutor } = parsed.data
  try {
    await db(c).from('speaking_mistakes').insert([{
      user_id: userId, tutor: tutor ?? null, mode: 'practice', topic: null,
      mistake: said || '(no response)', correction: answer,
      explanation: `Pronunciation exercise: "${prompt}" → correct answer is "${answer}"`, category: 'pronunciation',
    }])
    return c.json({ ok: true })
  } catch (err) {
    console.error('Practice mistake save error:', err)
    return c.json({ error: 'Could not save mistake' }, 500)
  }
})

// ── POST /speaking/mistakes/:id/resolve ───────────────────────
app.post('/mistakes/:id/resolve', async (c) => {
  const parsed = z.object({ resolved: z.boolean().default(true) }).safeParse(await body(c))
  const resolved = parsed.success ? parsed.data.resolved : true
  try {
    await db(c).from('speaking_mistakes')
      .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
      .eq('id', c.req.param('id')).eq('user_id', c.get('userId'))
    return c.json({ ok: true })
  } catch (_err) {
    return c.json({ error: 'Could not update mistake' }, 500)
  }
})

// ── POST /speaking/group-respond ──────────────────────────────
app.post('/group-respond', async (c) => {
  if (await voiceLimited(c)) return c.json(VOICE_BUSY, 429)
  const parsed = z.object({
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(80),
    tutors: z.array(z.string()).min(1).max(4),
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A1'),
    topic: z.string().max(120).optional(), focus: z.string().max(500).optional(),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { tutors, level, topic, focus } = parsed.data
  const messages = parsed.data.messages.slice(-24)

  const personaList = tutors.map((id) => `- ${id}: ${TUTOR_PERSONAS[id] ?? id}`).join('\n')
  const topicNote = topic ? `Conversation topic: "${topic}".` : ''
  const reviewNote = await buildReviewNote(db(c), c.get('userId'))

  const idList = tutors.map((t) => t.toLowerCase())
  const resolveTutor = (raw: string | undefined, idx: number): string => {
    const low = (raw ?? '').toLowerCase().trim().replace(/[:.]+$/, '')
    const exact = idList.find((t) => t === low)
    if (exact) return exact
    const partial = idList.find((t) => low.includes(t) || t.includes(low))
    if (partial) return partial
    return tutors[idx % tutors.length]
  }

  try {
    const transcript = messages.map((m) => `${m.role === 'user' ? 'STUDENT' : 'GROUP'}: ${m.content}`).join('\n')
    const completion = await openaiChat({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `This is a casual GROUP English conversation - like a real friend group chat on social media. The student is chatting with these tutors:
${personaList}
${topicNote}
Student level: ${level}. ${SPEAKING_SYSTEM_PROMPT}
${focus ?? ''}

WHO replies depends on who the student is talking to - this is the most important rule:
- If the student addresses ONE tutor by name (e.g. "Liam, ...?" or "what about you Emma?") → ONLY that one tutor replies. The others stay SILENT this turn. Do NOT add the others.
- If the student names SEVERAL tutors → only those named tutors reply.
- If the student talks to the whole group - uses words like "guys", "everyone", "you all", "all of you", or clearly asks the group as a whole - then 2 or 3 of them reply, each adding their own view. Do NOT answer with only one in this case.
- If it's a general message with no name and no group word, that anyone could answer → usually just ONE tutor replies (occasionally two if it's lively). Do NOT make everyone answer a plain general message.
- Exception: the VERY FIRST student message of a fresh chat can have 2-3 of them greet warmly. After that, keep it natural and usually 1 - like a real chat.

Make it feel like a REAL social-media group chat:
- It's normal that not everyone replies; some turns only one person speaks, sometimes a member stays quiet. Vary who speaks across turns - don't repeat the same person or the same order.
- Relaxed, warm, casual - friends hanging out. Light jokes and friendly teasing are welcome.
- At least one tutor ALWAYS replies (never leave the student hanging), even for "ok", "I'm fine" or "lol".
- Keep each reply SHORT (1-2 sentences). Gently model correct, natural English.
${reviewNote}
Output rules:
- The "tutor" field MUST be the lowercase id exactly as listed above (e.g. "emma", "liam"), NOT the display name.
- Return STRICT JSON: {"replies":[{"tutor":"<id>","text":"<what they say>"}]} ordered the way they should be read/heard, top to bottom. Never return an empty replies array.`,
      }, { role: 'user', content: transcript }],
      max_tokens: 400,
      temperature: 0.9,
    })

    const raw = completion.choices[0].message.content ?? '{"replies":[]}'
    let parsedReply: { replies?: Array<{ tutor?: string; text?: string }> }
    try { parsedReply = JSON.parse(raw) } catch { parsedReply = { replies: [] } }
    const replies = (parsedReply.replies ?? [])
      .filter((r) => r.text && r.text.trim())
      .map((r, i) => ({ tutor: resolveTutor(r.tutor, i), text: r.text!.trim() }))
      .slice(0, tutors.length)

    if (replies.length === 0) {
      replies.push({ tutor: tutors[0], text: "Sorry, say that again? We're all ears! 😊" })
    }
    return c.json({ replies })
  } catch (err) {
    console.error('Group respond error:', err)
    return c.json({ error: 'Group chat failed' }, 500)
  }
})

Deno.serve(app.fetch)
