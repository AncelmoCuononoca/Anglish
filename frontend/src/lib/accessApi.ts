// Access-code redemption - the student enters a code the admin gave them (e.g.
// after paying by IBAN over WhatsApp) to unlock / extend paid access.
import { supabase } from './supabase'
import { API_BASE as API } from './apiBase'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface RedeemResult {
  success: true
  access_end: string
  plan?: string
}

// Throws Error(message) on any failure so the caller can show it in a toast.
export async function redeemCode(code: string): Promise<RedeemResult> {
  const res = await fetch(`${API}/api/access/redeem`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Não foi possível resgatar o código.')
  return data as RedeemResult
}

export interface CodeInfo { valid: boolean; discount_pct: number; grant_days: number }

// Non-consuming lookup for the Plans page: returns the code's discount % so prices
// can show the promo without redeeming. Throws Error(message) if invalid.
export async function getCodeInfo(code: string): Promise<CodeInfo> {
  const res = await fetch(`${API}/api/access/code-info`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !(data as CodeInfo).valid) {
    throw new Error((data as { error?: string }).error || 'Código inválido.')
  }
  return data as CodeInfo
}
