/**
 * One-shot Stripe setup for Anglish Me.
 *
 * Creates every Product + Price the checkout needs and prints the .env lines to
 * paste into the backend .env (local) and Railway (production). Idempotent: it
 * reuses existing products (fixed ids) and prices (lookup_key), so you can run
 * it again safely after changing a price.
 *
 * USAGE
 *   1. Create a Stripe account and switch to TEST mode.
 *   2. Dashboard → Developers → API keys → copy the "Secret key" (sk_test_...).
 *   3. Put it in backend/.env as:  STRIPE_SECRET_KEY=sk_test_...
 *   4. From the backend/ folder run:  npm run setup:stripe
 *   5. Paste the printed STRIPE_PRICE_* lines into backend/.env and Railway.
 *
 * Prices mirror the amounts shown on the Plans page (EUR). Change AMOUNTS below
 * and re-run to update them.
 */
import dotenv from 'dotenv'
import path from 'path'
import Stripe from 'stripe'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('\n✖ STRIPE_SECRET_KEY is missing. Put your test secret key (sk_test_...) in backend/.env first.\n')
  process.exit(1)
}
const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion })
const MODE = key.startsWith('sk_live') ? 'LIVE' : 'TEST'

type Interval = 'month' | 'year' | null // null = one-time payment

interface PriceDef {
  env: string          // env var the backend reads (see routes/payments.ts CATALOG)
  lookup: string       // Stripe lookup_key — makes re-runs idempotent
  amount: number       // cents, EUR
  interval: Interval
}
interface PlanDef {
  productId: string    // fixed id → idempotent product
  name: string
  prices: PriceDef[]
}

// Amounts (EUR cents) match frontend/src/pages/PlansPage.tsx.
const PLANS: PlanDef[] = [
  { productId: 'anglish_basic', name: 'Anglish Me — Basic', prices: [
    { env: 'STRIPE_PRICE_BASIC_MONTHLY', lookup: 'anglish_basic_monthly', amount: 2500,  interval: 'month' },
    { env: 'STRIPE_PRICE_BASIC_ANNUAL',  lookup: 'anglish_basic_annual',  amount: 27900, interval: 'year' },
  ]},
  { productId: 'anglish_super', name: 'Anglish Me — Super', prices: [
    { env: 'STRIPE_PRICE_SUPER_MONTHLY', lookup: 'anglish_super_monthly', amount: 4500,  interval: 'month' },
    { env: 'STRIPE_PRICE_SUPER_ANNUAL',  lookup: 'anglish_super_annual',  amount: 48600, interval: 'year' },
  ]},
  { productId: 'anglish_family', name: 'Anglish Me — Family', prices: [
    { env: 'STRIPE_PRICE_FAMILY_MONTHLY', lookup: 'anglish_family_monthly', amount: 12500,  interval: 'month' },
    { env: 'STRIPE_PRICE_FAMILY_ANNUAL',  lookup: 'anglish_family_annual',  amount: 129000, interval: 'year' },
  ]},
  { productId: 'anglish_family_tutor', name: 'Anglish Me — Family + Tutor', prices: [
    { env: 'STRIPE_PRICE_FAMILY_TUTOR_MONTHLY', lookup: 'anglish_family_tutor_monthly', amount: 25000,  interval: 'month' },
    { env: 'STRIPE_PRICE_FAMILY_TUTOR_ANNUAL',  lookup: 'anglish_family_tutor_annual',  amount: 255000, interval: 'year' },
  ]},
  // Power = single one-time payment for 2 years of access.
  { productId: 'anglish_power', name: 'Anglish Me — Power All Access (2 years)', prices: [
    { env: 'STRIPE_PRICE_POWER', lookup: 'anglish_power', amount: 96000, interval: null },
  ]},
]

async function ensureProduct(id: string, name: string): Promise<string> {
  try {
    const existing = await stripe.products.retrieve(id)
    return existing.id
  } catch {
    const created = await stripe.products.create({ id, name })
    return created.id
  }
}

async function ensurePrice(productId: string, def: PriceDef): Promise<string> {
  const recurring = def.interval ? { interval: def.interval } : undefined
  // Reuse an existing price with the same lookup_key IF nothing changed.
  const found = await stripe.prices.list({ lookup_keys: [def.lookup], active: true, limit: 1 })
  const p = found.data[0]
  const sameInterval = (p?.recurring?.interval ?? null) === def.interval
  if (p && p.unit_amount === def.amount && p.currency === 'eur' && sameInterval) {
    return p.id
  }
  // Otherwise create a fresh price and move the lookup_key onto it.
  const created = await stripe.prices.create({
    product: productId,
    currency: 'eur',
    unit_amount: def.amount,
    lookup_key: def.lookup,
    transfer_lookup_key: true,
    ...(recurring ? { recurring } : {}),
  })
  return created.id
}

async function main() {
  console.log(`\n▶ Setting up Stripe products/prices in ${MODE} mode…\n`)
  const envLines: string[] = []

  for (const plan of PLANS) {
    const productId = await ensureProduct(plan.productId, plan.name)
    for (const price of plan.prices) {
      const priceId = await ensurePrice(productId, price)
      const euros = (price.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
      const period = price.interval ? `/${price.interval}` : ' one-time'
      console.log(`  ✓ ${plan.name} — €${euros}${period}  →  ${priceId}`)
      envLines.push(`${price.env}=${priceId}`)
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('Paste these into backend/.env AND Railway variables:\n')
  console.log(envLines.join('\n'))
  console.log('\nAlso set (from the Stripe dashboard):')
  console.log('  STRIPE_SECRET_KEY=sk_' + (MODE === 'LIVE' ? 'live' : 'test') + '_...   (Developers → API keys)')
  console.log('  STRIPE_WEBHOOK_SECRET=whsec_...   (Developers → Webhooks → add endpoint')
  console.log('     → URL: https://anglish-production.up.railway.app/api/payments/webhook')
  console.log('     → events: checkout.session.completed, invoice.paid, customer.subscription.deleted)')
  console.log('──────────────────────────────────────────────────────────────\n')
}

main().catch((err) => {
  console.error('\n✖ Stripe setup failed:', err?.message ?? err, '\n')
  process.exit(1)
})
