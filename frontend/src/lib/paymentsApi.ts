// Stripe checkout (EUR / card). Angola pays by IBAN over WhatsApp instead - that
// flow lives in PlansPage and does not touch this file.
import { supabase } from './supabase'
import { API_BASE as API } from './apiBase'

export type CheckoutPlan = 'basic' | 'super' | 'family' | 'family_tutor' | 'power' | 'topup'
export type CheckoutPeriod = 'monthly' | 'annual'

// Redirects the browser to Stripe Checkout for the given plan/period.
// Throws with a user-facing message if the session can't be created.
export async function startCheckout(plan: CheckoutPlan, period: CheckoutPeriod): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please log in again to continue.')

  const res = await fetch(`${API}/api/payments/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan, period }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not start the payment. Please try again.')
  }

  const { url } = await res.json()
  if (!url) throw new Error('Could not start the payment. Please try again.')
  window.location.href = url
}

export async function startTopupCheckout(): Promise<void> {
  return startCheckout('topup', 'monthly')
}
