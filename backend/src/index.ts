// MUST be the very first import: loads .env before any module that reads
// process.env at import time (openai/anthropic clients). Import hoisting means
// a dotenv.config() call placed here would run too late.
import './load-env'
// Polyfill do WebSocket global (Node < 22) — tem de vir antes de qualquer
// createClient() do Supabase, senão requireAuth rebenta com 500. Ver ws-polyfill.ts.
import './ws-polyfill'

import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

import { authRouter } from './routes/auth'
import { chatRouter } from './routes/chat'
import { speakingRouter } from './routes/speaking'
import { schedulingRouter } from './routes/scheduling'
import { paymentsRouter } from './routes/payments'
import { accessRouter } from './routes/access'
import { adminRouter } from './routes/admin'
import { familyRouter } from './routes/family'
import { requireAuth, requireAdmin, requireActiveAccess } from './middleware/auth'

const app = express()
const PORT = process.env.PORT ?? 4000

// Deploy hosts (Railway, Render, Vercel, ...) sit behind a reverse proxy, so
// req.ip / X-Forwarded-For only work if Express trusts that proxy. Without
// this, express-rate-limit v7 throws on every request in production.
app.set('trust proxy', 1)

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true }))

// Stripe webhook signature verification needs the RAW request body, so its raw
// parser MUST run before express.json() - otherwise express.json() consumes the
// body first and constructEvent() rejects every event as an invalid signature.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Global rate limit - generous enough for a voice session, which fires several
// requests per turn (transcribe + respond + tts + usage).
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400, standardHeaders: true }))

// TEMP request logger for speaking/chat - shows arrivals, status, and hangs.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/speaking') || req.path.startsWith('/api/chat')) {
    const t = Date.now()
    res.on('finish', () => console.log(`[REQ] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - t}ms)`))
    res.on('close', () => { if (!res.writableEnded) console.log(`[REQ] ${req.method} ${req.path} -> NO RESPONSE / hung (${Date.now() - t}ms)`) })
  }
  next()
})

// Routes
app.use('/api/auth', authRouter)
// Chat + Speaking are the costly AI features - gate them behind an access check
// so a suspended or expired student can't run up cost. requireAuth runs first
// (sets userId), then requireActiveAccess (suspended / access_end), then routes.
app.use('/api/chat', requireAuth, requireActiveAccess, chatRouter)
app.use('/api/speaking', requireAuth, requireActiveAccess, speakingRouter)
app.use('/api/scheduling', schedulingRouter)
app.use('/api/payments', paymentsRouter)
// Access-code redemption. requireAuth only (a blocked/expired student MUST be able
// to redeem to get back in), so it is deliberately NOT behind requireActiveAccess.
app.use('/api/access', accessRouter)
app.use('/api/admin', requireAuth, requireAdmin, adminRouter)
// Family management: a parent manages their own family's accounts. requireAuth
// sets userId; the router itself verifies family ownership on every call.
app.use('/api/family', requireAuth, familyRouter)

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// Express error handler - a thrown error in a route returns 500 instead of
// bubbling up. Keeps one bad request from taking the server down.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled route error:', err)
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`🚀 Anglish AI backend running on http://localhost:${PORT}`)
})

// Process-level safety net: log and keep running instead of crashing the whole
// backend (which would break ALL AI features at once).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
