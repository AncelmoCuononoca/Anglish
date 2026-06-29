// Admin panel - backend API helpers. All calls hit /api/admin/* which is gated
// by requireAuth + requireAdmin on the server (service-key access to all rows).
import { supabase } from './supabase'
import type { AdminStudent, PlanType, UserRole, Level, LearnerGoal } from '../types'

const API = import.meta.env.VITE_API_URL || ''

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
