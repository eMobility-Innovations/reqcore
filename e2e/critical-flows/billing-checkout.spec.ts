import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

/**
 * Critical flow: Stripe billing / checkout.
 *
 * The card form itself is Stripe-hosted — driving it in CI is slow and tests
 * Stripe's UI, not ours. So we test the seams we own:
 *  1. Post-checkout result banners (deterministic, no Stripe config needed).
 *  2. The free-tier billing page state.
 *  3. [needs Stripe config] Clicking Upgrade hands off to Stripe Checkout with a
 *     real session URL — the full app→Stripe loop, stopping at the redirect.
 *  4. [needs Stripe config] The webhook endpoint rejects forged/unsigned events,
 *     so nobody can grant themselves a paid plan by POSTing a fake event.
 *
 * (3) and (4) self-skip when the instance has no Stripe keys (the open-source
 * build), detected via /api/billing/status.
 */

const BILLING_URL = '/dashboard/settings/billing'

async function billingEnabled(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/billing/status')
  if (!res.ok()) return false
  const body = await res.json()
  return body?.enabled === true
}

test.describe('Stripe billing', () => {
  test('shows the cancelled banner without charging', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto(`${BILLING_URL}?checkout=cancelled`)
    await expect(page.getByText("Checkout was cancelled. You haven't been charged.")).toBeVisible()
  })

  test('shows the payment-received banner after a successful checkout', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto(`${BILLING_URL}?checkout=success`)
    await expect(page.getByText(/Payment received|Checkout completed/)).toBeVisible()
  })

  test('renders the billing page state for the org', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto(BILLING_URL)
    await page.waitForLoadState('networkidle')

    if (await billingEnabled(page)) {
      // A fresh org is on the free plan and is offered the paid tiers.
      await expect(page.getByRole('heading', { name: 'Current plan: Free' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Solo', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Scale', exact: true })).toBeVisible()
    }
    else {
      await expect(page.getByText("Billing isn't enabled on this instance")).toBeVisible()
    }
  })

  test('hands off to Stripe Checkout with a real session URL', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    test.skip(!(await billingEnabled(page)), 'Stripe billing not configured on this instance')

    await page.goto(BILLING_URL)
    await page.waitForLoadState('networkidle')

    // Don't actually leave for Stripe's hosted page — we only assert the handoff.
    await page.route(/checkout\.stripe\.com/, route => route.abort())
    const stripeCheckoutRequest = page.waitForRequest(/checkout\.stripe\.com/, { timeout: 30_000 })

    const upgradeResponse = page.waitForResponse(
      r => r.url().includes('/subscription/upgrade') && r.request().method() === 'POST',
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: /^(Upgrade to|Switch to) Team$/ }).click()

    const res = await upgradeResponse
    expect(res.status()).toBe(200)
    expect((await stripeCheckoutRequest).url(), 'upgrade must navigate to Stripe Checkout').toContain('stripe.com')
  })

  test('rejects forged / unsigned webhook events', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    test.skip(!(await billingEnabled(page)), 'Stripe billing not configured on this instance')

    // A fake "subscription activated" event with a bogus signature must not be
    // accepted — otherwise anyone could grant their org a paid plan for free.
    const forged = await page.request.post('/api/auth/stripe/webhook', {
      headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
      data: JSON.stringify({ id: 'evt_forged', type: 'customer.subscription.created' }),
    })
    expect(forged.ok(), 'forged webhook must be rejected').toBe(false)
    expect(forged.status()).toBeGreaterThanOrEqual(400)
  })
})
