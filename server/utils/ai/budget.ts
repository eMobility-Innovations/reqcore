/**
 * AI spend budget gate — the money-safety layer.
 *
 * Three lines of defence, checked *before* any platform-paid LLM call:
 *   1. Per-run output cap        — enforced via maxTokens in the provider call.
 *   2. Per-org monthly ceiling   — by plan tier, summed from analysisRun.
 *   3. Global daily kill-switch  — one cap across ALL orgs; the runaway-loop
 *                                  insurance (a re-scoring bug, not normal use,
 *                                  is how you actually lose money).
 *
 * Fail-closed: if we cannot read current spend, we refuse the run rather than
 * risk an unbounded bill. BYOK runs bypass everything here — it's the org's own
 * key and bill; we only track those, we don't cap them.
 */
import { and, eq, gte, sql } from 'drizzle-orm'
import { analysisRun } from '../../database/schema'
import { microsToUsd } from './pricing'
import { resolveOrgPlanId } from '../billing/plan'
import { FREE_PLAN_ANALYSIS_LIMIT } from '../../../shared/billing'

/**
 * Monthly platform-paid AI budget per *paid* org, in USD, keyed by plan.
 * Free orgs are gated by a lifetime run count instead (see `freeRunLimit`).
 * Scale/Agency are BYOK-encouraged, so their numbers are generous backstops,
 * not expected ceilings.
 *
 * These are conservative starting points — tune them as you learn real
 * cost-per-customer from the analytics. Keep them well under each plan's MRR.
 */
export const MONTHLY_BUDGET_USD: Record<string, number> = {
  default: 2,
  solo: 20,
  team: 60,
  scale: 200,
  agency: 500,
}

/**
 * Lifetime platform-paid run allowance for a free org — the count-based
 * "one free AI shortlist" gate. Defaults to FREE_PLAN_ANALYSIS_LIMIT, overridable
 * via AI_FREE_PLAN_RUN_LIMIT.
 */
export function freeRunLimit(): number {
  const raw = process.env.AI_FREE_PLAN_RUN_LIMIT
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FREE_PLAN_ANALYSIS_LIMIT
}

/**
 * Global platform-wide daily spend cap in USD. The runaway-loop circuit breaker.
 * Overridable via AI_DAILY_SPEND_CAP_USD; defaults to a deliberately low $25 so
 * a bug trips it loudly long before it empties your account.
 */
function dailyCapUsd(): number {
  const raw = process.env.AI_DAILY_SPEND_CAP_USD
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly scope: 'org_monthly' | 'org_free_limit' | 'global_daily',
    message: string,
  ) {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

/** Count completed platform-paid runs for an org (lifetime). */
async function countPlatformRuns(orgId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`count(*)` })
    .from(analysisRun)
    .where(and(
      eq(analysisRun.billingMode, 'platform'),
      eq(analysisRun.organizationId, orgId),
      eq(analysisRun.status, 'completed'),
    ))
  return Number(row?.total ?? 0)
}

/** Sum platform-paid spend (µ$) for an org since `since`. */
async function sumPlatformSpendMicros(since: Date, orgId?: string): Promise<number> {
  const where = orgId
    ? and(
        eq(analysisRun.billingMode, 'platform'),
        eq(analysisRun.organizationId, orgId),
        gte(analysisRun.createdAt, since),
      )
    : and(
        eq(analysisRun.billingMode, 'platform'),
        gte(analysisRun.createdAt, since),
      )

  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${analysisRun.costUsdMicros}), 0)` })
    .from(analysisRun)
    .where(where)
  return Number(row?.total ?? 0)
}

function startOfUtcMonth(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function startOfUtcDay(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Assert that a *platform-paid* run for `orgId` is within budget. Throws
 * `BudgetExceededError` if the org's month-to-date or the global day-to-date
 * spend has already reached its cap. Call this immediately before the LLM call.
 *
 * Note: this gate is pre-spend — it stops the *next* run once a cap is reached.
 * Combined with the per-run maxTokens cap, the worst-case overshoot is one run.
 */
export async function assertPlatformBudget(orgId: string): Promise<void> {
  const plan = await resolveOrgPlanId(orgId)

  if (plan === 'free') {
    // Count-based gate: one free AI shortlist per account, then upgrade.
    const [runs, daySpend] = await Promise.all([
      countPlatformRuns(orgId),
      sumPlatformSpendMicros(startOfUtcDay()),
    ])
    const limit = freeRunLimit()
    if (runs >= limit) {
      throw new BudgetExceededError(
        'org_free_limit',
        'You’ve used your free AI analysis runs. Add your own AI key (Settings → AI Configuration) or upgrade to a paid plan to keep running AI analysis — your existing rankings stay available.',
      )
    }
    assertDailyCap(daySpend)
    return
  }

  const [monthSpend, daySpend] = await Promise.all([
    sumPlatformSpendMicros(startOfUtcMonth(), orgId),
    sumPlatformSpendMicros(startOfUtcDay()),
  ])

  const monthlyCapUsd = MONTHLY_BUDGET_USD[plan] ?? MONTHLY_BUDGET_USD.default!
  if (microsToUsd(monthSpend) >= monthlyCapUsd) {
    throw new BudgetExceededError(
      'org_monthly',
      `Monthly AI budget reached for this workspace ($${monthlyCapUsd}). It resets at the start of next month, or upgrade for a higher limit.`,
    )
  }

  assertDailyCap(daySpend)
}

/** Global daily kill-switch — one cap across all orgs. */
function assertDailyCap(daySpend: number): void {
  const capUsd = dailyCapUsd()
  if (microsToUsd(daySpend) >= capUsd) {
    throw new BudgetExceededError(
      'global_daily',
      'AI analysis is temporarily paused for maintenance. Please try again later.',
    )
  }
}

/** Map a BudgetExceededError to an H3 error (429). */
export function budgetErrorToHttp(err: BudgetExceededError) {
  return createError({
    statusCode: 429,
    statusMessage: err.message,
    data: { code: 'AI_BUDGET_EXCEEDED', scope: err.scope },
  })
}
