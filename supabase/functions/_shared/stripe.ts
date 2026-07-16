// Stripe access for Edge Functions WITHOUT the npm:stripe SDK.
//
// Why no SDK: the heavy npm:openai@4 bundle made the MCP deploy time out twice
// during this migration; npm:stripe@14 is just as heavy and carries the same
// risk. Chat/Speaking already talk to their upstream APIs by plain fetch, so
// Payments follows the same pattern — a tiny, reliably-deployable module.
//
// Two things are needed:
//   1. createCheckoutSession() — a form-encoded POST to the Stripe REST API.
//   2. constructStripeEvent()  — webhook signature verification. The SDK's
//      constructEvent() uses Node crypto (absent in Deno); even the SDK route
//      would force constructEventAsync() + a SubtleCrypto provider. We do the
//      same HMAC-SHA256 check directly with Web Crypto — identical algorithm to
//      Stripe's own verifier.

const STRIPE_API = 'https://api.stripe.com/v1'
// Pin the API version so response shapes match what the Express backend saw.
const STRIPE_VERSION = '2023-10-16'

function secretKey(): string {
  return Deno.env.get('STRIPE_SECRET_KEY') ?? ''
}

// ── Checkout Session ──────────────────────────────────────────────────────────
export interface CheckoutParams {
  mode: 'subscription' | 'payment'
  price: string
  userId: string
  plan: string
  period: string
  successUrl: string
  cancelUrl: string
}

// Mirrors stripe.checkout.sessions.create() from backend/src/routes/payments.ts.
// Returns the hosted Checkout URL. Throws on a non-2xx from Stripe.
export async function createCheckoutSession(p: CheckoutParams): Promise<string> {
  const form = new URLSearchParams()
  form.set('mode', p.mode)
  form.set('payment_method_types[0]', 'card')
  // Lets the buyer enter a Stripe promotion code (e.g. the 10% promo) at checkout.
  form.set('allow_promotion_codes', 'true')
  form.set('line_items[0][price]', p.price)
  form.set('line_items[0][quantity]', '1')
  // client_reference_id ties the payment to a Supabase user with certainty -
  // far more reliable than matching on email.
  form.set('client_reference_id', p.userId)
  form.set('metadata[userId]', p.userId)
  form.set('metadata[plan]', p.plan)
  form.set('metadata[period]', p.period)
  // Subscriptions also stamp the userId on the subscription so renewals
  // (invoice.paid) can find the right profile.
  if (p.mode === 'subscription') {
    form.set('subscription_data[metadata][userId]', p.userId)
    form.set('subscription_data[metadata][plan]', p.plan)
    form.set('subscription_data[metadata][period]', p.period)
  }
  form.set('success_url', p.successUrl)
  form.set('cancel_url', p.cancelUrl)

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_VERSION,
    },
    body: form.toString(),
  })

  const data = await res.json().catch(() => ({})) as { url?: string; error?: { message?: string } }
  if (!res.ok || !data.url) {
    throw new Error(data.error?.message ?? `Stripe checkout failed (${res.status})`)
  }
  return data.url
}

// ── Webhook signature verification ────────────────────────────────────────────
// Minimal shapes of the three events the handler acts on. Only the fields the
// backend read are typed; everything else stays untouched on the parsed JSON.
export interface StripeEvent {
  type: string
  // `object` stays `unknown` so callers assert the concrete event shape they
  // expect (e.g. `as CheckoutSessionObj`) without an intermediate cast.
  data: { object: unknown }
}

const encoder = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time compare of two equal-length hex strings (avoids leaking, via
// timing, how many leading bytes of a forged signature were correct).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Verifies the Stripe-Signature header against the RAW body and returns the
// parsed event. Throws (like constructEvent) when the signature is missing,
// stale, or forged — the caller answers 400 so Stripe retries later.
// `payload` MUST be the exact raw request body (Hono: await c.req.text()).
export async function constructStripeEvent(
  payload: string,
  sigHeader: string | null,
  secret: string,
  toleranceSec = 300,
): Promise<StripeEvent> {
  if (!sigHeader) throw new Error('Missing Stripe-Signature header')
  if (!secret) throw new Error('Webhook secret not configured')

  // Header: "t=<ts>,v1=<sig>[,v1=<sig>...]". Multiple v1 appear during secret
  // rotation, so collect them all and accept if any matches.
  let timestamp = ''
  const v1: string[] = []
  for (const part of sigHeader.split(',')) {
    const [key, value] = part.split('=')
    if (key === 't') timestamp = value
    else if (key === 'v1') v1.push(value)
  }
  if (!timestamp || v1.length === 0) throw new Error('Malformed Stripe-Signature header')

  // Replay protection: reject events outside the tolerance window.
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > toleranceSec) throw new Error('Timestamp outside tolerance')

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`))
  const expected = toHex(sigBuf)

  if (!v1.some((candidate) => timingSafeEqual(expected, candidate))) {
    throw new Error('Signature mismatch')
  }
  return JSON.parse(payload) as StripeEvent
}
