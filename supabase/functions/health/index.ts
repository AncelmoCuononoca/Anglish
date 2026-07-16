// Trivial health-check function. Purpose: prove the deploy pipeline, Hono
// routing, CORS helper, and env var access all work before building any real
// route group on top of them. Mirrors GET /api/health from the Express
// backend (no auth required).
import { Hono } from 'jsr:@hono/hono@4'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'

const app = new Hono().basePath('/health')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

app.get('/', (c) => c.json({ ok: true, ts: new Date().toISOString(), runtime: 'deno-edge' }))

Deno.serve(app.fetch)
