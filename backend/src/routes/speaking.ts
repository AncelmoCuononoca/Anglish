import { Router, Request, Response, NextFunction } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { openai, SPEAKING_SYSTEM_PROMPT } from '../lib/openai'
import { toFile } from 'openai'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { z } from 'zod'
import multer from 'multer'

// ── Per-user voice rate limit (in-memory, 60 requests / 15 min window) ───────
// Protects expensive OpenAI endpoints (transcribe, tts, respond, group-respond,
// realtime-session, pronunciation-score, practice-generate, analyze) from
// runaway cost. The global 400/15min stays; this adds a tighter per-user cap on
// the routes that actually call OpenAI.
const VOICE_WINDOW_MS = 15 * 60 * 1000
const VOICE_MAX_PER_USER = 60
const voiceHits = new Map<string, number[]>()

function voiceRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as AuthRequest).userId
  if (!userId) return next()
  const now = Date.now()
  const cutoff = now - VOICE_WINDOW_MS
  let hits = voiceHits.get(userId) ?? []
  hits = hits.filter(t => t > cutoff)
  if (hits.length >= VOICE_MAX_PER_USER) {
    return res.status(429).json({ error: 'Too many voice requests. Please wait a few minutes.' })
  }
  hits.push(now)
  voiceHits.set(userId, hits)
  next()
}

// Prune stale entries every 10 min so the map doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - VOICE_WINDOW_MS
  for (const [uid, hits] of voiceHits) {
    const live = hits.filter(t => t > cutoff)
    if (live.length === 0) voiceHits.delete(uid)
    else voiceHits.set(uid, live)
  }
}, 10 * 60 * 1000).unref()

// Per-request Supabase client scoped to the user's JWT. RLS policies restrict
// each user to their own rows, so no service key is needed. (Future hardening:
// move usage writes behind the service key so users can't reset their own quota.)
function userDb(req: Request): SupabaseClient {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getPlan(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('plan').eq('id', userId).maybeSingle()
  return (data?.plan as string) ?? null
}

interface TopupInfo { seconds: number; expires: string | null; accessEnd: string | null }

async function getTopup(db: SupabaseClient, userId: string): Promise<TopupInfo> {
  const { data } = await db.from('profiles')
    .select('topup_seconds, topup_expires, access_end')
    .eq('id', userId).maybeSingle()
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

async function deductTopup(db: SupabaseClient, userId: string, seconds: number): Promise<void> {
  const { data } = await db.from('profiles').select('topup_seconds').eq('id', userId).maybeSingle()
  const current = (data?.topup_seconds as number) ?? 0
  const next = Math.max(0, current - Math.max(0, Math.round(seconds)))
  await db.from('profiles').update({ topup_seconds: next }).eq('id', userId)
}

export const speakingRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// ── Daily limits (server-enforced; renew every day at UTC midnight) ────────────
export const SPEAKING_LIMITS = {
  realtime: 3 * 60,      // realtime seconds tracked daily (for XP/stats only - gating is weekly, see below)
  pushtotalk: 3 * 60,    // 3 minutes/day of Push-to-Talk / Practice (cheap)
  group: 2 * 60,         // 2 minutes/day of Group chat (cheap)
}
type SpeakingMode = keyof typeof SPEAKING_LIMITS
const DAILY_SPEAKING_XP = 60   // awarded once/day when a daily target is reached

// ── Phone Call (Realtime) - the expensive feature - is PAID-ONLY and gated WEEKLY.
// Only premium plans (Super / Family+Tutor / Power / Doctor) get any Phone Call
// time; free and Basic/Family get none. Each call may last up to PHONECALL_DURATION.
// Talk / Practice / Group stay daily and renew every day.
const PHONECALL_DURATION = 5 * 60   // 5 minutes per weekly call

// ── Plan-aware limits ──────────────────────────────────────────────────────────
// Basic/Family keep the tight entry allowance (talk 3min, group 2min, 1 call/week).
// Super/Family+Tutor/Power get much more speaking time and a call roughly every
// day (7/week). We reuse the existing daily/weekly counters and just raise the
// numbers per plan - no new tables. True rolling 2h/1h windows can come later.
interface PlanSpeakingLimits {
  realtime: number
  pushtotalk: number
  group: number
  phonecallPerWeek: number
  phonecallDuration: number
}
function isPremiumPlan(plan?: string | null): boolean {
  return plan === 'monthly' || plan === 'annual' || plan === 'power_all_access'
    || plan === 'doctor_english' || plan === 'family_tutor'
}
function isFreePlan(plan?: string | null): boolean {
  return !plan || plan === 'free'
}
// Free trial gets only a tiny taste of Talk / Group and NO Phone Call.
const FREE_TALK_SECONDS = 60    // ~2 short Push-to-Talk turns
const FREE_GROUP_SECONDS = 45   // ~3 short Group messages
function speakingLimitsFor(plan?: string | null): PlanSpeakingLimits {
  if (isPremiumPlan(plan)) {
    return { realtime: 3 * 60, pushtotalk: 36 * 60, group: 48 * 60, phonecallPerWeek: 7, phonecallDuration: PHONECALL_DURATION }
  }
  if (isFreePlan(plan)) {
    return { realtime: SPEAKING_LIMITS.realtime, pushtotalk: FREE_TALK_SECONDS, group: FREE_GROUP_SECONDS, phonecallPerWeek: 0, phonecallDuration: PHONECALL_DURATION }
  }
  // Basic / Family (paid entry): more Talk/Group than free, plus 1 Phone Call per
  // week (Super / Family+Tutor get 1 per day via the premium branch above).
  return {
    realtime: SPEAKING_LIMITS.realtime,
    pushtotalk: SPEAKING_LIMITS.pushtotalk,
    group: SPEAKING_LIMITS.group,
    phonecallPerWeek: 1,
    phonecallDuration: PHONECALL_DURATION,
  }
}

// ── Tutor personas (shared by /respond and /group-respond) ────────────────────
const TUTOR_PERSONAS: Record<string, string> = {
  emma:    'You are Emma, a friendly American English tutor. Natural American accent and vocabulary ("apartment", "elevator", "vacation"). Warm and encouraging.',
  justin:  'You are Justin, a British English tutor. Polished RP British accent. British vocabulary ("flat", "lift", "holiday"). Polite and precise.',
  adele:   'You are Adele, a British English tutor. Elegant British accent. Conversational, warm and graceful.',
  liam:    'You are Liam, an Australian English tutor. Relaxed Aussie accent. Friendly and casual; occasional Aussie expressions ("no worries", "mate").',
  thandi:  'You are Thandi, a South African English tutor. Clear South African accent. Confident and articulate.',
  aiko:    'You are Aiko, a Japanese English tutor. Speak clearly at a comfortable pace, polite and encouraging.',
  priya:   'You are Priya, an Indian English tutor. Natural Indian English accent. Lively and expressive.',
  anselmo: 'You are Anselmo, a bilingual English-Portuguese coach from Angola. Warm and motivating; may switch briefly to Portuguese for tricky explanations.',
}

// ── Usage helpers ─────────────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

// Next UTC midnight - when the daily allowance resets
function nextResetISO(): string {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d.toISOString()
}

// Monday (UTC) of the current week - the key for weekly Phone Call usage.
function weekStartStr(): string {
  const d = new Date()
  const day = d.getUTCDay()                 // 0=Sun … 6=Sat
  const shift = day === 0 ? -6 : 1 - day    // back to Monday
  d.setUTCDate(d.getUTCDate() + shift)
  return d.toISOString().slice(0, 10)
}

// Next Monday 00:00 UTC - when the weekly Phone Call allowance resets.
function nextWeekResetISO(): string {
  const d = new Date(weekStartStr() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString()
}

// Phone Call is a WEEKLY TIME BUDGET (seconds), not a call count. This returns
// how many seconds the student has already spent on Phone Calls this week, so
// the time is continuous and PERSISTENT: switching tutor, hanging up and
// reconnecting, or closing and reopening all keep counting against the same
// weekly balance until it runs out.
async function getWeeklyPhoneSeconds(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db
    .from('speaking_weekly_usage')
    .select('phonecall_seconds')
    .eq('user_id', userId)
    .eq('week_start', weekStartStr())
    .maybeSingle()
  return (data?.phonecall_seconds as number) ?? 0
}

// Adds the seconds actually spent on a call to this week's balance (capped at
// `budget`). Upsert on the unique user+week key. Returns the new total.
async function addWeeklyPhoneSeconds(
  db: SupabaseClient, userId: string, seconds: number, budget: number,
): Promise<number> {
  const week = weekStartStr()
  const current = await getWeeklyPhoneSeconds(db, userId)
  const next = Math.min(budget, current + Math.max(0, Math.round(seconds)))
  const { data: existing } = await db
    .from('speaking_weekly_usage').select('id')
    .eq('user_id', userId).eq('week_start', week).maybeSingle()
  if (!existing) {
    await db.from('speaking_weekly_usage')
      .insert({ user_id: userId, week_start: week, phonecall_seconds: next })
  } else {
    await db.from('speaking_weekly_usage')
      .update({ phonecall_seconds: next, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('week_start', week)
  }
  return next
}

// Daily streak: +1 if last active yesterday, reset to 1 if there was a gap,
// unchanged if already counted today. Returns the profile fields to update.
function computeStreak(
  p: { streak: number; longest_streak: number; last_active_date: string | null },
  today: string,
): Record<string, number | string> {
  if (p.last_active_date === today) return {} // already counted today
  const y = new Date(today + 'T00:00:00Z')
  y.setUTCDate(y.getUTCDate() - 1)
  const yesterday = y.toISOString().slice(0, 10)
  const newStreak = p.last_active_date === yesterday ? (p.streak ?? 0) + 1 : 1
  return {
    streak: newStreak,
    longest_streak: Math.max(p.longest_streak ?? 0, newStreak),
    last_active_date: today,
  }
}

interface UsageRow {
  realtime_seconds: number
  pushtotalk_seconds: number
  group_seconds: number
  xp_awarded: boolean
}

const USAGE_COLS = 'realtime_seconds, pushtotalk_seconds, group_seconds, xp_awarded'

async function getOrCreateUsage(db: SupabaseClient, userId: string): Promise<UsageRow> {
  const date = todayStr()
  const { data } = await db
    .from('speaking_daily_usage')
    .select(USAGE_COLS)
    .eq('user_id', userId)
    .eq('usage_date', date)
    .maybeSingle()

  if (data) return data as UsageRow

  const { data: created } = await db
    .from('speaking_daily_usage')
    .insert({ user_id: userId, usage_date: date })
    .select(USAGE_COLS)
    .single()

  return (created as UsageRow) ?? { realtime_seconds: 0, pushtotalk_seconds: 0, group_seconds: 0, xp_awarded: false }
}

const MODE_COL: Record<SpeakingMode, keyof UsageRow> = {
  realtime: 'realtime_seconds',
  pushtotalk: 'pushtotalk_seconds',
  group: 'group_seconds',
}

// Total Phone Call SECONDS a plan gets per week (a continuous balance).
function weeklyPhoneBudget(lim: PlanSpeakingLimits): number {
  return lim.phonecallPerWeek * lim.phonecallDuration
}

function usagePayload(u: UsageRow, weeklySeconds: number, lim: PlanSpeakingLimits, topupSecs = 0) {
  const mode = (m: SpeakingMode) => ({
    used: u[MODE_COL[m]] as number,
    limit: lim[m],
    locked: (u[MODE_COL[m]] as number) >= lim[m],
  })
  const budget = weeklyPhoneBudget(lim)
  const totalBudget = budget + topupSecs
  const remaining = Math.max(0, totalBudget - weeklySeconds)
  return {
    date: todayStr(),
    resetAt: nextResetISO(),
    phonecall: {
      used: weeklySeconds,
      limit: totalBudget,
      locked: weeklySeconds >= totalBudget,
      callSeconds: remaining,
      resetAt: nextWeekResetISO(),
    },
    realtime: mode('realtime'),
    pushtotalk: mode('pushtotalk'),
    group: mode('group'),
    xpAwarded: u.xp_awarded,
    topup: { seconds: topupSecs },
  }
}

// Recent unresolved mistakes → a note that makes the tutor naturally re-test the
// student on what they got wrong, to check if they've improved.
async function buildReviewNote(db: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await db
      .from('speaking_mistakes')
      .select('mistake, correction')
      .eq('user_id', userId)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(6)
    const list = (data ?? []) as { mistake: string; correction: string }[]
    if (list.length === 0) return ''
    const items = list.map(m => `"${m.mistake}" → "${m.correction}"`).join('; ')
    return `The student recently made these mistakes: ${items}. At a natural moment, gently lead the conversation so they have to RE-USE one of these structures, and check if they got it right this time. If they fix it, praise them; if they repeat the error, correct it kindly.`
  } catch { return '' }
}

// ── POST /api/speaking/transcribe ─────────────────────────────
// Whisper: áudio → texto
speakingRouter.post('/transcribe', requireAuth, voiceRateLimit, upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' })

  try {
    // Use the filename the client sent (e.g. speech.m4a on iOS) so Whisper reads
    // the correct format from the extension. A wrong extension (.webm for mp4)
    // makes Whisper reject the upload → "could not transcribe".
    // toFile (não `new File`): o Node 18 do Railway não tem `File` global.
    const file = await toFile(req.file.buffer, req.file.originalname || 'audio.webm', { type: req.file.mimetype })
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
      response_format: 'verbose_json',
    })

    return res.json({
      text: transcription.text,
      duration: (transcription as { duration?: number }).duration,
    })
  } catch (err) {
    console.error('Transcribe error:', err)
    return res.status(500).json({ error: 'Transcription failed' })
  }
})

// ── POST /api/speaking/respond ────────────────────────────────
// GPT-4o → resposta de texto para a conversa
speakingRouter.post('/respond', requireAuth, voiceRateLimit, async (req: Request, res: Response) => {
  const parsed = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).max(60),
    level: z.enum(['A1','A2','B1','B2','C1','C2']).default('A1'),
    avatar: z.string().optional().default('emma'),
    topic: z.string().max(120).optional(),
  }).safeParse(req.body)
  if (!parsed.success) { console.error('respond bad body:', parsed.error.issues); return res.status(400).json({ error: 'Invalid request' }) }
  // keep only the last 20 turns so long chats never blow the limit
  const { level, avatar, topic } = parsed.data
  const messages = parsed.data.messages.slice(-20)

  const accentNote = TUTOR_PERSONAS[avatar] ?? ''
  const topicNote = topic
    ? `Today's conversation topic is "${topic}". Steer the chat around it, but follow the student if they want to talk about something else.`
    : ''
  const reviewNote = await buildReviewNote(userDb(req), (req as AuthRequest).userId)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${SPEAKING_SYSTEM_PROMPT}\n${accentNote}\n${topicNote}\n${reviewNote}\nStudent level: ${level}.`,
        },
        ...messages,
      ],
      max_tokens: 150,
      temperature: 0.85,
    })

    return res.json({ text: completion.choices[0].message.content ?? '' })
  } catch (err) {
    return res.status(500).json({ error: 'AI response failed' })
  }
})

// ── POST /api/speaking/tts ────────────────────────────────────
// TTS: texto → áudio MP3
speakingRouter.post('/tts', requireAuth, voiceRateLimit, async (req: Request, res: Response) => {
  // safeParse (never throws → never leaves the request hanging). tts-1 accepts
  // up to 4096 chars; longer input is truncated so chat replies always get audio.
  const parsed = z.object({
    text: z.string().min(1).max(8000),
    voice: z.enum(['alloy','echo','fable','onyx','nova','shimmer']).default('alloy'),
    speed: z.number().min(0.25).max(4.0).default(1.0),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid TTS request' })
  const { voice, speed } = parsed.data
  const text = parsed.data.text.slice(0, 4096)

  try {
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      response_format: 'mp3',
      speed,
    })

    const buffer = Buffer.from(await mp3.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.send(buffer)
  } catch (err) {
    return res.status(500).json({ error: 'TTS failed' })
  }
})

// ── POST /api/speaking/realtime-session ──────────────────────
// Cria sessão efémera para o OpenAI Realtime API (WebRTC)
// O frontend usa este token para ligar directamente ao Realtime API
// A API key NUNCA vai para o frontend
speakingRouter.post('/realtime-session', requireAuth, voiceRateLimit, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId
  const { level, avatar, topic, focus } = z.object({
    level: z.enum(['A1','A2','B1','B2','C1','C2']).default('A1'),
    avatar: z.string().optional().default('emma'),
    topic: z.string().max(120).optional(),
    focus: z.string().max(500).optional(),
  }).parse(req.body)

  // Gate by the WEEKLY Phone Call TIME BUDGET - without a token there is no
  // call, so this is what actually caps the cost. The student keeps their
  // remaining balance across tutors/reconnects; we only lock once the whole
  // weekly time is spent. Seconds are added when each call ends (/phonecall/report).
  const db = userDb(req)
  const [plan, weeklySeconds, topup] = await Promise.all([getPlan(db, userId), getWeeklyPhoneSeconds(db, userId), getTopup(db, userId)])
  const lim = speakingLimitsFor(plan)
  const topupSecs = topupAvailable(topup)
  if (weeklySeconds >= weeklyPhoneBudget(lim) + topupSecs) {
    const usage = await getOrCreateUsage(db, userId)
    return res.status(403).json({
      error: 'You have used all your Phone Call time this week. It renews next week.',
      locked: true,
      resetAt: nextWeekResetISO(),
      usage: usagePayload(usage, weeklySeconds, lim, topupSecs),
    })
  }

  // Realtime API só aceita estas vozes (diferente do tts-1):
  // alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar
  const voiceMap: Record<string, string> = {
    emma:    'coral',
    justin:  'ash',
    adele:   'shimmer',
    liam:    'echo',
    thandi:  'sage',
    aiko:    'marin',
    priya:   'ballad',
    anselmo: 'verse',
  }

  const accentInstructions = TUTOR_PERSONAS
  const topicNote = topic
    ? `Today's conversation topic is "${topic}". Steer the chat around it, but follow the student if they want something else.`
    : ''
  const reviewNote = await buildReviewNote(db, userId)

  const model = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime'

  try {
    // Cria client secret efémero no OpenAI (novo endpoint GA)
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions: `${SPEAKING_SYSTEM_PROMPT}\n${accentInstructions[avatar] ?? ''}\n${topicNote}\n${focus ?? ''}\n${reviewNote}\nStudent level: ${level}.`,
          audio: {
            input: {
              transcription: { model: 'whisper-1' },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 800,
              },
            },
            output: {
              voice: voiceMap[avatar] ?? 'coral',
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const err = await response.json() as { error?: { message?: string } }
      console.error('Realtime session error:', JSON.stringify(err))
      const msg = err?.error?.message ?? 'Failed to create realtime session'
      return res.status(500).json({ error: msg })
    }

    const sessionData = await response.json() as { value: string; expires_at?: string }

    // Devolve o token efémero (ek_...) + o model para o handshake WebRTC.
    // callSeconds = tempo RESTANTE do saldo semanal (não os 5 min fixos), para
    // a chamada continuar de onde ficou. O tempo gasto é contado no fim via
    // /phonecall/report, por isso mudar de tutor não queima nada além do usado.
    return res.json({
      value: sessionData.value,
      model,
      expires_at: sessionData.expires_at,
      callSeconds: Math.max(0, weeklyPhoneBudget(lim) + topupSecs - weeklySeconds),
    })
  } catch (err) {
    console.error('Realtime session error:', err)
    return res.status(500).json({ error: 'Realtime service unavailable' })
  }
})

// ── POST /api/speaking/pronunciation-score ────────────────────
// Compara o que o utilizador disse com o texto esperado
speakingRouter.post('/pronunciation-score', requireAuth, voiceRateLimit, upload.single('audio'), async (req: Request, res: Response) => {
  const { expected_text } = z.object({ expected_text: z.string() }).parse(req.body)
  if (!req.file) return res.status(400).json({ error: 'No audio file' })

  try {
    const file = await toFile(req.file.buffer, req.file.originalname || 'audio.webm', { type: req.file.mimetype })
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    })

    const said = transcription.text.toLowerCase().trim()
    const expected = expected_text.toLowerCase().trim()

    // Score simples baseado em word overlap
    const expectedWords = expected.split(/\s+/)
    const saidWords = said.split(/\s+/)
    const matches = expectedWords.filter(w => saidWords.includes(w)).length
    const score = Math.round((matches / expectedWords.length) * 100)

    // GPT avalia pronúncia
    const feedback = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `The student was supposed to say: "${expected_text}"\nThey said: "${transcription.text}"\nGive brief pronunciation feedback in 1-2 sentences. Be encouraging.`,
      }],
      max_tokens: 100,
    })

    return res.json({
      said: transcription.text,
      expected: expected_text,
      score,
      feedback: feedback.choices[0].message.content,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Pronunciation scoring failed' })
  }
})

// ── GET /api/speaking/usage ───────────────────────────────────
// Quanto tempo já foi usado hoje e que modos estão bloqueados
speakingRouter.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = userDb(req)
    const userId = (req as AuthRequest).userId
    const [usage, weeklySeconds, plan, topup] = await Promise.all([
      getOrCreateUsage(db, userId),
      getWeeklyPhoneSeconds(db, userId),
      getPlan(db, userId),
      getTopup(db, userId),
    ])
    return res.json(usagePayload(usage, weeklySeconds, speakingLimitsFor(plan), topupAvailable(topup)))
  } catch (err) {
    console.error('Usage fetch error:', err)
    return res.status(500).json({ error: 'Could not load usage' })
  }
})

// ── POST /api/speaking/usage/increment ────────────────────────
// Regista segundos usados; atribui XP uma vez/dia ao atingir um alvo
speakingRouter.post('/usage/increment', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId
  const { mode, seconds } = z.object({
    mode: z.enum(['realtime', 'pushtotalk', 'group']),
    seconds: z.number().int().min(1).max(3600),
  }).parse(req.body)

  try {
    const db = userDb(req)
    const date = todayStr()
    const [cur, plan, topup] = await Promise.all([getOrCreateUsage(db, userId), getPlan(db, userId), getTopup(db, userId)])
    const lim = speakingLimitsFor(plan)
    const topupSecs = topupAvailable(topup)

    const col = MODE_COL[mode]
    const newVal = Math.min(lim[mode], (cur[col] as number) + seconds)

    // Build the post-update row, then award XP once/day if ANY mode hits its target.
    const updatedRow: UsageRow = { ...cur, [col]: newVal }
    const reachedTarget =
      updatedRow.realtime_seconds >= lim.realtime ||
      updatedRow.pushtotalk_seconds >= lim.pushtotalk ||
      updatedRow.group_seconds >= lim.group
    const awardXp = reachedTarget && !cur.xp_awarded
    updatedRow.xp_awarded = cur.xp_awarded || awardXp

    await db.from('speaking_daily_usage')
      .update({ [col]: newVal, xp_awarded: updatedRow.xp_awarded, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('usage_date', date)

    // Update total speaking minutes + XP + streak on the profile.
    const { data: profile } = await db.from('profiles')
      .select('xp, speaking_minutes, streak, longest_streak, last_active_date').eq('id', userId).single()
    if (profile) {
      const p = profile as { xp: number; speaking_minutes: number; streak: number; longest_streak: number; last_active_date: string | null }
      const updates: Record<string, number | string> = {
        speaking_minutes: (p.speaking_minutes ?? 0) + Math.round(seconds / 60),
        ...computeStreak(p, date),
      }
      if (awardXp) updates.xp = (p.xp ?? 0) + DAILY_SPEAKING_XP
      await db.from('profiles').update(updates).eq('id', userId)
    }

    const weeklySeconds = await getWeeklyPhoneSeconds(db, userId)
    return res.json({ ...usagePayload(updatedRow, weeklySeconds, lim, topupSecs), xpEarned: awardXp ? DAILY_SPEAKING_XP : 0 })
  } catch (err) {
    console.error('Usage increment error:', err)
    return res.status(500).json({ error: 'Could not record usage' })
  }
})

// ── POST /api/speaking/phonecall/report ───────────────────────
// Regista os segundos gastos numa Phone Call no saldo SEMANAL. Chamado quando
// a chamada termina (desligar, trocar de tutor, fechar a app). Assim o tempo é
// contínuo e persistente: o que já foi gasto conta, e o aluno continua a ligar
// até o saldo da semana acabar. Devolve o usage atualizado.
speakingRouter.post('/phonecall/report', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId
  const { seconds } = z.object({
    seconds: z.number().min(0).max(3600),
  }).parse(req.body)

  try {
    const db = userDb(req)
    const [plan, usage, topup] = await Promise.all([getPlan(db, userId), getOrCreateUsage(db, userId), getTopup(db, userId)])
    const lim = speakingLimitsFor(plan)
    const topupSecs = topupAvailable(topup)
    const baseBudget = weeklyPhoneBudget(lim)
    const weeklySeconds = await addWeeklyPhoneSeconds(db, userId, seconds, baseBudget + topupSecs)

    // Deduct from topup: any seconds beyond the base weekly budget eat into topup.
    if (topupSecs > 0 && weeklySeconds > baseBudget) {
      const overBase = Math.min(topupSecs, weeklySeconds - baseBudget)
      await deductTopup(db, userId, overBase)
    }

    const freshTopup = topupSecs > 0 ? topupAvailable(await getTopup(db, userId)) : 0
    return res.json(usagePayload(usage, weeklySeconds, lim, freshTopup))
  } catch (err) {
    console.error('Phone call report error:', err)
    return res.status(500).json({ error: 'Could not record call time' })
  }
})

// ── POST /api/speaking/analyze ────────────────────────────────
// Analisa a conversa, extrai erros do aluno e grava-os para revisão
speakingRouter.post('/analyze', requireAuth, voiceRateLimit, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId
  const parsed = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).max(120),
    tutor: z.string().optional(),
    mode: z.string().optional(),
    topic: z.string().max(120).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request' })
  const { tutor, mode, topic } = parsed.data
  const messages = parsed.data.messages.slice(-40)

  const studentTurns = messages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  if (!studentTurns.trim()) return res.json({ mistakes: [] })

  try {
    const transcript = messages.map(m => `${m.role === 'user' ? 'STUDENT' : 'TUTOR'}: ${m.content}`).join('\n')
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You are an English teacher reviewing a conversation transcript. Find real English mistakes the STUDENT made (grammar, vocabulary, word order, verb tense, articles, prepositions). Ignore the TUTOR's lines. Ignore minor transcription artifacts and punctuation. Only list genuine language errors worth studying.
Return STRICT JSON: {"mistakes":[{"mistake":"<what the student said, wrong>","correction":"<the correct form>","explanation":"<short why, may use Portuguese>","category":"grammar|vocabulary|pronunciation|word_order|other"}]}.
If there are no real mistakes, return {"mistakes":[]}. Max 8 items.`,
      }, {
        role: 'user',
        content: transcript,
      }],
      max_tokens: 700,
      temperature: 0.2,
    })

    const raw = completion.choices[0].message.content ?? '{"mistakes":[]}'
    let parsed: { mistakes?: Array<{ mistake?: string; correction?: string; explanation?: string; category?: string }> }
    try { parsed = JSON.parse(raw) } catch { parsed = { mistakes: [] } }
    const list = (parsed.mistakes ?? []).filter(m => m.mistake && m.correction)

    if (list.length === 0) return res.json({ mistakes: [] })

    const db = userDb(req)

    // Dedupe: skip mistakes the student already has open (same wording), so the
    // same error isn't stored over and over when analyze re-runs.
    const { data: existing } = await db
      .from('speaking_mistakes')
      .select('mistake')
      .eq('user_id', userId)
      .eq('resolved', false)
      .limit(300)
    const seen = new Set((existing ?? []).map((m: { mistake: string }) => m.mistake.trim().toLowerCase()))

    const rows = list
      .filter(m => {
        const key = m.mistake!.trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key) // also dedupe within this batch
        return true
      })
      .map(m => ({
        user_id: userId,
        tutor: tutor ?? null,
        mode: mode ?? null,
        topic: topic ?? null,
        mistake: m.mistake,
        correction: m.correction,
        explanation: m.explanation ?? null,
        category: m.category ?? 'other',
      }))

    if (rows.length === 0) return res.json({ mistakes: [] })
    const { data } = await db.from('speaking_mistakes').insert(rows).select()
    return res.json({ mistakes: data ?? [] })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: 'Analysis failed' })
  }
})

// ── GET /api/speaking/mistakes ────────────────────────────────
speakingRouter.get('/mistakes', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = userDb(req)
    const { data } = await db.from('speaking_mistakes')
      .select('*')
      .eq('user_id', (req as AuthRequest).userId)
      .order('created_at', { ascending: false })
      .limit(300)
    return res.json({ mistakes: data ?? [] })
  } catch (err) {
    console.error('Mistakes fetch error:', err)
    return res.status(500).json({ error: 'Could not load mistakes' })
  }
})

// ── POST /api/speaking/practice-generate ─────────────────────
// Generates a fresh practice set (10 easier + 5 harder) tailored to the level.
speakingRouter.post('/practice-generate', requireAuth, voiceRateLimit, async (req: Request, res: Response) => {
  const parsed = z.object({
    level: z.string().default('A1'),
    seed: z.number().optional(),
    focus: z.string().max(500).optional(),
  }).safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' })
  const { level, seed, focus } = parsed.data
  try {
    const completion = await openai.chat.completions.create({
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
    const items = (out.items ?? [])
      .filter(it => it.say && Array.isArray(it.answers) && it.answers.length > 0
        && (it.kind === 'repeat' || it.kind === 'translate')
        && (it.sayLang === 'en' || it.sayLang === 'pt'))
      .slice(0, 15)
    if (items.length < 5) return res.status(500).json({ error: 'Generation produced too few items' })
    return res.json({ items })
  } catch (err) {
    console.error('Practice generate error:', err)
    return res.status(500).json({ error: 'Generation failed' })
  }
})

// ── POST /api/speaking/practice-mistake ──────────────────────
// Saves a pronunciation practice error directly (no GPT analysis needed).
speakingRouter.post('/practice-mistake', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId
  const parsed = z.object({
    said: z.string(),
    answer: z.string(),
    prompt: z.string(),
    tutor: z.string().optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' })
  const { said, answer, prompt, tutor } = parsed.data
  try {
    const db = userDb(req)
    await db.from('speaking_mistakes').insert([{
      user_id: userId,
      tutor: tutor ?? null,
      mode: 'practice',
      topic: null,
      mistake: said || '(no response)',
      correction: answer,
      explanation: `Pronunciation exercise: "${prompt}" → correct answer is "${answer}"`,
      category: 'pronunciation',
    }])
    return res.json({ ok: true })
  } catch (err) {
    console.error('Practice mistake save error:', err)
    return res.status(500).json({ error: 'Could not save mistake' })
  }
})

// ── POST /api/speaking/mistakes/:id/resolve ───────────────────
speakingRouter.post('/mistakes/:id/resolve', requireAuth, async (req: Request, res: Response) => {
  const { resolved } = z.object({ resolved: z.boolean().default(true) }).parse(req.body ?? {})
  try {
    const db = userDb(req)
    await db.from('speaking_mistakes')
      .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
      .eq('id', req.params.id)
      .eq('user_id', (req as AuthRequest).userId)
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: 'Could not update mistake' })
  }
})

// ── POST /api/speaking/group-respond ──────────────────────────
// Group chat: vários tutores respondem por turnos (texto + TTS no cliente)
speakingRouter.post('/group-respond', requireAuth, voiceRateLimit, async (req: Request, res: Response) => {
  const parsed = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).max(80),
    tutors: z.array(z.string()).min(1).max(4),
    level: z.enum(['A1','A2','B1','B2','C1','C2']).default('A1'),
    topic: z.string().max(120).optional(),
    focus: z.string().max(500).optional(),
  }).safeParse(req.body)
  if (!parsed.success) { console.error('group-respond bad body:', parsed.error.issues); return res.status(400).json({ error: 'Invalid request' }) }
  const { tutors, level, topic, focus } = parsed.data
  const messages = parsed.data.messages.slice(-24)

  const personaList = tutors
    .map(id => `- ${id}: ${TUTOR_PERSONAS[id] ?? id}`)
    .join('\n')
  const topicNote = topic ? `Conversation topic: "${topic}".` : ''
  const reviewNote = await buildReviewNote(userDb(req), (req as AuthRequest).userId)

  // Resolve whatever the model put in "tutor" back to a valid id. The model often
  // returns the display Name ("Emma") instead of the id ("emma") - especially on
  // later turns, because the conversation history shows names. Match case-insensitively
  // by id OR name; if it's still unknown, assign in order so a real reply is never lost.
  const idList = tutors.map(t => t.toLowerCase())
  const resolveTutor = (raw: string | undefined, idx: number): string => {
    const low = (raw ?? '').toLowerCase().trim().replace(/[:.]+$/, '')
    const exact = idList.find(t => t === low)
    if (exact) return exact
    const partial = idList.find(t => low.includes(t) || t.includes(low))
    if (partial) return partial
    return tutors[idx % tutors.length] // unknown label → keep the text, assign a real tutor
  }

  try {
    const transcript = messages.map(m => `${m.role === 'user' ? 'STUDENT' : 'GROUP'}: ${m.content}`).join('\n')
    const completion = await openai.chat.completions.create({
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
      }, {
        role: 'user',
        content: transcript,
      }],
      max_tokens: 400,
      temperature: 0.9,
    })

    const raw = completion.choices[0].message.content ?? '{"replies":[]}'
    let parsedReply: { replies?: Array<{ tutor?: string; text?: string }> }
    try { parsedReply = JSON.parse(raw) } catch { parsedReply = { replies: [] } }
    const replies = (parsedReply.replies ?? [])
      .filter(r => r.text && r.text.trim())
      .map((r, i) => ({ tutor: resolveTutor(r.tutor, i), text: r.text!.trim() }))
      .slice(0, tutors.length)

    // Safety net: the group must never leave the student hanging.
    if (replies.length === 0) {
      replies.push({ tutor: tutors[0], text: "Sorry, say that again? We're all ears! 😊" })
    }
    return res.json({ replies })
  } catch (err) {
    console.error('Group respond error:', err)
    return res.status(500).json({ error: 'Group chat failed' })
  }
})
