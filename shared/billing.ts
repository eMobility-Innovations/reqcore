/**
 * ─────────────────────────────────────────────
 * Billing plans — single source of truth (client + server)
 * ─────────────────────────────────────────────
 *
 * Imported by both the billing UI (app/) and the Stripe plugin wiring
 * (server/utils/auth.ts). This file holds only non-secret, display-level
 * metadata and the canonical plan *names*. The actual Stripe price IDs live in
 * server-side env vars (STRIPE_PRICE_*) and are mapped to these plans in
 * server/utils/auth.ts — they never reach the client bundle.
 *
 * IMPORTANT: `id` is the plan name persisted in the `subscription.plan` column
 * and passed to `authClient.subscription.upgrade({ plan })`. It MUST stay in
 * sync with the plan `name` configured in the Stripe plugin on the server.
 */

/** Self-serve, Stripe-checkout plan ids (persisted in subscription.plan). */
export type BillingPlanId = 'solo' | 'team' | 'scale'

/**
 * Every billing tier, including the ones with no Stripe checkout:
 *  - `free`          — no subscription row; the default for any org.
 *  - `grandfathered` — internal free Team-equivalent BYOK tier for legacy hosted orgs.
 *  - `agency`        — contact-sales / custom contract.
 */
export type BillingTier = 'free' | 'grandfathered' | BillingPlanId | 'agency'

export interface BillingPlan {
  /** Canonical plan name — stored in subscription.plan and used in upgrade(). */
  id: BillingPlanId
  /** Human-readable name shown in the UI. */
  name: string
  /** One-line description. */
  tagline: string
  /** Display price (USD) per month when billed monthly. */
  monthlyPrice: number
  /**
   * Display price (USD) for the whole year when billed annually.
   * The real charge always comes from Stripe; this is for the UI only.
   * `null` means annual display pricing is not advertised yet.
   */
  annualPrice: number | null
  /**
   * Max number of simultaneously *open* roles (jobs) this plan allows.
   * Enforced server-side in server/utils/billing/plan.ts.
   */
  activeRoleLimit: number
  /** Feature bullets shown on the plan card. */
  features: string[]
}

/**
 * Max number of simultaneously open roles per tier — the canonical limit table.
 * Applies to *every* tier, including free/agency which have no Stripe plan row.
 * Enforced in server/utils/billing/plan.ts (assertActiveRoleLimit).
 */
export const ACTIVE_ROLE_LIMITS: Record<BillingTier, number> = {
  free: 1,
  grandfathered: 8,
  solo: 2,
  team: 8,
  scale: 24,
  agency: Number.POSITIVE_INFINITY,
}

/**
 * Lifetime allowance of platform-paid AI analysis runs for a free org — the
 * count-based approximation of pricing-v5's "one free AI shortlist per account".
 * Once an org reaches this, platform AI is gated until they upgrade; ranking and
 * everything else stays available. Override with AI_FREE_PLAN_RUN_LIMIT.
 * Enforced in server/utils/ai/budget.ts.
 */
export const FREE_PLAN_ANALYSIS_LIMIT = 50

/**
 * Paid, self-serve plans. Mirrors the marketing pricing page (pricing-v5). Free
 * needs no checkout; Agency is contact-sales, so neither appears here.
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'solo',
    name: 'Solo',
    tagline: 'For steady hiring on a role or two.',
    monthlyPrice: 79,
    annualPrice: 790,
    activeRoleLimit: ACTIVE_ROLE_LIMITS.solo,
    features: [
      'Up to 2 active roles',
      'Unlimited applicants and hires per role',
      'Unlimited AI shortlists on every role',
      'Full shortlist workflow',
      'Invite your whole team. No per-seat fees.',
      'Share and export shortlists',
      'Email support',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For teams hiring all the time.',
    monthlyPrice: 239,
    annualPrice: 2390,
    activeRoleLimit: ACTIVE_ROLE_LIMITS.team,
    features: [
      'Up to 8 active roles',
      'Unlimited AI shortlists on every role',
      'Deeper analysis on every shortlisted application',
      'Your own domain. No Reqcore branding.',
      'Email and calendar integrations, pipeline, templates',
      'Your whole team included. No per-seat fees.',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'For high-volume, multi-team hiring.',
    monthlyPrice: 599,
    annualPrice: 5990,
    activeRoleLimit: ACTIVE_ROLE_LIMITS.scale,
    features: [
      'Up to 24 active roles',
      'Everything in Team',
      'SSO, SAML, SCIM',
      'Audit log and retention controls',
      'DPA and SLA',
      'Bring your own AI key (BYOK)',
      'Dedicated onboarding',
    ],
  },
]

export const BILLING_PLAN_IDS = BILLING_PLANS.map(p => p.id)

export function getBillingPlan(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find(p => p.id === id)
}

/** Active-role limit for any tier id (unknown ids fall back to the free cap). */
export function activeRoleLimitForTier(tier: string): number {
  return ACTIVE_ROLE_LIMITS[tier as BillingTier] ?? ACTIVE_ROLE_LIMITS.free
}

/**
 * ─────────────────────────────────────────────
 * Plan-gated features (entitlements beyond the role/AI-budget caps)
 * ─────────────────────────────────────────────
 *
 * The active-role limit and the AI-spend budget are quantitative caps. These
 * are the *boolean* entitlements — capabilities a plan either has or doesn't,
 * mirroring the per-plan feature bullets on the pricing page. Enforced
 * server-side via assertPlanFeature in server/utils/billing/plan.ts.
 *
 * NOT gated here, by deliberate decision:
 *  - Candidate stage/pipeline movement (the application-status workflow) — core
 *    to every plan; the pricing "pipeline and stages" bullet is forward-looking
 *    marketing, not a gate on the basic workflow.
 *  - The candidate data export endpoint — it doubles as the GDPR data-subject
 *    access export (Art. 15/20) and must stay available on every plan.
 */
export type PlanFeature =
  | 'interviews' // Interview scheduling — Solo and above
  | 'calendar' // Calendar (Google) sync on interviews — Team and above
  | 'sourceAnalytics' // Source attribution dashboard — Team and above
  | 'activityTimeline' // Org-wide activity timeline — Team and above
  | 'aiAnalytics' // AI Analysis dashboard (provider health, scoring volume) — Team and above
  | 'sso' // SSO / SAML / SCIM provider registration — Scale and above
  | 'auditLog' // The org-wide audit log — Scale and above
  | 'retention' // Data-retention policy controls — Scale and above
  | 'byok' // Bring-your-own AI key configuration — Free (to go past the free run limit) and Scale and above

/** Tiers ordered cheapest → most capable. A tier is entitled to a feature when
 *  its rank is ≥ the feature's minimum tier rank. */
const TIER_ORDER: BillingTier[] = ['free', 'solo', 'team', 'grandfathered', 'scale', 'agency']

/** Human-readable plan name per tier, for upgrade-prompt copy. */
const TIER_DISPLAY_NAME: Record<BillingTier, string> = {
  free: 'Free',
  grandfathered: 'Grandfathered Team',
  solo: 'Solo',
  team: 'Team',
  scale: 'Scale',
  agency: 'Agency',
}

/** Minimum tier required for each plan-gated feature. */
export const FEATURE_MIN_TIER: Record<PlanFeature, BillingTier> = {
  interviews: 'solo',
  calendar: 'team',
  sourceAnalytics: 'team',
  activityTimeline: 'team',
  aiAnalytics: 'team',
  sso: 'scale',
  auditLog: 'scale',
  retention: 'scale',
  byok: 'scale',
}

/** Short, user-facing label for each feature, used in upgrade prompts. */
export const FEATURE_LABEL: Record<PlanFeature, string> = {
  interviews: 'Interview scheduling',
  calendar: 'Calendar integration',
  sourceAnalytics: 'Source analytics',
  activityTimeline: 'The activity timeline',
  aiAnalytics: 'The AI Analysis dashboard',
  sso: 'SSO',
  auditLog: 'The audit log',
  retention: 'Retention controls',
  byok: 'Bring your own AI key',
}

function tierRank(tier: BillingTier): number {
  const i = TIER_ORDER.indexOf(tier)
  return i === -1 ? 0 : i
}

/** Human-readable plan name for a tier (e.g. for upgrade prompts in the UI). */
export function tierDisplayName(tier: BillingTier): string {
  return TIER_DISPLAY_NAME[tier] ?? TIER_DISPLAY_NAME.free
}

/** Minimum tier required for a feature, as a display name (e.g. "Scale"). */
export function featureRequiredTierName(feature: PlanFeature): string {
  return tierDisplayName(FEATURE_MIN_TIER[feature])
}

/** Whether `tier` is entitled to `feature`. Higher tiers inherit lower-tier features. */
export function tierHasFeature(tier: BillingTier, feature: PlanFeature): boolean {
  // Legacy hosted orgs get Team-equivalent access plus BYOK while remaining on
  // a free, non-Stripe tier. They do not inherit Scale features.
  if (tier === 'grandfathered' && feature === 'byok') return true
  // Free orgs can configure their own key to keep running AI analysis past the
  // lifetime free-run limit (see FREE_PLAN_ANALYSIS_LIMIT) instead of being
  // forced to upgrade. This is the Free plan's advertised "then bring your own
  // key" — Solo/Team don't get this; they buy a bigger platform-paid budget.
  if (tier === 'free' && feature === 'byok') return true
  return tierRank(tier) >= tierRank(FEATURE_MIN_TIER[feature])
}

/** Upgrade-prompt message for a feature the current tier can't access. */
export function featureUpgradeMessage(feature: PlanFeature): string {
  const minTier = FEATURE_MIN_TIER[feature]
  return `${FEATURE_LABEL[feature]} is available on the ${TIER_DISPLAY_NAME[minTier]} plan and above. Upgrade to unlock it.`
}

/** Billing actions the Stripe plugin authorizes via `authorizeReference`. */
export type BillingAction =
  | 'upgrade-subscription'
  | 'list-subscription'
  | 'cancel-subscription'
  | 'restore-subscription'
  | 'billing-portal'

/**
 * Authorization decision for an org-scoped billing action, given the acting
 * user's role in that organization (or null/undefined if they're not a member).
 *
 * - Non-members can do nothing.
 * - Any member may *read* the plan (`list-subscription`).
 * - Only owners/admins may change billing (upgrade/cancel/restore/portal).
 *
 * Pure function so it can be unit-tested without a database; the DB lookup of
 * the role lives in server/utils/auth.ts.
 */
export function isBillingActionAllowed(
  role: string | null | undefined,
  action: string,
): boolean {
  if (!role) return false
  if (action === 'list-subscription') return true
  return role === 'owner' || role === 'admin'
}
