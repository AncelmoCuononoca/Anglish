# End-to-end tests (Playwright)

Credential-free smoke tests of the critical entry points, plus a header guard
and a template for authenticated flows. They run against a **deployed URL**, so
the same specs validate a Vercel preview or production — no local server needed.

## One-time setup

```bash
cd frontend
npm install
npx playwright install --with-deps chromium
```

## Run

```bash
# Against production (default)
npm run test:e2e

# Against a Vercel preview deploy (recommended before promoting to prod)
E2E_BASE_URL=https://anglish-<hash>.vercel.app npm run test:e2e

# Headed / debug
npm run test:e2e:headed
npx playwright show-report
```

## What's covered

- `security-headers.spec.ts` — asserts HSTS, X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy (incl. `microphone=(self)`), and the CSP
  (Report-Only or enforcing). **This is the regression guard for `vercel.json`.**
- `smoke.spec.ts` — landing loads, auth form renders, bad login is rejected,
  protected route redirects to `/auth`, unknown route falls back to the SPA.
- `auth.spec.ts.disabled` — template for logged-in flows. Rename to
  `auth.spec.ts` and set `E2E_EMAIL` / `E2E_PASSWORD` (a throwaway **student**
  account, never the admin) to enable.

## CI

Point CI at a preview URL and run `npm run test:e2e`. `forbidOnly` and 2 retries
are already enabled when `CI=1`.
