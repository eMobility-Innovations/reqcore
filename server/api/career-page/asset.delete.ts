import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { careerPage } from '../../database/schema'
import { careerAssetKindSchema } from '../../utils/schemas/careerPage'

const querySchema = z.object({ kind: careerAssetKindSchema })

/**
 * DELETE /api/career-page/asset?kind=logo|banner
 *
 * Remove a career-page image. Clears the stored key and deletes the S3 object.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  await assertPlanFeature(orgId, 'careerPage')

  const { kind } = await getValidatedQuery(event, querySchema.parse)

  const keyColumn = kind === 'logo' ? 'logoStorageKey' : 'bannerStorageKey'

  const existing = await db.query.careerPage.findFirst({
    where: eq(careerPage.organizationId, orgId),
    columns: { logoStorageKey: true, bannerStorageKey: true },
  })
  const previousKey = existing?.[keyColumn]

  if (previousKey) {
    await db
      .update(careerPage)
      .set({ [keyColumn]: null, updatedAt: new Date() })
      .where(eq(careerPage.organizationId, orgId))

    try {
      await deleteFromS3(previousKey)
    } catch (cleanupError) {
      logWarn('career_page.asset_delete_s3_failed', {
        storage_key: previousKey,
        error_message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }
  }

  logApiRequest(event, session, 'career_page.asset_removed', { kind })
  return { kind, updatedAt: new Date().toISOString() }
})
