import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'
import { sendWelcomeEmail } from '../lib/email'

export const authRouter = Router()

// ── Validation schemas ────────────────────────────────────────
const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/signup
// ────────────────────────────────────────────────────────────────
authRouter.post('/signup', async (req: Request, res: Response) => {
  const parse = signupSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message })
  }
  const { email, password, name } = parse.data

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${process.env.FRONTEND_URL}/auth/confirm`,
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return res.status(409).json({ error: 'Email already in use' })
    }
    return res.status(400).json({ error: error.message })
  }

  // Fire-and-forget welcome email (no-op until RESEND_API_KEY is set).
  if (data.user?.email) {
    sendWelcomeEmail(data.user.email, name).catch(() => {})
  }

  return res.status(201).json({
    message: 'Account created. Check your email to confirm.',
    user: {
      id: data.user?.id,
      email: data.user?.email,
      name,
    },
    session: data.session,
  })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ────────────────────────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid credentials format' })
  }
  const { email, password } = parse.data

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Invalid login')) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    if (error.message.includes('Email not confirmed')) {
      return res.status(403).json({ error: 'Please confirm your email before logging in' })
    }
    return res.status(400).json({ error: error.message })
  }

  // Fetch full profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single()

  return res.json({
    session: {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_at: data.session?.expires_at,
    },
    user: profile ?? {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name,
    },
  })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/google
//  Returns the OAuth URL - the frontend redirects the user there
// ────────────────────────────────────────────────────────────────
authRouter.post('/google', async (_req: Request, res: Response) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.FRONTEND_URL}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error || !data.url) {
    return res.status(500).json({ error: 'Failed to generate Google OAuth URL' })
  }

  return res.json({ url: data.url })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/refresh
//  Exchange refresh_token for a new access_token
// ────────────────────────────────────────────────────────────────
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = req.body
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token required' })
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token })
  if (error) return res.status(401).json({ error: 'Invalid or expired refresh token' })

  return res.json({
    access_token: data.session?.access_token,
    refresh_token: data.session?.refresh_token,
    expires_at: data.session?.expires_at,
  })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ────────────────────────────────────────────────────────────────
authRouter.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ?? ''
  await supabase.auth.admin.signOut(token)
  return res.json({ message: 'Logged out successfully' })
})

// ────────────────────────────────────────────────────────────────
//  GET /api/auth/me
// ────────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(`
      id, email, name, avatar_url,
      level, plan, xp, streak, longest_streak,
      lessons_completed, speaking_minutes,
      last_active_date, created_at
    `)
    .eq('id', userId)
    .single()

  if (error) return res.status(404).json({ error: 'Profile not found' })

  // Fetch achievements
  const { data: achievements } = await supabase
    .from('user_achievements')
    .select('achievement_id, unlocked_at, achievements(slug, name, icon)')
    .eq('user_id', userId)

  return res.json({ ...profile, achievements: achievements ?? [] })
})

// ────────────────────────────────────────────────────────────────
//  PUT /api/auth/me  (update profile)
// ────────────────────────────────────────────────────────────────
authRouter.put('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId
  const allowed = z.object({
    name: z.string().min(2).max(120).optional(),
    avatar_url: z.string().url().optional(),
  })
  const parse = allowed.safeParse(req.body)
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message })

  const { data, error } = await supabase
    .from('profiles')
    .update(parse.data)
    .eq('id', userId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
// ────────────────────────────────────────────────────────────────
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body)

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/auth/reset-password`,
  })

  // Always return 200 to avoid email enumeration
  if (error) console.error('Reset password error:', error.message)
  return res.json({ message: 'If that email exists, a reset link has been sent.' })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/reset-password
// ────────────────────────────────────────────────────────────────
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { access_token, new_password } = z.object({
    access_token: z.string(),
    new_password: z.string().min(8),
  }).parse(req.body)

  // Set the session from the recovery token
  const { error: sessionErr } = await supabase.auth.setSession({
    access_token,
    refresh_token: access_token,
  })
  if (sessionErr) return res.status(400).json({ error: 'Invalid reset token' })

  const { error } = await supabase.auth.updateUser({ password: new_password })
  if (error) return res.status(400).json({ error: error.message })

  return res.json({ message: 'Password updated successfully' })
})
