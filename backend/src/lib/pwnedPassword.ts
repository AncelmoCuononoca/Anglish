import { createHash } from 'crypto'

// Checks a password against the HaveIBeenPwned "Pwned Passwords" breach
// corpus using k-anonymity: we only ever send the first 5 hex chars of the
// SHA-1 hash, so the API never sees the actual password or its full hash.
// This replicates Supabase Auth's "leaked password protection", which is
// gated behind their Pro plan — this gives every plan the same protection
// for free (the HIBP range API requires no key and no billing).
export async function isPasswordPwned(password: string): Promise<boolean> {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false // fail open: never block signup on a third-party outage
    const body = await res.text()
    return body.split('\r\n').some((line) => line.startsWith(suffix))
  } catch {
    return false // network error / timeout - fail open
  }
}
