import { eq } from 'drizzle-orm'
import { careerPage, organization } from '../database/schema'
import { tierHasFeature } from '../../shared/billing'
import { resolveOrgPlanId } from './billing/plan'

/**
 * Resolve a public /career/:slug request to its org + career-page config.
 *
 * The `:slug` param may be either the org's custom career-page slug or the
 * organization slug (the custom slug takes precedence). Returns `null` when no
 * org matches or the org's plan doesn't include the `careerPage` feature, so
 * callers can 404 uniformly.
 */
export interface CareerPageConfig {
  enabled: boolean
  slug: string | null
  accentColor: string | null
  headline: string | null
  description: string | null
  logoStorageKey: string | null
  bannerStorageKey: string | null
  bannerPosition: number
  updatedAt: Date
}

export interface ResolvedCareerPage {
  org: { id: string; name: string; logo: string | null; slug: string }
  config: CareerPageConfig | undefined
  /** Canonical public slug: the custom slug if set, otherwise the org slug. */
  canonicalSlug: string
}

const CONFIG_COLUMNS = {
  organizationId: true,
  enabled: true,
  slug: true,
  accentColor: true,
  headline: true,
  description: true,
  logoStorageKey: true,
  bannerStorageKey: true,
  bannerPosition: true,
  updatedAt: true,
} as const

const ORG_COLUMNS = { id: true, name: true, logo: true, slug: true } as const

export async function resolveCareerPageBySlug(slug: string): Promise<ResolvedCareerPage | null> {
  // Custom career-page slug wins over the org slug.
  let row = await db.query.careerPage.findFirst({
    where: eq(careerPage.slug, slug),
    columns: CONFIG_COLUMNS,
  })

  let org: ResolvedCareerPage['org'] | undefined
  if (row) {
    org = await db.query.organization.findFirst({
      where: eq(organization.id, row.organizationId),
      columns: ORG_COLUMNS,
    })
  }
  else {
    org = await db.query.organization.findFirst({
      where: eq(organization.slug, slug),
      columns: ORG_COLUMNS,
    })
    if (org) {
      row = await db.query.careerPage.findFirst({
        where: eq(careerPage.organizationId, org.id),
        columns: CONFIG_COLUMNS,
      })
    }
  }

  if (!org) return null

  const tier = await resolveOrgPlanId(org.id)
  if (!tierHasFeature(tier, 'careerPage')) return null

  const config: CareerPageConfig | undefined = row
    ? {
        enabled: row.enabled,
        slug: row.slug,
        accentColor: row.accentColor,
        headline: row.headline,
        description: row.description,
        logoStorageKey: row.logoStorageKey,
        bannerStorageKey: row.bannerStorageKey,
        bannerPosition: row.bannerPosition,
        updatedAt: row.updatedAt,
      }
    : undefined

  return { org, config, canonicalSlug: config?.slug ?? org.slug }
}
