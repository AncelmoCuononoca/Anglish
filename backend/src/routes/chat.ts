import { Router, Request, Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { openai, TUTOR_SYSTEM_PROMPT } from '../lib/openai'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { z } from 'zod'

export const chatRouter = Router()

const messageSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(40),
  level: z.enum(['A1','A2','B1','B2','C1','C2']).optional().default('A1'),
  focus: z.string().max(500).optional(),
})

// ── Daily chat limit (server-enforced; renews at UTC midnight) ─────────────────
// Basic/Family: 50 messages/day. Super/Family+Tutor/Power: 100/day (marketed as
// "Unlimited" — a normal user never reaches it). Mirrors lib/plans.ts on the
// frontend. Only the actual chat turns (/message, /stream) count; the grammar
// and translate helpers are free.
function chatDailyLimit(plan?: string | null): number {
  switch (plan) {
    case 'monthly':
    case 'annual':
    case 'power_all_access':
    case 'doctor_english':
    case 'family_tutor':
      return 100
    default: // 'free', 'basic' and 'family'
      return 50
  }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}
function nextResetISO(): string {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d.toISOString()
}

// Per-request Supabase client scoped to the caller's JWT (RLS restricts each
// user to their own rows), same pattern as speaking.ts.
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

// Today's chat message count for this user (0 if no row yet).
async function getChatCount(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db
    .from('chat_daily_usage')
    .select('message_count')
    .eq('user_id', userId)
    .eq('usage_date', todayStr())
    .maybeSingle()
  return (data?.message_count as number) ?? 0
}

// Records one chat message for today (upsert on the user+date key).
async function incrementChat(db: SupabaseClient, userId: string): Promise<void> {
  const date = todayStr()
  const current = await getChatCount(db, userId)
  if (current === 0) {
    await db.from('chat_daily_usage').insert({ user_id: userId, usage_date: date, message_count: 1 })
  } else {
    await db.from('chat_daily_usage')
      .update({ message_count: current + 1, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('usage_date', date)
  }
}

// Shared allowance check for the chat hot path. Resolves to the caller's db +
// current usage when allowed, or { allowed:false } with the reset time.
async function chatAllowance(req: Request): Promise<{
  allowed: boolean; db: SupabaseClient; userId: string
  used: number; limit: number; resetAt: string
}> {
  const userId = (req as AuthRequest).userId
  const db = userDb(req)
  const [plan, used] = await Promise.all([getPlan(db, userId), getChatCount(db, userId)])
  const limit = chatDailyLimit(plan)
  return { allowed: used < limit, db, userId, used, limit, resetAt: nextResetISO() }
}

// GET /api/chat/usage - today's chat allowance (for the progress bar)
chatRouter.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const a = await chatAllowance(req)
    return res.json({ used: a.used, limit: a.limit, locked: !a.allowed, resetAt: a.resetAt })
  } catch {
    return res.status(500).json({ error: 'Could not load chat usage' })
  }
})

// POST /api/chat/message - chat normal (resposta completa)
chatRouter.post('/message', requireAuth, async (req: Request, res: Response) => {
  const parse = messageSchema.safeParse(req.body)
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message })
  const { messages, level, focus } = parse.data

  // Daily limit gate
  const a = await chatAllowance(req)
  if (!a.allowed) {
    return res.status(429).json({ error: 'Daily chat limit reached', code: 'chat_limit', used: a.used, limit: a.limit, resetAt: a.resetAt })
  }
  await incrementChat(a.db, a.userId)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${TUTOR_SYSTEM_PROMPT}\n\nStudent level: ${level}. Adapt your language accordingly.${focus ? `\n${focus}` : ''}`,
        },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const reply = completion.choices[0].message.content ?? ''
    return res.json({
      message: reply,
      usage: completion.usage,
      chatUsage: { used: a.used + 1, limit: a.limit, resetAt: a.resetAt },
    })
  } catch (err) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: 'AI service unavailable' })
  }
})

// POST /api/chat/stream - streaming SSE
chatRouter.post('/stream', requireAuth, async (req: Request, res: Response) => {
  const parse = messageSchema.safeParse(req.body)
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message })
  const { messages, level, focus } = parse.data

  // Daily limit gate - checked BEFORE the SSE headers so a blocked request gets
  // a normal 429 JSON the client can read.
  const a = await chatAllowance(req)
  if (!a.allowed) {
    return res.status(429).json({ error: 'Daily chat limit reached', code: 'chat_limit', used: a.used, limit: a.limit, resetAt: a.resetAt })
  }
  await incrementChat(a.db, a.userId)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Tell the client the new usage up-front so the bar updates as it streams.
  res.write(`data: ${JSON.stringify({ chatUsage: { used: a.used + 1, limit: a.limit, resetAt: a.resetAt } })}\n\n`)

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${TUTOR_SYSTEM_PROMPT}\n\nStudent level: ${level}.${focus ? `\n${focus}` : ''}` },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.7,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
    res.end()
  }
})

// POST /api/chat/correct - correção gramatical com JSON estruturado
chatRouter.post('/correct', requireAuth, async (req: Request, res: Response) => {
  const parsed = z.object({
    text: z.string().min(1).max(8000),
    level: z.enum(['A1','A2','B1','B2','C1','C2']).default('A1'),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid text' })
  const { level } = parsed.data
  const text = parsed.data.text.slice(0, 3000)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an English grammar corrector for ${level} level students.
Return JSON: { "has_errors": boolean, "corrected": "...", "errors": [{ "original": "...", "correction": "...", "explanation": "..." }], "overall_feedback": "..." }
Keep explanations simple for ${level} level.`,
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.3,
    })

    const result = JSON.parse(completion.choices[0].message.content ?? '{}')
    return res.json(result)
  } catch (err) {
    return res.status(500).json({ error: 'Correction service unavailable' })
  }
})

// POST /api/chat/translate - tradução bidirecional PT↔EN
chatRouter.post('/translate', requireAuth, async (req: Request, res: Response) => {
  const parsed = z.object({ text: z.string().min(1).max(8000) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid text' })
  const text = parsed.data.text.slice(0, 3000)

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Detect the language of this text and translate it:
- If it is Portuguese → translate to English
- If it is English → translate to Portuguese (Brazilian/Angolan informal)
Return ONLY the translation, no explanation, no quotes.

Text: ${text}`,
      }],
      max_tokens: 500,
      temperature: 0.3,
    })
    return res.json({ translation: completion.choices[0].message.content?.trim() ?? '' })
  } catch {
    return res.status(500).json({ error: 'Translation failed' })
  }
})
