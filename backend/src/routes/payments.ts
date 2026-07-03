import express, { Router } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'

export const paymentsRouter = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2023-10-16' as Stripe.LatestApiVersion })

const PRICES: Record<string, string> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
  annual: process.env.STRIPE_PRICE_ANNUAL ?? '',
  power: process.env.STRIPE_PRICE_POWER ?? '',
  family: process.env.STRIPE_PRICE_FAMILY ?? '',
}

paymentsRouter.post('/checkout', async (req, res) => {
  try {
    const { plan, email } = z.object({
      plan: z.enum(['monthly', 'annual', 'power', 'family']),
      email: z.string().email(),
    }).parse(req.body)

    const session = await stripe.checkout.sessions.create({
      mode: plan === 'power' ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/plans?payment=cancelled`,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Payment session failed' })
  }
})

// Stripe webhook
paymentsRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
    if (event.type === 'checkout.session.completed') {
      // TODO: update user plan in Supabase
    }
    res.json({ received: true })
  } catch {
    res.status(400).send('Webhook Error')
  }
})
