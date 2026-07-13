// Deno port of backend/src/lib/pwnedPassword.ts. Uses Web Crypto (crypto.subtle)
// instead of node:crypto for the SHA-1. Same k-anonymity contract: only the
// first 5 hex chars of the hash ever leave this function; the password never does.
export async function isPasswordPwned(password: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  const sha1 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
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
