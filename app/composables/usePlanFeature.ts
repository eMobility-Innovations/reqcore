/**
 * Client-side plan entitlements — the UI mirror of the server-side feature gates
 * in server/utils/billing/plan.ts.
 *
 * The server rejects unentitled calls with a 402 `PLAN_FEATURE_REQUIRED`; this
 * composable lets the UI hide or disable the controls *before* the user hits
 * that wall, and surface a consistent upgrade prompt instead.
 *
 * Source of truth is /api/billing/status (shared via useBillingStatus's fixed
 * key, so this adds no extra request). Two rules keep it honest:
 *  - When Stripe billing isn't configured (self-hosted), nothing is gated —
 *    every feature is available, matching the server which only gates when
 *    billing is enabled.
 *  - The tier comes from the same usage payload the server computes, so client
 *    and server never disagree about what plan an org is on.
 */
import {
  tierHasFeature,
  featureUpgradeMessage,
  featureRequiredTierName,
  tierDisplayName,
  FEATURE_LABEL,
  FEATURE_MIN_TIER,
  type PlanFeature,
  type BillingTier,
} from '~~/shared/billing'

export function usePlanFeature() {
  const { data: status } = useBillingStatus()

  /** Billing is only enforced when Stripe is configured on the server. */
  const billingEnabled = computed(() => status.value?.enabled === true)

  /** The org's resolved tier (from the same usage the server computes). */
  const tier = computed<BillingTier>(
    () => (status.value?.usage?.tier as BillingTier | undefined) ?? 'free',
  )

  /** Whether the org's current tier is entitled to `feature`. */
  function hasFeature(feature: PlanFeature): boolean {
    // Self-hosted / billing-off installs gate nothing.
    if (!billingEnabled.value) return true
    return tierHasFeature(tier.value, feature)
  }

  /** Display-level metadata for an upgrade prompt about `feature`. */
  function featureMeta(feature: PlanFeature) {
    return {
      label: FEATURE_LABEL[feature],
      requiredTier: FEATURE_MIN_TIER[feature],
      requiredTierName: featureRequiredTierName(feature),
      message: featureUpgradeMessage(feature),
    }
  }

  return {
    status,
    billingEnabled,
    tier,
    hasFeature,
    featureMeta,
    tierDisplayName,
  }
}
