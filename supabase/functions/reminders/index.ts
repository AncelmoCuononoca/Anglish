// Daily study reminders. verify_jwt: false; called server-to-server (pg_cron via
// pg_net) and authenticated with a shared secret stored in `app_config`.
//
// Delivery is ONE channel only — never both:
//   • student has an active push subscription (app installed / notifications on)
//     → PHONE PUSH only. We never also email them.
//   • no push subscription (browser-only, or iPhone without the PWA installed)
//     → EMAIL only.
//
// Rules (decided with the founder):
//   • 3 nudges/day at 12:00, 17:30 and 21:00 in the STUDENT'S local timezone
//   • only to opted-in students with active access
//   • skip anyone who already FINISHED a block (10 exercises) today
//   • if they STARTED today but didn't finish, send the "quase a terminar" copy
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

// Copy actually delivered for one student (either the slot's default "not started
// today" copy, or the "started but not finished" variant).
interface Copy {
  subject: string
  heading: string
  bodyHtml: string
  pushTitle: string
  pushBody: string
  tag: string
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

// "Started the lesson today but didn't finish the block" — nudge to CONCLUDE,
// not to start. Greeting stays time-correct per slot.
function partialCopy(slot: Slot): Copy {
  const g = slot.key === 'evening' ? 'Boa noite' : 'Boa tarde'
  return {
    subject: 'Falta pouco para terminares a aula de hoje 💪',
    heading: `${g}! Estás quase a terminar`,
    bodyHtml: '<p style="margin:0 0 14px;">Já começaste a aula de hoje — falta só um bocadinho para a <strong style="color:#ffffff;">concluíres</strong> e manteres o teu streak. 💪🔥</p>',
    pushTitle: 'Falta pouco! 💪',
    pushBody: 'Estás quase a terminar a aula de hoje. Só mais um bocadinho 🔥',
    tag: `anglish-${slot.key}`,
  }
}

function defaultCopy(slot: Slot): Copy {
  return {
    subject: slot.subject, heading: slot.heading, bodyHtml: slot.bodyHtml,
    pushTitle: slot.pushTitle, pushBody: slot.pushBody, tag: `anglish-${slot.key}`,
  }
}

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

// Local calendar date (YYYY-MM-DD) of an instant in a timezone.
function localDateOf(tz: string, at: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value
  return `${p.year}-${p.month}-${p.day}`
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
type Sub = { endpoint: string; p256dh: string; auth: string }

async function getSubs(db: SupabaseClient, userId: string): Promise<Sub[]> {
  const { data } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', userId)
  return (data ?? []) as Sub[]
}

// Send to every registered device. Prunes dead subscriptions (404/410).
// Returns whether any device delivered, and how many subscriptions remain valid
// (delivered OR transient failure) — a device that returned 404/410 is gone.
async function sendPush(db: SupabaseClient, subs: Sub[], payload: PushPayload): Promise<{ delivered: boolean; alive: number }> {
  let delivered = false, alive = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
      delivered = true; alive++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint) // subscription gone
      } else {
        alive++ // still a valid device, just a transient failure — don't email instead
        console.error('[reminders] push send failed:', code)
      }
    }
  }
  return { delivered, alive }
}

// Did the student START a lesson today (their local day) without finishing the
// current block? Used to switch the copy to "quase a terminar".
async function startedTodayUnfinished(
  db: SupabaseClient, userId: string, tz: string, localDate: string,
): Promise<boolean> {
  const { data } = await db.from('lesson_progress')
    .select('state, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
  const row = (data ?? [])[0] as { state: { done?: boolean; idx?: number; xpEarned?: number } | null; updated_at: string } | undefined
  if (!row || !row.state) return false
  if (localDateOf(tz, new Date(row.updated_at)) !== localDate) return false
  const st = row.state
  return st.done !== true && ((st.idx ?? 0) > 0 || (st.xpEarned ?? 0) > 0)
}

// localDate minus n days, as YYYY-MM-DD.
function daysAgo(localDate: string, n: number): string {
  const d = new Date(localDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// One channel only: push if the student has a live subscription, otherwise email.
// `appUser` = opened the installed app recently → we NEVER email them (they get
// a phone notification, or nothing if they turned notifications off).
async function deliver(
  db: SupabaseClient, hasVapid: boolean,
  u: { id: string; email: string; name?: string | null }, copy: Copy, appUser: boolean,
): Promise<'push' | 'email' | null> {
  const subs = hasVapid ? await getSubs(db, u.id) : []
  // Anyone with the app (opened it recently, or has a push subscription) is
  // NEVER emailed — push, or nothing. Only browser-only users get email.
  const hasApp = appUser || subs.length > 0
  if (subs.length > 0) {
    const { delivered, alive } = await sendPush(db, subs, {
      title: copy.pushTitle, body: copy.pushBody, url: `${site()}/dashboard`, tag: copy.tag,
    })
    if (delivered || alive > 0) return 'push'
  }
  if (hasApp) return null // app user (stale/absent push) → don't fall back to email
  const ok = await sendInfoEmail({
    to: u.email, name: u.name ?? undefined,
    subject: copy.subject, heading: copy.heading,
    bodyHtml: copy.bodyHtml + mascotBlock(), cta: ctaFor(),
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
    .select('id, email, name, timezone, access_end, suspended, role, last_active_date, last_app_open')
    .eq('daily_reminder', true)
  if (error) { console.error('[reminders] candidate query failed:', error); return c.json({ error: 'query failed' }, 500) }

  let push = 0, email = 0, due = 0, doneToday = 0
  for (const u of users ?? []) {
    if (!u.email || u.suspended) continue
    if (u.role === 'admin') continue // staff don't get study reminders
    const tz = safeTz(u.timezone)
    const { localDate, minutes } = localNow(tz, now)
    if (u.role !== 'admin' && u.access_end && (u.access_end as string) < localDate) continue
    const slot = SLOTS.find((s) => minutes >= s.minutes && minutes < s.minutes + WINDOW_MIN)
    if (!slot) continue
    due++
    // Finished a block (earned XP) today → nothing to nudge about.
    if (u.last_active_date && (u.last_active_date as string) >= localDate) { doneToday++; continue }
    // Insert-first dedup: repeat (user, day, slot) is a hard error → never double-send.
    const { error: logErr } = await db.from('reminder_log').insert({ user_id: u.id, local_date: localDate, slot: slot.key })
    if (logErr) continue
    const partial = await startedTodayUnfinished(db, u.id as string, tz, localDate)
    const copy = partial ? partialCopy(slot) : defaultCopy(slot)
    // App user = opened the installed app in the last 14 days → never email.
    const appUser = !!u.last_app_open && (u.last_app_open as string) >= daysAgo(localDate, 14)
    const channel = await deliver(db, hasVapid, { id: u.id as string, email: u.email as string, name: u.name as string | null }, copy, appUser)
    if (channel === 'push') push++
    else if (channel === 'email') email++
    else await db.from('reminder_log').delete().eq('user_id', u.id).eq('local_date', localDate).eq('slot', slot.key) // both failed → allow retry
  }

  return c.json({ ok: true, candidates: users?.length ?? 0, due, doneToday, push, email })
})

// POST /reminders/test — body: { email, slot?, partial? }. Sends one reminder now
// (ignoring gates), using the same one-channel logic. For validation.
app.post('/test', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json().catch(() => ({})) as { email?: string; slot?: SlotKey; partial?: boolean }
  if (!body.email) return c.json({ error: 'email required' }, 400)
  const slot = SLOTS.find((s) => s.key === body.slot) ?? SLOTS[0]
  const db = getAdminClient()
  const hasVapid = await ensureVapid(db)

  const { data: u } = await db.from('profiles').select('id, name').eq('email', body.email).maybeSingle()
  const baseCopy = body.partial ? partialCopy(slot) : defaultCopy(slot)
  const copy: Copy = { ...baseCopy, subject: `[TESTE] ${baseCopy.subject}`, tag: 'anglish-test' }

  const channel = await deliver(
    db, hasVapid,
    { id: (u?.id as string) ?? '', email: body.email, name: (u?.name as string | null) ?? null },
    copy, false,
  )
  return c.json({ ok: !!channel, channel })
})

Deno.serve(app.fetch)
