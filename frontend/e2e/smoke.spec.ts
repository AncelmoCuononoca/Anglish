import { test, expect } from '@playwright/test'

// Public, credential-free smoke tests of the critical entry points. These run
// before every deploy to catch a white-screen / broken-routing regression.
// Authenticated flows (login, checkout, Speaking, plan limits) need test
// credentials — see auth.spec.ts.disabled for the template.
test.describe('public smoke', () => {
  test('landing page loads and renders', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Anglish/i)
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('auth page renders a working login form', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('client-side validation rejects an obviously bad login', async ({ page }) => {
    await page.goto('/auth')
    await page.locator('input[type="email"]').fill('not-an-email')
    await page.locator('input[type="password"]').first().fill('x')
    // The email input is type=email, so the browser blocks submit on invalid value:
    // we must still be on /auth, never navigated into the app.
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/auth/)
  })

  test('protected route bounces an unauthenticated visitor to /auth', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/auth/)
  })

  test('unknown route falls back to the SPA (catch-all) without a hard 404', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist')
    expect(res?.status()).toBeLessThan(400)
    await expect(page.locator('#root')).not.toBeEmpty()
  })
})
