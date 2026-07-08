import express, { Router } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { getAdminClient } from '../lib/supabase'
import { requireAuth, type AuthRequest } from '../middleware/auth'

export const paymentsRouter = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
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

function entryFor(plan: PlanKey, period: Period): CatalogEntry | null {
  return CATALOG[`${plan}:${period}`] ?? null
}

function priceIdOf(entry: CatalogEntry): string {
  return process.env[entry.priceEnv] ?? ''
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
export function extendAccessEnd(currentEnd: string | null | undefined, months: number): string {
  const now = new Date()
  const base = currentEnd ? new Date(currentEnd) : now
  const from = base > now ? base : now
  from.setUTCMonth(from.getUTCMonth() + months)
  return from.toISOString().slice(0, 10) // YYYY-MM-DD
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Create a Checkout Session (EUR / card) ────────────────────────────────────
paymentsRouter.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Card payments are not configured yet. Use the Angola / IBAN option, or contact support.' })
    }

    const { plan, period } = z.object({
      plan: z.enum(['basic', 'super', 'family', 'family_tutor', 'power', 'topup']),
      period: z.enum(['monthly', 'annual']),
    }).parse(req.body)

    const entry = entryFor(plan, period)
    if (!entry) return res.status(400).json({ error: 'That plan / period is not available.' })

    const price = priceIdOf(entry)
    if (!price) return res.status(503).json({ error: 'This plan is not available for card payment yet.' })

    const userId = (req as AuthRequest).userId

    const session = await stripe.checkout.sessions.create({
      mode: entry.mode,
      payment_method_types: ['card'],
      // Lets the buyer enter a Stripe promotion code (e.g. the 10% promo) at checkout.
      allow_promotion_codes: true,
      line_items: [{ price, quantity: 1 }],
      // client_reference_id ties the payment to a Supabase user with certainty -
      // far more reliable than matching on email.
      client_reference_id: userId,
      metadata: { userId, plan, period },
      // Subscriptions also stamp the userId on the subscription so renewals
      // (invoice.paid) can find the right profile.
      subscription_data: entry.mode === 'subscription' ? { metadata: { userId, plan, period } } : undefined,
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/plans?payment=cancelled`,
    })

    res.json({ url: session.url })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request' })
    console.error('[payments] checkout failed:', err)
    res.status(500).json({ error: 'Payment session failed' })
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

// ── Stripe webhook ────────────────────────────────────────────────────────────
// Raw body is registered app-level (index.ts) BEFORE express.json(); express.raw
// here is a harmless no-op second pass that keeps the router self-contained.
paymentsRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err) {
    console.error('[payments] webhook signature check failed:', err)
    return res.status(400).send('Webhook Error')
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
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
        } else {
          console.warn('[payments] checkout.session.completed missing userId/plan', { userId, plan, period })
        }
        break
      }

      // Subscription renewals: extend the paid window. The first invoice fires
      // together with checkout.session.completed, so only act on later cycles.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.billing_reason === 'subscription_cycle') {
          const line = invoice.lines?.data?.[0]
          const entry = entryByPriceId(line?.price?.id)
          const userId = (invoice.subscription_details?.metadata?.userId as string | undefined)
            ?? (line?.metadata?.userId as string | undefined)
          if (userId && entry) {
            await applyEntitlement(userId, entry, invoice.customer as string | null)
          }
        }
        break
      }

      // Subscription cancelled/ended: drop back to the free tier. Paid time
      // already granted (access_end) is left to run out naturally.
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId as string | undefined
        if (userId) {
          const { error } = await getAdminClient()
            .from('profiles').update({ plan: 'free' }).eq('id', userId)
          if (error) console.error('[payments] failed to downgrade on cancel:', error)
        }
        break
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[payments] webhook handler error:', err)
    // 200 so Stripe does not retry a handler bug forever; we logged it.
    res.json({ received: true })
  }
})
