// Edge Function port of backend/src/routes/chat.ts (Express → Hono).
// Mounted in Express behind requireAuth + requireActiveAccess; same here.
// Deployed with verify_jwt: false (auth enforced in-app).
import { Hono } from 'jsr:@hono/hono@4'
import { streamSSE } from 'jsr:@hono/hono@4/streaming'
import { z } from 'npm:zod@3'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getUserClient } from '../_shared/supabaseClients.ts'
import { requireAuth, requireActiveAccess, type AuthEnv } from '../_shared/auth.ts'
import { openaiChat, openaiChatStream, TUTOR_SYSTEM_PROMPT } from '../_shared/openai.ts'

const app = new Hono<AuthEnv>().basePath('/chat')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})
app.use('*', requireAuth)
app.use('*', requireActiveAccess)

const messageSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(40),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional().default('A1'),
  focus: z.string().max(500).optional(),
})

// Free trial: 3/day. Basic/Family: 50. Super/Family+Tutor/Power/Doctor: 100.
function chatDailyLimit(plan?: string | null): number {
  switch (plan) {
    case 'monthly': case 'annual': case 'power_all_access':
    case 'doctor_english': case 'family_tutor':
      return 100
    case 'basic': case 'family':
      return 50
    default:
      return 3
  }
}

const todayStr = () => new Date().toISOString().slice(0, 10)
function nextResetISO(): string {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d.toISOString()
}

async function getPlan(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('plan').eq('id', userId).maybeSingle()
  return (data?.plan as string) ?? null
}
async function getChatCount(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.from('chat_daily_usage')
    .select('message_count').eq('user_id', userId).eq('usage_date', todayStr()).maybeSingle()
  return (data?.message_count as number) ?? 0
}
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

type Allowance = { allowed: boolean; db: SupabaseClient; userId: string; used: number; limit: number; resetAt: string }
async function chatAllowance(c: { get(k: 'userId' | 'token'): string }): Promise<Allowance> {
  const userId = c.get('userId')
  const db = getUserClient(c.get('token'))
  const [plan, used] = await Promise.all([getPlan(db, userId), getChatCount(db, userId)])
  const limit = chatDailyLimit(plan)
  return { allowed: used < limit, db, userId, used, limit, resetAt: nextResetISO() }
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try { return (await c.req.json()) as Record<string, unknown> } catch { return {} }
}

// ── GET /chat/usage ───────────────────────────────────────────
app.get('/usage', async (c) => {
  try {
    const a = await chatAllowance(c)
    return c.json({ used: a.used, limit: a.limit, locked: !a.allowed, resetAt: a.resetAt })
  } catch {
    return c.json({ error: 'Could not load chat usage' }, 500)
  }
})

// ── POST /chat/message ────────────────────────────────────────
app.post('/message', async (c) => {
  const parse = messageSchema.safeParse(await body(c))
  if (!parse.success) return c.json({ error: parse.error.errors[0].message }, 400)
  const { messages, level, focus } = parse.data

  const a = await chatAllowance(c)
  if (!a.allowed) {
    return c.json({ error: 'Daily chat limit reached', code: 'chat_limit', used: a.used, limit: a.limit, resetAt: a.resetAt }, 429)
  }
  await incrementChat(a.db, a.userId)

  try {
    const completion = await openaiChat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${TUTOR_SYSTEM_PROMPT}\n\nStudent level: ${level}. Adapt your language accordingly.${focus ? `\n${focus}` : ''}` },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.7,
    })
    const reply = completion.choices[0].message.content ?? ''
    return c.json({ message: reply, usage: completion.usage, chatUsage: { used: a.used + 1, limit: a.limit, resetAt: a.resetAt } })
  } catch (err) {
    console.error('Chat error:', err)
    return c.json({ error: 'AI service unavailable' }, 500)
  }
})

// ── POST /chat/stream (SSE) ───────────────────────────────────
app.post('/stream', async (c) => {
  const parse = messageSchema.safeParse(await body(c))
  if (!parse.success) return c.json({ error: parse.error.errors[0].message }, 400)
  const { messages, level, focus } = parse.data

  // Gate BEFORE opening the stream so a blocked caller gets a normal 429 JSON.
  const a = await chatAllowance(c)
  if (!a.allowed) {
    return c.json({ error: 'Daily chat limit reached', code: 'chat_limit', used: a.used, limit: a.limit, resetAt: a.resetAt }, 429)
  }
  await incrementChat(a.db, a.userId)

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ chatUsage: { used: a.used + 1, limit: a.limit, resetAt: a.resetAt } }) })
    try {
      for await (const delta of openaiChatStream({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `${TUTOR_SYSTEM_PROMPT}\n\nStudent level: ${level}.${focus ? `\n${focus}` : ''}` },
          ...messages,
        ],
        max_tokens: 500,
        temperature: 0.7,
      })) {
        await stream.writeSSE({ data: JSON.stringify({ delta }) })
      }
      await stream.writeSSE({ data: '[DONE]' })
    } catch (_err) {
      await stream.writeSSE({ data: JSON.stringify({ error: 'Stream failed' }) })
    }
  })
})

// ── POST /chat/correct ────────────────────────────────────────
app.post('/correct', async (c) => {
  const parsed = z.object({
    text: z.string().min(1).max(8000),
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A1'),
  }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid text' }, 400)
  const { level } = parsed.data
  const text = parsed.data.text.slice(0, 3000)

  try {
    const completion = await openaiChat({
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
    return c.json(JSON.parse(completion.choices[0].message.content ?? '{}'))
  } catch (_err) {
    return c.json({ error: 'Correction service unavailable' }, 500)
  }
})

// ── POST /chat/translate ──────────────────────────────────────
app.post('/translate', async (c) => {
  const parsed = z.object({ text: z.string().min(1).max(8000) }).safeParse(await body(c))
  if (!parsed.success) return c.json({ error: 'Invalid text' }, 400)
  const text = parsed.data.text.slice(0, 3000)

  try {
    const completion = await openaiChat({
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
    return c.json({ translation: completion.choices[0].message.content?.trim() ?? '' })
  } catch {
    return c.json({ error: 'Translation failed' }, 500)
  }
})

Deno.serve(app.fetch)
