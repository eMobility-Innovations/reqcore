import { describe, it, expect } from 'vitest'
import {
  parseBillingCadenceQuery,
  parseBillingPlanQuery,
  parseBillingCheckoutIntent,
  hasFreePlanIntent,
  buildBillingCheckoutQuery,
} from '../../app/composables/useBillingCheckout'

/**
 * The pricing page deep-links into /dashboard/settings/billing?plan=…&billing=…
 * and the billing page auto-starts checkout for whatever this parses out (see the
 * watcher in billing.vue). A bug here sends a buyer to checkout for the wrong
 * plan or cadence, so the query parsing gets its own exhaustive coverage.
 *
 * Query values can arrive as string, string[], null, or undefined (Vue Router
 * LocationQuery), so each parser is exercised against those shapes too.
 */

describe('parseBillingCadenceQuery', () => {
  it('reads explicit billing=annual / billing=monthly', () => {
    expect(parseBillingCadenceQuery({ billing: 'annual' })).toBe('annual')
    expect(parseBillingCadenceQuery({ billing: 'monthly' })).toBe('monthly')
  })

  it('treats yearly as an annual alias', () => {
    expect(parseBillingCadenceQuery({ billing: 'yearly' })).toBe('annual')
  })

  it('supports the legacy annual=1 / annual=true flag', () => {
    expect(parseBillingCadenceQuery({ annual: '1' })).toBe('annual')
    expect(parseBillingCadenceQuery({ annual: 'true' })).toBe('annual')
    expect(parseBillingCadenceQuery({ annual: '0' })).toBe('monthly')
  })

  it('falls back to monthly (or the provided fallback) when unspecified', () => {
    expect(parseBillingCadenceQuery({})).toBe('monthly')
    expect(parseBillingCadenceQuery({ billing: 'nonsense' })).toBe('monthly')
    expect(parseBillingCadenceQuery({}, 'annual')).toBe('annual')
  })

  it('reads the first value of array query params', () => {
    expect(parseBillingCadenceQuery({ billing: ['annual', 'monthly'] })).toBe('annual')
  })
})

describe('parseBillingPlanQuery', () => {
  it('accepts the canonical self-serve plan ids', () => {
    expect(parseBillingPlanQuery({ plan: 'solo' })).toBe('solo')
    expect(parseBillingPlanQuery({ plan: 'team' })).toBe('team')
    expect(parseBillingPlanQuery({ plan: 'scale' })).toBe('scale')
  })

  it('rejects non-checkout / unknown plans by returning null', () => {
    expect(parseBillingPlanQuery({ plan: 'free' })).toBeNull()
    expect(parseBillingPlanQuery({ plan: 'agency' })).toBeNull()
    expect(parseBillingPlanQuery({ plan: 'enterprise' })).toBeNull()
    expect(parseBillingPlanQuery({})).toBeNull()
    expect(parseBillingPlanQuery({ plan: null })).toBeNull()
  })
})

describe('parseBillingCheckoutIntent', () => {
  it('returns null when there is no valid plan (cadence alone is not an intent)', () => {
    expect(parseBillingCheckoutIntent({ billing: 'annual' })).toBeNull()
    expect(parseBillingCheckoutIntent({ plan: 'free', billing: 'annual' })).toBeNull()
  })

  it('combines plan and cadence into a checkout intent', () => {
    expect(parseBillingCheckoutIntent({ plan: 'team', billing: 'annual' }))
      .toEqual({ planId: 'team', cadence: 'annual' })
    expect(parseBillingCheckoutIntent({ plan: 'solo' }))
      .toEqual({ planId: 'solo', cadence: 'monthly' })
  })
})

describe('hasFreePlanIntent', () => {
  it('is true only for plan=free', () => {
    expect(hasFreePlanIntent({ plan: 'free' })).toBe(true)
    expect(hasFreePlanIntent({ plan: 'team' })).toBe(false)
    expect(hasFreePlanIntent({})).toBe(false)
  })
})

describe('buildBillingCheckoutQuery round-trips with parseBillingCheckoutIntent', () => {
  it('produces a query the parser reads back unchanged', () => {
    for (const planId of ['solo', 'team', 'scale'] as const) {
      for (const cadence of ['monthly', 'annual'] as const) {
        const query = buildBillingCheckoutQuery({ planId, cadence })
        expect(parseBillingCheckoutIntent(query)).toEqual({ planId, cadence })
      }
    }
  })
})
