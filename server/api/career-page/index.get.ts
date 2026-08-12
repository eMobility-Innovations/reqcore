import { eq } from 'drizzle-orm'
import { careerPage } from '../../database/schema'
import { tierHasFeature } from '../../../shared/billing'
import { resolveOrgPlanId } from '../../utils/billing/plan'

/**
 * GET /api/career-page
 * Returns the active org's career-page configuration (or defaults if never
 * customized). Always returns 200 — the `canUse` flag tells the client whether
 * the org's plan entitles it to a live career page.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['read'] })
  const orgId = session.session.activeOrganizationId

  const tier = await resolveOrgPlanId(orgId)
  const canUse = tierHasFeature(tier, 'careerPage')

  const config = await db.query.careerPage.findFirst({
    where: eq(careerPage.organizationId, orgId),
    columns: {
      enabled: true,
      slug: true,
      accentColor: true,
      headline: true,
      description: true,
      logoStorageKey: true,
      bannerStorageKey: true,
      bannerPosition: true,
      updatedAt: true,
    },
  })

  return {
    canUse,
    enabled: config?.enabled ?? true,
    slug: config?.slug ?? null,
    accentColor: config?.accentColor ?? null,
    headline: config?.headline ?? null,
    description: config?.description ?? null,
    hasLogo: !!config?.logoStorageKey,
    hasBanner: !!config?.bannerStorageKey,
    bannerPosition: config?.bannerPosition ?? 50,
    updatedAt: config?.updatedAt ?? null,
  }
})
