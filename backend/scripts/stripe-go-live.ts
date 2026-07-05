/**
 * Stripe GO-LIVE for Anglish Me — one shot, secrets never printed.
 *
 * Does everything needed to accept real card payments in production:
 *   1. Creates every Product + Price the checkout needs (idempotent).
 *   2. Creates the webhook endpoint pointing at the Railway backend and
 *      captures its signing secret (whsec_…) — only available at creation time.
 *   3. Writes STRIPE_PRICE_* and STRIPE_WEBHOOK_SECRET into backend/.env in
 *      place (never echoed to the console).
 *   4. With --push, sets STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + all price
 *      IDs on Railway in a SINGLE call (one redeploy), values never printed.
 *
 * USAGE
 *   1. Put your LIVE secret key in backend/.env:  STRIPE_SECRET_KEY=sk_live_...
 *   2. From backend/ run:            npm run stripe:golive          (local .env only)
 *      or, to also push to Railway:  npm run stripe:golive -- --push
 *
 * Safe to re-run: products reuse fixed ids, prices reuse lookup_keys, and the
 * webhook endpoint for the target URL is replaced so its secret is refreshed.
 */
import { execFileSync } from 'child_process'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import Stripe from 'stripe'

const ENV_PATH = path.resolve(__dirname, '../.env')
dotenv.config({ path: ENV_PATH })

const WEBHOOK_URL = 'https://anglish-production.up.railway.app/api/payments/webhook'
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.deleted',
]
const RAILWAY_SERVICE = 'Anglish'
const PUSH_RAILWAY = process.argv.includes('--push')

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('\n✖ STRIPE_SECRET_KEY is missing. Put your LIVE secret key (sk_live_...) in backend/.env first.\n')
  process.exit(1)
}
const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion })
const MODE = key.startsWith('sk_live') ? 'LIVE' : 'TEST'

if (MODE === 'TEST') {
  console.warn('\n⚠ You are running with a TEST key (sk_test_...). This will set up TEST mode, not live payments.')
  console.warn('  For real payments, put your sk_live_... key in backend/.env and re-run.\n')
}

type Interval = 'month' | 'year' | null

interface PriceDef { env: string; lookup: string; amount: number; interval: Interval }
interface PlanDef { productId: string; name: string; prices: PriceDef[] }

// Amounts (EUR cents) match frontend/src/pages/PlansPage.tsx and setup-stripe.ts.
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
  { productId: 'anglish_power', name: 'Anglish Me — Power All Access (2 years)', prices: [
    { env: 'STRIPE_PRICE_POWER', lookup: 'anglish_power', amount: 96000, interval: null },
  ]},
  { productId: 'anglish_topup', name: 'Anglish Me — Speaking Time Top-Up', prices: [
    { env: 'STRIPE_PRICE_TOPUP', lookup: 'anglish_topup', amount: 1000, interval: null },
  ]},
]

async function ensureProduct(id: string, name: string): Promise<string> {
  try {
    return (await stripe.products.retrieve(id)).id
  } catch {
    return (await stripe.products.create({ id, name })).id
  }
}

async function ensurePrice(productId: string, def: PriceDef): Promise<string> {
  const recurring = def.interval ? { interval: def.interval } : undefined
  const found = await stripe.prices.list({ lookup_keys: [def.lookup], active: true, limit: 1 })
  const p = found.data[0]
  const sameInterval = (p?.recurring?.interval ?? null) === def.interval
  if (p && p.unit_amount === def.amount && p.currency === 'eur' && sameInterval) return p.id
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

// Replace the webhook endpoint for our URL so we get a fresh signing secret
// (the secret is only returned by the Stripe API at creation time).
async function ensureWebhook(): Promise<string> {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 })
  for (const ep of existing.data) {
    if (ep.url === WEBHOOK_URL) await stripe.webhookEndpoints.del(ep.id)
  }
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: 'Anglish Me — plan activation',
  })
  if (!created.secret) throw new Error('Stripe did not return a webhook signing secret')
  return created.secret
}

// Upsert KEY=value lines into backend/.env without disturbing anything else.
function writeEnv(pairs: Record<string, string>): void {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
  for (const [k, v] of Object.entries(pairs)) {
    const line = `${k}=${v}`
    const re = new RegExp(`^${k}=.*$`, 'm')
    text = re.test(text) ? text.replace(re, line) : (text.replace(/\s*$/, '') + `\n${line}`)
  }
  if (!text.endsWith('\n')) text += '\n'
  fs.writeFileSync(ENV_PATH, text)
}

// Push every Stripe var to Railway in ONE call (one redeploy). Values are passed
// as argv to the CLI and never printed here.
function pushToRailway(pairs: Record<string, string>): void {
  const args = ['@railway/cli', 'variables', '--service', RAILWAY_SERVICE]
  for (const [k, v] of Object.entries(pairs)) args.push('--set', `${k}=${v}`)
  execFileSync('npx', args, { stdio: ['ignore', 'ignore', 'inherit'], shell: true })
}

async function main() {
  console.log(`\n▶ Stripe GO-LIVE in ${MODE} mode…\n`)

  const priceEnv: Record<string, string> = {}
  for (const plan of PLANS) {
    const productId = await ensureProduct(plan.productId, plan.name)
    for (const price of plan.prices) {
      const priceId = await ensurePrice(productId, price)
      const euros = (price.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
      const period = price.interval ? `/${price.interval}` : ' one-time'
      console.log(`  ✓ ${plan.name} — €${euros}${period}`)
      priceEnv[price.env] = priceId
    }
  }

  console.log('\n▶ Creating webhook endpoint…')
  const webhookSecret = await ensureWebhook()
  console.log(`  ✓ Webhook → ${WEBHOOK_URL}`)
  console.log(`  ✓ Events: ${WEBHOOK_EVENTS.join(', ')}`)

  // Local .env: prices + webhook secret (secret never printed).
  writeEnv({ ...priceEnv, STRIPE_WEBHOOK_SECRET: webhookSecret })
  console.log(`\n  ✓ Wrote ${Object.keys(priceEnv).length} price IDs + STRIPE_WEBHOOK_SECRET to backend/.env (secret not shown)`)

  if (PUSH_RAILWAY) {
    console.log('\n▶ Pushing STRIPE_* to Railway (one redeploy)…')
    pushToRailway({ ...priceEnv, STRIPE_SECRET_KEY: key!, STRIPE_WEBHOOK_SECRET: webhookSecret })
    console.log('  ✓ Railway variables set. A redeploy is in progress.')
  } else {
    console.log('\n  ⭑ Local only. Re-run with `-- --push` to also set these on Railway.')
  }

  console.log(`\n✅ Done. ${MODE} mode ready.\n`)
}

main().catch((err) => {
  console.error('\n✖ Stripe go-live failed:', err?.message ?? err, '\n')
  process.exit(1)
})
