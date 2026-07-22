import { test, expect } from '@playwright/test'

// Validates that the security headers configured in vercel.json are actually
// served. This is the automated guard against a future edit silently dropping
// them, and it doubles as the check for promoting the CSP from Report-Only to
// enforcing (once enforced, the `content-security-policy` branch fires).
test.describe('HTTP security headers', () => {
  test('landing page sends the expected hardening headers', async ({ request, baseURL }) => {
    const res = await request.get(baseURL!)
    expect(res.ok()).toBeTruthy()
    const h = res.headers()

    expect(h['strict-transport-security']).toContain('max-age=')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')

    // microphone MUST stay allowed, or the Speaking feature breaks.
    expect(h['permissions-policy']).toContain('microphone=(self)')
    expect(h['permissions-policy']).toContain('geolocation=()')

    // A CSP must be present in one of the two forms (Report-Only today,
    // enforcing after browser validation). Either satisfies this test.
    const csp = h['content-security-policy'] ?? h['content-security-policy-report-only']
    expect(csp, 'a CSP header must be present').toBeTruthy()
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('https://api.openai.com') // Phone Call realtime must stay allow-listed
    expect(csp).toContain('js.stripe.com')          // Stripe checkout
  })

  test('api proxy responses also carry the core hardening headers', async ({ request, baseURL }) => {
    // /api/* is a Vercel rewrite to Supabase; the /(.*) header rule applies to it too.
    const res = await request.get(`${baseURL}/api/health`)
    const h = res.headers()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-frame-options']).toBe('DENY')
  })
})
