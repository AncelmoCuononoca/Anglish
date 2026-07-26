// Daily study reminders. Deployed with verify_jwt: false and called
// server-to-server (pg_cron via pg_net), NOT from the browser — so instead of a
// user JWT it authenticates with a shared secret stored in `app_config`
// (service-role-only table). Two routes:
//   • POST /reminders/run  — the cron sweep, sends due reminders
//   • POST /reminders/test — sends one reminder to a given address, for validation
//
// Rules (decided with the founder):
//   • 3 nudges per day at 12:00, 17:30 and 21:00 in the STUDENT'S local timezone
//   • only to students who opted in (profiles.daily_reminder) and still have
//     active access, and who have NOT practised yet today
//   • never twice for the same (user, local day, slot) — reminder_log is the guard
import { Hono } from 'jsr:@hono/hono@4'
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
const WINDOW_MIN = 30 // cron fires every 30 min; a slot is "due" within its half-hour

type SlotKey = 'noon' | 'afternoon' | 'evening'
interface Slot {
  key: SlotKey
  minutes: number // minutes-since-midnight, local
  subject: string
  heading: string
  bodyHtml: string
}

// Copy is Portuguese on purpose — every student is a Portuguese speaker, and a
// nudge converts far better in their own language than in the English they're
// still learning. Easy to swap per-locale later.
const SLOTS: Slot[] = [
  {
    key: 'noon',
    minutes: 12 * 60,
    subject: 'Ainda não praticaste hoje 👀',
    heading: 'Bom dia! A tua aula de hoje está à espera',
    bodyHtml:
      '<p style="margin:0 0 14px;">Ainda não fizeste a aula de hoje. Bastam <strong style="color:#ffffff;">5 minutos</strong> agora para manteres o teu streak vivo. 🔥</p>',
  },
  {
    key: 'afternoon',
    minutes: 17 * 60 + 30,
    subject: 'A tua aula de hoje ainda está por fazer',
    heading: 'Um bocadinho de inglês antes do fim do dia?',
    bodyHtml:
      '<p style="margin:0 0 14px;">Ainda vais a tempo de praticar hoje. Uma aula rápida agora e não perdes o ritmo que já construíste.</p>' +
      '<p style="margin:0 0 4px;">5 minutos fazem toda a diferença. 💪</p>',
  },
  {
    key: 'evening',
    minutes: 21 * 60,
    subject: 'Últimos minutos para manteres o streak 🔥',
    heading: 'Antes de dormires, fecha o dia com uma aula',
    bodyHtml:
      '<p style="margin:0 0 14px;">O dia está quase a acabar e a tua aula de hoje ainda está à espera. <strong style="color:#ffffff;">5 minutinhos</strong> e o teu streak fica intacto.</p>' +
      '<p style="margin:0 0 4px;">Boa noite e bons estudos. 🌙</p>',
  },
]

function ctaFor(): { label: string; url: string } {
  const site = Deno.env.get('FRONTEND_URL') || 'https://anglishme.com'
  // /dashboard is inside the PWA scope ('/'), so on a phone with Anglish Me
  // installed the OS opens the app; otherwise it opens in the browser.
  return { label: 'Fazer a minha aula', url: `${site}/dashboard` }
}

// The Angli mascot, hosted on our own domain (transparent PNG). Centered,
// email-safe markup — sits at the top of every reminder body.
function mascotBlock(): string {
  const site = Deno.env.get('FRONTEND_URL') || 'https://anglishme.com'
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 18px;"><img src="${site}/mascot/angli-watch.png" width="200" alt="Angli" style="display:block;width:200px;max-width:56%;height:auto;border:0;outline:none;text-decoration:none;" /></td></tr></table>`
}

// Local calendar date (YYYY-MM-DD) and minutes-since-midnight for a timezone.
function localNow(tz: string, now: Date): { localDate: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value
  let hh = Number(p.hour)
  if (hh === 24) hh = 0 // some runtimes emit "24" at midnight
  return { localDate: `${p.year}-${p.month}-${p.day}`, minutes: hh * 60 + Number(p.minute) }
}

function safeTz(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return DEFAULT_TZ
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

// Shared-secret gate. The caller must present the value held in app_config.
async function authorized(c: { req: { header(n: string): string | undefined } }): Promise<boolean> {
  const provided = c.req.header('x-cron-key') || (c.req.header('authorization') || '').replace('Bearer ', '')
  if (!provided) return false
  const { data } = await getAdminClient()
    .from('app_config').select('value').eq('key', 'reminder_secret').maybeSingle()
  const expected = data?.value as string | undefined
  return !!expected && provided === expected
}

// ── POST /reminders/run ───────────────────────────────────────
// The cron sweep. Idempotent per slot per day via reminder_log insert-first.
app.post('/run', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401)
  const db = getAdminClient()
  const now = new Date()

  const { data: users, error } = await db
    .from('profiles')
    .select('id, email, name, timezone, access_end, suspended, role, last_active_date')
    .eq('daily_reminder', true)
  if (error) {
    console.error('[reminders] candidate query failed:', error)
    return c.json({ error: 'query failed' }, 500)
  }

  let sent = 0, due = 0
  for (const u of users ?? []) {
    if (!u.email || u.suspended) continue
    const tz = safeTz(u.timezone)
    const { localDate, minutes } = localNow(tz, now)

    // Active-access gate (admins bypass, like requireActiveAccess).
    if (u.role !== 'admin' && u.access_end && (u.access_end as string) < localDate) continue

    // Which slot, if any, is due right now for this student?
    const slot = SLOTS.find((s) => minutes >= s.minutes && minutes < s.minutes + WINDOW_MIN)
    if (!slot) continue
    due++

    // Already practised today (local)? Then no nudge.
    if (u.last_active_date && (u.last_active_date as string) >= localDate) continue

    // Insert-first dedup: the PK (user_id, local_date, slot) makes a repeat a
    // hard error, so we never double-send even if the sweep overlaps.
    const { error: logErr } = await db.from('reminder_log')
      .insert({ user_id: u.id, local_date: localDate, slot: slot.key })
    if (logErr) continue // 23505 → already sent this slot today

    const ok = await sendInfoEmail({
      to: u.email as string,
      name: (u.name as string) ?? undefined,
      subject: slot.subject,
      heading: slot.heading,
      bodyHtml: mascotBlock() + slot.bodyHtml,
      cta: ctaFor(),
    })
    if (ok) sent++
  }

  return c.json({ ok: true, candidates: users?.length ?? 0, due, sent })
})

// ── POST /reminders/test ──────────────────────────────────────
// Body: { email, slot? }. Sends one reminder immediately, ignoring all gates.
// For validating deliverability before the cron is switched on.
app.post('/test', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json().catch(() => ({})) as { email?: string; slot?: SlotKey }
  if (!body.email) return c.json({ error: 'email required' }, 400)
  const slot = SLOTS.find((s) => s.key === body.slot) ?? SLOTS[0]
  const ok = await sendInfoEmail({
    to: body.email,
    subject: `[TESTE] ${slot.subject}`,
    heading: slot.heading,
    bodyHtml: mascotBlock() + slot.bodyHtml,
    cta: ctaFor(),
  })
  return c.json({ ok })
})

Deno.serve(app.fetch)
