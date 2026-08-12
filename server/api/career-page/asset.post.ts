import { eq } from 'drizzle-orm'
import { fileTypeFromBuffer } from 'file-type'
import { careerPage } from '../../database/schema'
import { optimizeCareerBanner } from '../../utils/careerAssetImage'
import {
  careerAssetKindSchema,
  CAREER_ASSET_MIME_TYPES,
  CAREER_ASSET_MIME_TO_EXTENSION,
  CAREER_ASSET_MAX_BYTES,
  type CareerAssetMime,
} from '../../utils/schemas/careerPage'

/**
 * POST /api/career-page/asset
 *
 * Upload a career-page image (logo or hero banner). Multipart form with:
 *   - `file`: the image (PNG / JPEG / WebP; banners are converted to WebP)
 *   - `kind`: "logo" | "banner"
 *
 * Available on every plan, including free — see FEATURE_MIN_TIER.
 * The image is stored to S3 under a server-generated key
 * and the key is upserted onto the org's career_page row. Any previously stored
 * image for the same slot is deleted. Served publicly via
 * /api/public/career-page/:slug/asset.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  await assertPlanFeature(orgId, 'careerPage')

  // ── Read + validate the multipart body ──────────────────────────────
  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  const kindPart = formData.find((p) => p.name === 'kind')
  const filePart = formData.find((p) => p.name === 'file')

  const kindResult = careerAssetKindSchema.safeParse(kindPart?.data?.toString())
  if (!kindResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid asset kind. Must be "logo" or "banner".' })
  }
  const kind = kindResult.data

  if (!filePart?.data || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  const fileBuffer = filePart.data
  if (fileBuffer.length > CAREER_ASSET_MAX_BYTES[kind]) {
    throw createError({
      statusCode: 413,
      statusMessage: `Image too large. Maximum size is ${CAREER_ASSET_MAX_BYTES[kind] / 1024 / 1024} MB.`,
    })
  }

  // MIME from magic bytes — never trust the Content-Type header.
  const detected = await fileTypeFromBuffer(fileBuffer)
  const mimeType = detected?.mime
  if (!mimeType || !CAREER_ASSET_MIME_TYPES.includes(mimeType as CareerAssetMime)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image type. Allowed: PNG, JPEG, WebP.',
    })
  }

  let assetBuffer = fileBuffer
  let assetMimeType = mimeType as CareerAssetMime
  if (kind === 'banner') {
    try {
      assetBuffer = await optimizeCareerBanner(fileBuffer)
      assetMimeType = 'image/webp'
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'The banner could not be processed. Try a different PNG, JPEG, or WebP image.',
      })
    }
  }

  // ── Upload to S3 under a fresh, server-generated key ────────────────
  const keyColumn = kind === 'logo' ? 'logoStorageKey' : 'bannerStorageKey'
  const existing = await db.query.careerPage.findFirst({
    where: eq(careerPage.organizationId, orgId),
    columns: { logoStorageKey: true, bannerStorageKey: true },
  })
  const previousKey = existing?.[keyColumn]

  const extension = CAREER_ASSET_MIME_TO_EXTENSION[assetMimeType]
  const storageKey = `career-page/${orgId}/${kind}-${crypto.randomUUID()}.${extension}`

  await uploadToS3(storageKey, assetBuffer, assetMimeType)

  // ── Persist the key (upsert), cleaning up the previous object ───────
  try {
    await db
      .insert(careerPage)
      .values({
        organizationId: orgId,
        [keyColumn]: storageKey,
      })
      .onConflictDoUpdate({
        target: careerPage.organizationId,
        set: { [keyColumn]: storageKey, updatedAt: new Date() },
      })
  } catch (dbError) {
    // Roll back the orphaned S3 object if the DB write fails.
    try {
      await deleteFromS3(storageKey)
    } catch (cleanupError) {
      logWarn('career_page.asset_s3_orphan_cleanup_failed', {
        storage_key: storageKey,
        error_message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }
    throw dbError
  }

  if (previousKey && previousKey !== storageKey) {
    try {
      await deleteFromS3(previousKey)
    } catch (cleanupError) {
      logWarn('career_page.asset_previous_cleanup_failed', {
        storage_key: previousKey,
        error_message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }
  }

  logApiRequest(event, session, 'career_page.asset_uploaded', { kind })
  await recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { settingsArea: 'career_page', asset: kind },
  })

  return { kind, updatedAt: new Date().toISOString() }
})
