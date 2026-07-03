import { eq } from 'drizzle-orm'
import { aiConfig } from '../../database/schema'
import { resolveOrgPlanId } from '../../utils/billing/plan'

/**
 * GET /api/ai-config
 *
 * List ALL AI configurations for the active organization, ordered with
 * defaults first then by recency. Never returns the encrypted API key —
 * only a `hasApiKey` boolean.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId

  const rows = await db.query.aiConfig.findMany({
    where: eq(aiConfig.organizationId, orgId),
    columns: {
      id: true,
      name: true,
      provider: true,
      model: true,
      baseUrl: true,
      maxTokens: true,
      inputPricePer1m: true,
      outputPricePer1m: true,
      isDefaultChatbot: true,
      isDefaultAnalysis: true,
      apiKeyEncrypted: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: (t, { desc }) => [desc(t.isDefaultChatbot), desc(t.isDefaultAnalysis), desc(t.createdAt)],
  })

  const mapped = rows.map(({ apiKeyEncrypted, ...rest }) => ({
    ...rest,
    inputPricePer1m: rest.inputPricePer1m != null ? Number(rest.inputPricePer1m) : null,
    outputPricePer1m: rest.outputPricePer1m != null ? Number(rest.outputPricePer1m) : null,
    hasApiKey: Boolean(apiKeyEncrypted),
  }))

  // Platform-level OpenRouter fallback — orgs with no BYOK config still get AI,
  // except grandfathered orgs whose free access is explicitly BYOK-only.
  const allowsPlatformFallback = await resolveOrgPlanId(orgId) !== 'grandfathered'
  if (allowsPlatformFallback && env.OPENROUTER_API_KEY && !mapped.some(c => c.hasApiKey)) {
    mapped.push({
      id: '__platform__',
      name: 'Platform (OpenRouter)',
      provider: 'openrouter',
      model: env.OPENROUTER_MODEL,
      baseUrl: null,
      maxTokens: 4096,
      inputPricePer1m: null,
      outputPricePer1m: null,
      isDefaultChatbot: false,
      isDefaultAnalysis: true,
      hasApiKey: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
  }

  return mapped
})
