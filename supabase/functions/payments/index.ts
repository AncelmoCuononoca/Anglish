// Edge Function port of backend/src/routes/payments.ts (Express → Hono).
//
// Deployed with verify_jwt: false. Two routes with OPPOSITE auth needs live
// here, so auth is applied per-route (not app-wide like chat/speaking):
//   • POST /payments/checkout — behind requireAuth (a logged-in buyer).
//   • POST /payments/webhook  — PUBLIC (Stripe calls it with no JWT); trust
//     comes from the Stripe signature, verified against the RAW body.
//
// No npm:stripe SDK — see _shared/stripe.ts for why. The webhook reads the raw
// body via c.req.text() (NEVER c.req.json(), which would re-serialize and break
// the signature check).
import { Hono } from 'jsr:@hono/hono@4'
import { z } from 'npm:zod@3'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseClients.ts'
import { requireAuth, type AuthEnv } from '../_shared/auth.ts'
import { sendReceiptEmail } from '../_shared/email.ts'
import { createCheckoutSession, constructStripeEvent } from '../_shared/stripe.ts'

const app = new Hono<AuthEnv>().basePath('/payments')

app.use('*', async (c, next) => {
  const preflight = handlePreflight(c.req.raw)
  if (preflight) return preflight
  await next()
  for (const [k, v] of Object.entries(corsHeaders())) c.res.headers.set(k, v)
})

// ─────────────────────────────────────────────────────────────────────────────
// Catalog: every purchasable (plan, period) → one Stripe Price + what it grants.
//
// EUR / card payments only. Angola (Kwanza) still pays by IBAN over WhatsApp on
// the Plans page — that flow does NOT touch this file.
//
// `storedPlan` is the value written to profiles.plan (drives tiers/limits in
// frontend/src/lib/plans.ts). `months` is how much paid access each purchase
// grants (added to access_end). Subscriptions renew via invoice.paid; the Power
// pack is a one-time payment for 2 years.
// ─────────────────────────────────────────────────────────────────────────────
type PlanKey = 'basic' | 'super' | 'family' | 'family_tutor' | 'power' | 'topup'
type Period = 'monthly' | 'annual'

interface CatalogEntry {
  priceEnv: string           // env var holding the Stripe Price ID
  storedPlan: string         // value written to profiles.plan ('' for topup — no plan change)
  months: number             // access granted per purchase / renewal (0 for topup)
  mode: 'subscription' | 'payment'
  isTopup?: boolean          // true → credits speaking seconds instead of changing plan
}

const CATALOG: Record<string, CatalogEntry> = {
  'basic:monthly':        { priceEnv: 'STRIPE_PRICE_BASIC_MONTHLY',        storedPlan: 'basic',            months: 1,  mode: 'subscription' },
  'basic:annual':         { priceEnv: 'STRIPE_PRICE_BASIC_ANNUAL',         storedPlan: 'basic',            months: 12, mode: 'subscription' },
  'super:monthly':        { priceEnv: 'STRIPE_PRICE_SUPER_MONTHLY',        storedPlan: 'monthly',          months: 1,  mode: 'subscription' },
  'super:annual':         { priceEnv: 'STRIPE_PRICE_SUPER_ANNUAL',         storedPlan: 'annual',           months: 12, mode: 'subscription' },
  'family:monthly':       { priceEnv: 'STRIPE_PRICE_FAMILY_MONTHLY',       storedPlan: 'family',           months: 1,  mode: 'subscription' },
  'family:annual':        { priceEnv: 'STRIPE_PRICE_FAMILY_ANNUAL',        storedPlan: 'family',           months: 12, mode: 'subscription' },
  'family_tutor:monthly': { priceEnv: 'STRIPE_PRICE_FAMILY_TUTOR_MONTHLY', storedPlan: 'family_tutor',     months: 1,  mode: 'subscription' },
  'family_tutor:annual':  { priceEnv: 'STRIPE_PRICE_FAMILY_TUTOR_ANNUAL',  storedPlan: 'family_tutor',     months: 12, mode: 'subscription' },
  // Power is sold as a single 2-year pack (no monthly option on the Plans page).
  'power:annual':         { priceEnv: 'STRIPE_PRICE_POWER',                storedPlan: 'power_all_access', months: 24, mode: 'payment' },
  // Speaking Time Top-Up: €10 one-time, credits 30 min of extra speaking time.
  'topup:monthly':        { priceEnv: 'STRIPE_PRICE_TOPUP',                storedPlan: '',                 months: 0,  mode: 'payment', isTopup: true },
}

// Human-friendly names for receipts (keyed by the PlanKey the user bought).
const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  super: 'Super',
  family: 'Family',
  family_tutor: 'Family + Tutor',
  power: 'Power (2-year All-Access)',
  topup: 'Speaking Time Top-Up (30 min)',
}

function planLabel(plan: string, period?: Period): string {
  const base = PLAN_LABELS[plan] ?? plan
  if (plan === 'topup' || plan === 'power') return base
  return period === 'annual' ? `${base} (annual)` : `${base} (monthly)`
}

// Format a Stripe amount_total (minor units) + currency into a display string.
function formatAmount(amountTotal: number | null, currency: string | null): string {
  if (amountTotal == null) return ''
  const value = amountTotal / 100
  const cur = (currency || 'eur').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(value)
  } catch {
    return `${value.toFixed(2)} ${cur}`
  }
}

function entryFor(plan: PlanKey, period: Period): CatalogEntry | null {
  return CATALOG[`${plan}:${period}`] ?? null
}

function priceIdOf(entry: CatalogEntry): string {
  return Deno.env.get(entry.priceEnv) ?? ''
}

// Reverse lookup: a Stripe Price ID → its catalog entry. Used on renewals
// (invoice.paid) where all we get back is the price that was billed.
function entryByPriceId(priceId: string | null | undefined): CatalogEntry | null {
  if (!priceId) return null
  for (const entry of Object.values(CATALOG)) {
    if (priceIdOf(entry) === priceId) return entry
  }
  return null
}

// Extend a paid window: add `months`, never shrinking what the user already has
// (renewals start from the later of "now" and the current access_end).
function extendAccessEnd(currentEnd: string | null | undefined, months: number): string {
  const now = new Date()
  const base = currentEnd ? new Date(currentEnd) : now
  const from = base > now ? base : now
  from.setUTCMonth(from.getUTCMonth() + months)
  return from.toISOString().slice(0, 10) // YYYY-MM-DD
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// A date `days` before today (UTC), as YYYY-MM-DD. Used to expire access
// immediately on a refund: an access_end in the past ⇒ no active access.
function daysAgoStr(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try { return (await c.req.json()) as Record<string, unknown> } catch { return {} }
}

// ── POST /payments/checkout (EUR / card) ──────────────────────────────────────
app.post('/checkout', requireAuth, async (c) => {
  try {
    if (!Deno.env.get('STRIPE_SECRET_KEY')) {
      return c.json({ error: 'Card payments are not configured yet. Use the Angola / IBAN option, or contact support.' }, 503)
    }

    const parsed = z.object({
      plan: z.enum(['basic', 'super', 'family', 'family_tutor', 'power', 'topup']),
      period: z.enum(['monthly', 'annual']),
    }).safeParse(await body(c))
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
    const { plan, period } = parsed.data

    const entry = entryFor(plan, period)
    if (!entry) return c.json({ error: 'That plan / period is not available.' }, 400)

    const price = priceIdOf(entry)
    if (!price) return c.json({ error: 'This plan is not available for card payment yet.' }, 503)

    const userId = c.get('userId')
    const frontend = Deno.env.get('FRONTEND_URL') ?? ''

    const url = await createCheckoutSession({
      mode: entry.mode,
      price,
      userId,
      plan,
      period,
      successUrl: `${frontend}/dashboard?payment=success`,
      cancelUrl: `${frontend}/plans?payment=cancelled`,
    })

    return c.json({ url })
  } catch (err) {
    console.error('[payments] checkout failed:', err)
    return c.json({ error: 'Payment session failed' }, 500)
  }
})

// ── Apply an entitlement to a user's profile (service key, bypasses RLS) ───────
// ── Top-up: credit 30 min (1800 s) of extra speaking time, valid 1 month ─────
const TOPUP_SECONDS = 30 * 60
async function applyTopup(userId: string, customerId?: string | null) {
  const db = getAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('topup_seconds, topup_expires')
    .eq('id', userId)
    .maybeSingle()

  const now = new Date()
  const expires = new Date(now)
  expires.setUTCMonth(expires.getUTCMonth() + 1)

  const existing = (profile?.topup_seconds as number) ?? 0
  const existingExpires = profile?.topup_expires ? new Date(profile.topup_expires as string) : null
  const stillValid = existingExpires && existingExpires > now ? existing : 0

  const update: Record<string, unknown> = {
    topup_seconds: stillValid + TOPUP_SECONDS,
    topup_expires: expires.toISOString().slice(0, 10),
  }
  if (customerId) update.stripe_customer_id = customerId

  const { error } = await db.from('profiles').update(update).eq('id', userId)
  if (error) console.error('[payments] failed to apply topup:', error)
}

async function applyEntitlement(userId: string, entry: CatalogEntry, customerId?: string | null) {
  const db = getAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('access_end')
    .eq('id', userId)
    .maybeSingle()

  const update: Record<string, unknown> = {
    plan: entry.storedPlan,
    access_start: todayStr(),
    access_end: extendAccessEnd(profile?.access_end as string | null, entry.months),
  }
  if (customerId) update.stripe_customer_id = customerId

  const { error } = await db.from('profiles').update(update).eq('id', userId)
  if (error) console.error('[payments] failed to apply entitlement:', error)
}

// Minimal shapes of the Stripe objects the handler reads (no SDK types).
interface CheckoutSessionObj {
  client_reference_id?: string | null
  metadata?: { userId?: string; plan?: string; period?: string } | null
  customer?: string | null
  customer_details?: { email?: string | null } | null
  amount_total?: number | null
  currency?: string | null
}
interface InvoiceObj {
  billing_reason?: string | null
  customer?: string | null
  subscription_details?: { metadata?: { userId?: string } | null } | null
  lines?: { data?: Array<{ price?: { id?: string } | null; metadata?: { userId?: string } | null }> } | null
}
interface SubscriptionObj {
  metadata?: { userId?: string } | null
}
interface ChargeObj {
  customer?: string | null
  amount?: number | null
  amount_refunded?: number | null
  refunded?: boolean | null
}

// ── POST /payments/webhook ────────────────────────────────────────────────────
// PUBLIC (no requireAuth). Trust is the Stripe signature over the RAW body.
app.post('/webhook', async (c) => {
  const payload = await c.req.text() // RAW body — do not use c.req.json()
  const sig = c.req.header('stripe-signature') ?? null

  let event
  try {
    event = await constructStripeEvent(payload, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '')
  } catch (err) {
    console.error('[payments] webhook signature check failed:', err)
    return c.text('Webhook Error', 400)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as CheckoutSessionObj
        const userId = session.client_reference_id || session.metadata?.userId
        const plan = session.metadata?.plan as PlanKey | undefined
        const period = session.metadata?.period as Period | undefined
        const entry = plan && period ? entryFor(plan, period) : null
        if (userId && entry) {
          if (entry.isTopup) {
            await applyTopup(userId, session.customer as string | null)
          } else {
            await applyEntitlement(userId, entry, session.customer as string | null)
          }
          // Receipt email (no-op until RESEND_API_KEY is set).
          try {
            const { data: profile } = await getAdminClient()
              .from('profiles')
              .select('email, name, access_end')
              .eq('id', userId)
              .maybeSingle()
            const to = (profile?.email as string) || session.customer_details?.email || ''
            if (to) {
              await sendReceiptEmail({
                to,
                name: profile?.name as string | undefined,
                planLabel: planLabel(plan as string, period),
                amount: formatAmount(session.amount_total ?? null, session.currency ?? null),
                accessEnd: entry.isTopup ? undefined : (profile?.access_end as string | undefined),
              })
            }
          } catch (err) {
            console.error('[payments] receipt email failed:', err)
          }
        } else {
          console.warn('[payments] checkout.session.completed missing userId/plan', { userId, plan, period })
        }
        break
      }

      // Subscription renewals: extend the paid window. The first invoice fires
      // together with checkout.session.completed, so only act on later cycles.
      case 'invoice.paid': {
        const invoice = event.data.object as InvoiceObj
        if (invoice.billing_reason === 'subscription_cycle') {
          const line = invoice.lines?.data?.[0]
          const entry = entryByPriceId(line?.price?.id)
          const userId = invoice.subscription_details?.metadata?.userId
            ?? line?.metadata?.userId
          if (userId && entry) {
            await applyEntitlement(userId, entry, invoice.customer as string | null)
          }
        }
        break
      }

      // Subscription cancelled/ended: drop back to the free tier. Paid time
      // already granted (access_end) is left to run out naturally.
      case 'customer.subscription.deleted': {
        const sub = event.data.object as SubscriptionObj
        const userId = sub.metadata?.userId
        if (userId) {
          const { error } = await getAdminClient()
            .from('profiles').update({ plan: 'free' }).eq('id', userId)
          if (error) console.error('[payments] failed to downgrade on cancel:', error)
        }
        break
      }

      // Full refund: cut access the SAME DAY. A *cancellation* keeps the paid
      // window running out (case above); a *refund* gives the money back, so
      // access_end is pushed to yesterday ⇒ access ends now. The user is found
      // by stripe_customer_id (a refunded charge has no metadata.userId).
      // Partial refunds do NOT revoke access.
      // NOTE: always pair a refund with cancelling the subscription — otherwise
      // the next invoice.paid renewal would re-grant access.
      case 'charge.refunded': {
        const charge = event.data.object as ChargeObj
        const fullyRefunded = charge.refunded === true
          || (charge.amount != null && (charge.amount_refunded ?? 0) >= charge.amount)
        if (fullyRefunded && charge.customer) {
          const { error } = await getAdminClient()
            .from('profiles')
            .update({ plan: 'free', access_end: daysAgoStr(1) })
            .eq('stripe_customer_id', charge.customer)
          if (error) console.error('[payments] failed to revoke access on refund:', error)
        }
        break
      }
    }

    return c.json({ received: true })
  } catch (err) {
    console.error('[payments] webhook handler error:', err)
    // 200 so Stripe does not retry a handler bug forever; we logged it.
    return c.json({ received: true })
  }
})

Deno.serve(app.fetch)
