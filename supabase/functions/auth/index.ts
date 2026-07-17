// Edge Function port of backend/src/routes/auth.ts (Express → Hono).
// Deployed with verify_jwt: false — auth is enforced per-route via requireAuth
// from _shared/auth.ts (so public routes like /login and /signup still run).
import { Hono } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAnonClient, newAnonClient, getUserClient, getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, type AuthEnv } from '../_shared/auth.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'
import { isPasswordPwned } from '../_shared/pwnedPassword.ts'
import { sendWelcomeEmail } from '../_shared/email.ts'

const app = new Hono<AuthEnv>().basePath('/auth')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

const FRONTEND_URL = Deno.env.get('FRONTEND_URL')

// Tight limiter for credential endpoints (10 attempts / 15 min), keyed on
// IP + email — mirrors express-rate-limit's authLimiter. Called inline in each
// handler because the key needs the request body's email.
const AUTH_MAX = 10
const AUTH_WINDOW = 15 * 60
async function authLimited(c: { req: { header(n: string): string | undefined } }, tag: string, email: string): Promise<boolean> {
  const key = `auth:${tag}:${clientIp(c as never)}:${email.toLowerCase()}`
  return !(await checkRateLimit(key, AUTH_MAX, AUTH_WINDOW))
}
const TOO_MANY = { error: 'Too many attempts. Please wait a few minutes and try again.' }

// Owner-safe profile columns (mirrors GET /me; omits stripe/role/access internals).
const PROFILE_PUBLIC_COLS =
  'id, email, name, avatar_url, level, plan, xp, streak, longest_streak, ' +
  'lessons_completed, speaking_minutes, last_active_date, created_at'

const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
})
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try { return (await c.req.json()) as Record<string, unknown> } catch { return {} }
}

// ── POST /auth/signup ─────────────────────────────────────────
app.post('/signup', async (c) => {
  const parse = signupSchema.safeParse(await body(c))
  if (!parse.success) return c.json({ error: parse.error.errors[0].message }, 400)
  const { email, password, name } = parse.data

  if (await authLimited(c, 'signup', email)) return c.json(TOO_MANY, 429)
  if (await isPasswordPwned(password)) {
    return c.json({ error: 'This password has appeared in a known data breach. Please choose a different one.' }, 400)
  }

  const { data, error } = await getAnonClient().auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${FRONTEND_URL}/auth/confirm` },
  })

  if (error) {
    // Never reveal whether the email already exists (account enumeration).
    if (error.message.includes('already registered')) {
      return c.json({ message: 'If that email is available, a confirmation link has been sent.' }, 200)
    }
    return c.json({ error: error.message }, 400)
  }

  // The welcome email is sent once at first login via POST /auth/welcome (deduped
  // via user_metadata + age-guarded), which also covers Google sign-ups. Sending
  // it here too would double-send and fire before the email is even confirmed.
  return c.json({
    message: 'Account created. Check your email to confirm.',
    user: { id: data.user?.id, email: data.user?.email, name },
    session: data.session,
  }, 201)
})

// ── POST /auth/login ──────────────────────────────────────────
app.post('/login', async (c) => {
  const parse = loginSchema.safeParse(await body(c))
  if (!parse.success) return c.json({ error: 'Invalid credentials format' }, 400)
  const { email, password } = parse.data

  if (await authLimited(c, 'login', email)) return c.json(TOO_MANY, 429)

  const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password })
  if (error) {
    if (error.message.includes('Email not confirmed')) {
      return c.json({ error: 'Please confirm your email before logging in' }, 403)
    }
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const { data: profile } = await getAnonClient()
    .from('profiles').select(PROFILE_PUBLIC_COLS).eq('id', data.user.id).single()

  return c.json({
    session: {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_at: data.session?.expires_at,
    },
    user: profile ?? { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name },
  })
})

// ── POST /auth/google ─────────────────────────────────────────
app.post('/google', async (c) => {
  const { data, error } = await getAnonClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${FRONTEND_URL}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error || !data.url) return c.json({ error: 'Failed to generate Google OAuth URL' }, 500)
  return c.json({ url: data.url })
})

// ── POST /auth/refresh ────────────────────────────────────────
app.post('/refresh', async (c) => {
  const { refresh_token } = await body(c)
  if (!refresh_token || typeof refresh_token !== 'string') return c.json({ error: 'refresh_token required' }, 400)
  if (await authLimited(c, 'refresh', '')) return c.json(TOO_MANY, 429)

  const { data, error } = await getAnonClient().auth.refreshSession({ refresh_token })
  if (error) return c.json({ error: 'Invalid or expired refresh token' }, 401)
  return c.json({
    access_token: data.session?.access_token,
    refresh_token: data.session?.refresh_token,
    expires_at: data.session?.expires_at,
  })
})

// ── POST /auth/logout ─────────────────────────────────────────
app.post('/logout', requireAuth, async (c) => {
  const token = c.get('token')
  await getAdminClient().auth.admin.signOut(token)
  return c.json({ message: 'Logged out successfully' })
})

// ── GET /auth/me ──────────────────────────────────────────────
app.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId')
  const db = getUserClient(c.get('token'))
  const { data: profile, error } = await db
    .from('profiles')
    .select(`id, email, name, avatar_url, level, plan, xp, streak, longest_streak,
             lessons_completed, speaking_minutes, last_active_date, created_at`)
    .eq('id', userId).single()
  if (error) return c.json({ error: 'Profile not found' }, 404)

  const { data: achievements } = await db
    .from('user_achievements')
    .select('achievement_id, unlocked_at, achievements(slug, name, icon)')
    .eq('user_id', userId)

  return c.json({ ...profile, achievements: achievements ?? [] })
})

// ── PUT /auth/me ──────────────────────────────────────────────
app.put('/me', requireAuth, async (c) => {
  const allowed = z.object({
    name: z.string().min(2).max(120).optional(),
    avatar_url: z.string().url().optional(),
  })
  const parse = allowed.safeParse(await body(c))
  if (!parse.success) return c.json({ error: parse.error.errors[0].message }, 400)

  const db = getUserClient(c.get('token'))
  const { data, error } = await db.from('profiles').update(parse.data).eq('id', c.get('userId')).select().single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// ── POST /auth/change-password ────────────────────────────────
app.post('/change-password', requireAuth, async (c) => {
  const parse = z.object({ new_password: z.string().min(8) }).safeParse(await body(c))
  if (!parse.success) return c.json({ error: parse.error.errors[0].message }, 400)
  const { new_password } = parse.data

  if (await authLimited(c, 'changepw', c.get('userId'))) return c.json(TOO_MANY, 429)
  if (await isPasswordPwned(new_password)) {
    return c.json({ error: 'This password has appeared in a known data breach. Please choose a different one.' }, 400)
  }

  const { error } = await getUserClient(c.get('token')).auth.updateUser({ password: new_password })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'Password updated successfully' })
})

// ── POST /auth/welcome ────────────────────────────────────────
// One-time welcome email at first login. Idempotent via user_metadata flag;
// skips accounts older than 7 days so a deploy never mass-mails existing users.
app.post('/welcome', requireAuth, async (c) => {
  const token = c.get('token')
  const client = getUserClient(token)
  const { data: { user }, error } = await client.auth.getUser(token)
  if (error || !user?.email) return c.json({ sent: false })

  if (user.user_metadata?.welcome_sent) return c.json({ sent: false, reason: 'already' })

  await client.auth.updateUser({ data: { welcome_sent: true } }).catch(() => {})

  const ageMs = Date.now() - new Date(user.created_at).getTime()
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return c.json({ sent: false, reason: 'existing_user' })

  const name = (user.user_metadata?.name as string) || undefined
  const ok = await sendWelcomeEmail(user.email, name)
  return c.json({ sent: ok })
})

// ── POST /auth/forgot-password ────────────────────────────────
app.post('/forgot-password', async (c) => {
  const parse = z.object({ email: z.string().email() }).safeParse(await body(c))
  if (!parse.success) return c.json({ error: 'Invalid email' }, 400)
  const { email } = parse.data
  if (await authLimited(c, 'forgot', email)) return c.json(TOO_MANY, 429)

  const { error } = await getAnonClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${FRONTEND_URL}/auth/reset-password`,
  })
  if (error) console.error('Reset password error:', error.message)
  // Always 200 to avoid email enumeration.
  return c.json({ message: 'If that email exists, a reset link has been sent.' })
})

// ── POST /auth/reset-password ─────────────────────────────────
app.post('/reset-password', async (c) => {
  const parse = z.object({ access_token: z.string(), new_password: z.string().min(8) }).safeParse(await body(c))
  if (!parse.success) return c.json({ error: 'Invalid request' }, 400)
  const { access_token, new_password } = parse.data

  if (await authLimited(c, 'reset', access_token.slice(0, 24))) return c.json(TOO_MANY, 429)
  if (await isPasswordPwned(new_password)) {
    return c.json({ error: 'This password has appeared in a known data breach. Please choose a different one.' }, 400)
  }

  // Fresh client: setSession + updateUser mutate this client's session, so it
  // must not be the shared singleton (concurrent resets would clobber it).
  const client = newAnonClient()
  const { error: sessionErr } = await client.auth.setSession({ access_token, refresh_token: access_token })
  if (sessionErr) return c.json({ error: 'Invalid reset token' }, 400)

  const { error } = await client.auth.updateUser({ password: new_password })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'Password updated successfully' })
})

Deno.serve(app.fetch)
