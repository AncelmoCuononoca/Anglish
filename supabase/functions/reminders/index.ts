// Daily study reminders. verify_jwt: false; called server-to-server (pg_cron via
// pg_net) and authenticated with a shared secret stored in `app_config`.
//
// Delivery: prefer a PHONE PUSH (Web Push / VAPID) and FALL BACK to email when
// the student has no active push subscription — e.g. browser-only users, or
// iPhone users who haven't installed the PWA to the Home Screen (Apple only
// allows web push for installed PWAs).
//
// Rules (decided with the founder):
//   • 3 nudges/day at 12:00, 17:30 and 21:00 in the STUDENT'S local timezone
//   • only to opted-in students with active access who haven't practised today
//   • never twice for the same (user, local day, slot) — reminder_log is the guard
import { Hono } from 'jsr:@hono/hono@4'
import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { sendInfoEmail } from '../_shared/email.ts'

const app = new Hono().basePath('/reminders')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

const DEFAULT_TZ = 'Africa/Luanda'
const WINDOW_MIN = 30

function site(): string {
  return Deno.env.get('FRONTEND_URL') || 'https://anglishme.com'
}

type SlotKey = 'noon' | 'afternoon' | 'evening'
interface Slot {
  key: SlotKey
  minutes: number
  subject: string       // email subject
  heading: string       // email heading
  bodyHtml: string      // email body
  pushTitle: string     // phone notification title
  pushBody: string      // phone notification body
}

const SLOTS: Slot[] = [
  {
    key: 'noon', minutes: 12 * 60,
    subject: 'Ainda não praticaste hoje 👀',
    heading: 'Boa tarde! A tua aula de hoje está à espera',
    bodyHtml: '<p style="margin:0 0 14px;">Ainda não fizeste a aula de hoje. Bastam <strong style="color:#ffffff;">5 minutos</strong> agora para manteres o teu streak vivo. 🔥</p>',
    pushTitle: 'Boa tarde! 👀',
    pushBody: 'Ainda não fizeste a aula de hoje. 5 minutos e mantés o streak 🔥',
  },
  {
    key: 'afternoon', minutes: 17 * 60 + 30,
    subject: 'A tua aula de hoje ainda está por fazer',
    heading: 'Boa tarde! Um bocadinho de inglês antes do fim do dia?',
    bodyHtml: '<p style="margin:0 0 14px;">Ainda vais a tempo de praticar hoje. Uma aula rápida agora e não perdes o ritmo que já construíste.</p><p style="margin:0 0 4px;">5 minutos fazem toda a diferença. 💪</p>',
    pushTitle: 'A tua aula está à espera',
    pushBody: 'Uma aula rápida agora e não perdes o ritmo 💪',
  },
  {
    key: 'evening', minutes: 21 * 60,
    subject: 'Últimos minutos para manteres o streak 🔥',
    heading: 'Boa noite! Antes de dormires, fecha o dia com uma aula',
    bodyHtml: '<p style="margin:0 0 14px;">O dia está quase a acabar e a tua aula de hoje ainda está à espera. <strong style="color:#ffffff;">5 minutinhos</strong> e o teu streak fica intacto.</p><p style="margin:0 0 4px;">Boa noite e bons estudos. 🌙</p>',
    pushTitle: 'Boa noite! 🌙',
    pushBody: 'Últimos minutos para manteres o teu streak hoje 🔥',
  },
]

function ctaFor(): { label: string; url: string } {
  // /dashboard is inside the PWA scope ('/'), so on a phone with the app the OS
  // opens the app; otherwise it opens the browser.
  return { label: 'Fazer a minha aula', url: `${site()}/dashboard` }
}

// The Angli mascot, at the END of the email body, right before the CTA button.
function mascotBlock(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:14px 0 2px;"><img src="${site()}/mascot/angli-watch.png" width="200" alt="Angli" style="display:block;width:200px;max-width:56%;height:auto;border:0;outline:none;text-decoration:none;" /></td></tr></table>`
}

function localNow(tz: string, now: Date): { localDate: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value
  let hh = Number(p.hour)
  if (hh === 24) hh = 0
  return { localDate: `${p.year}-${p.month}-${p.day}`, minutes: hh * 60 + Number(p.minute) }
}

function safeTz(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return DEFAULT_TZ
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return tz } catch { return DEFAULT_TZ }
}

async function authorized(c: { req: { header(n: string): string | undefined } }): Promise<boolean> {
  const provided = c.req.header('x-cron-key') || (c.req.header('authorization') || '').replace('Bearer ', '')
  if (!provided) return false
  const { data } = await getAdminClient().from('app_config').select('value').eq('key', 'reminder_secret').maybeSingle()
  const expected = data?.value as string | undefined
  return !!expected && provided === expected
}

// Load VAPID keys from app_config and arm web-push. Returns false if not set up.
let vapidReady = false
async function ensureVapid(db: SupabaseClient): Promise<boolean> {
  if (vapidReady) return true
  const { data } = await db.from('app_config').select('key,value').in('key', ['vapid_public', 'vapid_private'])
  const m: Record<string, string> = {}
  for (const r of data ?? []) m[r.key as string] = r.value as string
  if (!m.vapid_public || !m.vapid_private) return false
  try {
    webpush.setVapidDetails('mailto:support@anglishme.com', m.vapid_public, m.vapid_private)
    vapidReady = true
    return true
  } catch (e) {
    console.error('[reminders] VAPID setup failed:', e)
    return false
  }
}

interface PushPayload { title: string; body: string; url: string; tag: string }

// Try every registered device for this user. Prunes dead subscriptions (404/410).
async function sendPush(db: SupabaseClient, userId: string, payload: PushPayload): Promise<boolean> {
  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', userId)
  if (!subs || subs.length === 0) return false
  let ok = false
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
        JSON.stringify(payload),
      )
      ok = true
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint) // subscription gone
      } else {
        console.error('[reminders] push send failed:', code)
      }
    }
  }
  return ok
}

// Push first, email fallback. Returns which channel delivered (or null).
async function deliver(
  db: SupabaseClient, hasVapid: boolean,
  u: { id: string; email: string; name?: string | null }, slot: Slot,
): Promise<'push' | 'email' | null> {
  if (hasVapid) {
    const pushed = await sendPush(db, u.id, {
      title: slot.pushTitle, body: slot.pushBody, url: `${site()}/dashboard`, tag: `anglish-${slot.key}`,
    })
    if (pushed) return 'push'
  }
  const ok = await sendInfoEmail({
    to: u.email, name: u.name ?? undefined,
    subject: slot.subject, heading: slot.heading,
    bodyHtml: slot.bodyHtml + mascotBlock(), cta: ctaFor(),
  })
  return ok ? 'email' : null
}

app.post('/run', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401)
  const db = getAdminClient()
  const now = new Date()
  const hasVapid = await ensureVapid(db)

  const { data: users, error } = await db
    .from('profiles')
    .select('id, email, name, timezone, access_end, suspended, role, last_active_date')
    .eq('daily_reminder', true)
  if (error) { console.error('[reminders] candidate query failed:', error); return c.json({ error: 'query failed' }, 500) }

  let push = 0, email = 0, due = 0
  for (const u of users ?? []) {
    if (!u.email || u.suspended) continue
    const tz = safeTz(u.timezone)
    const { localDate, minutes } = localNow(tz, now)
    if (u.role !== 'admin' && u.access_end && (u.access_end as string) < localDate) continue
    const slot = SLOTS.find((s) => minutes >= s.minutes && minutes < s.minutes + WINDOW_MIN)
    if (!slot) continue
    due++
    if (u.last_active_date && (u.last_active_date as string) >= localDate) continue
    // Insert-first dedup: repeat (user, day, slot) is a hard error → never double-send.
    const { error: logErr } = await db.from('reminder_log').insert({ user_id: u.id, local_date: localDate, slot: slot.key })
    if (logErr) continue
    const channel = await deliver(db, hasVapid, { id: u.id as string, email: u.email as string, name: u.name as string | null }, slot)
    if (channel === 'push') push++
    else if (channel === 'email') email++
    else await db.from('reminder_log').delete().eq('user_id', u.id).eq('local_date', localDate).eq('slot', slot.key) // both failed → allow retry
  }

  return c.json({ ok: true, candidates: users?.length ?? 0, due, push, email })
})

// POST /reminders/test — body: { email, slot? }. Sends one reminder now (ignoring
// gates), preferring push if that account has a subscription. For validation.
app.post('/test', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json().catch(() => ({})) as { email?: string; slot?: SlotKey }
  if (!body.email) return c.json({ error: 'email required' }, 400)
  const slot = SLOTS.find((s) => s.key === body.slot) ?? SLOTS[0]
  const db = getAdminClient()
  const hasVapid = await ensureVapid(db)

  const { data: u } = await db.from('profiles').select('id, name').eq('email', body.email).maybeSingle()

  let channel: 'push' | 'email' | null = null
  if (u && hasVapid) {
    const pushed = await sendPush(db, u.id as string, {
      title: slot.pushTitle, body: slot.pushBody, url: `${site()}/dashboard`, tag: 'anglish-test',
    })
    if (pushed) channel = 'push'
  }
  if (!channel) {
    const ok = await sendInfoEmail({
      to: body.email, subject: `[TESTE] ${slot.subject}`,
      heading: slot.heading, bodyHtml: slot.bodyHtml + mascotBlock(), cta: ctaFor(),
    })
    channel = ok ? 'email' : null
  }
  return c.json({ ok: !!channel, channel })
})

Deno.serve(app.fetch)
