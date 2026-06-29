import { supabase } from './supabase'
import type { User } from '../types'

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${window.location.origin}/auth/confirm`,
    },
  })
  if (error) throw error
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

export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
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
