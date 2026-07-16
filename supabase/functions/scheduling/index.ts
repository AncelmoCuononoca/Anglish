// Edge Function port of backend/src/routes/scheduling.ts (Express → Hono).
// Deployed with verify_jwt: false. Per-route auth:
//   • POST /scheduling  — PUBLIC live-class booking (landing form).
//   • GET  /scheduling  — admin-only list (requireAuth + requireAdmin).
//
// Two fixes vs. the Express original, which never actually worked (and which the
// current frontend bypasses in favour of a wa.me link, so nothing regresses):
//   1. It inserted columns `name`/`email`, but the table has student_name/
//      student_email — every insert would have failed. Mapped correctly here.
//   2. It used the anon client, but RLS on scheduled_lessons only allows
//      `authenticated` INSERT, so a public (anon) booking was blocked. This uses
//      the service client for the validated, server-stamped insert.
// Twilio WhatsApp notify is via fetch (no npm:twilio SDK); it stays a no-op
// until TWILIO_* / ADMIN_WHATSAPP secrets are set (as in prod today).
import { Hono, type Context } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, requireAdmin, type AuthEnv } from '../_shared/auth.ts'

const app = new Hono<AuthEnv>()

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

const bookingSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().min(8),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  preferred_date: z.string(),
  notes: z.string().optional(),
})

async function body(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try { return await c.req.json() } catch { return {} }
}

// Best-effort WhatsApp notify to the admin via the Twilio REST API (no SDK).
// No-op unless TWILIO_ACCOUNT_SID is configured — same as prod on Railway.
async function notifyAdminWhatsApp(msg: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNum = Deno.env.get('TWILIO_WHATSAPP_FROM')
  const toNum = Deno.env.get('ADMIN_WHATSAPP')
  if (!sid || !token || !fromNum || !toNum) return
  try {
    const form = new URLSearchParams({
      From: `whatsapp:${fromNum}`,
      To: `whatsapp:${toNum}`,
      Body: msg,
    })
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    if (!res.ok) console.error('[scheduling] Twilio notify failed:', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('[scheduling] Twilio notify error:', err)
  }
}

// ── POST /scheduling — public booking ─────────────────────────
async function createBooking(c: Context<AuthEnv>) {
  try {
    const parsed = bookingSchema.safeParse(await body(c))
    if (!parsed.success) return c.json({ error: 'Invalid booking details' }, 400)
    const data = parsed.data

    // Service client: public endpoint, RLS blocks anon INSERT. Columns mapped to
    // the real schema (student_name / student_email), status stamped server-side.
    const { error } = await getAdminClient().from('scheduled_lessons').insert({
      student_name: data.name,
      student_email: data.email,
      whatsapp: data.whatsapp,
      level: data.level,
      preferred_date: data.preferred_date,
      notes: data.notes ?? null,
      status: 'pending',
    })
    if (error) throw error

    const adminMsg = `📅 *New Class Request*\n\nStudent: ${data.name}\nEmail: ${data.email}\nWhatsApp: ${data.whatsapp}\nLevel: ${data.level}\nDate: ${data.preferred_date}\nNotes: ${data.notes ?? 'None'}`
    await notifyAdminWhatsApp(adminMsg)

    return c.json({ success: true })
  } catch (err) {
    console.error('[scheduling] booking failed:', err)
    return c.json({ error: 'Booking failed' }, 500)
  }
}

// ── GET /scheduling — admin list (PII) ────────────────────────
async function listBookings(c: Context<AuthEnv>) {
  const { data, error } = await getAdminClient()
    .from('scheduled_lessons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
}

// Register both with and without the trailing slash (Supabase invokes the
// function at /functions/v1/scheduling; clients may add a slash).
app.post('/scheduling', createBooking)
app.post('/scheduling/', createBooking)
app.get('/scheduling', requireAuth, requireAdmin, listBookings)
app.get('/scheduling/', requireAuth, requireAdmin, listBookings)

Deno.serve(app.fetch)
