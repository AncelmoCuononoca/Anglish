// Admin panel - backend API helpers. All calls hit /api/admin/* which is gated
// by requireAuth + requireAdmin on the server (service-key access to all rows).
import { supabase } from './supabase'
import type { AdminStudent, PlanType, UserRole, Level, LearnerGoal } from '../types'
import { API_BASE as API } from './apiBase'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface AdminStats {
  totalStudents: number
  paidStudents: number
  suspended: number
  pendingSchedulings: number
  expiringSoon: number
}

export async function fetchStudents(): Promise<AdminStudent[]> {
  const res = await fetch(`${API}/api/admin/students`, { headers: await authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load students')
  }
  return res.json()
}

export async function fetchStats(): Promise<AdminStats> {
  const res = await fetch(`${API}/api/admin/stats`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Failed to load stats')
  return res.json()
}

export interface StudentUpdate {
  plan?: PlanType
  role?: UserRole
  level?: Level
  suspended?: boolean
  access_start?: string | null
  access_end?: string | null
  unlock_override_month?: number | null
  goal?: LearnerGoal | null
  goal_detail?: string | null
}

export async function updateStudent(id: string, updates: StudentUpdate): Promise<AdminStudent> {
  const res = await fetch(`${API}/api/admin/students/${id}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Update failed')
  }
  return res.json()
}

export interface NewStudent {
  email: string
  password: string
  name: string
  plan?: PlanType
  level?: Level
  access_end?: string | null
}

export async function createStudent(payload: NewStudent): Promise<AdminStudent> {
  const res = await fetch(`${API}/api/admin/students`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not create account')
  }
  return res.json()
}

// Gives a student a fresh Phone Call this week.
export async function resetPhoneCall(id: string): Promise<void> {
  const res = await fetch(`${API}/api/admin/students/${id}/reset-phonecall`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error('Could not reset Phone Call')
}

// Manually credit a speaking-time top-up (default 30 min) after a student pays
// the 10.000 Kz by IBAN over WhatsApp - the Kwanza equivalent of the €10 top-up.
export async function creditTopup(id: string, seconds?: number): Promise<{ topup_seconds: number; topup_expires: string }> {
  const res = await fetch(`${API}/api/admin/students/${id}/topup`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(seconds ? { seconds } : {}),
  })
  if (!res.ok) throw new Error('Could not credit top-up')
  return res.json()
}

// How many Phone Calls this student used this week.
export async function fetchPhoneCalls(id: string): Promise<{ used: number; weekStart: string }> {
  const res = await fetch(`${API}/api/admin/students/${id}/phonecalls`, { headers: await authHeaders() })
  if (!res.ok) return { used: 0, weekStart: '' }
  return res.json()
}

// Per-day study activity (which days the student did exercises / spoke).
export interface DayActivity {
  date: string            // YYYY-MM-DD
  lessons: number         // lessons touched that day
  speakingSeconds: number // total speaking seconds that day
  active: boolean         // did anything that day
}
export interface ActivityResponse {
  days: number
  today: string
  activity: DayActivity[]
}
export async function fetchActivity(id: string, days = 30): Promise<ActivityResponse> {
  const res = await fetch(`${API}/api/admin/students/${id}/activity?days=${days}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Could not load activity')
  return res.json()
}

// Estimated AI spend per student (built from stored usage; rates are estimates).
export interface CostUser {
  id: string
  name: string
  email: string
  plan: PlanType
  realtimeSeconds: number
  speakingSeconds: number
  chatMessages: number
  costUsd: number
}
export interface CostsResponse {
  days: number
  since: string
  rates: { realtimeUsdPerMin: number; speakingUsdPerMin: number; chatUsdPerMsg: number }
  totalUsd: number
  users: CostUser[]
}
export async function fetchCosts(days = 30): Promise<CostsResponse> {
  const res = await fetch(`${API}/api/admin/costs?days=${days}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Could not load costs')
  return res.json()
}

// ── Access codes ──────────────────────────────────────────────────────────────
export interface AccessCode {
  id: string
  code: string
  grant_days: number
  grant_plan: PlanType | null
  discount_pct: number
  max_uses: number | null
  uses: number
  active: boolean
  expires_at: string | null
  note: string | null
  created_at: string
}
export interface NewCode {
  code?: string
  grant_days: number
  grant_plan?: PlanType | null
  discount_pct?: number
  max_uses?: number | null
  expires_at?: string | null
  note?: string | null
}

export async function fetchCodes(): Promise<AccessCode[]> {
  const res = await fetch(`${API}/api/admin/codes`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Could not load codes')
  return res.json()
}

export async function createCode(payload: NewCode): Promise<AccessCode> {
  const res = await fetch(`${API}/api/admin/codes`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not create code')
  }
  return res.json()
}

export async function updateCode(id: string, updates: Partial<Pick<AccessCode, 'active' | 'grant_days' | 'discount_pct' | 'max_uses' | 'expires_at' | 'note'>>): Promise<AccessCode> {
  const res = await fetch(`${API}/api/admin/codes/${id}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Update failed')
  }
  return res.json()
}
