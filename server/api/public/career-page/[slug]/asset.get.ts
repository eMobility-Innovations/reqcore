import { z } from 'zod'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { resolveCareerPageBySlug } from '../../../../utils/careerPage'
import { publicJobSlugSchema } from '../../../../utils/schemas/publicApplication'
import { careerAssetKindSchema, CAREER_ASSET_MIME_TYPES } from '../../../../utils/schemas/careerPage'

/**
 * GET /api/public/career-page/:slug/asset?kind=logo|banner
 *
 * Public, no auth. Streams a career-page image (logo or hero banner) from S3
 * through our origin so the public page can render it without exposing the
 * private bucket.
 *
 * - Org not found, or no image for the slot → 404.
 * - Content-Type is forced to the safe raster set and sniffing is disabled.
 */
const querySchema = z.object({ kind: careerAssetKindSchema })

export default defineEventHandler(async (event) => {
  const { slug } = await getValidatedRouterParams(event, publicJobSlugSchema.parse)
  const { kind } = await getValidatedQuery(event, querySchema.parse)

  const resolved = await resolveCareerPageBySlug(slug)
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const { config } = resolved
  const storageKey = kind === 'logo' ? config?.logoStorageKey : config?.bannerStorageKey
  if (!storageKey) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const s3Response = await getS3Client().send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
  )
  if (!s3Response.Body) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve image' })
  }

  // Force a safe image content type — never echo an untrusted stored value.
  const stored = s3Response.ContentType ?? ''
  const contentType = (CAREER_ASSET_MIME_TYPES as readonly string[]).includes(stored)
    ? stored
    : 'image/png'

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    // Callers cache-bust with ?v=<updatedAt>, so a long cache is safe.
    'Cache-Control': 'public, max-age=86400',
  }
  if (s3Response.ContentLength) {
    headers['Content-Length'] = String(s3Response.ContentLength)
  }
  setResponseHeaders(event, headers)

  return s3Response.Body.transformToWebStream()
})
