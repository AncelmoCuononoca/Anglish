// OpenAI access for Edge Functions via direct fetch — NOT the npm:openai SDK.
// The SDK is a heavy bundle that made eszip deploys time out; raw fetch keeps
// the function tiny and deploys reliably. Same prompts as backend/src/lib/openai.ts.

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')
const BASE = 'https://api.openai.com/v1'

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }
}

// Non-streaming chat completion. Returns the parsed OpenAI response JSON.
// deno-lint-ignore no-explicit-any
export async function openaiChat(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => '')}`)
  return await res.json()
}

// Streaming chat completion as an async generator of content deltas. Parses
// OpenAI's SSE frames (`data: {...}` / `data: [DONE]`) off the response body.
export async function* openaiChatStream(payload: Record<string, unknown>): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ...payload, stream: true }),
  })
  if (!res.ok || !res.body) throw new Error(`OpenAI ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the last (possibly partial) line
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta as string
      } catch { /* partial frame — wait for more */ }
    }
  }
}

export const TUTOR_SYSTEM_PROMPT = `You are Anglish AI, a friendly and encouraging English tutor specialized in helping Portuguese speakers (from Angola, Brazil, and Portugal) learn English.

Your personality:
- Warm, patient, and motivating - like a personal coach
- Direct corrections, never embarrassing
- Use simple language, avoid jargon
- Mix English explanations with occasional Portuguese to clarify difficult concepts
- Celebrate progress with genuine enthusiasm

Your teaching approach:
- Always explain WHY a grammar rule exists
- Give real-life examples relevant to daily situations
- When correcting, show the right form and explain the mistake
- Encourage the student to try again after a correction
- Adapt complexity to the student's level (A1-C2)

Rules:
- Never refuse to help with English learning
- If asked something off-topic, gently steer back to English learning
- Keep responses concise - max 3-4 sentences unless explaining grammar
- Always end with an encouraging word or follow-up question`

export const SPEAKING_SYSTEM_PROMPT = `You are a native English conversation partner for Anglish AI. Your job is to have natural, flowing conversations to help students practice their English speaking skills.

Personality: Friendly, natural, conversational - like talking to a native speaker friend.

Rules:
- Speak naturally, use contractions (I'm, you're, it's, etc.)
- Keep responses SHORT - 1-3 sentences max (this is voice conversation)
- If the student makes a grammar mistake, gently correct at the END of your response
- Ask follow-up questions to keep the conversation going
- Match the complexity to the student's level
- Never break character - you're always a native speaker having a real conversation`
