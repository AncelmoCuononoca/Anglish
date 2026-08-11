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

// Google OAuth is a full-page redirect to Google and back, so React Router's
// in-memory location.state (the deep link a shared /lessons/:id came from) is
// lost. We stash the intended destination in sessionStorage — it survives the
// cross-origin round-trip within the same tab — and the callback reads it.
const POST_LOGIN_REDIRECT_KEY = 'anglish-post-login-redirect'

// Only keep genuine in-app paths ("/lessons/x"), never a protocol-relative
// "//evil.com" or an absolute URL — that would be an open-redirect.
function isSafeInternalPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//')
}

export function stashPostLoginRedirect(path?: string | null) {
  try {
    if (isSafeInternalPath(path) && path !== '/dashboard') {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path)
    } else {
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
    }
  } catch { /* private mode — fall back to the default destination */ }
}

// Read-and-clear: returns the stashed path once, then forgets it so a later
// normal login doesn't get bounced to a stale destination.
export function takePostLoginRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
    return isSafeInternalPath(path) ? path : null
  } catch {
    return null
  }
}

export async function signInWithGoogle(redirectPath?: string) {
  // Persist where to land before we leave for Google's consent screen.
  stashPostLoginRedirect(redirectPath)
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

// Set (or clear, with null) the profile avatar. Stores either an uploaded photo
// URL or a cartoon SVG data URI; both render anywhere avatar_url is shown.
export async function updateAvatar(url: string | null): Promise<User> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data as User
}

// Record that the student opened the INSTALLED app today (throttled to once per
// day per device). Reminders read this to stop emailing app users. Best-effort.
export async function markAppOpen(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const k = 'anglish-app-open-marked'
    if (localStorage.getItem(k) === today) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ last_app_open: today }).eq('id', user.id)
    if (!error) localStorage.setItem(k, today)
  } catch { /* offline / best-effort */ }
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
// if already counted today. A day only counts once the student COMPLETES a real
// activity — finishing a lesson stage (≥10 exercises), a speaking "Talk" set, or
// a chat conversation cycle. Just opening the app, or dabbling in Call/Group,
// does NOT count. Callers signal a qualifying completion via addXp(x,{streak:true}).
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

// Points are deliberately slow to accrue: at most DAILY_XP_CAP per day, tracked
// per-device in localStorage (resets each calendar day). A full lesson gives up
// to 30 (1 per exercise), a Talk set 15, chat tops the day up toward 50.
const DAILY_XP_CAP = 50
const xpTodayKey = () => `anglish-xp-today-${new Date().toISOString().slice(0, 10)}`
function xpEarnedToday(): number {
  try { return parseInt(localStorage.getItem(xpTodayKey()) ?? '0', 10) || 0 } catch { return 0 }
}
function bumpXpToday(n: number): void {
  try { localStorage.setItem(xpTodayKey(), String(xpEarnedToday() + n)) } catch { /* private mode */ }
}

// Add XP (clamped to the daily cap) and, when `streak` is set, count today toward
// the streak. The streak still advances on a qualifying completion even after the
// XP cap is hit for the day.
export async function addXp(amount: number, opts?: { streak?: boolean }): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('xp, streak, longest_streak, last_active_date')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  const p = profile as { xp: number; streak: number; longest_streak: number; last_active_date: string | null }

  const room = Math.max(0, DAILY_XP_CAP - xpEarnedToday())
  const add = Math.max(0, Math.min(amount, room))
  const streakChanges = opts?.streak ? streakUpdate(p) : {}

  // Nothing to persist (capped out and no streak change)? Return the fresh row so
  // callers that refresh the UI still get up-to-date values.
  if (add === 0 && Object.keys(streakChanges).length === 0) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    return (data as User) ?? null
  }

  const newXp = (p.xp ?? 0) + add
  const newLevel = xpToLevel(newXp)
  const { data, error } = await supabase
    .from('profiles')
    .update({ xp: newXp, level: newLevel, ...streakChanges })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  if (add > 0) bumpXpToday(add)
  return data as User
}

export async function getLeaderboard() {
  // RLS on `profiles` only lets a user read their own row, so a direct select
  // can never build a shared leaderboard. This SECURITY DEFINER RPC returns the
  // safe public columns for ALL real users (admins/suspended excluded), so every
  // account sees the same real ranking and the list grows as people sign up.
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 100 })
  if (error) throw error
  return (data ?? []) as Array<{ id: string; name: string; xp: number; streak: number; level: Level; avatar_url?: string }>
}

// Public count of real learners (same filter as the leaderboard). Used by the
// landing page so its "Active Learners" number tracks real signups. Returns null
// on failure so the caller can fall back to a static number.
export async function getLearnerCount(): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_learner_count')
  if (error) return null
  return typeof data === 'number' ? data : null
}
