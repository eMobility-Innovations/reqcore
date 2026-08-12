import { z } from 'zod'
import { generateCriteriaFromDescription } from '../../utils/ai/scoring'
import { resolveAnalysisProvider } from '../../utils/ai/resolveProvider'
import { createRateLimiter } from '../../utils/rateLimit'

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(50000),
  /** Optional override — defaults to the org's analysis configuration. */
  aiConfigId: z.string().min(1).nullable().optional(),
})

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  message: 'Too many AI criteria generation requests. Please wait before retrying.',
})

/**
 * POST /api/ai-config/generate-criteria
 *
 * Generate scoring criteria from a job title + description using the org's
 * default analysis AI configuration (or an explicit override).
 */
export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, bodySchema.parse)

  const resolved = await resolveAnalysisProvider(orgId, { preferId: body.aiConfigId })

  const criteria = await generateCriteriaFromDescription(
    resolved.providerConfig,
    body.title,
    body.description,
  )

  return { criteria, source: 'ai' }
})
