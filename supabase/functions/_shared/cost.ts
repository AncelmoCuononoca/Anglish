// Real AI cost tracking. After each OpenAI call, the chat/speaking functions
// call recordCost() with the ACTUAL USD spent, computed from the returned token
// usage (chat), audio duration (whisper) or character count (tts). Written to
// public.ai_cost_daily via the atomic add_ai_cost RPC (service role only). The
// admin /costs panel reads that table for real per-person + total spend.
//
// Phone Call / Realtime audio flows browser<->OpenAI directly, so the server
// never sees its tokens: that cost is a per-minute ESTIMATE from call seconds.
import { getAdminClient } from './supabaseClients.ts'

const price = (env: string, fallback: number): number => {
  const v = Number(Deno.env.get(env))
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

// Current OpenAI list prices (USD). Overridable via env so they can be
// calibrated against a real invoice WITHOUT a code change / redeploy.
const PRICES = {
  gpt4oMiniInPerM:  price('COST_GPT4OMINI_IN_PER_M', 0.15),  // $ / 1M input tokens
  gpt4oMiniOutPerM: price('COST_GPT4OMINI_OUT_PER_M', 0.60), // $ / 1M output tokens
  whisperPerMin:    price('COST_WHISPER_PER_MIN', 0.006),    // $ / audio minute
  ttsPerMChar:      price('COST_TTS_PER_MCHAR', 15),         // $ / 1M characters
  realtimePerMin:   price('COST_REALTIME_PER_MIN', 0.30),    // $ / minute (estimate)
}

interface Usage { prompt_tokens?: number; completion_tokens?: number }

// gpt-4o-mini chat/completions cost from the response's token usage.
export function chatUsd(usage?: Usage | null): number {
  if (!usage) return 0
  return ((usage.prompt_tokens ?? 0) * PRICES.gpt4oMiniInPerM
        + (usage.completion_tokens ?? 0) * PRICES.gpt4oMiniOutPerM) / 1_000_000
}
// whisper-1 transcription cost from audio duration (seconds).
export function whisperUsd(seconds?: number | null): number {
  return ((seconds ?? 0) / 60) * PRICES.whisperPerMin
}
// tts-1 speech cost from the input character count.
export function ttsUsd(chars?: number | null): number {
  return ((chars ?? 0) / 1_000_000) * PRICES.ttsPerMChar
}
// Realtime (Phone Call) estimate from reported call seconds.
export function realtimeUsd(seconds?: number | null): number {
  return ((seconds ?? 0) / 60) * PRICES.realtimePerMin
}

type Buckets = { chat?: number; speaking?: number; realtime?: number }

// Fire-and-forget: add cost to the user's daily tally. NEVER throws — a logging
// failure must never break the user's chat/speaking request.
export async function recordCost(userId: string | null | undefined, b: Buckets): Promise<void> {
  try {
    if (!userId) return
    const chat = Number(b.chat ?? 0), speaking = Number(b.speaking ?? 0), realtime = Number(b.realtime ?? 0)
    if (!(chat > 0) && !(speaking > 0) && !(realtime > 0)) return
    await getAdminClient().rpc('add_ai_cost', {
      p_user: userId, p_chat: chat, p_speaking: speaking, p_realtime: realtime,
    })
  } catch (e) {
    console.error('[cost] record failed:', e)
  }
}
