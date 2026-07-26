import { supabase } from './supabase'
import { API_BASE } from './apiBase'
import type { User } from '../types'

// Routed through the Edge Function (not supabase.auth.signUp directly) so the
// leaked-password (HaveIBeenPwned) check and the 8-char minimum run on sign-up -
// Supabase's built-in leaked-password protection is Pro-only, so this is how we
// block breached passwords on the free plan. The function creates the account and
// triggers the confirmation email; the welcome email follows at first login via
// notifyWelcome(). A breached/weak password surfaces as a thrown message.
export async function signUp(email: string, password: string, name: string) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Sign-up failed')
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getProfile(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) return null
  return data as User
}

export async function updateProfile(updates: Partial<Pick<User, 'name' | 'avatar_url'>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) throw error
  return data as User
}

// Save the onboarding objective (and optional work-area / custom detail).
export async function saveGoal(goal: User['goal'], goalDetail?: string | null): Promise<User> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('profiles')
    .update({ goal, goal_detail: goalDetail ?? null })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data as User
}

// Fire-and-forget: asks the backend to send the one-time welcome email. The
// backend dedups (user_metadata flag) and skips old accounts, so it is safe to
// call on every login, nothing happens after the first time.
export async function notifyWelcome() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  try {
    await fetch(`${API_BASE}/api/auth/welcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
  } catch { /* welcome email is non-critical */ }
}

export async function forgotPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  if (error) throw error
}

export async function resetPassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function updateDisplayName(name: string): Promise<User> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('profiles')
    .update({ name })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data as User
}

// Persist the daily-reminder opt-in. The column-level GRANT lets the student
// write only `daily_reminder` / `timezone` on their own row (RLS scopes it to id).
export async function updateReminderPref(enabled: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('profiles')
    .update({ daily_reminder: enabled })
    .eq('id', user.id)
  if (error) throw error
}

// Fire-and-forget: keep profiles.timezone in sync with the device timezone so
// reminder emails land at the right local hour. Only writes when it changed.
export async function syncTimezone(current?: string | null): Promise<void> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz || tz === current) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ timezone: tz }).eq('id', user.id)
  } catch { /* timezone sync is non-critical */ }
}

// Irreversible: deletes the account and all data server-side, then ends the
// local session. Routed through the Edge Function (service-role deletion + auth
// user removal live there); the client only ever asks to delete ITSELF.
export async function deleteAccount(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${API_BASE}/api/account/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to delete account')
  }
  // Data + login are gone; clear the local session (best-effort — the user no
  // longer exists, so a network signOut may 4xx, which we can safely ignore).
  await supabase.auth.signOut().catch(() => {})
}

// Routed through the backend (not supabase.auth.updateUser directly) so the
// pwned-password check applies here too.
export async function changePassword(newPassword: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ new_password: newPassword }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Failed to change password')
  }
}

type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
function xpToLevel(xp: number): Level {
  if (xp >= 8000) return 'C2'
  if (xp >= 5000) return 'C1'
  if (xp >= 3000) return 'B2'
  if (xp >= 1500) return 'B1'
  if (xp >= 500) return 'A2'
  return 'A1'
}

// Daily streak: +1 if last active yesterday, reset to 1 after a gap, unchanged
// if already counted today. Any XP-earning activity (lesson, mistakes, speaking)
// counts as activity for the day.
function streakUpdate(
  p: { streak?: number; longest_streak?: number; last_active_date?: string | null },
): Record<string, number | string> {
  const today = new Date().toISOString().slice(0, 10)
  if (p.last_active_date === today) return {}
  const y = new Date(today + 'T00:00:00Z'); y.setUTCDate(y.getUTCDate() - 1)
  const yesterday = y.toISOString().slice(0, 10)
  const newStreak = p.last_active_date === yesterday ? (p.streak ?? 0) + 1 : 1
  return {
    streak: newStreak,
    longest_streak: Math.max(p.longest_streak ?? 0, newStreak),
    last_active_date: today,
  }
}

export async function addXp(amount: number): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('xp, streak, longest_streak, last_active_date')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  const p = profile as { xp: number; streak: number; longest_streak: number; last_active_date: string | null }
  const newXp = (p.xp ?? 0) + amount
  const newLevel = xpToLevel(newXp)
  const { data, error } = await supabase
    .from('profiles')
    .update({ xp: newXp, level: newLevel, ...streakUpdate(p) })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data as User
}

export async function getLeaderboard() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, xp, streak, level, avatar_url')
    .order('xp', { ascending: false })
    .limit(25)
  if (error) throw error
  return data as Array<{ id: string; name: string; xp: number; streak: number; level: Level; avatar_url?: string }>
}
