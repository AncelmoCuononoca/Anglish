import { defineConfig, devices } from '@playwright/test'

// E2E runs against a DEPLOYED URL (no local server needed), so the same specs
// smoke-test a Vercel preview or production. Override the target with
// E2E_BASE_URL, e.g. `E2E_BASE_URL=https://anglish-<hash>.vercel.app npm run test:e2e`.
// Default is production.
const baseURL = process.env.E2E_BASE_URL ?? 'https://anglishme.com'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
})
