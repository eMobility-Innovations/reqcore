import { and, eq, ne } from 'drizzle-orm'
import { careerPage, organization } from '../../database/schema'
import { updateCareerPageSchema } from '../../utils/schemas/careerPage'

/** Empty strings from form inputs become NULL for nullable text fields. */
function emptyToNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  return v
}

/**
 * PUT /api/career-page
 * Upserts the active org's career-page configuration. Available on every plan,
 * including free — see FEATURE_MIN_TIER.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  await assertPlanFeature(orgId, 'careerPage')

  const body = await readValidatedBody(event, updateCareerPageSchema.parse)

  const accentColor = emptyToNull(body.accentColor)
  const headline = emptyToNull(body.headline)
  const description = emptyToNull(body.description)
  const slug = emptyToNull(body.slug)

  // A custom slug shares the /career/:slug namespace with organization slugs, so
  // it must not collide with another org's slug or another org's custom slug.
  if (slug) {
    const [orgClash, slugClash] = await Promise.all([
      db.query.organization.findFirst({
        where: and(eq(organization.slug, slug), ne(organization.id, orgId)),
        columns: { id: true },
      }),
      db.query.careerPage.findFirst({
        where: and(eq(careerPage.slug, slug), ne(careerPage.organizationId, orgId)),
        columns: { id: true },
      }),
    ])
    if (orgClash || slugClash) {
      throw createError({ statusCode: 409, statusMessage: 'That career-page URL is already taken.' })
    }
  }

  const [result] = await db
    .insert(careerPage)
    .values({
      organizationId: orgId,
      enabled: body.enabled ?? true,
      slug: slug ?? null,
      accentColor: accentColor ?? null,
      headline: headline ?? null,
      description: description ?? null,
      ...(body.bannerPosition !== undefined && { bannerPosition: body.bannerPosition }),
    })
    .onConflictDoUpdate({
      target: careerPage.organizationId,
      set: {
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(slug !== undefined && { slug }),
        ...(accentColor !== undefined && { accentColor }),
        ...(headline !== undefined && { headline }),
        ...(description !== undefined && { description }),
        ...(body.bannerPosition !== undefined && { bannerPosition: body.bannerPosition }),
        updatedAt: new Date(),
      },
    })
    .returning({
      enabled: careerPage.enabled,
      slug: careerPage.slug,
      accentColor: careerPage.accentColor,
      headline: careerPage.headline,
      description: careerPage.description,
      bannerPosition: careerPage.bannerPosition,
      updatedAt: careerPage.updatedAt,
    })

  if (!result) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to save career page' })
  }

  logApiRequest(event, session, 'career_page.updated', { enabled: result.enabled })
  await recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { settingsArea: 'career_page', enabled: result.enabled },
  })

  return { canUse: true, ...result }
})
