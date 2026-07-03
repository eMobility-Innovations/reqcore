import { describe, it, expect } from 'vitest'
import { buildStripePlans, resolveStripePricePlan, type StripePriceEnv } from '../../server/utils/billing/stripe-plans'
import { BILLING_PLANS, BILLING_PLAN_IDS } from '../../shared/billing'

/**
 * Money-critical: the env → Stripe price mapping the @better-auth/stripe plugin
 * is configured with. A swapped or missing price id charges customers the wrong
 * amount or lands them on the wrong tier, so these tests pin the mapping down.
 *
 * Each fixture value encodes plan + cadence (e.g. price_team_annual) so a swap
 * is caught by an exact-value assertion rather than just "is a string".
 */
const prices: StripePriceEnv = {
  STRIPE_PRICE_SOLO_MONTHLY: 'price_solo_monthly',
  STRIPE_PRICE_SOLO_ANNUAL: 'price_solo_annual',
  STRIPE_PRICE_TEAM_MONTHLY: 'price_team_monthly',
  STRIPE_PRICE_TEAM_ANNUAL: 'price_team_annual',
  STRIPE_PRICE_SCALE_MONTHLY: 'price_scale_monthly',
  STRIPE_PRICE_SCALE_ANNUAL: 'price_scale_annual',
}

describe('buildStripePlans', () => {
  it('emits exactly one plan per self-serve billing plan, in order', () => {
    const plans = buildStripePlans(prices)
    expect(plans.map(p => p.name)).toEqual(BILLING_PLAN_IDS)
    expect(plans).toHaveLength(BILLING_PLANS.length)
  })

  it('maps every plan to the right monthly and annual price ids', () => {
    const plans = buildStripePlans(prices)
    const byName = Object.fromEntries(plans.map(p => [p.name, p]))

    expect(byName.solo).toMatchObject({ priceId: 'price_solo_monthly', annualDiscountPriceId: 'price_solo_annual' })
    expect(byName.team).toMatchObject({ priceId: 'price_team_monthly', annualDiscountPriceId: 'price_team_annual' })
    expect(byName.scale).toMatchObject({ priceId: 'price_scale_monthly', annualDiscountPriceId: 'price_scale_annual' })
  })

  it('never reuses a price id across plans or cadences (guards swaps)', () => {
    const plans = buildStripePlans(prices)
    const allIds = plans.flatMap(p => [p.priceId, p.annualDiscountPriceId])
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('only emits canonical plan names persisted in subscription.plan', () => {
    for (const plan of buildStripePlans(prices)) {
      expect(BILLING_PLAN_IDS).toContain(plan.name)
    }
  })

  it('throws loudly when a price id is missing instead of silently dropping it', () => {
    const { STRIPE_PRICE_TEAM_ANNUAL: _omitted, ...incomplete } = prices
    expect(() => buildStripePlans(incomplete)).toThrow(/team/i)
    expect(() => buildStripePlans({})).toThrow(/solo/i)
  })

  it('resolves a live Stripe price id back to the app plan and billing interval', () => {
    expect(resolveStripePricePlan(prices, 'price_solo_monthly')).toEqual({ planId: 'solo', billingInterval: 'month' })
    expect(resolveStripePricePlan(prices, 'price_team_annual')).toEqual({ planId: 'team', billingInterval: 'year' })
    expect(resolveStripePricePlan(prices, 'price_scale_monthly')).toEqual({ planId: 'scale', billingInterval: 'month' })
  })

  it('does not guess a plan for unknown or missing Stripe prices', () => {
    expect(resolveStripePricePlan(prices, 'price_custom')).toBeNull()
    expect(resolveStripePricePlan(prices, null)).toBeNull()
    expect(resolveStripePricePlan({}, 'price_solo_monthly')).toBeNull()
  })
})
