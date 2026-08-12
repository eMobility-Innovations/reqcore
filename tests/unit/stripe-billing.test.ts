import { describe, it, expect } from 'vitest'
import { envSchema, getMissingStripeBillingVars, isStripeBillingConfigured } from '../../server/utils/env'
import { isBillingActionAllowed, getBillingPlan, BILLING_PLAN_IDS } from '../../shared/billing'

/**
 * Stripe billing tests.
 *
 * Covers the two security/correctness-critical pure layers:
 *  1. Env helpers — billing is enabled only when every Stripe var is present.
 *  2. Org-scoped authorization decision used by the Stripe plugin's
 *     `authorizeReference` callback.
 */

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://app.reqcore.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
}

const fullStripe = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_SOLO_MONTHLY: 'price_solo_m',
  STRIPE_PRICE_SOLO_ANNUAL: 'price_solo_y',
  STRIPE_PRICE_TEAM_MONTHLY: 'price_team_m',
  STRIPE_PRICE_TEAM_ANNUAL: 'price_team_y',
  STRIPE_PRICE_SCALE_MONTHLY: 'price_scale_m',
  STRIPE_PRICE_SCALE_ANNUAL: 'price_scale_y',
}

describe('Stripe env helpers', () => {
  it('accepts a config with no Stripe vars (billing disabled)', () => {
    const result = envSchema.safeParse(baseEnv)
    expect(result.success).toBe(true)
    expect(isStripeBillingConfigured(result.success ? result.data : {})).toBe(false)
    expect(getMissingStripeBillingVars(result.success ? result.data : {})).toEqual([])
  })

  it('accepts a fully-specified Stripe config', () => {
    const result = envSchema.safeParse({ ...baseEnv, ...fullStripe })
    expect(result.success).toBe(true)
    expect(isStripeBillingConfigured(result.success ? result.data : {})).toBe(true)
    expect(getMissingStripeBillingVars(result.success ? result.data : {})).toEqual([])
  })

  it('rejects partial Stripe env so billing is not silently disabled', () => {
    const { STRIPE_WEBHOOK_SECRET, ...partial } = fullStripe
    const result = envSchema.safeParse({ ...baseEnv, ...partial })
    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['STRIPE_WEBHOOK_SECRET'],
          message: expect.stringContaining('Stripe billing is partially configured'),
        }),
      ]),
    )
  })

  it('reports missing Stripe vars for already-parsed partial config objects', () => {
    const { STRIPE_WEBHOOK_SECRET, ...partial } = fullStripe
    expect(isStripeBillingConfigured(partial)).toBe(false)
    expect(getMissingStripeBillingVars(partial)).toEqual(['STRIPE_WEBHOOK_SECRET'])
  })
})

describe('isBillingActionAllowed (org-scoped authorization)', () => {
  it('denies non-members for every action', () => {
    for (const action of ['list-subscription', 'upgrade-subscription', 'cancel-subscription', 'billing-portal']) {
      expect(isBillingActionAllowed(null, action)).toBe(false)
      expect(isBillingActionAllowed(undefined, action)).toBe(false)
    }
  })

  it('lets any member read the subscription', () => {
    expect(isBillingActionAllowed('member', 'list-subscription')).toBe(true)
    expect(isBillingActionAllowed('admin', 'list-subscription')).toBe(true)
    expect(isBillingActionAllowed('owner', 'list-subscription')).toBe(true)
  })

  it('denies plain members from mutating billing', () => {
    for (const action of ['upgrade-subscription', 'cancel-subscription', 'restore-subscription', 'billing-portal']) {
      expect(isBillingActionAllowed('member', action)).toBe(false)
    }
  })

  it('allows owners and admins to mutate billing', () => {
    for (const action of ['upgrade-subscription', 'cancel-subscription', 'restore-subscription', 'billing-portal']) {
      expect(isBillingActionAllowed('owner', action)).toBe(true)
      expect(isBillingActionAllowed('admin', action)).toBe(true)
    }
  })
})

describe('billing plan config', () => {
  it('exposes exactly the three self-serve plans', () => {
    expect(BILLING_PLAN_IDS).toEqual(['solo', 'team', 'scale'])
  })

  it('resolves plans by id and returns undefined for unknown ids', () => {
    expect(getBillingPlan('solo')?.name).toBe('Solo')
    expect(getBillingPlan('team')?.name).toBe('Team')
    expect(getBillingPlan('scale')?.name).toBe('Scale')
    expect(getBillingPlan('enterprise')).toBeUndefined()
  })
})
