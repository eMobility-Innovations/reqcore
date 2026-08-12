import { BILLING_PLAN_IDS, type BillingPlanId } from '~~/shared/billing'

type QueryValue = string | null | undefined | Array<string | null>

export type BillingCadence = 'monthly' | 'annual'

export interface BillingCheckoutIntent {
  planId: BillingPlanId
  cadence: BillingCadence
}

export interface BillingCheckoutOptions extends BillingCheckoutIntent {
  orgId: string
  subscriptionId?: string
  successUrl?: string
  cancelUrl?: string
}

function readQueryString(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value[0] ?? undefined
  return typeof value === 'string' ? value : undefined
}

export function parseBillingCadenceQuery(
  query: Record<string, QueryValue>,
  fallback: BillingCadence = 'monthly',
): BillingCadence {
  const billing = readQueryString(query.billing)
  if (billing === 'annual' || billing === 'yearly') return 'annual'
  if (billing === 'monthly') return 'monthly'

  const annual = readQueryString(query.annual)
  if (annual === '1' || annual === 'true') return 'annual'

  return fallback
}

export function parseBillingPlanQuery(query: Record<string, QueryValue>): BillingPlanId | null {
  const plan = readQueryString(query.plan)
  if (!plan) return null

  return (BILLING_PLAN_IDS as readonly string[]).includes(plan)
    ? plan as BillingPlanId
    : null
}

export function parseBillingCheckoutIntent(
  query: Record<string, QueryValue>,
  fallbackCadence: BillingCadence = 'monthly',
): BillingCheckoutIntent | null {
  const planId = parseBillingPlanQuery(query)
  if (!planId) return null

  return {
    planId,
    cadence: parseBillingCadenceQuery(query, fallbackCadence),
  }
}

export function hasFreePlanIntent(query: Record<string, QueryValue>): boolean {
  return readQueryString(query.plan) === 'free'
}

export function buildBillingCheckoutQuery(intent: BillingCheckoutIntent): Record<string, string> {
  return {
    plan: intent.planId,
    billing: intent.cadence,
  }
}

export function useBillingCheckout() {
  async function startBillingCheckout(options: BillingCheckoutOptions): Promise<{ ok: boolean, error?: string }> {
    try {
      const res = await authClient.subscription.upgrade({
        plan: options.planId,
        annual: options.cadence === 'annual',
        referenceId: options.orgId,
        customerType: 'organization',
        successUrl: options.successUrl ?? '/dashboard/settings/billing?checkout=success',
        cancelUrl: options.cancelUrl ?? '/dashboard/settings/billing?checkout=cancelled',
        // For an existing subscription, better-auth switches the plan via the
        // Stripe Customer Portal and redirects to `returnUrl` (not successUrl)
        // after the customer confirms — so point it back at the billing page.
        returnUrl: options.successUrl ?? '/dashboard/settings/billing?checkout=success',
        ...(options.subscriptionId ? { subscriptionId: options.subscriptionId } : {}),
      })

      if (res?.error) {
        return { ok: false, error: res.error.message || 'Could not start checkout. Please try again.' }
      }

      if (res?.data && 'url' in res.data && res.data.url) {
        window.location.href = res.data.url as string
        return { ok: true }
      }

      return { ok: false, error: 'Could not start checkout. Please try again.' }
    }
    catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not start checkout. Please try again.',
      }
    }
  }

  return { startBillingCheckout }
}
