// Web Push subscription management. verify_jwt: false; each route uses
// requireAuth so a caller only ever manages their own device subscriptions.
// The actual push SENDING lives in the reminders function (with email fallback).
import { Hono } from 'jsr:@hono/hono@4'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, type AuthEnv } from '../_shared/auth.ts'

const app = new Hono<AuthEnv>().basePath('/push')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

// POST /push/subscribe — body: a PushSubscription JSON { endpoint, keys:{p256dh,auth} }
app.post('/subscribe', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({})) as {
    endpoint?: string; keys?: { p256dh?: string; auth?: string }
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: 'invalid subscription' }, 400)
  }
  const db = getAdminClient()
  const { error } = await db.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) {
    console.error('[push] subscribe failed:', error)
    return c.json({ error: 'could not save subscription' }, 500)
  }
  // Enabling notifications = this student uses the installed app. Mark it durably
  // so reminders never email them, even if the subscription later goes stale.
  await db.from('profiles').update({ last_app_open: new Date().toISOString().slice(0, 10) }).eq('id', userId)
  return c.json({ ok: true })
})

// POST /push/unsubscribe — body: { endpoint? }. Removes that device (or all of
// the caller's devices if no endpoint given).
app.post('/unsubscribe', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({})) as { endpoint?: string }
  const db = getAdminClient()
  if (body.endpoint) {
    await db.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  } else {
    await db.from('push_subscriptions').delete().eq('user_id', userId)
  }
  return c.json({ ok: true })
})

Deno.serve(app.fetch)
