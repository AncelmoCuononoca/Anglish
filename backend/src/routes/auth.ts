import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'
import { sendWelcomeEmail } from '../lib/email'
import { isPasswordPwned } from '../lib/pwnedPassword'

export const authRouter = Router()

// Tight limiter for credential endpoints (login / signup / password reset /
// token refresh). The global 400/15min limiter is far too loose to slow a
// brute-force or credential-stuffing run. Keyed on IP + email so one IP can't
// grind a single account and one account can't be sprayed from one IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
})

// Columns safe to return to the account owner on login. Mirrors GET /me and
// deliberately omits internal/billing fields (stripe_customer_id, role,
// suspended, access_*) — data minimization.
const PROFILE_PUBLIC_COLS =
  'id, email, name, avatar_url, level, plan, xp, streak, longest_streak, ' +
  'lessons_completed, speaking_minutes, last_active_date, created_at'

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
authRouter.post('/signup', authLimiter, async (req: Request, res: Response) => {
  const parse = signupSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0].message })
  }
  const { email, password, name } = parse.data

  if (await isPasswordPwned(password)) {
    return res.status(400).json({
      error: 'This password has appeared in a known data breach. Please choose a different one.',
    })
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${process.env.FRONTEND_URL}/auth/confirm`,
    },
  })

  // Do NOT reveal whether the email already exists (account enumeration).
  // Return the same generic "check your email" response either way; a real
  // new account gets a confirmation mail, an existing one does not.
  if (error) {
    if (error.message.includes('already registered')) {
      return res.status(200).json({
        message: 'If that email is available, a confirmation link has been sent.',
      })
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
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid credentials format' })
  }
  const { email, password } = parse.data

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      return res.status(403).json({ error: 'Please confirm your email before logging in' })
    }
    // Generic message for every other auth failure (bad password, unknown
    // email, ...) so an attacker can't tell which accounts exist.
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  // Fetch the owner-safe subset of the profile (no billing/role internals).
  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_PUBLIC_COLS)
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
authRouter.post('/refresh', authLimiter, async (req: Request, res: Response) => {
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
//  POST /api/auth/change-password  (already logged in)
//  The frontend used to call supabase.auth.updateUser() directly from the
//  browser for this, which skipped our pwned-password check entirely. Route
//  it through the backend so every password-setting path is covered.
// ────────────────────────────────────────────────────────────────
authRouter.post('/change-password', requireAuth, authLimiter, async (req: Request, res: Response) => {
  const parse = z.object({ new_password: z.string().min(8) }).safeParse(req.body)
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message })
  const { new_password } = parse.data

  if (await isPasswordPwned(new_password)) {
    return res.status(400).json({
      error: 'This password has appeared in a known data breach. Please choose a different one.',
    })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const userClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await userClient.auth.updateUser({ password: new_password })
  if (error) return res.status(400).json({ error: error.message })

  return res.json({ message: 'Password updated successfully' })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/welcome  (fire the welcome email once, at first login)
//  The app signs up straight through the Supabase client, so there is no
//  session at signup time (email confirmation is required first) — the backend
//  signup route that used to send the welcome is never hit. Instead the frontend
//  calls this once the user is authenticated. Idempotent + abuse-proof:
//   - requireAuth: only a real logged-in user can trigger a send to their own inbox
//   - user_metadata.welcome_sent flag: sent at most once (no DB migration needed)
//   - accounts older than 7 days are flagged WITHOUT sending, so deploying this
//     never blasts the existing user base with a welcome email.
// ────────────────────────────────────────────────────────────────
authRouter.post('/welcome', requireAuth, async (req: Request, res: Response) => {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error } = await client.auth.getUser(token)
  if (error || !user?.email) return res.json({ sent: false })

  if (user.user_metadata?.welcome_sent) return res.json({ sent: false, reason: 'already' })

  // Flag the account either way so this only ever evaluates once per user.
  await client.auth.updateUser({ data: { welcome_sent: true } }).catch(() => {})

  const ageMs = Date.now() - new Date(user.created_at).getTime()
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    return res.json({ sent: false, reason: 'existing_user' })
  }

  const name = (user.user_metadata?.name as string) || undefined
  const ok = await sendWelcomeEmail(user.email, name)
  return res.json({ sent: ok })
})

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
// ────────────────────────────────────────────────────────────────
authRouter.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
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
authRouter.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  const { access_token, new_password } = z.object({
    access_token: z.string(),
    new_password: z.string().min(8),
  }).parse(req.body)

  if (await isPasswordPwned(new_password)) {
    return res.status(400).json({
      error: 'This password has appeared in a known data breach. Please choose a different one.',
    })
  }

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
