// Speaking AI - backend API helpers (usage limits, mistakes, group chat, topic)
import { getAllLessons } from './lessonData'
import { API_BASE as API } from './apiBase'

export interface UsageMode { used: number; limit: number; locked: boolean }
// Phone Call is a WEEKLY TIME BUDGET (seconds). `used`/`limit` are seconds
// spent/total this week; `callSeconds` is the REMAINING balance the next call
// may last (continuous across tutors, reconnects and app restarts). `resetAt`
// is next Monday (UTC).
export interface PhoneCallUsage {
  used: number; limit: number; locked: boolean
  callSeconds: number; resetAt: string
}
export interface Usage {
  date: string
  resetAt: string
  phonecall: PhoneCallUsage
  realtime: UsageMode
  pushtotalk: UsageMode
  group: UsageMode
  xpAwarded: boolean
  xpEarned?: number
}

export interface SpeakingMistake {
  id: string
  created_at: string
  tutor: string | null
  mode: string | null
  topic: string | null
  mistake: string
  correction: string
  explanation: string | null
  category: string | null
  resolved: boolean
}

function authHeaders(token?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// fetch that always settles - aborts after `ms` so callers never hang forever
// (a hung request used to leave the UI stuck on "loading"/busy).
async function tFetch(url: string, opts: RequestInit, ms = 30000): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

export async function getUsage(token?: string): Promise<Usage | null> {
  try {
    const res = await tFetch(`${API}/api/speaking/usage`, { headers: authHeaders(token) })
    if (!res.ok) return null
    return await res.json() as Usage
  } catch { return null }
}

export async function incrementUsage(
  mode: 'realtime' | 'pushtotalk' | 'group', seconds: number, token?: string,
): Promise<Usage | null> {
  if (seconds < 1) return null
  try {
    const res = await tFetch(`${API}/api/speaking/usage/increment`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ mode, seconds: Math.round(seconds) }),
    })
    if (!res.ok) return null
    return await res.json() as Usage
  } catch { return null }
}

// Reports the seconds spent on a Phone Call to the WEEKLY balance. Uses
// `keepalive` so it still lands when the tab is closing / the user navigates
// away mid-call. Returns the updated usage (null on failure).
export async function reportPhoneSeconds(seconds: number, token?: string): Promise<Usage | null> {
  if (seconds < 1) return null
  try {
    const res = await fetch(`${API}/api/speaking/phonecall/report`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ seconds: Math.round(seconds) }),
      keepalive: true,
    })
    if (!res.ok) return null
    return await res.json() as Usage
  } catch { return null }
}

export async function analyzeConversation(
  payload: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    tutor?: string; mode?: string; topic?: string
  },
  token?: string,
): Promise<SpeakingMistake[]> {
  try {
    const res = await tFetch(`${API}/api/speaking/analyze`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    })
    if (!res.ok) return []
    const data = await res.json() as { mistakes: SpeakingMistake[] }
    return data.mistakes ?? []
  } catch { return [] }
}

export async function getMistakes(token?: string): Promise<SpeakingMistake[]> {
  try {
    const res = await tFetch(`${API}/api/speaking/mistakes`, { headers: authHeaders(token) })
    if (!res.ok) return []
    const data = await res.json() as { mistakes: SpeakingMistake[] }
    return data.mistakes ?? []
  } catch { return [] }
}

export async function resolveMistake(id: string, resolved: boolean, token?: string): Promise<boolean> {
  try {
    const res = await tFetch(`${API}/api/speaking/mistakes/${id}/resolve`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ resolved }),
    })
    return res.ok
  } catch { return false }
}

export async function groupRespond(
  payload: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    tutors: string[]; level: string; topic?: string; focus?: string
  },
  token?: string,
): Promise<{ tutor: string; text: string }[]> {
  try {
    const res = await tFetch(`${API}/api/speaking/group-respond`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    })
    if (!res.ok) return []
    const data = await res.json() as { replies: { tutor: string; text: string }[] }
    return data.replies ?? []
  } catch { return [] }
}

// ── Topic of the day ──────────────────────────────────────────────────────────
// Rotates through the curriculum topics by calendar day so every student gets
// the same "today's topic", which the Speaking AI conversation defaults to.
export function getTodayTopic(): { topic: string; title: string } {
  const lessons = getAllLessons()
  if (lessons.length === 0) return { topic: 'Everyday conversation', title: 'Free Talk' }
  const start = Date.UTC(2026, 0, 1)
  const today = new Date()
  const dayNum = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - start) / 86400000)
  const lesson = lessons[((dayNum % lessons.length) + lessons.length) % lessons.length]
  return { topic: lesson.topic || lesson.title, title: lesson.title }
}

export function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
