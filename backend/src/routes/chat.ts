import { Router, Request, Response } from 'express'
import { openai, TUTOR_SYSTEM_PROMPT } from '../lib/openai'
import { requireAuth } from '../middleware/auth'
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

// POST /api/chat/message - chat normal (resposta completa)
chatRouter.post('/message', requireAuth, async (req: Request, res: Response) => {
  const parse = messageSchema.safeParse(req.body)
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message })
  const { messages, level, focus } = parse.data

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
    return res.json({ message: reply, usage: completion.usage })
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

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

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
