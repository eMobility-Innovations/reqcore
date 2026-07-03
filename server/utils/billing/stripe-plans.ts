/**
 * Env → Stripe plan mapping (money-critical, kept pure so it can be unit-tested).
 *
 * The @better-auth/stripe plugin is configured with a list of subscription
 * plans, each naming a Stripe recurring price id for monthly billing and one
 * for annual billing. A swap or typo here charges customers the wrong amount or
 * puts them on the wrong tier, so the mapping lives in this isolated helper with
 * its own test (tests/unit/stripe-plans.test.ts) rather than buried in auth.ts.
 *
 * The plan list is derived from BILLING_PLANS (the single source of truth shared
 * with the UI) so a new self-serve plan can never be added to the pricing page
 * without also wiring its Stripe prices here — the build throws if one is
 * missing the env mapping.
 */
import { BILLING_PLANS, type BillingPlanId } from '../../../shared/billing'

/** The six Stripe price env vars consumed by the plan builder. */
export interface StripePriceEnv {
  STRIPE_PRICE_SOLO_MONTHLY?: string
  STRIPE_PRICE_SOLO_ANNUAL?: string
  STRIPE_PRICE_TEAM_MONTHLY?: string
  STRIPE_PRICE_TEAM_ANNUAL?: string
  STRIPE_PRICE_SCALE_MONTHLY?: string
  STRIPE_PRICE_SCALE_ANNUAL?: string
}

/** Shape the Stripe plugin expects for each subscription plan. */
export interface StripeSubscriptionPlan {
  /** Plan name — MUST equal the canonical BillingPlanId persisted in subscription.plan. */
  name: BillingPlanId
  /** Stripe recurring price id used for monthly checkout. */
  priceId: string
  /** Stripe recurring price id used for annual checkout. */
  annualDiscountPriceId: string
}

export interface StripePricePlanMatch {
  planId: BillingPlanId
  billingInterval: 'month' | 'year'
}

/** Which env var holds the monthly / annual price id for each self-serve plan. */
const PRICE_ENV_BY_PLAN: Record<BillingPlanId, { monthly: keyof StripePriceEnv, annual: keyof StripePriceEnv }> = {
  solo: { monthly: 'STRIPE_PRICE_SOLO_MONTHLY', annual: 'STRIPE_PRICE_SOLO_ANNUAL' },
  team: { monthly: 'STRIPE_PRICE_TEAM_MONTHLY', annual: 'STRIPE_PRICE_TEAM_ANNUAL' },
  scale: { monthly: 'STRIPE_PRICE_SCALE_MONTHLY', annual: 'STRIPE_PRICE_SCALE_ANNUAL' },
}

/**
 * Build the Stripe subscription plan list from the configured price env vars.
 * Only call this when Stripe billing is fully configured (isStripeBillingConfigured),
 * which guarantees every price var is present; this throws otherwise so a
 * misconfigured deploy fails loudly instead of silently dropping a plan.
 */
export function buildStripePlans(config: StripePriceEnv): StripeSubscriptionPlan[] {
  return BILLING_PLANS.map((plan) => {
    const keys = PRICE_ENV_BY_PLAN[plan.id]
    const priceId = config[keys.monthly]
    const annualDiscountPriceId = config[keys.annual]

    if (!priceId || !annualDiscountPriceId) {
      throw new Error(
        `Missing Stripe price id(s) for plan "${plan.id}": `
        + `${keys.monthly}=${priceId ? 'set' : 'MISSING'}, `
        + `${keys.annual}=${annualDiscountPriceId ? 'set' : 'MISSING'}`,
      )
    }

    return { name: plan.id, priceId, annualDiscountPriceId }
  })
}

/**
 * Resolve a live Stripe price id back to the canonical plan persisted locally.
 * Used to reconcile stale Better Auth subscription rows after plan renames or
 * missed webhooks. Unknown prices return null so custom/manual Stripe products
 * do not get mislabeled.
 */
export function resolveStripePricePlan(
  config: StripePriceEnv,
  priceId: string | null | undefined,
): StripePricePlanMatch | null {
  if (!priceId) return null

  for (const plan of BILLING_PLANS) {
    const keys = PRICE_ENV_BY_PLAN[plan.id]
    if (config[keys.monthly] === priceId) {
      return { planId: plan.id, billingInterval: 'month' }
    }
    if (config[keys.annual] === priceId) {
      return { planId: plan.id, billingInterval: 'year' }
    }
  }

  return null
}
